'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { Agent, Message, getAgentStatus, getAgentConversation } from '@/lib/cursorClient';
import { AgentStep } from '@/lib/cursorSdk';
import { CursorLoader } from './CursorLoader';

interface ConversationViewProps {
  agentId: string | null;
  apiKey: string;
  prompt: string;
  onStatusChange?: (status: string) => void;
  onAgentUpdate?: (agentId: string, updates: { status?: string; name?: string }) => void;
  isSdkMode?: boolean;
  sdkSteps?: AgentStep[];
  preloadedData?: { agent: Agent; messages: Message[] };
}

const INITIAL_POLL_INTERVAL = 1500;
const NORMAL_POLL_INTERVAL = 3000;
const BACKOFF_POLL_INTERVAL = 8000;

// Parse text and render inline code tags
function renderWithCodeTags(text: string) {
  const parts = text.split(/(`[^`]+`)/g);
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

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [steps.length, scrollRef]);

  if (steps.length === 0) {
    return (
      <div className="flex items-center gap-2 text-neutral-500">
        <CursorLoader size="sm" />
        <span>Starting...</span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {mergedSteps.map((step, idx) => (
        <StepItem key={idx} step={step} />
      ))}
      
      {isActive && (
        <div className="flex items-center gap-2 text-neutral-500 pt-1">
          <CursorLoader size="sm" />
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
}: {
  agent: Agent | null;
  messages: Message[];
  isActive: boolean;
  scrollRef: React.RefObject<HTMLDivElement | null>;
}) {
  const agentMessages = messages.filter(m => m.type === 'assistant_message');

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length, scrollRef]);

  return (
    <div className="space-y-3">
      {/* Agent response section */}
      <div className="space-y-1.5">
        {/* Planning state */}
        {agentMessages.length === 0 && isActive && (
          <div className="flex items-center gap-3">
            <div className="w-1 h-5 bg-white/60 rounded-sm animate-pulse" />
            <span className="shimmer-text">Planning next moves...</span>
          </div>
        )}

        {/* Agent messages */}
        {agentMessages.map((msg, idx) => {
          const isLatest = idx === agentMessages.length - 1;
          const isActiveMessage = isLatest && isActive;

          return (
            <div 
              key={msg.id} 
              className={`relative leading-relaxed whitespace-pre-wrap transition-colors ${
                isActiveMessage 
                  ? 'text-white pl-3 border-l-2 border-white/40' 
                  : 'text-neutral-400'
              }`}
            >
              {renderWithCodeTags(msg.text)}
              {isActiveMessage && (
                <span className="inline-block w-1 h-4 ml-1 bg-white/60 rounded-sm animate-pulse align-middle" />
              )}
            </div>
          );
        })}

        {/* Thinking indicator */}
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

      {/* Metadata row */}
      {agent && (
        <div className="flex items-center gap-3 text-xs text-neutral-600 pt-2">
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

export function ConversationView({
  agentId,
  apiKey,
  prompt,
  onStatusChange,
  onAgentUpdate,
  isSdkMode = false,
  sdkSteps = [],
  preloadedData,
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

  const isTerminal = agent?.status === 'FINISHED' || agent?.status === 'ERROR' || agent?.status === 'STOPPED';
  const isActive = agent?.status === 'RUNNING' || agent?.status === 'CREATING';

  const fetchAll = useCallback(async (isInitial = false): Promise<boolean> => {
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
  }, [agentId, apiKey, onStatusChange, onAgentUpdate]);

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
    if (!agentId) {
      stopPolling();
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

  if (!agentId) {
    return null;
  }

  return (
    <div 
      ref={scrollRef}
      className="flex-1 overflow-y-auto flex flex-col"
    >
      <div className="flex-1" />
      <div className="px-4 py-6 space-y-4">
        {/* User prompt - right aligned, contained */}
        <div className="flex justify-end">
          <div className="bg-neutral-900 rounded-2xl px-4 py-3 max-w-[85%]">
            <p className="text-white text-sm leading-relaxed">
              {prompt}
            </p>
          </div>
        </div>

        {/* Agent response - left aligned */}
        <div className="text-sm">
          {isSdkMode ? (
            <SdkStepsView steps={sdkSteps} scrollRef={scrollRef} />
          ) : error ? (
            <div className="text-neutral-500">
              {error}
            </div>
          ) : isLoading ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-1 h-5 bg-white/20 rounded-sm skeleton-shimmer" />
                <div className="h-3 bg-white/8 rounded w-24 skeleton-shimmer" />
              </div>
              <div className="space-y-1.5">
                <div className="h-3.5 bg-white/6 rounded w-full skeleton-shimmer" />
                <div className="h-3.5 bg-white/6 rounded w-5/6 skeleton-shimmer" style={{ animationDelay: '0.1s' }} />
                <div className="h-3.5 bg-white/6 rounded w-2/3 skeleton-shimmer" style={{ animationDelay: '0.2s' }} />
              </div>
            </div>
          ) : (
            <CloudAgentView
              agent={agent}
              messages={messages}
              isActive={isActive}
              scrollRef={scrollRef}
            />
          )}
        </div>
      </div>
    </div>
  );
}
