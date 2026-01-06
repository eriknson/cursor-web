'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { toast } from 'sonner';
import Image from 'next/image';
import { Composer } from '@/components/Composer';
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
import {
  trackAgentLaunch,
  trackAgentSelect,
  trackAgentFollowUp,
  trackBackToHome,
  trackApiKeySubmit,
  trackLogout,
} from '@/lib/analytics';

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

// Normalize repository string for comparison
// Handles formats like "github.com/owner/repo", "owner/repo", or just "repo"
function normalizeRepo(repo: string): { full: string; name: string; ownerAndName: string } {
  const normalized = repo.toLowerCase().trim().replace(/\/+$/, '');
  const parts = normalized.split('/');
  const name = parts[parts.length - 1] || normalized;

  let ownerAndName = name;
  if (parts.length >= 2) {
    const owner = parts[parts.length - 2];
    if (owner && owner !== 'github.com') {
      ownerAndName = `${owner}/${name}`;
    }
  }

  return { full: normalized, name, ownerAndName };
}

function agentMatchesRepo(agent: Agent, repo: CachedRepo): boolean {
  const agentRepo = normalizeRepo(agent.source.repository);
  const selected = normalizeRepo(repo.repository);

  if (agentRepo.full === selected.full) return true;
  if (agentRepo.ownerAndName === selected.ownerAndName) return true;
  if (agentRepo.name.length > 2 && agentRepo.name === selected.name) return true;
  if (agentRepo.full.endsWith(`/${selected.name}`)) return true;
  if (selected.full.endsWith(`/${agentRepo.name}`)) return true;

  return false;
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

  // Preloaded agent data cache - keyed by agent ID
  const [agentCache, setAgentCache] = useState<Record<string, { agent: Agent; messages: Message[] }>>({});
  const agentPrefetchInFlightRef = useRef<Set<string>>(new Set());

  // Conversation history for continuation chains
  const [conversationTurns, setConversationTurns] = useState<ConversationTurn[]>([]);

  // Track whether composer has input (for hiding empty state)
  const [hasComposerInput, setHasComposerInput] = useState(false);

  // Trigger to restart polling in ConversationView (for follow-ups to finished agents)
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Pending follow-up message for optimistic UI
  const [pendingFollowUp, setPendingFollowUp] = useState<string | null>(null);

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

  const prefetchAgentConversation = useCallback(async (agent: Agent) => {
    if (!apiKey) return;
    if (!agent?.id) return;

    // Already cached
    if (agentCache[agent.id]) return;

    // Deduplicate in-flight requests
    if (agentPrefetchInFlightRef.current.has(agent.id)) return;
    agentPrefetchInFlightRef.current.add(agent.id);

    try {
      const conversation = await getAgentConversation(apiKey, agent.id);
      setAgentCache((prev) => {
        if (prev[agent.id]) return prev;
        return { ...prev, [agent.id]: { agent, messages: conversation.messages || [] } };
      });
    } catch (err) {
      // Silently fail preloading - conversation will fetch on open
      if (err instanceof AuthError) {
        handleAuthFailure();
      }
    } finally {
      agentPrefetchInFlightRef.current.delete(agent.id);
    }
  }, [apiKey, agentCache, handleAuthFailure]);

  // Preload agent data for recent cloud runs
  useEffect(() => {
    if (!apiKey || runs.length === 0) return;

    // Preload first 5 recent runs (runs are already Agent[] from API)
    const toPreload = runs.slice(0, 5);

    // Stagger preloads to avoid rate limits
    toPreload.forEach((agent, idx) => {
      setTimeout(() => {
        prefetchAgentConversation(agent);
      }, idx * 500);
    });
  }, [apiKey, runs, prefetchAgentConversation]);

  // Normalize repository string to "owner/repo" format for consistent matching
  const normalizeRepoKey = (repo: string) => {
    // Handle "github.com/owner/repo" or "owner/repo" formats
    const parts = repo.split('/');
    if (parts.length >= 3 && parts[0].includes('github')) {
      return `${parts[1]}/${parts[2]}`;
    }
    if (parts.length >= 2) {
      return `${parts[parts.length - 2]}/${parts[parts.length - 1]}`;
    }
    return repo;
  };

  // Build a map of repo -> most recent agent activity timestamp
  // This gives us the actual "last used" time for each repo
  const repoLastUsedMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const agent of runs) {
      const repoKey = normalizeRepoKey(agent.source.repository);
      const timestamp = new Date(agent.createdAt).getTime();
      const existing = map.get(repoKey);
      if (!existing || timestamp > existing) {
        map.set(repoKey, timestamp);
      }
    }
    return map;
  }, [runs]);

  // Sort repos by: 1) has agent activity, 2) recent agent activity, 3) pushedAt, 4) alphabetical
  const sortedRepos = useMemo(() => {
    return [...repos].sort((a, b) => {
      const aKey = normalizeRepoKey(a.repository);
      const bKey = normalizeRepoKey(b.repository);
      const aLastUsed = repoLastUsedMap.get(aKey) ?? 0;
      const bLastUsed = repoLastUsedMap.get(bKey) ?? 0;
      
      // Primary: repos with agent activity come first
      const aHasActivity = aLastUsed > 0;
      const bHasActivity = bLastUsed > 0;
      if (aHasActivity !== bHasActivity) {
        return aHasActivity ? -1 : 1; // Repos with activity first
      }
      
      // Secondary: among repos with activity, sort by most recent
      if (aLastUsed !== bLastUsed) {
        return bLastUsed - aLastUsed; // Most recently used first
      }
      
      // Tertiary: pushedAt from API (for repos not yet used with agents)
      const aPushedAt = a.pushedAt ? new Date(a.pushedAt).getTime() : 0;
      const bPushedAt = b.pushedAt ? new Date(b.pushedAt).getTime() : 0;
      
      if (aPushedAt !== bPushedAt) {
        return bPushedAt - aPushedAt; // Most recently pushed first
      }
      
      // Final fallback: alphabetical
      return a.name.localeCompare(b.name);
    });
  }, [repos, repoLastUsedMap]);

  // Prefetch the latest agent conversation for repos with recent activity so opening feels instant.
  useEffect(() => {
    if (!apiKey || runs.length === 0 || sortedRepos.length === 0) return;

    const PREFETCH_REPO_COUNT = 6;
    const PREFETCH_AGENTS_PER_REPO = 1;

    // Repos with activity, sorted by most recent activity (same ordering as picker)
    const reposWithActivity = sortedRepos
      .filter((r) => (repoLastUsedMap.get(normalizeRepoKey(r.repository)) ?? 0) > 0)
      .slice(0, PREFETCH_REPO_COUNT);

    const agentsToPrefetch: Agent[] = [];

    for (const repo of reposWithActivity) {
      const latestForRepo = runs
        .filter((a) => agentMatchesRepo(a, repo))
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, PREFETCH_AGENTS_PER_REPO);

      agentsToPrefetch.push(...latestForRepo);
    }

    // Stagger to avoid rate limits / bursts
    agentsToPrefetch.forEach((agent, idx) => {
      setTimeout(() => prefetchAgentConversation(agent), idx * 450);
    });
  }, [apiKey, runs, sortedRepos, repoLastUsedMap, prefetchAgentConversation]);

  // When the user picks a repo, eagerly prefetch a couple of its most recent conversations.
  useEffect(() => {
    if (!apiKey || !selectedRepo || runs.length === 0) return;

    const PREFETCH_AGENTS_FOR_SELECTED_REPO = 3;
    const latestForRepo = runs
      .filter((a) => agentMatchesRepo(a, selectedRepo))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, PREFETCH_AGENTS_FOR_SELECTED_REPO);

    latestForRepo.forEach((agent, idx) => {
      setTimeout(() => prefetchAgentConversation(agent), idx * 350);
    });
  }, [apiKey, selectedRepo, runs, prefetchAgentConversation]);

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
      
      // Map repos, using pushedAt from Cursor API if available
      // Only fetch from GitHub for repos without pushedAt (as fallback)
      const BATCH_SIZE = 10;
      const mappedRepos: CachedRepo[] = [];
      
      // Repos that need GitHub fallback (no pushedAt from Cursor API)
      const needsGitHubInfo: { repo: typeof repoList[0]; index: number }[] = [];
      
      // First pass: map all repos, note which need GitHub fallback
      for (let i = 0; i < repoList.length; i++) {
        const r = repoList[i];
        mappedRepos.push({
          owner: r.owner,
          name: r.name,
          repository: r.repository,
          pushedAt: r.pushedAt, // Use Cursor API's pushedAt if available
        });
        if (!r.pushedAt) {
          needsGitHubInfo.push({ repo: r, index: i });
        }
      }
      
      // Second pass: fetch pushedAt from GitHub for repos without it (in batches)
      // GitHub allows 60 requests/hour for unauthenticated users
      for (let i = 0; i < needsGitHubInfo.length; i += BATCH_SIZE) {
        const batch = needsGitHubInfo.slice(i, i + BATCH_SIZE);
        const batchResults = await Promise.all(
          batch.map(async ({ repo, index }) => {
            const githubInfo = await fetchGitHubRepoInfo(repo.owner, repo.name);
            return { index, pushedAt: githubInfo?.pushedAt };
          })
        );
        
        // Update the repos with GitHub data
        for (const { index, pushedAt } of batchResults) {
          if (pushedAt) {
            mappedRepos[index].pushedAt = pushedAt;
          }
        }
        
        // Small delay between batches to be nice to the API
        if (i + BATCH_SIZE < needsGitHubInfo.length) {
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
    trackApiKeySubmit();

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
    trackLogout();
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
    activeAgentId !== 'pending'
  );
  
  // Check if agent is still running (for UI hints)
  const isAgentRunning = activeAgentStatus === 'RUNNING' || activeAgentStatus === 'CREATING';
  const isAgentFinished = activeAgentStatus === 'FINISHED' || activeAgentStatus === 'STOPPED' || activeAgentStatus === 'ERROR' || activeAgentStatus === 'EXPIRED';

  // Handle launching agent or sending follow-up/continuation
  const handleLaunch = async (prompt: string, model: string) => {
    if (!apiKey || isLaunching) return;

    // If in conversation mode, try follow-up first, then fall back to continuation
    if (isConversationMode && activeAgentId) {
      setIsLaunching(true);
      
      // If agent is still running, send a follow-up
      if (isAgentRunning) {
        // Show the message immediately (optimistic UI)
        setPendingFollowUp(prompt);
        trackAgentFollowUp(activeAgentId);
        
        try {
          await addFollowUp(apiKey, activeAgentId, {
            prompt: { text: prompt },
          });
          // The ConversationView will pick up the new message via polling
          // and call onFollowUpConfirmed to clear the pending state
        } catch (err) {
          console.error('Failed to send follow-up:', err);
          // Clear the optimistic message on error
          setPendingFollowUp(null);
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
      // Show the message immediately (optimistic UI)
      setPendingFollowUp(prompt);
      trackAgentFollowUp(activeAgentId);
      
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
        // Clear the optimistic message since we're falling through to continuation
        setPendingFollowUp(null);
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

        trackAgentLaunch(repoToUse.repository, model);

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

    // Cloud mode - use REST API
    try {
        const agent = await launchAgent(apiKey, {
          prompt: { text: prompt },
          source: { repository: launchRepo.repository },
          target: { autoCreatePr: true },
          model,
        });

        trackAgentLaunch(launchRepo.repository, model);

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
  };

  // Handle selecting a previous run from activity list
  const handleSelectAgent = (agent: Agent) => {
    trackAgentSelect(agent.id, agent.status);
    setActiveAgentId(agent.id);
    // Use agent name as prompt display (API doesn't return original prompt)
    setActivePrompt(agent.name || 'Agent task');
    setActiveAgentStatus(agent.status);
    setActiveAgentName(agent.name || 'Agent task');
    // Extract full repo display name (owner/repo format)
    const repoDisplay = getRepoDisplayFromAgent(agent);
    setActiveAgentRepo(repoDisplay);
    // Clear conversation history and pending state when switching to a different run
    setConversationTurns([]);
    setRefreshTrigger(0);
    setPendingFollowUp(null);
  };

  // Handle going back to home from conversation
  const handleBackToHome = () => {
    trackBackToHome();
    setActiveAgentId(null);
    setActivePrompt('');
    setActiveAgentStatus(null);
    setActiveAgentRepo(null);
    setActiveAgentName(null);
    setConversationTurns([]);
    setRefreshTrigger(0);
    setPendingFollowUp(null);
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
      // Also update the agent cache so it stays in sync
      setAgentCache(prev => {
        const cached = prev[agentId];
        if (!cached) return prev;
        return {
          ...prev,
          [agentId]: {
            ...cached,
            agent: {
              ...cached.agent,
              ...(updates.status && { status: updates.status as Agent['status'] }),
              ...(updates.name && { name: updates.name }),
            },
          },
        };
      });
    }
  }, []);

  // Legacy handler for backwards compatibility - memoized to prevent polling instability
  const handleStatusChange = useCallback((status: string) => {
    setActiveAgentStatus(status);
  }, []);

  // Callback when pending follow-up has been confirmed in the conversation
  const handleFollowUpConfirmed = useCallback(() => {
    setPendingFollowUp(null);
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
    // App shell uses a fixed viewport height and internal scroll containers.
    // This prevents the window from being the scroll container (which breaks chat "scroll to bottom" on open).
    <div className="h-dvh flex flex-col overflow-hidden" style={{ background: theme.bg.main }}>
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

      {/* ====== TOP EDGE: Header + Search ====== */}
      <div 
        className="fixed top-0 left-0 right-0 z-40 pt-safe" 
        style={{ 
          background: isInChatView 
            ? 'color-mix(in oklab, var(--color-theme-bg) 80%, transparent)' 
            : theme.bg.main,
          backdropFilter: isInChatView ? 'blur(20px) saturate(180%)' : undefined,
          WebkitBackdropFilter: isInChatView ? 'blur(20px) saturate(180%)' : undefined,
        }}
      >
        <div>
          {/* Header bar */}
          <div className="px-4 h-14 flex items-center">
            <div className="max-w-[700px] mx-auto w-full flex items-center justify-between gap-3">
              {/* Left side */}
              {isInChatView ? (
                <div className="flex-shrink-0">
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

              {/* Center - Title (chat view only) - fills available space, truncates when needed */}
              {isInChatView && (
                <div className="flex-1 min-w-0 text-center">
                  <h1 className="text-[15px] font-medium truncate max-w-full" style={{ color: theme.text.primary }}>
                    {activeAgentName || 'Agent'}
                  </h1>
                  <p className="text-xs truncate max-w-full" style={{ color: theme.text.tertiary }}>
                    {activeAgentRepo || (launchRepo ? `${launchRepo.owner}/${launchRepo.name}` : 'repository')}
                  </p>
                </div>
              )}
              
              {/* Right side */}
              <div className="flex-shrink-0">
                <UserAvatarDropdown
                  userEmail={userInfo?.userEmail}
                  onLogout={handleLogout}
                  showEmail={!isInChatView}
                />
              </div>
            </div>
          </div>

          {/* Search bar (home view only) */}
          {!isInChatView && (
            <div className="px-4 pb-3">
              <div className="max-w-[700px] mx-auto">
                <input
                  type="text"
                  placeholder="Search agents..."
                  value={runsSearchQuery}
                  onChange={(e) => setRunsSearchQuery(e.target.value)}
                  className="w-full h-11 px-4 rounded-xl text-[15px] focus:outline-none transition-colors"
                  style={{
                    background: theme.bg.card,
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
        className="flex-1 min-h-0 flex flex-col relative z-20 overflow-hidden"
        style={{ 
          paddingTop: isInChatView 
            ? 'calc(env(safe-area-inset-top, 0px) + 3.5rem)' 
            : 'calc(env(safe-area-inset-top, 0px) + 7rem)',
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 5.5rem)',
        }}
      >
        {isInChatView ? (
          <div className="flex-1 min-h-0 flex flex-col max-w-[700px] mx-auto w-full px-4">
            <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                            <ConversationView
                            agentId={activeAgentId}
                            apiKey={apiKey}
                            prompt={activePrompt}
                            onStatusChange={handleStatusChange}
                            onAgentUpdate={handleAgentUpdate}
                            onAuthFailure={handleAuthFailure}
                            preloadedData={activeAgentId ? agentCache[activeAgentId] : undefined}
                            previousTurns={conversationTurns}
                            refreshTrigger={refreshTrigger}
                            initialStatus={activeAgentStatus || undefined}
                            pendingFollowUp={pendingFollowUp || undefined}
                            onFollowUpConfirmed={handleFollowUpConfirmed}
                          />
            </div>
          </div>
        ) : (
          <div className="flex-1 min-h-0 flex flex-col px-4">
            <div className="max-w-[700px] mx-auto w-full flex-1 min-h-0 flex flex-col">
              <HomeActivityList
                agents={runs}
                onSelectAgent={handleSelectAgent}
                onPrefetchAgent={prefetchAgentConversation}
                isLoading={isLoadingRuns}
                selectedRepo={selectedRepo}
                hideSearch={true}
                searchQuery={runsSearchQuery}
              />
            </div>
          </div>
        )}
      </main>

      {/* ====== BOTTOM EDGE: Composer ====== */}
      <div className="fixed bottom-0 left-0 right-0 z-40 pb-safe">
        <div className="px-4 pb-4 pt-2">
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
