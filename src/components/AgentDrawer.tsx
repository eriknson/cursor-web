'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { Drawer } from 'vaul';
import { Agent, Message, getAgentStatus, getAgentConversation, addFollowUp, stopAgent, getGitHubBranchCommitsUrl } from '@/lib/cursorClient';
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
    
    // Set first phase after short delay
    timers.push(setTimeout(() => setPhase(1), INITIAL_PHASES[0].duration));
    timers.push(setTimeout(() => setPhase(2), INITIAL_PHASES[0].duration + INITIAL_PHASES[1].duration));
    
    return () => timers.forEach(clearTimeout);
  }, [isActive, hasMessages]);
  
  if (!isActive || hasMessages) return null;
  return INITIAL_PHASES[phase]?.message || 'Initializing agent';
}

// Get a status message based on REAL agent data - no fake timers
function getAgentStatusMessage(agent: Agent | null): string {
  if (!agent) return 'Connecting';
  
  // Show the agent's actual name if available - this is what it's working on
  if (agent.name) {
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

interface AgentDrawerProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  agentId: string | null;
  apiKey: string;
  onStatusChange?: (status: string) => void;
  onAgentUpdate?: (agentId: string, updates: { status?: string; name?: string }) => void;
  // SDK mode props
  isSdkMode?: boolean;
  sdkSteps?: AgentStep[];
  // Preloaded data for instant display
  preloadedData?: { agent: Agent; messages: Message[] };
}

const INITIAL_POLL_INTERVAL = 1500;
const NORMAL_POLL_INTERVAL = 3000;
const BACKOFF_POLL_INTERVAL = 8000;

// Format time ago
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

// Parse text and render inline code tags
function renderWithCodeTags(text: string) {
  const parts = text.split(/(`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith('`') && part.endsWith('`')) {
      const code = part.slice(1, -1);
      return (
        <code 
          key={i} 
          className="px-1.5 py-0.5 bg-white/5 rounded text-inherit font-mono"
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
      // Flush accumulated text
      if (currentText) {
        merged.push({ type: 'text', content: currentText, timestamp: step.timestamp });
        currentText = '';
      }
      if (currentThinking) {
        merged.push({ type: 'thinking', content: currentThinking, timestamp: step.timestamp });
        currentThinking = '';
      }
      // Skip empty step_complete and done events
      if (step.type !== 'step_complete' && step.type !== 'done' && step.content) {
        merged.push(step);
      }
    }
  }

  // Flush remaining text
  if (currentText) {
    merged.push({ type: 'text', content: currentText, timestamp: new Date() });
  }
  if (currentThinking) {
    merged.push({ type: 'thinking', content: currentThinking, timestamp: new Date() });
  }

  return merged;
}

// SDK Steps View Component
function SdkStepsView({ 
  steps, 
  messagesEndRef 
}: { 
  steps: AgentStep[]; 
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
}) {
  const mergedSteps = mergeTextSteps(steps);
  const isActive = steps.length > 0 && steps[steps.length - 1]?.type !== 'done';
  
  // Get last meaningful step for real-time status (SDK provides streaming updates)
  const lastStep = steps[steps.length - 1];
  const statusMessage = lastStep?.type === 'tool_start' 
    ? lastStep.content 
    : 'Working';

  // Auto-scroll when new steps arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [steps.length, messagesEndRef]);

  if (steps.length === 0) {
    return (
      <div className="px-5 py-4">
        <div className="shimmer-text text-[16px] md:text-[15px]">
          Starting
        </div>
      </div>
    );
  }

  return (
    <div className="text-[16px] md:text-[15px]">
      <div className="px-5 py-4 space-y-2">
        {mergedSteps.map((step, idx) => (
          <StepItem key={idx} step={step} />
        ))}
        
        {/* Active indicator - shows real status from last step */}
        {isActive && (
          <div className="shimmer-text text-[16px] md:text-[15px] pt-2">
            {statusMessage}
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>
    </div>
  );
}

// Individual Step Item
function StepItem({ step }: { step: AgentStep }) {
  switch (step.type) {
    case 'text':
      return (
        <div className="text-white leading-relaxed whitespace-pre-wrap">
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
        <div className="text-neutral-500 leading-relaxed">
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

// Cloud Agent Streaming View - shows conversation in real-time
function CloudAgentStreamView({
  agent,
  messages,
  isActive,
  messagesEndRef,
}: {
  agent: Agent | null;
  messages: Message[];
  isActive: boolean;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
}) {
  const agentMessages = messages.filter(m => m.type === 'assistant_message');
  const userMessage = messages.find(m => m.type === 'user_message');
  
  // Get initial loading phase message (before any real messages arrive)
  const hasAnyAgentContent = agentMessages.length > 0 || !!agent?.name;
  const initialPhaseMessage = useInitialLoadingPhase(isActive, hasAnyAgentContent);
  
  // Get REAL status from agent data
  const realStatusMessage = getAgentStatusMessage(agent);
  
  // Use initial phase message when we have no real content, otherwise use real status
  const statusMessage = !hasAnyAgentContent && initialPhaseMessage 
    ? initialPhaseMessage 
    : realStatusMessage;

  // Auto-scroll when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, messagesEndRef]);

  // Always show shimmer on something when active
  const needsShimmerIndicator = isActive && agentMessages.length > 0;

  return (
    <div className="text-[16px] md:text-[15px]">
      <div className="px-5 py-4 space-y-3">
        {/* User message - contained */}
        {userMessage && (
          <div className="bg-white/5 rounded-lg px-4 py-3">
            <p className="text-white leading-relaxed">
              {renderWithCodeTags(userMessage.text)}
            </p>
          </div>
        )}

        {/* Agent response section */}
        <div className="space-y-1.5">
          {/* Status indicator - shows initial phases then real agent status/name */}
          {agentMessages.length === 0 && isActive && (
            <div className="shimmer-text text-[16px] md:text-[15px]">
              {statusMessage}
            </div>
          )}

          {/* Agent messages - streaming conversation */}
          {agentMessages.map((msg, idx) => {
            const isLatest = idx === agentMessages.length - 1;
            const isActiveMessage = isLatest && isActive;

            return (
              <div 
                key={msg.id} 
                className={`relative leading-relaxed whitespace-pre-wrap transition-colors ${
                  isActiveMessage 
                    ? 'text-white shimmer-active' 
                    : 'text-neutral-500'
                }`}
              >
                {renderWithCodeTags(msg.text)}
              </div>
            );
          })}

          {/* Status indicator - shows REAL agent status when active with messages */}
          {needsShimmerIndicator && (
            <div className="shimmer-text text-[16px] md:text-[15px] pt-2">
              {statusMessage}
            </div>
          )}

          {/* Summary - shown in default text color when complete */}
          {agent?.summary && !isActive && (
            <div className="text-white leading-relaxed pt-2">
              {renderWithCodeTags(agent.summary)}
            </div>
          )}
        </div>

        <div ref={messagesEndRef} />
      </div>

      {/* Commit confirmation - show when finished successfully */}
      {agent && agent.status === 'FINISHED' && (
        <DrawerCommitConfirmation agent={agent} />
      )}

      {/* Metadata row for non-finished states */}
      {agent && agent.status !== 'FINISHED' && (
        <div className="px-5 py-3 border-t border-neutral-900 flex items-center gap-3 text-xs text-neutral-600">
          <span className="text-neutral-500">{agent.target.branchName}</span>
          <span className="text-neutral-700">·</span>
          <a
            href={agent.target.url}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-white transition-colors"
          >
            Open in Cursor
          </a>
        </div>
      )}
    </div>
  );
}

// Commit confirmation component for the drawer
function DrawerCommitConfirmation({ agent }: { agent: Agent }) {
  // Construct GitHub URL for viewing the commit
  const githubCommitsUrl = getGitHubBranchCommitsUrl(agent.source.repository, agent.target.branchName);
  const timeAgo = agent.createdAt ? formatTimeAgo(agent.createdAt) : '';
  
  return (
    <div className="px-5 py-4 border-t border-neutral-900 bg-neutral-950/50">
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
        
        {/* Time ago - muted text */}
        {timeAgo && (
          <span className="text-neutral-500">{timeAgo}</span>
        )}
      </div>
    </div>
  );
}

export function AgentDrawer({
  isOpen,
  onOpenChange,
  agentId,
  apiKey,
  onStatusChange,
  onAgentUpdate,
  isSdkMode = false,
  sdkSteps = [],
  preloadedData,
}: AgentDrawerProps) {
  const [agent, setAgent] = useState<Agent | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [followUp, setFollowUp] = useState('');
  const [isSendingFollowUp, setIsSendingFollowUp] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messageIdsRef = useRef<Set<string>>(new Set());
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const currentAgentIdRef = useRef<string | null>(null);
  
  const pollCountRef = useRef(0);
  const rateLimitedRef = useRef(false);

  const isTerminal = agent?.status === 'FINISHED' || agent?.status === 'ERROR' || agent?.status === 'STOPPED';
  const isActive = agent?.status === 'RUNNING' || agent?.status === 'CREATING';

  const fetchAll = useCallback(async (isInitial = false): Promise<boolean> => {
    // Skip Cloud API calls for SDK agents (they have IDs starting with 'sdk-')
    if (!agentId || !apiKey || agentId.startsWith('sdk-')) return false;
    
    let gotData = false;
    
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

    await new Promise(r => setTimeout(r, 300));

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
      rateLimitedRef.current = false;
    } catch (err) {
      if (err instanceof Error && err.message.includes('429')) {
        rateLimitedRef.current = true;
      }
    }

    return gotData;
  }, [agentId, apiKey, onStatusChange]);

  const scheduleNextPoll = useCallback(() => {
    if (pollingRef.current) clearTimeout(pollingRef.current);
    
    let interval = NORMAL_POLL_INTERVAL;
    
    if (rateLimitedRef.current) {
      interval = BACKOFF_POLL_INTERVAL;
    } else if (pollCountRef.current < 5) {
      interval = INITIAL_POLL_INTERVAL;
    }
    
    pollingRef.current = setTimeout(async () => {
      const agentIdToCheck = currentAgentIdRef.current;
      if (!agentIdToCheck) return;
      
      pollCountRef.current++;
      await fetchAll();
      
      const currentAgent = await getAgentStatus(apiKey, agentIdToCheck).catch(() => null);
      const terminal = currentAgent?.status === 'FINISHED' || 
                      currentAgent?.status === 'ERROR' || 
                      currentAgent?.status === 'STOPPED';
      
      if (terminal) {
        // Give server a moment to finalize, then fetch final state
        await new Promise(r => setTimeout(r, 500));
        await fetchAll();
        // Do one more fetch after a bit longer to catch any delayed updates like summary
        setTimeout(async () => {
          if (currentAgentIdRef.current === agentIdToCheck) {
            await fetchAll();
          }
        }, 1500);
        return;
      }
      
      scheduleNextPoll();
    }, interval);
  }, [fetchAll, apiKey]);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearTimeout(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!isOpen) {
      stopPolling();
      return;
    }

    if (!agentId) {
      stopPolling();
      return;
    }

    // SDK agents don't use Cloud API polling
    const isSdkAgent = agentId.startsWith('sdk-');

    if (currentAgentIdRef.current !== agentId) {
      currentAgentIdRef.current = agentId;
      setError(null);
      pollCountRef.current = 0;
      rateLimitedRef.current = false;

      if (isSdkAgent) {
        // SDK agents stream data directly, no loading needed
        setAgent(null);
        setMessages([]);
        messageIdsRef.current = new Set();
        setIsLoading(false);
      } else if (preloadedData) {
        // Use preloaded data for instant display
        setAgent(preloadedData.agent);
        setMessages(preloadedData.messages);
        messageIdsRef.current = new Set(preloadedData.messages.map(m => m.id));
        setIsLoading(false);
        onStatusChange?.(preloadedData.agent.status);
        
        // Still poll if agent is active
        const isActiveAgent = preloadedData.agent.status === 'RUNNING' || preloadedData.agent.status === 'CREATING';
        if (isActiveAgent) {
          scheduleNextPoll();
        }
      } else {
        // Cloud agents need to fetch status via API
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
  }, [isOpen, agentId, fetchAll, scheduleNextPoll, stopPolling, preloadedData, onStatusChange]);

  useEffect(() => {
    if (isTerminal) {
      stopPolling();
    }
  }, [isTerminal, stopPolling]);

  const handleSendFollowUp = async () => {
    if (!followUp.trim() || !agentId || !apiKey || isSendingFollowUp) return;

    const text = followUp.trim();
    setFollowUp('');
    setIsSendingFollowUp(true);
    
    try {
      await addFollowUp(apiKey, agentId, { prompt: { text } });
      await fetchAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send');
      setFollowUp(text);
    } finally {
      setIsSendingFollowUp(false);
    }
  };

  const handleStop = async () => {
    if (!agentId || !apiKey || isStopping) return;

    setIsStopping(true);
    try {
      await stopAgent(apiKey, agentId);
      await fetchAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to stop');
    } finally {
      setIsStopping(false);
    }
  };

  return (
    <Drawer.Root open={isOpen} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-black/90 z-50" />
        <Drawer.Content className="fixed inset-x-0 bottom-0 z-50 flex flex-col max-h-[85vh] rounded-t-xl bg-neutral-950">
          {/* Handle */}
          <div className="flex justify-center pt-3 pb-2">
            <div className="w-8 h-0.5 rounded-full bg-neutral-700" />
          </div>

          {/* Header */}
          <header className="flex items-center justify-between px-5 pb-4">
            <div className="flex items-center gap-3">
              <Drawer.Title className="text-base font-medium text-white">
                {agent?.name || 'Agent'}
              </Drawer.Title>
              {agent && (
                <span className="text-xs text-neutral-500">
                  {formatTimeAgo(agent.createdAt)}
                </span>
              )}
              {isActive && (
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
              )}
            </div>
            <div className="flex items-center gap-4">
              {agent && !isTerminal && (
                <button
                  onClick={handleStop}
                  disabled={isStopping}
                  className="text-xs text-neutral-500 hover:text-white transition-colors disabled:opacity-50"
                >
                  {isStopping ? 'Stopping...' : 'Stop'}
                </button>
              )}
              <Drawer.Close className="text-neutral-600 hover:text-white transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </Drawer.Close>
            </div>
          </header>

          {/* Content */}
          <div className="flex-1 overflow-y-auto">
            {isSdkMode ? (
              /* SDK Mode - show streaming steps with real-time updates */
              <SdkStepsView steps={sdkSteps} messagesEndRef={messagesEndRef} />
            ) : error ? (
              <div className="px-5 py-6 text-[16px] md:text-[15px] text-neutral-500">
                {error}
              </div>
            ) : isLoading ? (
              <div className="px-5 py-4 space-y-3">
                {/* Skeleton for user message */}
                <div className="bg-white/5 rounded-lg px-4 py-3 space-y-2">
                  <div className="h-4 bg-white/10 rounded w-3/4 skeleton-shimmer" />
                  <div className="h-4 bg-white/10 rounded w-1/2 skeleton-shimmer" style={{ animationDelay: '0.1s' }} />
                </div>
                
                {/* Skeleton for agent response */}
                <div className="space-y-2 pl-0.5">
                  <div className="flex items-center gap-3">
                    <div className="w-1 h-5 bg-white/20 rounded-sm skeleton-shimmer" />
                    <div className="h-3 bg-white/8 rounded w-24 skeleton-shimmer" style={{ animationDelay: '0.15s' }} />
                  </div>
                  <div className="space-y-1.5 mt-2">
                    <div className="h-3.5 bg-white/6 rounded w-full skeleton-shimmer" style={{ animationDelay: '0.2s' }} />
                    <div className="h-3.5 bg-white/6 rounded w-5/6 skeleton-shimmer" style={{ animationDelay: '0.25s' }} />
                    <div className="h-3.5 bg-white/6 rounded w-2/3 skeleton-shimmer" style={{ animationDelay: '0.3s' }} />
                  </div>
                </div>
              </div>
            ) : (
              /* Cloud Mode - show streaming conversation with shimmer effects */
              <CloudAgentStreamView
                agent={agent}
                messages={messages}
                isActive={isActive}
                messagesEndRef={messagesEndRef}
              />
            )}
          </div>

          {/* Follow-up input */}
          {agent && !isTerminal ? (
            <div className="px-5 pt-4 pb-safe">
              <div className="flex gap-3">
                <input
                  type="text"
                  value={followUp}
                  onChange={(e) => setFollowUp(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSendFollowUp()}
                  placeholder="Follow up..."
                  className="flex-1 px-3 py-2 bg-white/[0.03] rounded-lg text-[16px] md:text-[15px] text-white placeholder:text-neutral-700 focus:outline-none focus:bg-white/[0.05] transition-colors"
                />
                <button
                  onClick={handleSendFollowUp}
                  disabled={!followUp.trim() || isSendingFollowUp}
                  className="px-4 py-2 bg-white text-black text-[16px] md:text-[15px] font-medium rounded-lg hover:bg-neutral-200 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  {isSendingFollowUp ? '...' : 'Send'}
                </button>
              </div>
            </div>
          ) : (
            /* Safe area spacing when no input shown */
            <div className="pb-safe" />
          )}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
