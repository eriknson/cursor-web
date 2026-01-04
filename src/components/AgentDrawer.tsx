'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { Drawer } from 'vaul';
import { Agent, Message, getAgentStatus, getAgentConversation, addFollowUp, stopAgent } from '@/lib/cursorClient';
import { AgentStep } from '@/lib/cursorSdk';
import { CursorLoader } from './CursorLoader';

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

  // Auto-scroll when new steps arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [steps.length, messagesEndRef]);

  if (steps.length === 0) {
    return (
      <div className="px-5 py-4">
        <div className="flex items-center gap-2 text-neutral-500">
          <CursorLoader size="sm" />
          <span>Starting SDK agent...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="text-sm">
      <div className="px-5 py-4 space-y-2">
        {mergedSteps.map((step, idx) => (
          <StepItem key={idx} step={step} />
        ))}
        
        {/* Active indicator */}
        {isActive && (
          <div className="flex items-center gap-2 text-neutral-500 pt-1">
            <CursorLoader size="sm" />
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

  // Auto-scroll when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, messagesEndRef]);

  return (
    <div className="text-sm">
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
          {/* Planning state - shimmer effect */}
          {agentMessages.length === 0 && isActive && (
            <div className="flex items-center gap-3">
              <div className="w-1 h-5 bg-white/60 rounded-sm animate-pulse" />
              <span className="shimmer-text">Planning next moves...</span>
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
                    ? 'text-white pl-3 border-l-2 border-white/40' 
                    : 'text-neutral-500'
                }`}
              >
                {renderWithCodeTags(msg.text)}
                {isActiveMessage && (
                  <span className="inline-block w-1 h-4 ml-1 bg-white/60 rounded-sm animate-pulse align-middle" />
                )}
              </div>
            );
          })}

          {/* Thinking indicator - shimmer effect */}
          {agentMessages.length > 0 && isActive && (
            <div className="flex items-center gap-3 pt-1">
              <div className="w-1 h-4 bg-white/40 rounded-sm animate-pulse" />
              <span className="shimmer-text text-sm">Thinking...</span>
            </div>
          )}

          {/* Summary */}
          {agent?.summary && !isActive && (
            <div className="text-neutral-400 leading-relaxed pt-2">
              {renderWithCodeTags(agent.summary)}
            </div>
          )}
        </div>

        <div ref={messagesEndRef} />
      </div>

      {/* Metadata row */}
      {agent && (
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
          {agent.target.prUrl && (
            <>
              <span className="text-neutral-700">·</span>
              <a
                href={agent.target.prUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-white transition-colors"
              >
                View PR
              </a>
            </>
          )}
        </div>
      )}
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
      if (!currentAgentIdRef.current) return;
      
      pollCountRef.current++;
      await fetchAll();
      
      const currentAgent = await getAgentStatus(apiKey, currentAgentIdRef.current!).catch(() => null);
      const terminal = currentAgent?.status === 'FINISHED' || 
                      currentAgent?.status === 'ERROR' || 
                      currentAgent?.status === 'STOPPED';
      
      if (!terminal) {
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
              <div className="px-5 py-6 text-sm text-neutral-500">
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
                  className="flex-1 px-3 py-2 bg-white/[0.03] rounded-lg text-sm text-white placeholder:text-neutral-700 focus:outline-none focus:bg-white/[0.05] transition-colors"
                />
                <button
                  onClick={handleSendFollowUp}
                  disabled={!followUp.trim() || isSendingFollowUp}
                  className="px-4 py-2 bg-white text-black text-sm font-medium rounded-lg hover:bg-neutral-200 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
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
