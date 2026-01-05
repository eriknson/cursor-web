'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Composer, AgentMode } from '@/components/Composer';
import { Sidebar } from '@/components/Sidebar';
import { ConversationView, ConversationTurn } from '@/components/ConversationView';
import { CursorLoader } from '@/components/CursorLoader';
import { EmptyState } from '@/components/EmptyState';
import {
  validateApiKey,
  listRepositories,
  listAgents,
  launchAgent,
  addFollowUp,
  fetchGitHubRepoInfo,
  getAgentConversation,
  ApiKeyInfo,
  RateLimitError,
  AuthError,
  Agent,
  Message,
  IS_MOCK,
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
} from '@/lib/storage';

export function App() {
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
  const [isLaunching, setIsLaunching] = useState(false);

  // Sidebar state (left side, for mobile drawer)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Active conversation state
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null);
  const [activePrompt, setActivePrompt] = useState<string>('');
  const [activeAgentStatus, setActiveAgentStatus] = useState<string | null>(null);
  const [activeAgentRepo, setActiveAgentRepo] = useState<string | null>(null);

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

  // Fetch runs from Cursor API (source of truth - syncs across all devices)
  const fetchRuns = useCallback(async (key: string) => {
    try {
      const agents = await listAgents(key, 50);
      setRuns(agents);
    } catch (err) {
      console.error('Failed to fetch agents:', err);
    }
  }, []);

  // Load runs when API key is available
  useEffect(() => {
    if (apiKey) {
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
          await new Promise((r) => setTimeout(r, 100));
        }
      }

      setRepos(mappedRepos);
      setCachedRepos(mappedRepos);
    } catch (err) {
      console.error('Failed to fetch repos:', err);
      // On rate limit, try stale cache (ignore expiry)
      if (err instanceof RateLimitError) {
        const staleCache = getCachedRepos(true);
        if (staleCache && staleCache.length > 0) {
          console.warn('Rate limited, using stale cache');
          setRepos(staleCache);
          return;
        }
      }
      // Fall back to cached data on other errors
      const cachedRepos = getCachedRepos(true);
      if (cachedRepos && cachedRepos.length > 0) {
        setRepos(cachedRepos);
      }
    } finally {
      setIsLoadingRepos(false);
    }
  }, []);

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
  const isAgentFinished = activeAgentStatus === 'FINISHED' || activeAgentStatus === 'STOPPED';

  // Handle launching agent or sending follow-up/continuation
  const handleLaunch = async (prompt: string, mode: AgentMode, model: string) => {
    if (!apiKey) return;

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
          alert(err instanceof Error ? err.message : 'Failed to send follow-up');
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
        setRefreshTrigger((prev) => prev + 1);
        setIsLaunching(false);
        return;
      } catch (err) {
        // Follow-up to finished agent failed - launch a continuation agent
        console.log('Follow-up to finished agent failed, launching continuation:', err);
        // Fall through to launch a new agent as continuation
      }

      // Launch a continuation agent on the same repo
      const repoToUse = activeAgentRepo ? repos.find((r) => r.name === activeAgentRepo) : selectedRepo;
      if (!repoToUse) {
        alert('Could not find repository for continuation');
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
        setConversationTurns((prev) => [...prev, currentTurn]);

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
        setRuns((prev) => [agent, ...prev.filter((r) => r.id !== agent.id)]);
        setActiveAgentId(agent.id);
      } catch (err) {
        console.error('Failed to launch continuation agent:', err);
        alert(err instanceof Error ? err.message : 'Failed to continue');
        // Remove the turn we just added since the continuation failed
        setConversationTurns((prev) => prev.slice(0, -1));
        setActiveAgentId(null);
        setActivePrompt('');
      } finally {
        setIsLaunching(false);
      }
      return;
    }

    // Otherwise, launch a new agent (fresh conversation)
    if (!selectedRepo) return;

    setIsLaunching(true);
    setActivePrompt(prompt);
    setActiveAgentRepo(selectedRepo.name);

    // Clear any previous conversation history since this is a fresh start
    setConversationTurns([]);

    // Show the prompt immediately by setting a pending agent ID
    // This lets the conversation view render right away
    setActiveAgentId('pending');
    setActiveAgentStatus('CREATING');

    if (mode === 'sdk') {
      // SDK mode - use @cursor-ai/january package
      // Note: SDK runs are local-only and don't sync via Cursor API
      try {
        // Create a temporary run for the SDK session
        const tempRunId = `sdk-${Date.now()}`;
        // Create a temporary Agent-like object for local display
        const tempAgent: Agent = {
          id: tempRunId,
          name: prompt.length > 50 ? `${prompt.slice(0, 50)}...` : prompt,
          status: 'RUNNING',
          source: { repository: selectedRepo.repository, ref: 'main' },
          target: {
            branchName: '',
            url: '',
            autoCreatePr: false,
            openAsCursorGithubApp: false,
            skipReviewerRequest: false,
          },
          createdAt: new Date().toISOString(),
        };
        setRuns((prev) => [tempAgent, ...prev]);
        setActiveAgentId(tempRunId);
        setSdkStepsMap((prev) => ({ ...prev, [tempRunId]: [] }));

        // Stream the response from the SDK via our API route
        for await (const step of streamSdkAgent(
          {
            apiKey,
            model,
            repository: selectedRepo.repository,
          },
          prompt,
        )) {
          setSdkStepsMap((prev) => ({
            ...prev,
            [tempRunId]: [...(prev[tempRunId] || []), step],
          }));
        }

        // Mark as finished
        setRuns((prev) => prev.map((r) => (r.id === tempRunId ? { ...r, status: 'FINISHED' } : r)));
      } catch (err) {
        console.error('SDK agent failed:', err);
        alert(err instanceof Error ? err.message : 'SDK agent failed');
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
          source: { repository: selectedRepo.repository },
          target: { autoCreatePr: true },
          model,
        });

        // Optimistically add to local state - API is source of truth, will sync on next poll
        setRuns((prev) => [agent, ...prev.filter((r) => r.id !== agent.id)]);
        setActiveAgentId(agent.id);
      } catch (err) {
        console.error('Failed to launch agent:', err);
        alert(err instanceof Error ? err.message : 'Failed to launch agent');
        // Reset to null on error so user can try again
        setActiveAgentId(null);
        setActivePrompt('');
      } finally {
        setIsLaunching(false);
      }
    }
  };

  // Handle selecting a previous run from activity drawer
  const handleSelectRun = (agent: Agent) => {
    setActiveAgentId(agent.id);
    // Use agent name as prompt display (API doesn't return original prompt)
    setActivePrompt(agent.name || 'Agent task');
    setActiveAgentStatus(agent.status);
    // Extract repo name from repository string
    const repoName = agent.source.repository.split('/').pop() || agent.source.repository;
    setActiveAgentRepo(repoName);
    // Clear conversation history when switching to a different run
    setConversationTurns([]);
    setRefreshTrigger(0);
  };

  // Handle agent data change from conversation view (status, name, etc.)
  // Updates local state for immediate UI feedback - API is source of truth
  const handleAgentUpdate = (agentId: string, updates: { status?: string; name?: string }) => {
    if (updates.status || updates.name) {
      setRuns((prev) =>
        prev.map((agent) =>
          agent.id === agentId
            ? {
                ...agent,
                ...(updates.status && { status: updates.status as Agent['status'] }),
                ...(updates.name && { name: updates.name }),
              }
            : agent,
        ),
      );
    }
  };

  // Legacy handler for backwards compatibility
  const handleStatusChange = (status: string) => {
    setActiveAgentStatus(status);
    if (activeAgentId) {
      handleAgentUpdate(activeAgentId, { status });
    }
  };

  // Show nothing while checking for stored API key to prevent flash
  if (isInitializing) {
    return <div className="min-h-dvh bg-black" />;
  }

  // API Key entry screen
  if (!apiKey) {
    return (
      <div className="min-h-dvh bg-black flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-sm space-y-8">
          <div className="text-center">
            <img
              src="/cursor-logo.svg"
              alt="Cursor"
              className="h-10 mx-auto"
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
                className="w-full px-4 py-3 bg-transparent border border-zinc-800 rounded-xl text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-700"
                autoFocus
              />
              {authError && <p className="mt-2 text-xs text-zinc-500">{authError}</p>}
            </div>

            <button
              onClick={handleValidateKey}
              disabled={!apiKeyInput.trim() || isValidating}
              className="w-full py-3 bg-white hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer rounded-xl text-zinc-900 text-sm font-medium transition-colors flex items-center justify-center gap-2"
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

            <p className="text-center text-[13px] text-zinc-700">
              Get your API key from{' '}
              <a
                href="https://cursor.com/dashboard"
                target="_blank"
                rel="noopener noreferrer"
                className="text-zinc-500 hover:text-zinc-400"
              >
                cursor.com/dashboard
              </a>
              . Your key is stored in your browser and{' '}
              <a
                href="https://github.com/eriknson/cursor-web/blob/main/src/lib/storage.ts#L32-L45"
                target="_blank"
                rel="noopener noreferrer"
                className="text-zinc-500 hover:text-zinc-400"
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

  // Handle new agent action
  const handleNewAgent = () => {
    setActiveAgentId(null);
    setActivePrompt('');
    setActiveAgentStatus(null);
    setActiveAgentRepo(null);
    setConversationTurns([]);
    setRefreshTrigger(0);
  };

  // Main app
  return (
    <div className="min-h-dvh bg-black flex relative">
      {IS_MOCK && (
        <div className="absolute top-3 right-3 z-50">
          <span className="px-3 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-300 border border-amber-500/40">
            Mock mode
          </span>
        </div>
      )}
      {/* Left sidebar */}
      <Sidebar
        runs={runs}
        onSelectRun={handleSelectRun}
        onNewAgent={handleNewAgent}
        onLogout={handleLogout}
        userEmail={userInfo?.userEmail}
        isOpen={isSidebarOpen}
        onOpenChange={setIsSidebarOpen}
      />

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0 relative">
        {/* Mobile header with hamburger - fixed position so it doesn't scroll */}
        <header className="md:hidden fixed top-0 left-0 right-0 z-40 flex items-center p-2 pt-safe pointer-events-none">
          <button
            onClick={() => setIsSidebarOpen(true)}
            className="w-11 h-11 flex items-center justify-center text-white bg-black/60 backdrop-blur-xl hover:bg-black/80 rounded-xl transition-colors cursor-pointer pointer-events-auto"
            title="Menu"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 8h12M4 14h8" />
            </svg>
          </button>
        </header>

        {/* Main content - conversation or empty state */}
        <div className="flex-1 flex flex-col max-w-2xl mx-auto w-full px-4 pt-16 md:pt-0">
          {activeAgentId ? (
            <ConversationView
              agentId={activeAgentId}
              apiKey={apiKey}
              prompt={activePrompt}
              onStatusChange={handleStatusChange}
              onAgentUpdate={handleAgentUpdate}
              isSdkMode={activeAgentId.startsWith('sdk-')}
              sdkSteps={activeAgentId ? sdkStepsMap[activeAgentId] || [] : []}
              preloadedData={activeAgentId ? agentCache[activeAgentId] : undefined}
              previousTurns={conversationTurns}
              refreshTrigger={refreshTrigger}
            />
          ) : (
            <EmptyState visible={!hasComposerInput} />
          )}

          {/* Composer - sticky at bottom with backdrop blur so content scrolls behind */}
          <div className="mt-auto sticky bottom-0 -mx-4 px-4">
            {/* Gradient fade for content scrolling behind */}
            <div className="absolute inset-x-0 top-0 h-8 bg-gradient-to-b from-transparent to-black/70 pointer-events-none" />
            <div className="pt-6 pb-safe bg-black/70 backdrop-blur-xl">
              <Composer
                onSubmit={handleLaunch}
                isLoading={isLaunching}
                disabled={!isConversationMode && !selectedRepo}
                placeholder="Ask, plan, build anything"
                repos={sortedRepos}
                selectedRepo={selectedRepo}
                onSelectRepo={handleSelectRepo}
                isLoadingRepos={isLoadingRepos}
                isConversationMode={isConversationMode}
                isAgentFinished={isAgentFinished}
                activeRepoName={activeAgentRepo || undefined}
                onInputChange={setHasComposerInput}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
