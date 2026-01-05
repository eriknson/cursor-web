'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { Agent, Message, getAgentStatus, getAgentConversation, getGitHubBranchCommitsUrl, AuthError, RateLimitError } from '@/lib/cursorClient';
import { AgentStep } from '@/lib/cursorSdk';
import { CursorLoader } from '@/components/CursorLoader';
import { ShimmerText } from '@/components/ShimmerText';
import { theme } from '@/lib/theme';

// Initial loading phases shown before first real message arrives
const INITIAL_PHASES = [
  { message: 'Initializing agent', duration: 2000 },
  { message: 'Thinking', duration: 3000 },
  { message: 'Planning next moves', duration: Infinity }, // Show until real data arrives
];

// Hook to track initial loading phase before agent has real messages
function useInitialLoadingPhase(isActive: boolean, hasMessages: boolean): string | null {
  const [phase, setPhase] = useState(0);
  
  useEffect(() => {
    if (!isActive || hasMessages) {
      // Reset when inactive or when we have messages
      setPhase(0);
      return;
    }
    
    // Progress through phases based on time
    const timers: NodeJS.Timeout[] = [];
    let elapsed = 0;
    
    INITIAL_PHASES.forEach((p, idx) => {
      if (idx > 0 && p.duration !== Infinity) {
        elapsed += INITIAL_PHASES[idx - 1].duration;
        timers.push(setTimeout(() => setPhase(idx), elapsed));
      }
    });
    
    // Set first phase after short delay
    timers.push(setTimeout(() => setPhase(1), INITIAL_PHASES[0].duration));
    timers.push(setTimeout(() => setPhase(2), INITIAL_PHASES[0].duration + INITIAL_PHASES[1].duration));
    
    return () => timers.forEach(clearTimeout);
  }, [isActive, hasMessages]);
  
  if (!isActive || hasMessages) return null;
  return INITIAL_PHASES[phase]?.message || 'Initializing agent';
}

// Get a status message based on REAL agent data
function getAgentStatusMessage(agent: Agent | null, isPending: boolean): string {
  if (isPending) return 'Initializing agent';
  if (!agent) return 'Connecting';
  
  // Show the agent's actual name if available - this is what it's working on
  if (agent.name) {
    // The agent name often describes the task, show it with status
    switch (agent.status) {
      case 'CREATING':
        return `Setting up: ${agent.name}`;
      case 'RUNNING':
        return agent.name;
      default:
        return agent.name;
    }
  }
  
  // Fallback to status-based message
  switch (agent.status) {
    case 'CREATING':
      return 'Setting up workspace';
    case 'RUNNING':
      return 'Working';
    case 'FINISHED':
      return 'Complete';
    case 'STOPPED':
      return 'Stopped';
    case 'ERROR':
      return 'Error occurred';
    case 'EXPIRED':
      return 'Expired';
    default:
      return 'Processing';
  }
}

// Conversation turn from previous agents in the same thread
export interface ConversationTurn {
  prompt: string;
  messages: Message[];
  summary?: string;
}

interface ConversationViewProps {
  agentId: string | null;
  apiKey: string;
  prompt: string;
  onStatusChange?: (status: string) => void;
  onAgentUpdate?: (agentId: string, updates: { status?: string; name?: string }) => void;
  onAuthFailure?: () => void;
  isSdkMode?: boolean;
  sdkSteps?: AgentStep[];
  preloadedData?: { agent: Agent; messages: Message[] };
  // Previous conversation turns from continuation agents
  previousTurns?: ConversationTurn[];
  // Counter that triggers a refetch when incremented (for follow-ups to finished agents)
  refreshTrigger?: number;
  // Initial status hint - used to show appropriate loading UI for past agents
  initialStatus?: string;
}

const INITIAL_POLL_INTERVAL = 1000;
const NORMAL_POLL_INTERVAL = 2000;
const BACKOFF_POLL_INTERVAL = 5000;
// Fetch conversation every 2nd poll to avoid rate limiting
// The Cursor API rate limits conversation endpoint more strictly than status
const CONVERSATION_POLL_FREQUENCY = 2;

// Normalize text whitespace - collapse multiple newlines into single
function normalizeText(text: string): string {
  return text
    .replace(/\n{3,}/g, '\n\n')  // Collapse 3+ newlines to 2
    .replace(/\n\n/g, '\n')       // Collapse double newlines to single
    .trim();
}

// Parse text and render inline code tags
function renderWithCodeTags(text: string) {
  const normalized = normalizeText(text);
  const parts = normalized.split(/(`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith('`') && part.endsWith('`')) {
      const code = part.slice(1, -1);
      return (
        <code 
          key={i} 
          className="px-1.5 py-0.5 rounded text-inherit font-mono text-[0.9em]"
          style={{ background: 'var(--color-theme-bg-tertiary)' }}
        >
          {code}
        </code>
      );
    }
    return part;
  });
}

// Merge consecutive text deltas into single blocks
function mergeTextSteps(steps: AgentStep[]): AgentStep[] {
  const merged: AgentStep[] = [];
  let currentText = '';
  let currentThinking = '';

  for (const step of steps) {
    if (step.type === 'text' && step.content) {
      currentText += step.content;
    } else if (step.type === 'thinking' && step.content) {
      currentThinking += step.content;
    } else {
      if (currentText) {
        merged.push({ type: 'text', content: currentText, timestamp: step.timestamp });
        currentText = '';
      }
      if (currentThinking) {
        merged.push({ type: 'thinking', content: currentThinking, timestamp: step.timestamp });
        currentThinking = '';
      }
      if (step.type !== 'step_complete' && step.type !== 'done' && step.content) {
        merged.push(step);
      }
    }
  }

  if (currentText) {
    merged.push({ type: 'text', content: currentText, timestamp: new Date() });
  }
  if (currentThinking) {
    merged.push({ type: 'thinking', content: currentThinking, timestamp: new Date() });
  }

  return merged;
}

// Individual Step Item
function StepItem({ step }: { step: AgentStep }) {
  switch (step.type) {
    case 'text':
      return (
        <div 
          className="text-[16px] md:text-[15px] leading-tight whitespace-pre-wrap"
          style={{ color: theme.text.primary }}
        >
          {renderWithCodeTags(step.content)}
        </div>
      );

    case 'thinking':
      return (
        <div 
          className="leading-relaxed italic text-xs border-l-2 pl-3"
          style={{ color: theme.text.tertiary, borderColor: theme.border.secondary }}
        >
          {step.content}
        </div>
      );

    case 'tool_start':
      return (
        <div className="flex items-start gap-2 font-mono text-xs py-1">
          <span className="text-amber-500 mt-0.5">▶</span>
          <span style={{ color: theme.text.secondary }}>{step.content}</span>
        </div>
      );

    case 'tool_complete':
      return (
        <div className="flex items-start gap-2 font-mono text-xs py-0.5">
          <span className="text-green-500 mt-0.5">✓</span>
          <span style={{ color: theme.text.tertiary }}>{step.content}</span>
        </div>
      );

    case 'tool_output':
      return (
        <div 
          className="font-mono text-xs rounded px-2 py-1 overflow-x-auto max-h-32 overflow-y-auto"
          style={{ 
            color: theme.text.tertiary,
            background: theme.bg.card,
          }}
        >
          <pre className="whitespace-pre-wrap">{step.content}</pre>
        </div>
      );

    case 'user_message':
      return (
        <div 
          className="text-[16px] md:text-[15px] leading-relaxed"
          style={{ color: theme.text.tertiary }}
        >
          {step.content}
        </div>
      );

    case 'error':
      return (
        <div className="flex items-start gap-2 text-red-400 text-xs py-1">
          <span>✗</span>
          <span>{step.content}</span>
        </div>
      );

    default:
      return null;
  }
}

// SDK Steps View Component
function SdkStepsView({ 
  steps, 
  scrollRef 
}: { 
  steps: AgentStep[]; 
  scrollRef: React.RefObject<HTMLDivElement | null>;
}) {
  const mergedSteps = mergeTextSteps(steps);
  const isActive = steps.length > 0 && steps[steps.length - 1]?.type !== 'done';
  
  // Get last meaningful step for status (SDK provides real-time updates)
  const lastStep = steps[steps.length - 1];
  const statusMessage = lastStep?.type === 'tool_start' 
    ? lastStep.content 
    : 'Working';

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [steps.length, scrollRef]);

  if (steps.length === 0) {
    return (
      <ShimmerText className="text-[16px] md:text-[15px]">
        Starting
      </ShimmerText>
    );
  }

  return (
    <div className="space-y-0.5">
      {mergedSteps.map((step, idx) => (
        <StepItem key={idx} step={step} />
      ))}
      
      {isActive && (
        <ShimmerText className="text-[16px] md:text-[15px] pt-2 block">
          {statusMessage}
        </ShimmerText>
      )}
    </div>
  );
}

// Cloud Agent View
function CloudAgentView({
  agent,
  messages,
  isActive,
  scrollRef,
  isPending,
  initialPrompt,
}: {
  agent: Agent | null;
  messages: Message[];
  isActive: boolean;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  isPending?: boolean;
  initialPrompt: string;
}) {
  // Skip the first user message if it matches our initial prompt (already shown above)
  const displayMessages = messages.filter((msg, idx) => {
    if (idx === 0 && msg.type === 'user_message' && msg.text === initialPrompt) {
      return false;
    }
    return true;
  });
  
  const agentMessages = displayMessages.filter(m => m.type === 'assistant_message');
  const lastMessage = displayMessages[displayMessages.length - 1];
  const isWaitingForResponse = isActive && lastMessage?.type === 'user_message';
  
  // Get initial loading phase message (before any real messages arrive)
  const hasAnyAgentContent = agentMessages.length > 0 || !!agent?.name;
  const initialPhaseMessage = useInitialLoadingPhase(isActive, hasAnyAgentContent);
  
  // Get REAL status from agent data
  const realStatusMessage = getAgentStatusMessage(agent, isPending || false);
  
  // Use initial phase message when we have no real content, otherwise use real status
  const statusMessage = !hasAnyAgentContent && initialPhaseMessage 
    ? initialPhaseMessage 
    : realStatusMessage;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length, scrollRef]);

  // Show thinking when: pending, no agent messages yet, or waiting for response to follow-up
  const showThinking = isPending || (isActive && agentMessages.length === 0) || isWaitingForResponse;
  
  // Determine if the latest agent message is being actively worked on
  const latestAgentMessage = agentMessages[agentMessages.length - 1];
  const isLatestMessageActive = latestAgentMessage && isActive && !isWaitingForResponse;
  
  // Always show shimmer on something when active - either the message or thinking text
  const needsShimmerIndicator = isActive && !showThinking && latestAgentMessage;

  return (
    <div>
      {/* Conversation thread - shows both user follow-ups and agent responses */}
      {displayMessages.map((msg, idx) => {
        const isLatestAgent = msg.type === 'assistant_message' && 
          displayMessages.filter(m => m.type === 'assistant_message').pop()?.id === msg.id;
        const isActiveMessage = isLatestAgent && isActive && !isWaitingForResponse;
        const prevMsg = displayMessages[idx - 1];
        const isAfterUser = prevMsg?.type === 'user_message';

        if (msg.type === 'user_message') {
          // User follow-up message - styled like the initial prompt
          return (
            <div key={msg.id} className="flex justify-end pt-4">
              <div 
                className="rounded-2xl px-4 py-3 max-w-[85%]"
                style={{ background: 'var(--color-theme-bg-card)' }}
              >
                <p 
                  className="text-[16px] md:text-[15px] leading-relaxed"
                  style={{ color: 'var(--color-theme-fg)' }}
                >
                  {msg.text}
                </p>
              </div>
            </div>
          );
        }

        // Agent message - flows together with comfortable spacing
        return (
          <div 
            key={msg.id} 
            className={`relative text-[16px] md:text-[15px] leading-relaxed whitespace-pre-wrap transition-colors ${
              isAfterUser ? 'pt-3' : 'pt-1'
            } ${isActiveMessage ? 'shimmer-active' : ''}`}
            style={{ 
              color: isActiveMessage ? theme.text.primary : theme.text.secondary 
            }}
          >
            {renderWithCodeTags(msg.text)}
          </div>
        );
      })}

      {/* Status indicator - shows REAL agent status/name */}
      {showThinking && (
        <ShimmerText className="text-[16px] md:text-[15px] pt-1 block">
          {statusMessage}
        </ShimmerText>
      )}
      
      {/* Active indicator when we have messages but still working */}
      {needsShimmerIndicator && (
        <ShimmerText className="text-[16px] md:text-[15px] pt-2 block">
          {statusMessage}
        </ShimmerText>
      )}

      {/* Summary - only show when finished */}
      {agent?.summary && !isActive && (
        <div 
          className="text-[16px] md:text-[15px] leading-relaxed pt-1"
          style={{ color: theme.text.primary }}
        >
          {renderWithCodeTags(agent.summary)}
        </div>
      )}

      {/* Commit confirmation - show when finished successfully */}
      {agent && agent.status === 'FINISHED' && (
        <CommitConfirmation agent={agent} />
      )}
    </div>
  );
}

// Format time ago from date string
function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

// Extract repo name from repository string (e.g., "github.com/owner/repo" -> "owner/repo")
function extractRepoName(repo: string): string {
  const parts = repo.split('/');
  if (parts.length >= 3 && parts[0] === 'github.com') {
    return `${parts[1]}/${parts[2]}`;
  }
  if (parts.length >= 2) {
    return `${parts[parts.length - 2]}/${parts[parts.length - 1]}`;
  }
  return parts[parts.length - 1] || repo;
}

// Commit confirmation component - subtle design with arrow pointing to status
function CommitConfirmation({ agent }: { agent: Agent }) {
  // Construct GitHub URL for viewing the commit
  const githubCommitsUrl = getGitHubBranchCommitsUrl(agent.source.repository, agent.target.branchName);
  const timeAgo = agent.createdAt ? formatTimeAgo(agent.createdAt) : '';
  const repoName = extractRepoName(agent.source.repository);
  const branchName = agent.target.branchName;
  
  // Format status message - just owner/repo
  const statusMessage = `Committed to ${repoName} ${timeAgo}`;
  
  // Use the best available URL (PR > commits > Cursor URL)
  const linkUrl = agent.target.prUrl || githubCommitsUrl || agent.target.url;
  
  return (
    <div className="pt-2 flex items-start gap-1.5">
      {/* Small arrow pointing down-right */}
      <span className="text-xs" style={{ color: theme.text.tertiary }}>↘</span>
      
      {/* Status message - subtle and clickable */}
      {linkUrl ? (
        <a
          href={linkUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs transition-colors hover:opacity-80"
          style={{ color: theme.text.tertiary }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = theme.text.secondary;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = theme.text.tertiary;
          }}
        >
          {statusMessage}
        </a>
      ) : (
        <span className="text-xs" style={{ color: theme.text.tertiary }}>
          {statusMessage}
        </span>
      )}
    </div>
  );
}

export function ConversationView({
  agentId,
  apiKey,
  prompt,
  onStatusChange,
  onAgentUpdate,
  onAuthFailure,
  isSdkMode = false,
  sdkSteps = [],
  preloadedData,
  previousTurns = [],
  refreshTrigger = 0,
  initialStatus,
}: ConversationViewProps) {
  const [agent, setAgent] = useState<Agent | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const messageIdsRef = useRef<Set<string>>(new Set());
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const currentAgentIdRef = useRef<string | null>(null);
  const fetchInFlightRef = useRef(false);
  const latestAgentRef = useRef<Agent | null>(null);
  
  const pollCountRef = useRef(0);
  const rateLimitedRef = useRef(false);
  const conversationRateLimitedUntilRef = useRef(0); // Timestamp when to retry conversation
  
  // Stable refs for callbacks to avoid polling instability when parent re-renders
  const onStatusChangeRef = useRef(onStatusChange);
  const onAgentUpdateRef = useRef(onAgentUpdate);
  const onAuthFailureRef = useRef(onAuthFailure);
  
  // Keep refs in sync with props
  useEffect(() => {
    onStatusChangeRef.current = onStatusChange;
    onAgentUpdateRef.current = onAgentUpdate;
    onAuthFailureRef.current = onAuthFailure;
  }, [onStatusChange, onAgentUpdate, onAuthFailure]);
  
  // Handle "pending" state - when user just submitted but we don't have an agent ID yet
  const isPending = agentId === 'pending';

  const isTerminal = agent?.status === 'FINISHED' || agent?.status === 'ERROR' || agent?.status === 'STOPPED' || agent?.status === 'EXPIRED';
  const isActive = agent?.status === 'RUNNING' || agent?.status === 'CREATING' || isPending;

  const fetchAll = useCallback(async (isInitial = false, forceConversation = false): Promise<boolean> => {
    if (!agentId || !apiKey || agentId.startsWith('sdk-')) return false;
    if (fetchInFlightRef.current) return false;
    
    fetchInFlightRef.current = true;
    const release = () => { fetchInFlightRef.current = false; };
    
    let gotData = false;
    
    // Always fetch agent status
    try {
      const status = await getAgentStatus(apiKey, agentId);
      setAgent(status);
      latestAgentRef.current = status;
      setError(null);
      onStatusChangeRef.current?.(status.status);
      if (agentId) {
        onAgentUpdateRef.current?.(agentId, { status: status.status, name: status.name });
      }
      gotData = true;
      rateLimitedRef.current = false;
    } catch (err) {
      if (err instanceof AuthError) {
        onAuthFailureRef.current?.();
        setError('Authentication failed');
        toast.error('Session expired. Please re-enter your API key.');
        release();
        return false;
      }
      if (err instanceof RateLimitError) {
        rateLimitedRef.current = true;
        toast.warning('Rate limited - slowing down requests');
      } else if (isInitial) {
        setError('Failed to load agent');
        toast.error('Failed to load agent data');
      }
    }

    // Only fetch conversation on initial load, forced, or every N polls
    // Also respect rate limit backoff
    const isConversationRateLimited = Date.now() < conversationRateLimitedUntilRef.current;
    const shouldFetchConversation = !isConversationRateLimited && (
      isInitial || forceConversation || 
      (pollCountRef.current % CONVERSATION_POLL_FREQUENCY === 0)
    );
    
    if (shouldFetchConversation) {
      try {
        const conv = await getAgentConversation(apiKey, agentId);
        const newMessages = conv.messages || [];
        
        const newIds = new Set(newMessages.map(m => m.id));
        const hasChanges = newMessages.some(m => !messageIdsRef.current.has(m.id)) ||
                          newMessages.length !== messageIdsRef.current.size;
        
        if (hasChanges) {
          messageIdsRef.current = newIds;
          setMessages(newMessages);
        }
        gotData = true;
        // Reset rate limit on success
        conversationRateLimitedUntilRef.current = 0;
      } catch (err) {
        if (err instanceof AuthError) {
          onAuthFailureRef.current?.();
          setError('Authentication failed');
          release();
          return gotData;
        }
        if (err instanceof RateLimitError || (err instanceof Error && err.message.includes('429'))) {
          // Back off for 5 seconds before retrying conversation endpoint
          conversationRateLimitedUntilRef.current = Date.now() + 5000;
        }
      }
    }

    release();
    return gotData;
  }, [agentId, apiKey]);

  const scheduleNextPoll = useCallback(function scheduleNextPollFn() {
    if (pollingRef.current) clearTimeout(pollingRef.current);
    
    let interval = NORMAL_POLL_INTERVAL;
    
    if (rateLimitedRef.current) {
      interval = BACKOFF_POLL_INTERVAL;
    } else if (pollCountRef.current < 20) {
      // More aggressive polling for first 20 polls (~16-20 seconds)
      // This covers the typical "thinking" phase before first response
      interval = INITIAL_POLL_INTERVAL;
    }
    
    // Add jitter to avoid thundering herd
    const jitter = Math.random() * 200 - 100;
    interval = Math.max(500, interval + jitter);
    
    pollingRef.current = setTimeout(async () => {
      const agentIdToCheck = currentAgentIdRef.current;
      if (!agentIdToCheck || agentIdToCheck === 'pending') return;
      
      pollCountRef.current++;
      await fetchAll();
      
      // Check terminal state using the cached agent from fetchAll
      const currentStatus = latestAgentRef.current?.status;
      const terminal = currentStatus === 'FINISHED' || 
                      currentStatus === 'ERROR' || 
                      currentStatus === 'STOPPED' ||
                      currentStatus === 'EXPIRED';
      
      // Only stop polling if we successfully got a terminal status
      if (terminal) {
        // Give server a moment to finalize, then fetch final state
        await new Promise(r => setTimeout(r, 500));
        await fetchAll(false, true);
        // Do one more fetch after a bit longer to catch any delayed updates like summary
        setTimeout(async () => {
          if (currentAgentIdRef.current === agentIdToCheck) {
            await fetchAll(false, true);
          }
        }, 1500);
        return;
      }
      
      // Continue polling if agent is still current
      if (currentAgentIdRef.current === agentIdToCheck) {
        scheduleNextPollFn();
      }
    }, interval);
  }, [fetchAll]);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearTimeout(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!agentId) {
      stopPolling();
      return;
    }
    
    // Skip processing for "pending" state - just show the prompt
    if (agentId === 'pending') {
      setAgent(null);
      setMessages([]);
      setIsLoading(false);
      return;
    }

    const isSdkAgent = agentId.startsWith('sdk-');

    if (currentAgentIdRef.current !== agentId) {
      currentAgentIdRef.current = agentId;
      setError(null);
      pollCountRef.current = 0;
      rateLimitedRef.current = false;

      if (isSdkAgent) {
        setAgent(null);
        setMessages([]);
        messageIdsRef.current = new Set();
        setIsLoading(false);
      } else if (preloadedData) {
        setAgent(preloadedData.agent);
        setMessages(preloadedData.messages);
        messageIdsRef.current = new Set(preloadedData.messages.map(m => m.id));
        setIsLoading(false);
        onStatusChangeRef.current?.(preloadedData.agent.status);
        
        const isActiveAgent = preloadedData.agent.status === 'RUNNING' || preloadedData.agent.status === 'CREATING';
        if (isActiveAgent) {
          scheduleNextPoll();
        }
      } else {
        setAgent(null);
        setMessages([]);
        messageIdsRef.current = new Set();
        setIsLoading(true);
        fetchAll(true).finally(() => {
          setIsLoading(false);
          scheduleNextPoll();
        });
      }
    }

    return stopPolling;
  }, [agentId, fetchAll, scheduleNextPoll, stopPolling, preloadedData]);

  useEffect(() => {
    if (isTerminal) {
      stopPolling();
    }
  }, [isTerminal, stopPolling]);

  // Restart polling when refreshTrigger changes (e.g., after follow-up to finished agent)
  useEffect(() => {
    if (refreshTrigger > 0 && agentId && !agentId.startsWith('sdk-') && agentId !== 'pending') {
      // Reset rate limit state and restart polling
      pollCountRef.current = 0;
      rateLimitedRef.current = false;
      // Fetch immediately then schedule next poll
      fetchAll(false, true).then(() => {
        scheduleNextPoll();
      });
    }
  }, [refreshTrigger, agentId, fetchAll, scheduleNextPoll]);

  if (!agentId) {
    return null;
  }

  return (
    <div 
      ref={scrollRef}
      data-scroll-container
      className="flex-1 overflow-y-auto flex flex-col"
      style={{ WebkitOverflowScrolling: 'touch' }}
    >
      {/* Conversation content with consistent padding */}
      <div className="pt-16 pb-4 space-y-3 px-4">
        {/* Previous conversation turns - show history from continuation chain */}
        {previousTurns.map((turn, turnIdx) => (
          <div key={`turn-${turnIdx}`} className="space-y-2">
            {/* Previous user prompt */}
            <div className="flex justify-end">
              <div 
                className="rounded-2xl px-4 py-3 max-w-[85%]"
                style={{ background: 'var(--color-theme-bg-card)' }}
              >
                <p 
                  className="text-[16px] md:text-[15px] leading-relaxed"
                  style={{ color: 'var(--color-theme-fg)' }}
                >
                  {turn.prompt}
                </p>
              </div>
            </div>
            
            {/* Previous agent messages */}
            <div className="text-sm">
              {turn.messages.filter(m => m.type === 'assistant_message').map((msg) => (
                <div 
                  key={msg.id} 
                  className="text-[16px] md:text-[15px] leading-relaxed whitespace-pre-wrap pt-1"
                  style={{ color: theme.text.tertiary }}
                >
                  {renderWithCodeTags(msg.text)}
                </div>
              ))}
              
              {/* Previous turn summary */}
              {turn.summary && (
                <div 
                  className="text-[16px] md:text-[15px] leading-relaxed pt-1"
                  style={{ color: theme.text.tertiary }}
                >
                  {renderWithCodeTags(turn.summary)}
                </div>
              )}
            </div>
          </div>
        ))}
        
        {/* Current user prompt - right aligned, contained */}
        <div className="flex justify-end">
          <div 
            className="rounded-2xl px-4 py-3 max-w-[85%]"
            style={{ background: 'var(--color-theme-bg-card)' }}
          >
            <p 
              className="text-[16px] md:text-[15px] leading-relaxed"
              style={{ color: 'var(--color-theme-fg)' }}
            >
              {prompt}
            </p>
          </div>
        </div>

        {/* Current agent response - left aligned */}
        <div className="text-sm">
          {isSdkMode ? (
            <SdkStepsView steps={sdkSteps} scrollRef={scrollRef} />
          ) : error ? (
            <div style={{ color: theme.text.tertiary }}>
              {error}
            </div>
          ) : isPending ? (
            // Pending state - just show thinking while we wait for agent ID
            <ShimmerText className="text-[16px] md:text-[15px]">
              Thinking
            </ShimmerText>
          ) : isLoading ? (
            // Check if loading a past/terminal agent - show logo animation
            // For running agents, show shimmer text instead
            initialStatus === 'FINISHED' || initialStatus === 'STOPPED' || initialStatus === 'ERROR' || initialStatus === 'EXPIRED' ? (
              <div className="flex items-center justify-center py-8">
                <CursorLoader size="lg" />
              </div>
            ) : (
              <ShimmerText className="text-[16px] md:text-[15px]">
                Thinking
              </ShimmerText>
            )
          ) : (
            <CloudAgentView
              agent={agent}
              messages={messages}
              isActive={isActive}
              scrollRef={scrollRef}
              isPending={isPending}
              initialPrompt={prompt}
            />
          )}
        </div>
      </div>
    </div>
  );
}
