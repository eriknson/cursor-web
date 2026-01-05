'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { Agent, Message, getAgentStatus, getAgentConversation, getGitHubBranchCommitsUrl } from '@/lib/cursorClient';
import { AgentStep } from '@/lib/cursorSdk';

// Initial loading phases shown before first real message arrives
const INITIAL_PHASES = [
  { message: 'Initializing agent', duration: 2000 },
  { message: 'Thinking', duration: 3000 },
  { message: 'Planning next moves', duration: Infinity }, // Show until real data arrives
];

// Hook to track initial loading phase before agent has real messages
function useInitialLoadingPhase(isActive: boolean, hasMessages: boolean): string | null {
  const [phase, setPhase] = useState(0);
  const startTimeRef = useRef<number>(Date.now());
  
  useEffect(() => {
    if (!isActive || hasMessages) {
      // Reset when inactive or when we have messages
      setPhase(0);
      startTimeRef.current = Date.now();
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
  isSdkMode?: boolean;
  sdkSteps?: AgentStep[];
  preloadedData?: { agent: Agent; messages: Message[] };
  // Previous conversation turns from continuation agents
  previousTurns?: ConversationTurn[];
  // Counter that triggers a refetch when incremented (for follow-ups to finished agents)
  refreshTrigger?: number;
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
          className="px-1.5 py-0.5 bg-white/5 rounded text-inherit font-mono text-[0.9em]"
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
        <div className="text-white text-[16px] md:text-[15px] leading-tight whitespace-pre-wrap">
          {renderWithCodeTags(step.content)}
        </div>
      );

    case 'thinking':
      return (
        <div className="text-neutral-500 leading-relaxed italic text-xs border-l-2 border-neutral-800 pl-3">
          {step.content}
        </div>
      );

    case 'tool_start':
      return (
        <div className="flex items-start gap-2 font-mono text-xs py-1">
          <span className="text-amber-500 mt-0.5">▶</span>
          <span className="text-neutral-400">{step.content}</span>
        </div>
      );

    case 'tool_complete':
      return (
        <div className="flex items-start gap-2 font-mono text-xs py-0.5">
          <span className="text-green-500 mt-0.5">✓</span>
          <span className="text-neutral-500">{step.content}</span>
        </div>
      );

    case 'tool_output':
      return (
        <div className="font-mono text-xs text-neutral-600 bg-neutral-900 rounded px-2 py-1 overflow-x-auto max-h-32 overflow-y-auto">
          <pre className="whitespace-pre-wrap">{step.content}</pre>
        </div>
      );

    case 'user_message':
      return (
        <div className="text-neutral-500 text-[16px] md:text-[15px] leading-relaxed">
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
      <div className="shimmer-text text-[16px] md:text-[15px]">
        Starting
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      {mergedSteps.map((step, idx) => (
        <StepItem key={idx} step={step} />
      ))}
      
      {isActive && (
        <div className="shimmer-text text-[16px] md:text-[15px] pt-2">
          {statusMessage}
        </div>
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
              <div className="bg-neutral-900 rounded-2xl px-4 py-3 max-w-[85%]">
                <p className="text-white text-[16px] md:text-[15px] leading-relaxed">
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
            } ${
              isActiveMessage 
                ? 'text-white shimmer-active' 
                : 'text-neutral-400'
            }`}
          >
            {renderWithCodeTags(msg.text)}
          </div>
        );
      })}

      {/* Status indicator - shows REAL agent status/name */}
      {showThinking && (
        <div className="shimmer-text text-[16px] md:text-[15px] pt-1">
          {statusMessage}
        </div>
      )}
      
      {/* Active indicator when we have messages but still working */}
      {needsShimmerIndicator && (
        <div className="shimmer-text text-[16px] md:text-[15px] pt-2 text-neutral-500">
          {statusMessage}
        </div>
      )}

      {/* Summary - only show when finished */}
      {agent?.summary && !isActive && (
        <div className="text-white text-[16px] md:text-[15px] leading-relaxed pt-1">
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

// Commit confirmation component - minimal design with just View Commit button
function CommitConfirmation({ agent }: { agent: Agent }) {
  // Construct GitHub URL for viewing the commit
  const githubCommitsUrl = getGitHubBranchCommitsUrl(agent.source.repository, agent.target.branchName);
  const timeAgo = agent.createdAt ? formatTimeAgo(agent.createdAt) : '';
  
  return (
    <div className="mt-4 pt-4 border-t border-neutral-800/50">
      <div className="flex items-center gap-3 text-xs">
        {/* PR link - show if available */}
        {agent.target.prUrl && (
          <a
            href={agent.target.prUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 text-neutral-400 rounded-lg hover:bg-white/10 hover:text-white transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 16 16">
              <path d="M1.5 3.25a2.25 2.25 0 1 1 3 2.122v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.25 2.25 0 0 1 1.5 3.25Zm5.677-.177L9.573.677A.25.25 0 0 1 10 .854V2.5h1A2.5 2.5 0 0 1 13.5 5v5.628a2.251 2.251 0 1 1-1.5 0V5a1 1 0 0 0-1-1h-1v1.646a.25.25 0 0 1-.427.177L7.177 3.427a.25.25 0 0 1 0-.354ZM3.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm0 9.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm8.25.75a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Z"/>
            </svg>
            View Pull Request
          </a>
        )}
        
        {/* View Commit button */}
        {githubCommitsUrl && (
          <a
            href={githubCommitsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 text-neutral-400 rounded-lg hover:bg-white/10 hover:text-white transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 16 16">
              <path d="M11.93 8.5a4.002 4.002 0 0 1-7.86 0H.75a.75.75 0 0 1 0-1.5h3.32a4.002 4.002 0 0 1 7.86 0h3.32a.75.75 0 0 1 0 1.5Zm-1.43-.75a2.5 2.5 0 1 0-5 0 2.5 2.5 0 0 0 5 0Z"/>
            </svg>
            View Commit
          </a>
        )}
        
        {/* Cursor app link as fallback */}
        {agent.target.url && !agent.target.prUrl && !githubCommitsUrl && (
          <a
            href={agent.target.url}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 bg-white/5 text-neutral-400 rounded-lg hover:bg-white/10 hover:text-white transition-colors"
          >
            Open in Cursor
          </a>
        )}
        
        {/* Time ago - muted text */}
        {timeAgo && (
          <span className="text-neutral-500">{timeAgo}</span>
        )}
      </div>
    </div>
  );
}

export function ConversationView({
  agentId,
  apiKey,
  prompt,
  onStatusChange,
  onAgentUpdate,
  isSdkMode = false,
  sdkSteps = [],
  preloadedData,
  previousTurns = [],
  refreshTrigger = 0,
}: ConversationViewProps) {
  const [agent, setAgent] = useState<Agent | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const messageIdsRef = useRef<Set<string>>(new Set());
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const currentAgentIdRef = useRef<string | null>(null);
  
  const pollCountRef = useRef(0);
  const rateLimitedRef = useRef(false);
  const conversationRateLimitedUntilRef = useRef(0); // Timestamp when to retry conversation
  
  // Handle "pending" state - when user just submitted but we don't have an agent ID yet
  const isPending = agentId === 'pending';

  const isTerminal = agent?.status === 'FINISHED' || agent?.status === 'ERROR' || agent?.status === 'STOPPED';
  const isActive = agent?.status === 'RUNNING' || agent?.status === 'CREATING' || isPending;

  const fetchAll = useCallback(async (isInitial = false, forceConversation = false): Promise<boolean> => {
    if (!agentId || !apiKey || agentId.startsWith('sdk-')) return false;
    
    let gotData = false;
    
    // Always fetch agent status
    try {
      const status = await getAgentStatus(apiKey, agentId);
      setAgent(status);
      setError(null);
      onStatusChange?.(status.status);
      if (agentId) {
        onAgentUpdate?.(agentId, { status: status.status, name: status.name });
      }
      gotData = true;
      rateLimitedRef.current = false;
    } catch (err) {
      if (err instanceof Error && err.message.includes('429')) {
        rateLimitedRef.current = true;
      } else if (isInitial) {
        setError('Failed to load agent');
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
        if (err instanceof Error && (err.message.includes('429') || err.message.includes('Rate limited'))) {
          // Back off for 5 seconds before retrying conversation endpoint
          conversationRateLimitedUntilRef.current = Date.now() + 5000;
        }
      }
    }

    return gotData;
  }, [agentId, apiKey, onStatusChange, onAgentUpdate]);

  const scheduleNextPoll = useCallback(() => {
    if (pollingRef.current) clearTimeout(pollingRef.current);
    
    let interval = NORMAL_POLL_INTERVAL;
    
    if (rateLimitedRef.current) {
      interval = BACKOFF_POLL_INTERVAL;
    } else if (pollCountRef.current < 20) {
      // More aggressive polling for first 20 polls (~16-20 seconds)
      // This covers the typical "thinking" phase before first response
      interval = INITIAL_POLL_INTERVAL;
    }
    
    pollingRef.current = setTimeout(async () => {
      const agentIdToCheck = currentAgentIdRef.current;
      if (!agentIdToCheck || agentIdToCheck === 'pending') return;
      
      pollCountRef.current++;
      await fetchAll();
      
      // Check terminal state using the agent we already fetched
      // We stored it in state during fetchAll
      const currentStatus = await getAgentStatus(apiKey, agentIdToCheck).catch(() => null);
      const terminal = currentStatus?.status === 'FINISHED' || 
                      currentStatus?.status === 'ERROR' || 
                      currentStatus?.status === 'STOPPED';
      
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
        scheduleNextPoll();
      }
    }, interval);
  }, [fetchAll, apiKey]);

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
        onStatusChange?.(preloadedData.agent.status);
        
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
  }, [agentId, fetchAll, scheduleNextPoll, stopPolling, preloadedData, onStatusChange]);

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
      className="flex-1 overflow-y-auto flex flex-col overscroll-contain keyboard-stable"
      style={{ WebkitOverflowScrolling: 'touch' }}
    >
      <div className="flex-1" />
      <div className="py-6 space-y-2">
        {/* Previous conversation turns - show history from continuation chain */}
        {previousTurns.map((turn, turnIdx) => (
          <div key={`turn-${turnIdx}`} className="space-y-2">
            {/* Previous user prompt */}
            <div className="flex justify-end">
              <div className="bg-neutral-900 rounded-2xl px-4 py-3 max-w-[85%]">
                <p className="text-white text-[16px] md:text-[15px] leading-relaxed">
                  {turn.prompt}
                </p>
              </div>
            </div>
            
            {/* Previous agent messages */}
            <div className="text-sm">
              {turn.messages.filter(m => m.type === 'assistant_message').map((msg) => (
                <div 
                  key={msg.id} 
                  className="text-neutral-500 text-[16px] md:text-[15px] leading-relaxed whitespace-pre-wrap pt-1"
                >
                  {renderWithCodeTags(msg.text)}
                </div>
              ))}
              
              {/* Previous turn summary */}
              {turn.summary && (
                <div className="text-neutral-500 text-[16px] md:text-[15px] leading-relaxed pt-1">
                  {renderWithCodeTags(turn.summary)}
                </div>
              )}
            </div>
          </div>
        ))}
        
        {/* Current user prompt - right aligned, contained */}
        <div className="flex justify-end">
          <div className="bg-neutral-900 rounded-2xl px-4 py-3 max-w-[85%]">
            <p className="text-white text-[16px] md:text-[15px] leading-relaxed">
              {prompt}
            </p>
          </div>
        </div>

        {/* Current agent response - left aligned */}
        <div className="text-sm">
          {isSdkMode ? (
            <SdkStepsView steps={sdkSteps} scrollRef={scrollRef} />
          ) : error ? (
            <div className="text-neutral-500">
              {error}
            </div>
          ) : isPending ? (
            // Pending state - just show thinking while we wait for agent ID
            <div className="shimmer-text text-[16px] md:text-[15px]">
              Thinking
            </div>
          ) : isLoading ? (
            <div className="shimmer-text text-[16px] md:text-[15px]">
              Thinking
            </div>
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
