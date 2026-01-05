'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { toast } from 'sonner';
import Image from 'next/image';
import { Composer, AgentMode } from '@/components/Composer';
import { ConversationView, ConversationTurn } from '@/components/ConversationView';
import { UserAvatarDropdown } from '@/components/UserAvatarDropdown';
import { CursorLoader } from '@/components/CursorLoader';
import { HomeActivityList } from '@/components/HomeActivityList';
import { RepoPicker } from '@/components/RepoPicker';
import { theme } from '@/lib/theme';
import {
  validateApiKey,
  listRepositories,
  listAgents,
  launchAgent,
  addFollowUp,
  fetchGitHubRepoInfo,
  getAgentStatus,
  getAgentConversation,
  ApiKeyInfo,
  RateLimitError,
  AuthError,
  Agent,
  Message,
} from '@/lib/cursorClient';
import { streamSdkAgent, AgentStep } from '@/lib/cursorSdk';
import {
  getApiKey,
  setApiKey,
  clearApiKey,
  getCachedRepos,
  setCachedRepos,
  getLastSelectedRepo,
  setLastSelectedRepo,
  CachedRepo,
  isPersistentStorage,
} from '@/lib/storage';

// Get repo display name from agent (owner/repo format, e.g., "anysphere/cursor")
function getRepoDisplayFromAgent(agent: Agent): string {
  const repository = agent.source.repository;
  // repository is typically "github.com/owner/repo" or "owner/repo"
  const parts = repository.split('/');
  if (parts.length >= 2) {
    // Return last two parts (owner/repo)
    return `${parts[parts.length - 2]}/${parts[parts.length - 1]}`;
  }
  return repository;
}

export default function Home() {
  // Auth state
  const [isInitializing, setIsInitializing] = useState(true);
  const [apiKey, setApiKeyState] = useState<string | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [userInfo, setUserInfo] = useState<ApiKeyInfo | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Repo state
  const [repos, setRepos] = useState<CachedRepo[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<CachedRepo | null>(null);
  const [isLoadingRepos, setIsLoadingRepos] = useState(false);

  // Runs state - fetched from Cursor API (source of truth)
  const [runs, setRuns] = useState<Agent[]>([]);
  const [isLoadingRuns, setIsLoadingRuns] = useState(true);
  const [isLaunching, setIsLaunching] = useState(false);

  // Home search query (filters the runs list)
  const [runsSearchQuery, setRunsSearchQuery] = useState('');

  // Active conversation state
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null);
  const [activePrompt, setActivePrompt] = useState<string>('');
  const [activeAgentStatus, setActiveAgentStatus] = useState<string | null>(null);
  const [activeAgentRepo, setActiveAgentRepo] = useState<string | null>(null);
  const [activeAgentName, setActiveAgentName] = useState<string | null>(null);

  // SDK streaming state - keyed by run ID
  const [sdkStepsMap, setSdkStepsMap] = useState<Record<string, AgentStep[]>>({});

  // Preloaded agent data cache - keyed by agent ID
  const [agentCache, setAgentCache] = useState<Record<string, { agent: Agent; messages: Message[] }>>({});

  // Conversation history for continuation chains
  const [conversationTurns, setConversationTurns] = useState<ConversationTurn[]>([]);

  // Track whether composer has input (for hiding empty state)
  const [hasComposerInput, setHasComposerInput] = useState(false);

  // Trigger to restart polling in ConversationView (for follow-ups to finished agents)
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Guard for concurrent run fetches
  const runsFetchInFlight = useRef(false);

  // Centralized auth failure handler
  const handleAuthFailure = useCallback((message = 'Session expired. Please re-enter your API key.') => {
    clearApiKey();
    setApiKeyState(null);
    setUserInfo(null);
    setRepos([]);
    setSelectedRepo(null);
    setRuns([]);
    toast.error(message);
  }, []);

  // Load API key from localStorage on mount
  useEffect(() => {
    const storedKey = getApiKey();
    if (storedKey) {
      setApiKeyState(storedKey);
      // Fetch user info to display email (optional - don't block on this)
      validateApiKey(storedKey)
        .then(setUserInfo)
        .catch((err) => {
          // Only clear key on actual auth failures (invalid/expired key)
          if (err instanceof AuthError) {
            clearApiKey();
            setApiKeyState(null);
          }
          // For transient errors (network, server), keep the key and continue
          // User can still use the app; email just won't show
          console.warn('Validation failed (non-fatal):', err.message);
        });
    }
    // Done checking for stored key
    setIsInitializing(false);
  }, []);

  // Show warning if storage is not persistent (e.g., private browsing)
  useEffect(() => {
    if (!isPersistentStorage()) {
      toast.warning('Private browsing detected. Your API key will not be saved.', {
        duration: 5000,
      });
    }
  }, []);

  // Fetch runs from Cursor API (source of truth - syncs across all devices)
  const fetchRuns = useCallback(async (key: string) => {
    if (runsFetchInFlight.current) return;
    runsFetchInFlight.current = true;
    
    try {
      const agents = await listAgents(key, 50);
      setRuns(agents);
    } catch (err) {
      console.error('Failed to fetch agents:', err);
      if (err instanceof AuthError) {
        handleAuthFailure();
      } else if (err instanceof RateLimitError) {
        toast.warning('Rate limited while fetching runs');
      } else {
        toast.error('Failed to load runs');
      }
    } finally {
      setIsLoadingRuns(false);
      runsFetchInFlight.current = false;
    }
  }, [handleAuthFailure]);

  // Load runs when API key is available
  useEffect(() => {
    if (apiKey) {
      setIsLoadingRuns(true);
      fetchRuns(apiKey);
    }
  }, [apiKey, fetchRuns]);

  // Poll for run updates every 30 seconds to keep list synced across devices
  useEffect(() => {
    if (!apiKey) return;
    
    const interval = setInterval(() => {
      fetchRuns(apiKey);
    }, 30000);
    
    return () => clearInterval(interval);
  }, [apiKey, fetchRuns]);

  // Preload agent data for recent cloud runs
  useEffect(() => {
    if (!apiKey || runs.length === 0) return;

    // Preload first 5 recent runs (runs are already Agent[] from API)
    const toPreload = runs.slice(0, 5);

    const preloadAgent = async (agent: Agent) => {
      try {
        const conversation = await getAgentConversation(apiKey, agent.id);

        setAgentCache((prev) => {
          // Skip if already cached (check inside setter to avoid race)
          if (prev[agent.id]) return prev;
          return {
            ...prev,
            [agent.id]: { agent, messages: conversation.messages || [] },
          };
        });
      } catch {
        // Silently fail preloading - conversation will fetch on open
      }
    };

    // Stagger preloads to avoid rate limits
    toPreload.forEach((agent, idx) => {
      setTimeout(() => {
        // Check cache before making request
        setAgentCache((prev) => {
          if (!prev[agent.id]) {
            preloadAgent(agent);
          }
          return prev;
        });
      }, idx * 500);
    });
  }, [apiKey, runs]);

  // Sort repos by most recent push (from GitHub)
  const sortedRepos = useMemo(() => {
    return [...repos].sort((a, b) => {
      const aTime = a.pushedAt ? new Date(a.pushedAt).getTime() : 0;
      const bTime = b.pushedAt ? new Date(b.pushedAt).getTime() : 0;
      
      if (aTime !== bTime) {
        return bTime - aTime; // Most recently pushed first
      }
      
      return a.name.localeCompare(b.name);
    });
  }, [repos]);

  // Auto-select default repo when repos are loaded
  useEffect(() => {
    if (sortedRepos.length > 0 && !selectedRepo) {
      // Try to use last selected repo
      const lastSelected = getLastSelectedRepo();
      if (lastSelected) {
        const lastRepo = sortedRepos.find((r) => r.repository === lastSelected);
        if (lastRepo) {
          setSelectedRepo(lastRepo);
          return;
        }
      }
      // Fall back to most recently pushed (first in sorted list)
      setSelectedRepo(sortedRepos[0]);
    }
  }, [sortedRepos, selectedRepo]);

  // Fetch repos when API key is available
  const fetchRepos = useCallback(async (key: string) => {
    const cached = getCachedRepos();
    if (cached && cached.length > 0) {
      setRepos(cached);
      return;
    }

    setIsLoadingRepos(true);
    try {
      const repoList = await listRepositories(key);
      
      // Fetch pushedAt from GitHub in batches to avoid rate limits
      // GitHub allows 60 requests/hour for unauthenticated users
      const BATCH_SIZE = 10;
      const mappedRepos: CachedRepo[] = [];
      
      for (let i = 0; i < repoList.length; i += BATCH_SIZE) {
        const batch = repoList.slice(i, i + BATCH_SIZE);
        const batchResults = await Promise.all(
          batch.map(async (r) => {
            const githubInfo = await fetchGitHubRepoInfo(r.owner, r.name);
            return {
              owner: r.owner,
              name: r.name,
              repository: r.repository,
              pushedAt: githubInfo?.pushedAt,
            };
          })
        );
        mappedRepos.push(...batchResults);
        
        // Small delay between batches to be nice to the API
        if (i + BATCH_SIZE < repoList.length) {
          await new Promise(r => setTimeout(r, 100));
        }
      }
      
      setRepos(mappedRepos);
      setCachedRepos(mappedRepos);
    } catch (err) {
      console.error('Failed to fetch repos:', err);
      if (err instanceof AuthError) {
        handleAuthFailure();
        return;
      }
      // On rate limit, try stale cache (ignore expiry)
      if (err instanceof RateLimitError) {
        const staleCache = getCachedRepos(true);
        if (staleCache && staleCache.length > 0) {
          console.warn('Rate limited, using stale cache');
          setRepos(staleCache);
          toast.warning('Rate limited - showing cached repositories');
          return;
        }
        toast.warning('Rate limited while fetching repositories');
      } else {
        toast.error('Failed to load repositories');
      }
      // Fall back to cached data on other errors
      if (cached && cached.length > 0) {
        setRepos(cached);
      }
    } finally {
      setIsLoadingRepos(false);
    }
  }, [handleAuthFailure]);

  // Validate and store API key
  const handleValidateKey = async () => {
    if (!apiKeyInput.trim()) return;

    setIsValidating(true);
    setAuthError(null);

    try {
      const info = await validateApiKey(apiKeyInput.trim());
      setUserInfo(info);
      setApiKey(apiKeyInput.trim());
      setApiKeyState(apiKeyInput.trim());
      setApiKeyInput('');
      fetchRepos(apiKeyInput.trim());
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Invalid API key');
    } finally {
      setIsValidating(false);
    }
  };

  // Fetch repos when API key changes
  useEffect(() => {
    if (apiKey) {
      fetchRepos(apiKey);
    }
  }, [apiKey, fetchRepos]);

  // Handle repo selection with persistence
  const handleSelectRepo = (repo: CachedRepo) => {
    setSelectedRepo(repo);
    setLastSelectedRepo(repo.repository);
  };

  // Get the actual repo for launching
  const launchRepo = selectedRepo;

  // Handle logout
  const handleLogout = () => {
    clearApiKey();
    setApiKeyState(null);
    setUserInfo(null);
    setRepos([]);
    setSelectedRepo(null);
  };

  // Determine if we're in conversation mode (can send messages)
  // Available when there's an active cloud agent (running or finished)
  const isConversationMode = Boolean(
    activeAgentId && 
    !activeAgentId.startsWith('sdk-') && 
    activeAgentId !== 'pending'
  );
  
  // Check if agent is still running (for UI hints)
  const isAgentRunning = activeAgentStatus === 'RUNNING' || activeAgentStatus === 'CREATING';
  const isAgentFinished = activeAgentStatus === 'FINISHED' || activeAgentStatus === 'STOPPED' || activeAgentStatus === 'ERROR' || activeAgentStatus === 'EXPIRED';

  // Handle launching agent or sending follow-up/continuation
  const handleLaunch = async (prompt: string, mode: AgentMode, model: string) => {
    if (!apiKey || isLaunching) return;

    // If in conversation mode, try follow-up first, then fall back to continuation
    if (isConversationMode && activeAgentId) {
      setIsLaunching(true);
      
      // If agent is still running, send a follow-up
      if (isAgentRunning) {
        try {
          await addFollowUp(apiKey, activeAgentId, {
            prompt: { text: prompt },
          });
          // The ConversationView will pick up the new message via polling
        } catch (err) {
          console.error('Failed to send follow-up:', err);
          if (err instanceof AuthError) {
            handleAuthFailure();
          } else {
            toast.error(err instanceof Error ? err.message : 'Failed to send follow-up');
          }
        } finally {
          setIsLaunching(false);
        }
        return;
      }
      
      // Agent is finished - try follow-up first, then fall back to launching continuation agent
      try {
        await addFollowUp(apiKey, activeAgentId, {
          prompt: { text: prompt },
        });
        // If it works, update status and trigger polling restart in ConversationView
        setActiveAgentStatus('RUNNING');
        setRefreshTrigger(prev => prev + 1);
        setIsLaunching(false);
        return;
      } catch (err) {
        // Follow-up to finished agent failed - launch a continuation agent
        console.log('Follow-up to finished agent failed, launching continuation:', err);
        // Fall through to launch a new agent as continuation
      }
      
      // Launch a continuation agent on the same repo
      const repoToUse = activeAgentRepo ? repos.find(r => r.name === activeAgentRepo) : selectedRepo;
      if (!repoToUse) {
        toast.error('Could not find repository for continuation');
        setIsLaunching(false);
        return;
      }
      
      try {
        // Build context from previous conversation and save current turn for display
        const previousAgent = agentCache[activeAgentId];
        let contextPrompt = prompt;
        
        // Save the current conversation as a turn for the history display
        const currentTurn: ConversationTurn = {
          prompt: activePrompt,
          messages: previousAgent?.messages || [],
          summary: previousAgent?.agent?.summary,
        };
        
        if (previousAgent) {
          const summary = previousAgent.agent?.summary;
          
          // Create a brief context header for the new agent
          if (summary) {
            contextPrompt = `[Continuing from previous work]\nPrevious task completed: ${summary}\n\nNew request: ${prompt}`;
          }
        }
        
        // Add current turn to conversation history
        setConversationTurns(prev => [...prev, currentTurn]);
        
        // Set pending state to show immediate feedback
        setActivePrompt(prompt); // Keep original prompt for display
        setActiveAgentId('pending');
        setActiveAgentStatus('CREATING');
        
        const agent = await launchAgent(apiKey, {
          prompt: { text: contextPrompt },
          source: { repository: repoToUse.repository },
          target: { autoCreatePr: true },
          model,
        });

        // Optimistically add to local state - API is source of truth, will sync on next poll
        setRuns(prev => [agent, ...prev.filter((r) => r.id !== agent.id)]);
        setActiveAgentId(agent.id);
        setActiveAgentName(agent.name || prompt);
      } catch (err) {
        console.error('Failed to launch continuation agent:', err);
        if (err instanceof AuthError) {
          handleAuthFailure();
        } else {
          toast.error(err instanceof Error ? err.message : 'Failed to continue');
        }
        // Remove the turn we just added since the continuation failed
        setConversationTurns(prev => prev.slice(0, -1));
        setActiveAgentId(null);
        setActivePrompt('');
      } finally {
        setIsLaunching(false);
      }
      return;
    }

    // Otherwise, launch a new agent (fresh conversation)
    // Use launchRepo which handles the "All Repositories" case
    if (!launchRepo) return;

    setIsLaunching(true);
    setActivePrompt(prompt);
    setActiveAgentRepo(`${launchRepo.owner}/${launchRepo.name}`);
    setActiveAgentName(prompt.length > 50 ? prompt.slice(0, 50) + '...' : prompt);
    
    // Clear any previous conversation history since this is a fresh start
    setConversationTurns([]);
    
    // Show the prompt immediately by setting a pending agent ID
    // This lets the conversation view render right away
    setActiveAgentId('pending');
    setActiveAgentStatus('CREATING');

    if (mode === 'sdk') {
      // SDK mode - use @cursor-ai/january package
      // Note: SDK runs are local-only and don't sync via Cursor API
      const tempRunId = `sdk-${Date.now()}`;
      try {
        // Create a temporary Agent-like object for local display
        const tempAgent: Agent = {
          id: tempRunId,
          name: prompt.length > 50 ? prompt.slice(0, 50) + '...' : prompt,
          status: 'RUNNING',
          source: { repository: launchRepo.repository, ref: 'main' },
          target: { branchName: '', url: '', autoCreatePr: false, openAsCursorGithubApp: false, skipReviewerRequest: false },
          createdAt: new Date().toISOString(),
        };
        setRuns(prev => [tempAgent, ...prev]);
        setActiveAgentId(tempRunId);
        setSdkStepsMap((prev) => ({ ...prev, [tempRunId]: [] }));

        // Stream the response from the SDK via our API route
        for await (const step of streamSdkAgent({
          apiKey,
          model,
          repository: launchRepo.repository,
        }, prompt)) {
          setSdkStepsMap((prev) => ({
            ...prev,
            [tempRunId]: [...(prev[tempRunId] || []), step],
          }));
        }

        // Mark as finished
        setRuns((prev) =>
          prev.map((r) => (r.id === tempRunId ? { ...r, status: 'FINISHED' } : r))
        );
      } catch (err) {
        console.error('SDK agent failed:', err);
        if (err instanceof AuthError) {
          handleAuthFailure();
        } else {
          toast.error(err instanceof Error ? err.message : 'SDK agent failed');
        }
        // Clean up temporary run on failure
        setRuns((prev) => prev.filter((r) => r.id !== tempRunId));
        setSdkStepsMap((prev) => {
          const next = { ...prev };
          delete next[tempRunId];
          return next;
        });
        // Reset to null on error so user can try again
        setActiveAgentId(null);
        setActivePrompt('');
      } finally {
        setIsLaunching(false);
      }
    } else {
      // Cloud mode - use REST API
      try {
        const agent = await launchAgent(apiKey, {
          prompt: { text: prompt },
          source: { repository: launchRepo.repository },
          target: { autoCreatePr: true },
          model,
        });

        // Optimistically add to local state - API is source of truth, will sync on next poll
        setRuns(prev => [agent, ...prev.filter((r) => r.id !== agent.id)]);
        setActiveAgentId(agent.id);
        setActiveAgentName(agent.name || prompt);
      } catch (err) {
        console.error('Failed to launch agent:', err);
        if (err instanceof AuthError) {
          handleAuthFailure();
        } else {
          toast.error(err instanceof Error ? err.message : 'Failed to launch agent');
        }
        // Reset to null on error so user can try again
        setActiveAgentId(null);
        setActivePrompt('');
      } finally {
        setIsLaunching(false);
      }
    }
  };

  // Handle selecting a previous run from activity list
  const handleSelectAgent = (agent: Agent) => {
    setActiveAgentId(agent.id);
    // Use agent name as prompt display (API doesn't return original prompt)
    setActivePrompt(agent.name || 'Agent task');
    setActiveAgentStatus(agent.status);
    setActiveAgentName(agent.name || 'Agent task');
    // Extract full repo display name (owner/repo format)
    const repoDisplay = getRepoDisplayFromAgent(agent);
    setActiveAgentRepo(repoDisplay);
    // Clear conversation history when switching to a different run
    setConversationTurns([]);
    setRefreshTrigger(0);
  };

  // Handle going back to home from conversation
  const handleBackToHome = () => {
    setActiveAgentId(null);
    setActivePrompt('');
    setActiveAgentStatus(null);
    setActiveAgentRepo(null);
    setActiveAgentName(null);
    setConversationTurns([]);
    setRefreshTrigger(0);
  };

  // Handle agent data change from conversation view (status, name, etc.)
  // Updates local state for immediate UI feedback - API is source of truth
  // Memoized to prevent polling instability in ConversationView
  const handleAgentUpdate = useCallback((agentId: string, updates: { status?: string; name?: string }) => {
    if (updates.status) {
      setActiveAgentStatus(updates.status);
    }
    if (updates.name) {
      setActiveAgentName(updates.name);
    }
    if (updates.status || updates.name) {
      setRuns(prev =>
        prev.map((agent) =>
          agent.id === agentId 
            ? { 
                ...agent, 
                ...(updates.status && { status: updates.status as Agent['status'] }),
                ...(updates.name && { name: updates.name }),
              } 
            : agent
        )
      );
    }
  }, []);

  // Legacy handler for backwards compatibility - memoized to prevent polling instability
  const handleStatusChange = useCallback((status: string) => {
    setActiveAgentStatus(status);
  }, []);

  // Show nothing while checking for stored API key to prevent flash
  if (isInitializing) {
    return <div className="min-h-dvh" style={{ background: theme.bg.main }} />;
  }

  // API Key entry screen
  if (!apiKey) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center p-4" style={{ background: theme.bg.main }}>
        <div className="w-full max-w-sm space-y-8">
          <div className="text-center">
            <Image
              src="/cursor-logo.svg"
              alt="Cursor"
              width={160}
              height={40}
              className="h-10 w-auto mx-auto"
              priority
            />
          </div>

          <div className="space-y-4">
            <div>
            <input
              type="password"
              value={apiKeyInput}
              onInput={(e) => setApiKeyInput((e.target as HTMLInputElement).value)}
              onKeyDown={(e) => e.key === 'Enter' && handleValidateKey()}
              placeholder="Enter Cursor API key"
              className="w-full px-4 py-3 bg-transparent rounded-xl focus:outline-none"
              style={{
                border: `1px solid ${theme.border.secondary}`,
                color: theme.text.primary,
              }}
              autoFocus
            />
              {authError && (
                <p className="mt-2 text-xs" style={{ color: theme.text.tertiary }}>{authError}</p>
              )}
            </div>

            <button
              onClick={handleValidateKey}
              disabled={!apiKeyInput.trim() || isValidating}
              className="w-full py-3 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2"
              style={{
                background: theme.fg,
                color: theme.bg.main,
              }}
            >
              {isValidating ? (
                <>
                  <CursorLoader size="sm" />
                  <span>Connecting</span>
                </>
              ) : (
                'Continue'
              )}
            </button>

            <p className="text-center text-[13px]" style={{ color: theme.text.quaternary }}>
              Get your API key from{' '}
              <a
                href="https://cursor.com/dashboard"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: theme.text.tertiary }}
              >
                cursor.com/dashboard
              </a>
              . Your key is stored in your browser and{' '}
              <a
                href="https://github.com/eriknson/cursor-web/blob/main/src/lib/storage.ts#L32-L45"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: theme.text.tertiary }}
              >
                never saved on our servers
              </a>
              .
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Determine if we're in chat view or home view
  const isInChatView = activeAgentId !== null;

  // Get the composer placeholder based on context
  const composerPlaceholder = isInChatView 
    ? 'Add a task for Cursor to do'
    : 'Ask Cursor to build, plan, fix anything';

  // Debug utility: add `?debugBlur=1` to verify backdrop-filter works at all.
  // If this doesn't blur the list behind it, the environment is disabling backdrop-filter.
  const debugBlur =
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('debugBlur');

  // Main app
  return (
    <div className="min-h-dvh flex flex-col" style={{ background: theme.bg.main }}>
      {debugBlur && (
        <div className="fixed left-4 right-4 top-28 z-[9999] pointer-events-none">
          <div
            className="h-28 rounded-2xl border border-white/20 bg-white/10 backdrop-blur-2xl"
            style={{ boxShadow: '0 0 0 1px rgba(0,0,0,0.3), 0 12px 40px rgba(0,0,0,0.35)' }}
          >
            <div className="h-full w-full rounded-2xl flex items-center justify-center text-white/80 text-sm">
              Debug blur panel (should blur content behind)
            </div>
          </div>
        </div>
      )}

      {/* ====== TOP EDGE: Header + Search (UI layer with frosted blur) ====== */}
      <div className="edge-blur-top pt-safe">
        <div className="frosted-edge frosted-edge-top" aria-hidden="true" />
        <div className="edge-ui">
          {/* Header bar */}
          <div className="flex items-center justify-between px-4 h-14">
            {/* Left side */}
            {isInChatView ? (
              <div className="flex items-center gap-3 flex-1">
                <button
                  onClick={handleBackToHome}
                  className="w-9 h-9 flex items-center justify-center rounded-xl transition-colors cursor-pointer"
                  style={{ color: theme.text.secondary }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = theme.text.primary;
                    e.currentTarget.style.background = theme.bg.tertiary;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = theme.text.secondary;
                    e.currentTarget.style.background = 'transparent';
                  }}
                  title="Back"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
                  </svg>
                </button>
              </div>
            ) : (
              <RepoPicker
                repos={sortedRepos}
                selectedRepo={selectedRepo}
                onSelectRepo={handleSelectRepo}
                isLoading={isLoadingRepos}
              />
            )}

            {/* Center - Title (chat view only) */}
            {isInChatView && (
              <div className="flex-1 text-center px-2">
                <h1 className="text-[15px] font-medium truncate" style={{ color: theme.text.primary }}>
                  {activeAgentName || 'Agent'}
                </h1>
                <p className="text-xs truncate" style={{ color: theme.text.tertiary }}>
                  {activeAgentRepo || (launchRepo ? `${launchRepo.owner}/${launchRepo.name}` : 'repository')}
                </p>
              </div>
            )}
            
            {/* Right side */}
            <div className={isInChatView ? 'flex-1 flex justify-end' : ''}>
              <UserAvatarDropdown
                userEmail={userInfo?.userEmail}
                onLogout={handleLogout}
              />
            </div>
          </div>

          {/* Search bar (home view only) */}
          {!isInChatView && (
            <div className="px-4 pb-3">
              <div className="max-w-[700px] mx-auto">
                <input
                  type="text"
                  placeholder="Search Agents"
                  value={runsSearchQuery}
                  onChange={(e) => setRunsSearchQuery(e.target.value)}
                  className="w-full h-11 px-4 rounded-xl text-[15px] focus:outline-none transition-colors"
                  style={{
                    background: theme.bg.tertiary,
                    color: theme.text.primary,
                  }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ====== MAIN CONTENT (z-20, below blur overlays) ====== */}
      <main 
        className="flex-1 flex flex-col relative z-20"
        style={{ 
          paddingTop: isInChatView 
            ? 'calc(env(safe-area-inset-top, 0px) + 3.5rem)' 
            : 'calc(env(safe-area-inset-top, 0px) + 7rem)',
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 5.5rem)',
        }}
      >
        {isInChatView ? (
          <div className="flex-1 flex flex-col max-w-[700px] mx-auto w-full px-4">
            <ConversationView
              agentId={activeAgentId}
              apiKey={apiKey}
              prompt={activePrompt}
              onStatusChange={handleStatusChange}
              onAgentUpdate={handleAgentUpdate}
              onAuthFailure={handleAuthFailure}
              isSdkMode={activeAgentId?.startsWith('sdk-') || false}
              sdkSteps={activeAgentId ? sdkStepsMap[activeAgentId] || [] : []}
              preloadedData={activeAgentId ? agentCache[activeAgentId] : undefined}
              previousTurns={conversationTurns}
              refreshTrigger={refreshTrigger}
              initialStatus={activeAgentStatus || undefined}
            />
          </div>
        ) : (
          <div className="flex-1 flex flex-col max-w-[700px] mx-auto w-full">
            <HomeActivityList
              agents={runs}
              onSelectAgent={handleSelectAgent}
              isLoading={isLoadingRuns}
              selectedRepo={selectedRepo}
              hideSearch={true}
              searchQuery={runsSearchQuery}
            />
          </div>
        )}
      </main>

      {/* ====== BOTTOM EDGE: Composer with blur fade ====== */}
      <div className="edge-blur-bottom pb-safe">
        <div className="frosted-edge frosted-edge-bottom" aria-hidden="true" />
        <div className="edge-ui px-4 pb-4 pt-2">
          <div className="max-w-[700px] mx-auto">
            <Composer
              onSubmit={handleLaunch}
              isLoading={isLaunching}
              disabled={!launchRepo}
              placeholder={composerPlaceholder}
              onInputChange={setHasComposerInput}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
