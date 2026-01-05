'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { toast } from 'sonner';
import Link from 'next/link';
import { Composer, AgentMode } from '@/components/Composer';
import { ConversationView, ConversationTurn } from '@/components/ConversationView';
import { CursorLoader } from '@/components/CursorLoader';
import { HomeActivityList } from '@/components/HomeActivityList';
import { RepoPicker } from '@/components/RepoPicker';
import { UserAvatarDropdown } from '@/components/UserAvatarDropdown';
import { mockCursorApi } from '@/lib/mockApi';
import { Agent, Message } from '@/lib/cursorTypes';
import { AgentStep } from '@/lib/cursorSdk';
import {
  CachedRepo,
} from '@/lib/storage';
import { MockProvider } from '@/lib/mockContext';

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

// Mock version of the main app - uses mockCursorApi instead of real API
function MockedApp() {
  // Auth state - auto-logged in for mock mode
  const [isInitializing, setIsInitializing] = useState(true);
  const [userEmail] = useState('demo@cursor.dev');

  // Repo state
  const [repos, setRepos] = useState<CachedRepo[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<CachedRepo | null>(null);
  const [isLoadingRepos, setIsLoadingRepos] = useState(false);

  // Runs state
  const [runs, setRuns] = useState<Agent[]>([]);
  const [isLoadingRuns, setIsLoadingRuns] = useState(true);
  const [isLaunching, setIsLaunching] = useState(false);

  // Active conversation state
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null);
  const [activePrompt, setActivePrompt] = useState<string>('');
  const [activeAgentStatus, setActiveAgentStatus] = useState<string | null>(null);
  const [activeAgentRepo, setActiveAgentRepo] = useState<string | null>(null);
  const [activeAgentName, setActiveAgentName] = useState<string | null>(null);

  // SDK streaming state
  const [sdkStepsMap, setSdkStepsMap] = useState<Record<string, AgentStep[]>>({});

  // Preloaded agent data cache
  const [agentCache, setAgentCache] = useState<Record<string, { agent: Agent; messages: Message[] }>>({});

  // Conversation history
  const [conversationTurns, setConversationTurns] = useState<ConversationTurn[]>([]);

  // Composer input state
  const [hasComposerInput, setHasComposerInput] = useState(false);

  // Refresh trigger
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Fetch in-flight guard
  const runsFetchInFlight = useRef(false);

  // Initialize mock data
  useEffect(() => {
    const init = async () => {
      try {
        // Fetch mock repos
        setIsLoadingRepos(true);
        const repoList = await mockCursorApi.listRepositories();
        const mappedRepos: CachedRepo[] = repoList.map(r => ({
          owner: r.owner,
          name: r.name,
          repository: r.repository,
          pushedAt: undefined,
        }));
        setRepos(mappedRepos);
        if (mappedRepos.length > 0) {
          setSelectedRepo(mappedRepos[0]);
        }
        setIsLoadingRepos(false);

        // Fetch mock runs
        const agents = await mockCursorApi.listAgents(50);
        setRuns(agents);
        setIsLoadingRuns(false);
      } catch (err) {
        console.error('Mock init failed:', err);
        toast.error('Failed to initialize mock environment');
      } finally {
        setIsInitializing(false);
      }
    };
    init();
  }, []);

  // Fetch runs
  const fetchRuns = useCallback(async () => {
    if (runsFetchInFlight.current) return;
    runsFetchInFlight.current = true;
    
    try {
      const agents = await mockCursorApi.listAgents(50);
      setRuns(agents);
    } catch (err) {
      console.error('Failed to fetch mock agents:', err);
    } finally {
      setIsLoadingRuns(false);
      runsFetchInFlight.current = false;
    }
  }, []);

  // Poll for run updates
  useEffect(() => {
    const interval = setInterval(() => {
      fetchRuns();
    }, 5000);
    
    return () => clearInterval(interval);
  }, [fetchRuns]);

  // Preload agent data
  useEffect(() => {
    if (runs.length === 0) return;

    const toPreload = runs.slice(0, 5);

    const preloadAgent = async (agent: Agent) => {
      try {
        const conversation = await mockCursorApi.getAgentConversation(agent.id);

        setAgentCache((prev) => {
          if (prev[agent.id]) return prev;
          return {
            ...prev,
            [agent.id]: { agent, messages: conversation.messages || [] },
          };
        });
      } catch {
        // Silently fail
      }
    };

    toPreload.forEach((agent, idx) => {
      setTimeout(() => {
        setAgentCache((prev) => {
          if (!prev[agent.id]) {
            preloadAgent(agent);
          }
          return prev;
        });
      }, idx * 300);
    });
  }, [runs]);

  // Sort repos
  const sortedRepos = useMemo(() => {
    return [...repos].sort((a, b) => a.name.localeCompare(b.name));
  }, [repos]);

  // Conversation mode
  const isConversationMode = Boolean(
    activeAgentId && 
    !activeAgentId.startsWith('sdk-') && 
    activeAgentId !== 'pending'
  );
  
  const isAgentRunning = activeAgentStatus === 'RUNNING' || activeAgentStatus === 'CREATING';
  const isAgentFinished = activeAgentStatus === 'FINISHED' || activeAgentStatus === 'STOPPED' || activeAgentStatus === 'ERROR' || activeAgentStatus === 'EXPIRED';

  // Handle launch
  const handleLaunch = async (prompt: string, mode: AgentMode, model: string) => {
    if (isLaunching) return;

    // Follow-up for active conversation
    if (isConversationMode && activeAgentId) {
      setIsLaunching(true);
      
      if (isAgentRunning) {
        try {
          await mockCursorApi.addFollowUp(activeAgentId, {
            prompt: { text: prompt },
          });
          toast.success('Follow-up sent');
        } catch (err) {
          console.error('Failed to send follow-up:', err);
          toast.error('Failed to send follow-up');
        } finally {
          setIsLaunching(false);
        }
        return;
      }
      
      // Agent finished - try follow-up
      try {
        await mockCursorApi.addFollowUp(activeAgentId, {
          prompt: { text: prompt },
        });
        setActiveAgentStatus('RUNNING');
        setRefreshTrigger(prev => prev + 1);
        setIsLaunching(false);
        toast.success('Follow-up sent');
        return;
      } catch {
        // Fall through to launch new agent
      }
      
      // Launch continuation
      const repoToUse = activeAgentRepo ? repos.find(r => r.name === activeAgentRepo) : selectedRepo;
      if (!repoToUse) {
        toast.error('Could not find repository');
        setIsLaunching(false);
        return;
      }
      
      try {
        const previousAgent = agentCache[activeAgentId];
        let contextPrompt = prompt;
        
        const currentTurn: ConversationTurn = {
          prompt: activePrompt,
          messages: previousAgent?.messages || [],
          summary: previousAgent?.agent?.summary,
        };
        
        if (previousAgent?.agent?.summary) {
          contextPrompt = `[Continuing from previous work]\nPrevious: ${previousAgent.agent.summary}\n\nNew request: ${prompt}`;
        }
        
        setConversationTurns(prev => [...prev, currentTurn]);
        setActivePrompt(prompt);
        setActiveAgentId('pending');
        setActiveAgentStatus('CREATING');
        
        const agent = await mockCursorApi.launchAgent({
          prompt: { text: contextPrompt },
          source: { repository: repoToUse.repository },
          target: { autoCreatePr: true },
          model,
        });

        setRuns(prev => [agent, ...prev.filter((r) => r.id !== agent.id)]);
        setActiveAgentId(agent.id);
        setActiveAgentName(agent.name || prompt);
        toast.success('Agent launched');
      } catch (err) {
        console.error('Failed to launch continuation:', err);
        toast.error('Failed to continue');
        setConversationTurns(prev => prev.slice(0, -1));
        setActiveAgentId(null);
        setActivePrompt('');
      } finally {
        setIsLaunching(false);
      }
      return;
    }

    // New agent
    if (!selectedRepo) return;

    setIsLaunching(true);
    setActivePrompt(prompt);
    setActiveAgentRepo(`${selectedRepo.owner}/${selectedRepo.name}`);
    setActiveAgentName(prompt.length > 50 ? prompt.slice(0, 50) + '...' : prompt);
    setConversationTurns([]);
    setActiveAgentId('pending');
    setActiveAgentStatus('CREATING');

    if (mode === 'sdk') {
      // SDK mode - would use mock streaming
      const tempRunId = `sdk-${Date.now()}`;
      try {
        const tempAgent: Agent = {
          id: tempRunId,
          name: prompt.length > 50 ? prompt.slice(0, 50) + '...' : prompt,
          status: 'RUNNING',
          source: { repository: selectedRepo.repository, ref: 'main' },
          target: { branchName: '', url: '', autoCreatePr: false, openAsCursorGithubApp: false, skipReviewerRequest: false },
          createdAt: new Date().toISOString(),
        };
        setRuns(prev => [tempAgent, ...prev]);
        setActiveAgentId(tempRunId);
        setSdkStepsMap((prev) => ({ ...prev, [tempRunId]: [] }));

        // Mock SDK stream
        const mockSteps: AgentStep[] = [
          { type: 'thinking', content: 'Analyzing request...', timestamp: new Date(), isStreaming: true },
          { type: 'tool_start', content: '$ git fetch origin main', timestamp: new Date(), toolType: 'shell' },
          { type: 'tool_complete', content: '✓ Command completed', timestamp: new Date(), toolType: 'shell' },
          { type: 'text', content: `Working on: ${prompt.slice(0, 100)}`, timestamp: new Date(), isStreaming: true },
          { type: 'text', content: 'Completed in mock mode.', timestamp: new Date(), isStreaming: false },
        ];

        for (const step of mockSteps) {
          await new Promise(r => setTimeout(r, 400));
          setSdkStepsMap((prev) => ({
            ...prev,
            [tempRunId]: [...(prev[tempRunId] || []), step],
          }));
        }

        setRuns((prev) =>
          prev.map((r) => (r.id === tempRunId ? { ...r, status: 'FINISHED' } : r))
        );
        toast.success('SDK agent completed');
      } catch (err) {
        console.error('SDK agent failed:', err);
        toast.error('SDK agent failed');
        setRuns((prev) => prev.filter((r) => r.id !== tempRunId));
        setSdkStepsMap((prev) => {
          const next = { ...prev };
          delete next[tempRunId];
          return next;
        });
        setActiveAgentId(null);
        setActivePrompt('');
      } finally {
        setIsLaunching(false);
      }
    } else {
      // Cloud mode
      try {
        const agent = await mockCursorApi.launchAgent({
          prompt: { text: prompt },
          source: { repository: selectedRepo.repository },
          target: { autoCreatePr: true },
          model,
        });

        setRuns(prev => [agent, ...prev.filter((r) => r.id !== agent.id)]);
        setActiveAgentId(agent.id);
        setActiveAgentName(agent.name || prompt);
        toast.success('Agent launched');
      } catch (err) {
        console.error('Failed to launch agent:', err);
        toast.error('Failed to launch agent');
        setActiveAgentId(null);
        setActivePrompt('');
      } finally {
        setIsLaunching(false);
      }
    }
  };

  // Handle selecting an agent
  const handleSelectAgent = (agent: Agent) => {
    setActiveAgentId(agent.id);
    setActivePrompt(agent.name || 'Agent task');
    setActiveAgentStatus(agent.status);
    setActiveAgentName(agent.name || 'Agent task');
    const repoDisplay = getRepoDisplayFromAgent(agent);
    setActiveAgentRepo(repoDisplay);
    setConversationTurns([]);
    setRefreshTrigger(0);
  };

  // Handle going back to home
  const handleBackToHome = () => {
    setActiveAgentId(null);
    setActivePrompt('');
    setActiveAgentStatus(null);
    setActiveAgentRepo(null);
    setActiveAgentName(null);
    setConversationTurns([]);
    setRefreshTrigger(0);
  };

  // Handle agent update
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

  // Handle status change
  const handleStatusChange = useCallback((status: string) => {
    setActiveAgentStatus(status);
  }, []);

  // Handle repo selection
  const handleSelectRepo = (repo: CachedRepo) => {
    setSelectedRepo(repo);
  };

  // Handle logout (go back to real app)
  const handleLogout = () => {
    window.location.href = '/';
  };

  // Loading state
  if (isInitializing) {
    return (
      <div className="min-h-dvh bg-black flex items-center justify-center">
        <CursorLoader size="lg" />
      </div>
    );
  }

  // Determine if we're in chat view or home view
  const isInChatView = activeAgentId !== null;

  // Get the composer placeholder based on context
  const composerPlaceholder = isInChatView 
    ? 'Add a task for Cursor to do'
    : 'Try it out - no API key needed';

  return (
    <div className="min-h-dvh bg-black flex flex-col">
      {/* Demo mode banner */}
      <div className="flex items-center justify-center gap-3 py-2 bg-amber-500/10 border-b border-amber-500/20 text-amber-100 text-sm">
        <span>🎭 Demo Mode - No real API calls</span>
        <Link 
          href="/" 
          className="px-3 py-1 rounded-full bg-white/10 hover:bg-white/20 transition-colors text-xs"
        >
          Exit Demo →
        </Link>
      </div>

      {/* Fixed header with blur */}
      <header className="fixed top-8 left-0 right-0 z-40 bg-black/60 backdrop-blur-xl border-b border-white/[0.06] pt-safe">
        <div className="flex items-center justify-between px-4 h-14">
          {/* Left side - context dependent */}
          {isInChatView ? (
            // Chat view: Back button
            <div className="flex items-center gap-3 flex-1">
              <button
                onClick={handleBackToHome}
                className="w-9 h-9 flex items-center justify-center text-neutral-400 hover:text-white hover:bg-white/10 rounded-xl transition-colors cursor-pointer"
                title="Back"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
                </svg>
              </button>
            </div>
          ) : (
            // Home view: Logo + Repo picker
            <RepoPicker
              repos={sortedRepos}
              selectedRepo={selectedRepo}
              onSelectRepo={handleSelectRepo}
              isLoading={isLoadingRepos}
            />
          )}

          {/* Center - Title (only in chat view) */}
          {isInChatView && (
            <div className="flex-1 text-center px-2">
              <h1 className="text-white text-[15px] font-medium truncate">
                {activeAgentName || 'Agent'}
              </h1>
              <p className="text-neutral-500 text-xs truncate">
                {activeAgentRepo || (selectedRepo ? `${selectedRepo.owner}/${selectedRepo.name}` : 'repository')}
              </p>
            </div>
          )}
          
          {/* Right side - User avatar (with spacer for centering in chat view) */}
          <div className={isInChatView ? 'flex-1 flex justify-end' : ''}>
            <UserAvatarDropdown
              userEmail={userEmail}
              onLogout={handleLogout}
            />
          </div>
        </div>
      </header>

      {/* Main content area */}
      <main className="flex-1 flex flex-col pt-22 pt-safe">
        {isInChatView ? (
          // Chat view - show conversation
          <div className="flex-1 flex flex-col max-w-2xl mx-auto w-full px-4 pb-40">
            <ConversationView
              agentId={activeAgentId}
              apiKey="mock-key"
              prompt={activePrompt}
              onStatusChange={handleStatusChange}
              onAgentUpdate={handleAgentUpdate}
              onAuthFailure={handleLogout}
              isSdkMode={activeAgentId?.startsWith('sdk-') || false}
              sdkSteps={activeAgentId ? sdkStepsMap[activeAgentId] || [] : []}
              preloadedData={activeAgentId ? agentCache[activeAgentId] : undefined}
              previousTurns={conversationTurns}
              refreshTrigger={refreshTrigger}
            />
          </div>
        ) : (
          // Home view - show activity list
          <HomeActivityList
            agents={runs}
            onSelectAgent={handleSelectAgent}
            isLoading={isLoadingRuns}
          />
        )}
      </main>

      {/* Composer - fixed at bottom */}
      <div className="fixed bottom-0 left-0 right-0 z-30 pointer-events-none pb-safe mb-3">
        <div className="max-w-[46rem] mx-auto px-3 pointer-events-auto">
          <Composer
            onSubmit={handleLaunch}
            isLoading={isLaunching}
            disabled={!selectedRepo}
            placeholder={composerPlaceholder}
            onInputChange={setHasComposerInput}
          />
        </div>
      </div>
    </div>
  );
}

export default function MockedPage() {
  return (
    <MockProvider enabled={true}>
      <MockedApp />
    </MockProvider>
  );
}
