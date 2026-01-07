'use client';

import { useEffect, useLayoutEffect, useState, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import Image from 'next/image';
import { Agent, Message, getAgentStatus, getAgentConversation, getGitHubBranchCommitsUrl, AuthError, RateLimitError, NotFoundError } from '@/lib/cursorClient';
import { CursorLoader } from '@/components/CursorLoader';
import { ShimmerText } from '@/components/ShimmerText';
import { useTypewriter } from '@/components/TypewriterText';
import { theme } from '@/lib/theme';
import { trackGitHubLinkClick } from '@/lib/analytics';

// Cursor cube avatar for agent messages
// SVG aspect ratio: 466.73 x 532.09 (width x height) ≈ 0.877:1
function CursorAvatar({ size = 24, noMargin = false }: { size?: number; noMargin?: boolean }) {
  // Calculate icon dimensions preserving SVG aspect ratio (taller than wide)
  const iconHeight = Math.round(size * 0.6);
  const iconWidth = Math.round(iconHeight * (466.73 / 532.09));
  
  return (
    <div 
      className="flex-shrink-0 rounded-full flex items-center justify-center"
      style={{ 
        width: size, 
        height: size, 
        marginTop: noMargin ? 0 : 6, // Align avatar center with first line of text
        background: 'rgba(255, 255, 255, 0.08)',
      }}
    >
      <Image 
        src="/cursor-cube.svg" 
        alt="" 
        width={iconWidth}
        height={iconHeight}
        className="opacity-85"
        style={{
          width: iconWidth,
          height: iconHeight,
        }}
        priority
        unoptimized // SVGs don't need optimization and this prevents quality loss
      />
    </div>
  );
}

// Avatar header for mobile - shows avatar with "Cursor" label above first message
function CursorAvatarHeader() {
  return (
    <div className="flex items-center gap-1.5 pt-3 sm:hidden">
      <CursorAvatar size={20} noMargin />
      <span 
        className="text-xs font-medium"
        style={{ color: theme.text.tertiary }}
      >
        Cursor
      </span>
    </div>
  );
}

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
  preloadedData?: { agent: Agent; messages: Message[] };
  // Previous conversation turns from continuation agents
  previousTurns?: ConversationTurn[];
  // Counter that triggers a refetch when incremented (for follow-ups to finished agents)
  refreshTrigger?: number;
  // Initial status hint - used to show appropriate loading UI for past agents
  initialStatus?: string;
  // Pending follow-up message that should appear immediately (optimistic UI)
  pendingFollowUp?: string;
  // Callback when pending follow-up has been confirmed in the conversation
  onFollowUpConfirmed?: () => void;
}

const INITIAL_POLL_INTERVAL = 1000;
const NORMAL_POLL_INTERVAL = 2000;
const BACKOFF_POLL_INTERVAL = 5000;
// Fetch conversation every 3rd poll (~3 seconds) to avoid rate limiting
// Status is still polled every 1-2 seconds for responsive UI
const CONVERSATION_POLL_FREQUENCY = 3;

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
          className="px-1.5 py-0.5 rounded text-inherit text-[0.9em] font-mono"
          style={{ background: 'var(--color-theme-bg-tertiary)' }}
        >
          {code}
        </code>
      );
    }
    return part;
  });
}

// Agent response with typewriter effect
function AgentResponseText({ 
  text, 
  isActive,
  skipAnimation = false,
}: { 
  text: string; 
  isActive: boolean;
  skipAnimation?: boolean;
}) {
  const { displayedText, isTyping } = useTypewriter(
    normalizeText(text), 
    500, // 500 chars/sec = fast typewriter
    skipAnimation
  );
  
  // Parse displayed text for code tags
  const parts = displayedText.split(/(`[^`]+`)/g);
  const rendered = parts.map((part, i) => {
    if (part.startsWith('`') && part.endsWith('`')) {
      const code = part.slice(1, -1);
      return (
        <code 
          key={i} 
          className="px-1.5 py-0.5 rounded text-inherit text-[0.9em] font-mono"
          style={{ background: 'var(--color-theme-bg-tertiary)' }}
        >
          {code}
        </code>
      );
    }
    return part;
  });

  return (
    <>
      {rendered}
      {isTyping && isActive && (
        <span 
          className="inline-block w-[2px] h-[1.1em] ml-[1px] align-text-bottom"
          style={{ 
            backgroundColor: theme.text.primary,
            opacity: 0.8,
            animation: 'cursor-blink 0.6s ease-in-out infinite',
          }}
        />
      )}
    </>
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
  pendingFollowUp,
  summaryStale,
}: {
  agent: Agent | null;
  messages: Message[];
  isActive: boolean;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  isPending?: boolean;
  initialPrompt: string;
  pendingFollowUp?: string;
  summaryStale?: boolean;
}) {
  // Skip user messages that are either:
  // 1. The first message matching our initial prompt (already shown above)
  // 2. Messages that match the agent's auto-generated name/title (not user-written)
  const displayMessages = messages.filter((msg, idx) => {
    if (msg.type === 'user_message') {
      // Skip if it matches the initial prompt (already displayed above)
      if (msg.text === initialPrompt) {
        return false;
      }
      // Skip if it matches the agent's auto-generated title/name
      if (agent?.name && msg.text === agent.name) {
        return false;
      }
    }
    return true;
  });
  
  // Check if pending follow-up is already in the messages (to avoid duplicate display)
  const pendingAlreadyInMessages = pendingFollowUp && displayMessages.some(
    msg => msg.type === 'user_message' && msg.text === pendingFollowUp
  );
  
  // If we have a pending follow-up that's not yet in messages, add it for display
  const messagesWithPending = pendingFollowUp && !pendingAlreadyInMessages
    ? [...displayMessages, { 
        id: 'pending-followup', 
        type: 'user_message' as const, 
        text: pendingFollowUp,
        isPending: true 
      }]
    : displayMessages;
  
  const agentMessages = messagesWithPending.filter(m => m.type === 'assistant_message');
  const lastMessage = messagesWithPending[messagesWithPending.length - 1];
  // Waiting for response if we have a pending follow-up or if last message is user message
  const isWaitingForResponse = isActive && (lastMessage?.type === 'user_message' || !!pendingFollowUp);
  
  // Get initial loading phase message (before any real messages arrive)
  const hasAnyAgentContent = agentMessages.length > 0 || !!agent?.name;
  const initialPhaseMessage = useInitialLoadingPhase(isActive, hasAnyAgentContent);
  
  // Get REAL status from agent data
  const realStatusMessage = getAgentStatusMessage(agent, isPending || false);
  
  // Use initial phase message when we have no real content, otherwise use real status
  const statusMessage = !hasAnyAgentContent && initialPhaseMessage 
    ? initialPhaseMessage 
    : realStatusMessage;

  // Note: Scrolling is handled by parent ConversationView component
  // This effect removed to avoid conflicts with main scroll logic

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
      {messagesWithPending.map((msg, idx) => {
        const isLatestAgent = msg.type === 'assistant_message' && 
          messagesWithPending.filter(m => m.type === 'assistant_message').pop()?.id === msg.id;
        const isActiveMessage = isLatestAgent && isActive && !isWaitingForResponse;
        // Consistent spacing between all message bubbles
        const spacingClass = 'pt-3';

        if (msg.type === 'user_message') {
          // User follow-up message - bubble style
          return (
            <div key={msg.id} className={`flex justify-end ${spacingClass}`}>
              <div 
                className="max-w-[85%] px-4 py-2.5 rounded-2xl"
                style={{ background: theme.bg.tertiary }}
              >
                <p 
                  className="text-[14px] leading-relaxed"
                  style={{ color: theme.text.primary }}
                >
                  {msg.text}
                </p>
              </div>
            </div>
          );
        }

        // Agent message - flows together with comfortable spacing, monospace font with typewriter
        // Only show avatar on first message in a sequence of agent messages
        const prevMsg = messagesWithPending[idx - 1];
        const isFirstInSequence = prevMsg?.type !== 'assistant_message';
        
        return (
          <div key={msg.id}>
            {/* Mobile: Show avatar header above first message in sequence */}
            {isFirstInSequence && <CursorAvatarHeader />}
            
            {/* Message row - responsive layout */}
            <div 
              className={`flex items-start sm:gap-2.5 ${isFirstInSequence ? 'pt-1.5 sm:pt-3' : spacingClass}`}
            >
              {/* Desktop only: Avatar to the left */}
              <div className="hidden sm:block">
                {isFirstInSequence ? (
                  <CursorAvatar />
                ) : (
                  // Spacer to maintain alignment when avatar is hidden
                  <div className="w-6 flex-shrink-0" />
                )}
              </div>
              <div 
                className="max-w-[85%] sm:max-w-[70%] px-3 py-2 rounded-2xl"
                style={{ background: theme.bg.quaternary }}
              >
                <div 
                  className="text-[13px] leading-[1.7] whitespace-pre-wrap transition-colors"
                  style={{ 
                    color: isActiveMessage ? theme.text.primary : theme.text.secondary 
                  }}
                >
                  <AgentResponseText 
                    text={msg.text} 
                    isActive={isActiveMessage}
                    skipAnimation={!isActiveMessage}
                  />
                </div>
              </div>
            </div>
          </div>
        );
      })}

      {/* Status indicator - shows REAL agent status/name */}
      {/* Hide avatar if continuing after agent messages */}
      {showThinking && (
        <div>
          {/* Mobile: Show avatar header if no messages yet */}
          {agentMessages.length === 0 && <CursorAvatarHeader />}
          
          <div className={`flex items-start sm:gap-2.5 ${agentMessages.length === 0 ? 'pt-1.5 sm:pt-3' : 'pt-3'}`}>
            {/* Desktop only: Avatar or spacer */}
            <div className="hidden sm:block">
              {agentMessages.length === 0 ? (
                <CursorAvatar />
              ) : (
                <div className="w-6 flex-shrink-0" />
              )}
            </div>
            <div 
              className="max-w-[85%] sm:max-w-[70%] px-3 py-2 rounded-2xl"
              style={{ background: theme.bg.quaternary }}
            >
              <ShimmerText className="text-[13px]">
                {statusMessage}
              </ShimmerText>
            </div>
          </div>
        </div>
      )}
      
      {/* Active indicator when we have messages but still working */}
      {needsShimmerIndicator && (
        <div className="flex items-start sm:gap-2.5 pt-3">
          {/* Desktop only: Spacer */}
          <div className="hidden sm:block w-6 flex-shrink-0" />
          <div 
            className="max-w-[85%] sm:max-w-[70%] px-3 py-2 rounded-2xl"
            style={{ background: theme.bg.quaternary }}
          >
            <ShimmerText className="text-[13px]">
              {statusMessage}
            </ShimmerText>
          </div>
        </div>
      )}

      {/* Summary - only show when finished and not stale */}
      {agent?.summary && !isActive && !summaryStale && (
        <div>
          {/* Mobile: Show avatar header if no messages */}
          {agentMessages.length === 0 && <CursorAvatarHeader />}
          
          <div className={`flex items-start sm:gap-2.5 ${agentMessages.length === 0 ? 'pt-1.5 sm:pt-3' : 'pt-3'}`}>
            {/* Desktop only: Avatar or spacer */}
            <div className="hidden sm:block">
              {agentMessages.length === 0 ? (
                <CursorAvatar />
              ) : (
                <div className="w-6 flex-shrink-0" />
              )}
            </div>
            <div 
              className="max-w-[85%] sm:max-w-[70%] px-3 py-2 rounded-2xl"
              style={{ background: theme.bg.quaternary }}
            >
              <div 
                className="text-[13px] leading-[1.7]"
                style={{ color: theme.text.primary }}
              >
                {renderWithCodeTags(agent.summary)}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Commit confirmation - show after summary when finished successfully */}
      {/* Only show when we have the summary to ensure correct visual order */}
      {agent && agent.status === 'FINISHED' && !isActive && agent.summary && !summaryStale && (
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

// Commit confirmation component - subtle design with GitHub merge icon
function CommitConfirmation({ agent }: { agent: Agent }) {
  // Construct GitHub URL for viewing the commit
  const githubCommitsUrl = getGitHubBranchCommitsUrl(agent.source.repository, agent.target.branchName);
  const timeAgo = agent.createdAt ? formatTimeAgo(agent.createdAt) : '';
  const repoName = extractRepoName(agent.source.repository);
  const branchName = agent.target.branchName;
  
  // Format status message - just owner/repo
  const statusMessage = `Committed to ${repoName} ${timeAgo}`;
  
  // Use the best available URL (PR > commits > Cursor URL)
  // Only show if we have a PR URL (definite commit) or a valid GitHub commits URL
  const linkUrl = agent.target.prUrl || githubCommitsUrl || agent.target.url;
  
  // Only show commit confirmation if there's evidence of an actual commit
  // PR URL is the strongest indicator, but we also check for valid GitHub commits URL
  const hasCommitEvidence = !!agent.target.prUrl || !!githubCommitsUrl;
  
  if (!hasCommitEvidence) {
    return null;
  }
  
  return (
    <div className="pt-1 flex items-center gap-1.5 sm:pl-[34px]">
      {/* Checkmark icon - inherits text color */}
      <svg 
        width="12" 
        height="12" 
        viewBox="0 0 16 16" 
        fill="none" 
        xmlns="http://www.w3.org/2000/svg"
        className="flex-shrink-0"
        style={{ color: theme.text.tertiary }}
      >
        <path
          d="M13.25 4.75 6.5 11.5 3 8"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      
      {/* Status message - subtle and clickable */}
      {linkUrl ? (
        <a
          href={linkUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs transition-colors hover:opacity-80"
          style={{ color: theme.text.tertiary }}
          onClick={() => trackGitHubLinkClick(linkUrl)}
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
  preloadedData,
  previousTurns = [],
  refreshTrigger = 0,
  initialStatus,
  pendingFollowUp,
  onFollowUpConfirmed,
}: ConversationViewProps) {
  const [agent, setAgent] = useState<Agent | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomAnchorRef = useRef<HTMLDivElement>(null);
  const messageIdsRef = useRef<Set<string>>(new Set());
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const currentAgentIdRef = useRef<string | null>(null);
  const fetchInFlightRef = useRef(false);
  const latestAgentRef = useRef<Agent | null>(null);
  
  const pollCountRef = useRef(0);
  const rateLimitedRef = useRef(false);
  const conversationRateLimitedUntilRef = useRef(0); // Timestamp when to retry conversation
  
  // Track when a restart happened so we can clear stale summaries
  const lastRefreshTriggerRef = useRef(refreshTrigger);
  const [summaryStale, setSummaryStale] = useState(false);
  
  // Stable refs for callbacks to avoid polling instability when parent re-renders
  const onStatusChangeRef = useRef(onStatusChange);
  const onAgentUpdateRef = useRef(onAgentUpdate);
  const onAuthFailureRef = useRef(onAuthFailure);
  const onFollowUpConfirmedRef = useRef(onFollowUpConfirmed);
  
  // Keep refs in sync with props
  useEffect(() => {
    onStatusChangeRef.current = onStatusChange;
    onAgentUpdateRef.current = onAgentUpdate;
    onAuthFailureRef.current = onAuthFailure;
    onFollowUpConfirmedRef.current = onFollowUpConfirmed;
  }, [onStatusChange, onAgentUpdate, onAuthFailure, onFollowUpConfirmed]);
  
  // When refreshTrigger changes (follow-up to finished agent), mark summary as stale
  useEffect(() => {
    if (refreshTrigger > lastRefreshTriggerRef.current) {
      setSummaryStale(true);
      lastRefreshTriggerRef.current = refreshTrigger;
    }
  }, [refreshTrigger]);
  
  // Detect when pending follow-up appears in the actual messages and notify parent
  useEffect(() => {
    if (pendingFollowUp && messages.length > 0) {
      // Check if a user message with matching text appeared
      const hasMatchingMessage = messages.some(
        msg => msg.type === 'user_message' && msg.text === pendingFollowUp
      );
      if (hasMatchingMessage) {
        onFollowUpConfirmedRef.current?.();
      }
    }
  }, [pendingFollowUp, messages]);
  
  // Clear stale summary flag when we get a fresh agent with updated summary
  // We detect this when the summary changes after being marked stale
  const prevSummaryRef = useRef(agent?.summary);
  useEffect(() => {
    if (summaryStale && agent?.summary && agent.summary !== prevSummaryRef.current) {
      setSummaryStale(false);
    }
    prevSummaryRef.current = agent?.summary;
  }, [agent?.summary, summaryStale]);
  
  // Handle "pending" state - when user just submitted but we don't have an agent ID yet
  const isPending = agentId === 'pending';

  const isTerminal = agent?.status === 'FINISHED' || agent?.status === 'ERROR' || agent?.status === 'STOPPED' || agent?.status === 'EXPIRED';
  const isActive = agent?.status === 'RUNNING' || agent?.status === 'CREATING' || isPending;

  // Determine if we're loading a past/terminal agent - show full-screen centered loader
  const isLoadingPastAgent = isLoading && (
    initialStatus === 'FINISHED' ||
    initialStatus === 'STOPPED' ||
    initialStatus === 'ERROR' ||
    initialStatus === 'EXPIRED'
  );

  // Best-practice scroll-to-bottom: anchor + scroll container + window fallback
  const scrollToBottom = useCallback(() => {
    // 1) Prefer sentinel anchor (scrolls the nearest scrollable ancestor, including window)
    bottomAnchorRef.current?.scrollIntoView({ block: 'end', behavior: 'auto' });

    // 2) Also force the known scroll container, in case the browser chooses a different ancestor
    if (scrollRef.current) {
      const el = scrollRef.current;
      el.scrollTop = el.scrollHeight;
    }

    // 3) Final fallback: if the page itself is scrolling, force the document scroller
    const scrollingEl = document.scrollingElement;
    if (scrollingEl) {
      scrollingEl.scrollTop = scrollingEl.scrollHeight;
    }
  }, []);

  const fetchAll = useCallback(async (isInitial = false, forceConversation = false): Promise<boolean> => {
    if (!agentId || !apiKey) return false;
    if (fetchInFlightRef.current) return false;
    
    fetchInFlightRef.current = true;
    const release = () => { fetchInFlightRef.current = false; };
    
    let gotData = false;
    let agentStatusAfterFetch: string | undefined;
    
    // Always fetch agent status
    try {
      const status = await getAgentStatus(apiKey, agentId);
      setAgent(status);
      latestAgentRef.current = status;
      agentStatusAfterFetch = status.status;
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

    // Only fetch conversation on initial load, forced, every N polls, or when agent is terminal
    // When agent is terminal, always fetch to ensure we get all final messages
    // Also respect rate limit backoff - but BYPASS it for forced fetches (critical for terminal state)
    const isConversationRateLimited = Date.now() < conversationRateLimitedUntilRef.current;
    const agentIsTerminal = agentStatusAfterFetch === 'FINISHED' || 
                            agentStatusAfterFetch === 'ERROR' || 
                            agentStatusAfterFetch === 'STOPPED' ||
                            agentStatusAfterFetch === 'EXPIRED';
    // forceConversation bypasses rate limit - used when we MUST get final messages
    const shouldFetchConversation = forceConversation || (
      !isConversationRateLimited && (
        isInitial || agentIsTerminal ||
        (pollCountRef.current % CONVERSATION_POLL_FREQUENCY === 0)
      )
    );
    
    if (shouldFetchConversation) {
      try {
        const conv = await getAgentConversation(apiKey, agentId);
        const fetchedMessages = conv.messages || [];
        
        // Accumulate messages - never lose messages we've already seen
        // This prevents flickering when API returns incomplete data temporarily
        setMessages(prevMessages => {
          // If API returns at least as many messages as we have, use API order
          // (it's authoritative and in correct chronological order)
          if (fetchedMessages.length >= prevMessages.length) {
            messageIdsRef.current = new Set(fetchedMessages.map(m => m.id));
            return fetchedMessages;
          }
          
          // API returned fewer messages (temporary incomplete response)
          // Keep our existing messages and only add truly new ones
          const existingIds = new Set(prevMessages.map(m => m.id));
          const newMessages = fetchedMessages.filter(m => !existingIds.has(m.id));
          
          if (newMessages.length === 0) {
            // No new messages, keep what we have
            return prevMessages;
          }
          
          // Append new messages to the end
          const merged = [...prevMessages, ...newMessages];
          messageIdsRef.current = new Set(merged.map(m => m.id));
          return merged;
        });
        
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
        // NotFoundError (409/404) means conversation doesn't exist yet - this is normal for new agents
        if (err instanceof NotFoundError) {
          // Silently ignore - conversation will be created when agent starts responding
          gotData = true; // Consider this successful (just no messages yet)
        } else if (err instanceof RateLimitError || (err instanceof Error && err.message.includes('429'))) {
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
        // When agent finishes, ensure we fetch conversation to get all final messages
        // The conversation might not have been fetched in the last poll cycle
        const previousMessageCount = messageIdsRef.current.size;
        
        // Give server a moment to finalize, then fetch final state
        // Use a longer delay to ensure server has time to commit final messages
        await new Promise(r => setTimeout(r, 800));
        await fetchAll(false, true);
        
        // Check if we got new messages - if so, wait a bit more and fetch again
        const messageCountAfterFirstFetch = messageIdsRef.current.size;
        const gotNewMessages = messageCountAfterFirstFetch > previousMessageCount;
        
        if (gotNewMessages) {
          // If we got new messages, wait a bit more and fetch again to catch any remaining
          await new Promise(r => setTimeout(r, 1200));
          await fetchAll(false, true);
        }
        
        // Always do one more fetch after a short delay to ensure we have all messages
        // This catches edge cases where messages are still being finalized
        await new Promise(r => setTimeout(r, 1000));
        await fetchAll(false, true);
        
        // Do one final fetch after a bit longer to catch any delayed updates like summary
        setTimeout(async () => {
          if (currentAgentIdRef.current === agentIdToCheck) {
            await fetchAll(false, true);
          }
        }, 2500);
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

    if (currentAgentIdRef.current !== agentId) {
      currentAgentIdRef.current = agentId;
      setError(null);
      pollCountRef.current = 0;
      rateLimitedRef.current = false;

      if (preloadedData) {
        // Check if preloaded data is stale: parent says terminal but cache says active
        const isPreloadedActive = preloadedData.agent.status === 'RUNNING' || preloadedData.agent.status === 'CREATING';
        const isInitialTerminal = initialStatus === 'FINISHED' || initialStatus === 'STOPPED' || initialStatus === 'ERROR' || initialStatus === 'EXPIRED';
        
        if (isPreloadedActive && isInitialTerminal) {
          // Cache is stale - use corrected status for immediate UI, then fetch fresh data
          const correctedAgent = { ...preloadedData.agent, status: initialStatus as Agent['status'] };
          setAgent(correctedAgent);
          setMessages(preloadedData.messages);
          messageIdsRef.current = new Set(preloadedData.messages.map(m => m.id));
          setIsLoading(false);
          onStatusChangeRef.current?.(initialStatus);
          // Fetch fresh data to get summary and complete agent info
          fetchAll(false, true);
        } else {
          // Normal path: preloaded data is fresh
          setAgent(preloadedData.agent);
          setMessages(preloadedData.messages);
          messageIdsRef.current = new Set(preloadedData.messages.map(m => m.id));
          setIsLoading(false);
          onStatusChangeRef.current?.(preloadedData.agent.status);
          
          const isActiveAgent = preloadedData.agent.status === 'RUNNING' || preloadedData.agent.status === 'CREATING';
          if (isActiveAgent) {
            scheduleNextPoll();
          }
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

  // Track whether we've completed post-terminal polling for summary
  const postTerminalPollDoneRef = useRef(false);
  
  useEffect(() => {
    if (isTerminal && agentId && agentId !== 'pending') {
      stopPolling();
      
      // Skip if we've already done post-terminal polling for this agent
      if (postTerminalPollDoneRef.current) {
        return;
      }
      
      // Poll a few more times to catch the summary which may not be immediately available
      let attempts = 0;
      const maxAttempts = 5;
      const pollInterval = 2000;
      
      const pollForSummary = async () => {
        attempts++;
        await fetchAll(false, true).catch(() => {
          // Silently ignore errors - we're just trying to get final state
        });
        
        // Keep polling until we have a summary or hit max attempts
        const currentAgent = latestAgentRef.current;
        if (attempts < maxAttempts && !currentAgent?.summary && currentAgentIdRef.current === agentId) {
          setTimeout(pollForSummary, pollInterval);
        } else {
          postTerminalPollDoneRef.current = true;
        }
      };
      
      // Start polling for summary immediately
      pollForSummary();
    }
  }, [isTerminal, stopPolling, agentId, fetchAll]);
  
  // Reset post-terminal poll flag when agent changes
  useEffect(() => {
    postTerminalPollDoneRef.current = false;
  }, [agentId]);

  // Restart polling when refreshTrigger changes (e.g., after follow-up to finished agent)
  useEffect(() => {
    if (refreshTrigger > 0 && agentId && agentId !== 'pending') {
      // Reset rate limit state and restart polling
      pollCountRef.current = 0;
      rateLimitedRef.current = false;
      // Fetch immediately then schedule next poll
      fetchAll(false, true).then(() => {
        scheduleNextPoll();
      });
    }
  }, [refreshTrigger, agentId, fetchAll, scheduleNextPoll]);

  // Always open at the bottom for any agent activity/conversation.
  // useLayoutEffect makes this happen before paint once content exists.
  useLayoutEffect(() => {
    if (!agentId || isPending) return;
    if (isLoadingPastAgent) return;
    // Only scroll once we either have messages or loading has completed.
    if (messages.length === 0 && isLoading) return;
    scrollToBottom();
  }, [agentId, isPending, isLoadingPastAgent, isLoading, messages.length, scrollToBottom]);

  // After-paint fallback for late layout changes (images/video/fonts)
  useEffect(() => {
    if (!agentId || isPending) return;
    if (isLoadingPastAgent) return;
    if (messages.length === 0 && isLoading) return;
    const t = setTimeout(scrollToBottom, 0);
    return () => clearTimeout(t);
  }, [agentId, isPending, isLoadingPastAgent, isLoading, messages.length, scrollToBottom]);

  if (!agentId) {
    return null;
  }

  if (isLoadingPastAgent) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <CursorLoader size="2xl" />
      </div>
    );
  }

  return (
    <div 
      ref={scrollRef}
      data-scroll-container
      className="flex-1 min-h-0 overflow-y-auto scrollbar-hidden flex flex-col"
      style={{ WebkitOverflowScrolling: 'touch' }}
    >
      {/* Conversation content with consistent padding */}
      <div className="pt-16 pb-20 px-2 sm:px-4">
        {/* Previous conversation turns - show history from continuation chain */}
        {previousTurns.map((turn, turnIdx) => {
          const isFirstTurn = turnIdx === 0;
          const prevTurn = previousTurns[turnIdx - 1];
          const hasPrevTurnMessages = prevTurn?.messages?.some(m => m.type === 'assistant_message') || prevTurn?.summary;
          
          return (
            <div key={`turn-${turnIdx}`}>
              {/* Previous user prompt - bubble style */}
              <div className={`flex justify-end ${isFirstTurn ? '' : 'pt-3'}`}>
                <div 
                  className="max-w-[85%] px-4 py-2.5 rounded-2xl"
                  style={{ background: theme.bg.tertiary }}
                >
                  <p 
                    className="text-[14px] leading-relaxed"
                    style={{ color: theme.text.primary }}
                  >
                    {turn.prompt}
                  </p>
                </div>
              </div>
              
              {/* Previous agent messages */}
              <div className="text-sm">
                {turn.messages.filter(m => m.type === 'assistant_message').map((msg, msgIdx) => {
                  const isFirst = msgIdx === 0;
                  return (
                    <div key={msg.id}>
                      {/* Mobile: Show avatar header above first message */}
                      {isFirst && <CursorAvatarHeader />}
                      
                      <div className={`flex items-start sm:gap-2.5 ${isFirst ? 'pt-1.5 sm:pt-3' : 'pt-3'}`}>
                        {/* Desktop only: Avatar */}
                        <div className="hidden sm:block">
                          <CursorAvatar />
                        </div>
                        <div 
                          className="max-w-[85%] sm:max-w-[70%] px-3 py-2 rounded-2xl"
                          style={{ background: theme.bg.quaternary }}
                        >
                          <div 
                            className="text-[13px] leading-[1.7] whitespace-pre-wrap"
                            style={{ color: theme.text.tertiary }}
                          >
                            {renderWithCodeTags(msg.text)}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
                
                {/* Previous turn summary */}
                {turn.summary && (
                  <div className="flex items-start sm:gap-2.5 pt-3">
                    {/* Desktop only: Avatar */}
                    <div className="hidden sm:block">
                      <CursorAvatar />
                    </div>
                    <div 
                      className="max-w-[85%] sm:max-w-[70%] px-3 py-2 rounded-2xl"
                      style={{ background: theme.bg.quaternary }}
                    >
                      <div 
                        className="text-[13px] leading-[1.7]"
                        style={{ color: theme.text.tertiary }}
                      >
                        {renderWithCodeTags(turn.summary)}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
        
        {/* Compute actual user prompt - if prop is just agent's auto-generated name, use first user message */}
        {(() => {
          // Check if prompt is the auto-generated agent name (not the real user input)
          // This happens when opening an existing agent from the activity list
          const isPromptJustAgentName = prompt && agent?.name && prompt === agent.name;
          
          // Find the first user message in the conversation (the real user prompt)
          const firstUserMessage = messages.find(m => m.type === 'user_message');
          
          // Use the real user message if prompt is just the agent name
          const actualUserPrompt = isPromptJustAgentName && firstUserMessage 
            ? firstUserMessage.text 
            : prompt;
          
          return (
            <>
              {/* Current user prompt - bubble style */}
              <div className={`flex justify-end ${previousTurns.length > 0 ? 'pt-3' : ''}`}>
                <div 
                  className="max-w-[85%] px-4 py-2.5 rounded-2xl"
                  style={{ background: theme.bg.tertiary }}
                >
                  <p 
                    className="text-[14px] leading-relaxed"
                    style={{ color: theme.text.primary }}
                  >
                    {actualUserPrompt}
                  </p>
                </div>
              </div>

              {/* Current agent response - left aligned */}
              <div className="text-sm">
                {error ? (
                  <div>
                    <CursorAvatarHeader />
                    <div className="flex items-start sm:gap-2.5 pt-1.5 sm:pt-3">
                      <div className="hidden sm:block">
                        <CursorAvatar />
                      </div>
                      <div 
                        className="max-w-[85%] sm:max-w-[70%] px-3 py-2 rounded-2xl"
                        style={{ background: theme.bg.quaternary }}
                      >
                        <div style={{ color: theme.text.tertiary }}>
                          {error}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : isPending ? (
                  // Pending state - just show thinking while we wait for agent ID
                  <div>
                    <CursorAvatarHeader />
                    <div className="flex items-start sm:gap-2.5 pt-1.5 sm:pt-3">
                      <div className="hidden sm:block">
                        <CursorAvatar />
                      </div>
                      <div 
                        className="max-w-[85%] sm:max-w-[70%] px-3 py-2 rounded-2xl"
                        style={{ background: theme.bg.quaternary }}
                      >
                        <ShimmerText className="text-[13px]">
                          Thinking
                        </ShimmerText>
                      </div>
                    </div>
                  </div>
                ) : isLoading ? (
                  // Loading a running agent - show shimmer text
                  <div>
                    <CursorAvatarHeader />
                    <div className="flex items-start sm:gap-2.5 pt-1.5 sm:pt-3">
                      <div className="hidden sm:block">
                        <CursorAvatar />
                      </div>
                      <div 
                        className="max-w-[85%] sm:max-w-[70%] px-3 py-2 rounded-2xl"
                        style={{ background: theme.bg.quaternary }}
                      >
                        <ShimmerText className="text-[13px]">
                          Thinking
                        </ShimmerText>
                      </div>
                    </div>
                  </div>
                ) : (
                  <CloudAgentView
                    agent={agent}
                    messages={messages}
                    isActive={isActive}
                    scrollRef={scrollRef}
                    isPending={isPending}
                    initialPrompt={actualUserPrompt}
                    pendingFollowUp={pendingFollowUp}
                    summaryStale={summaryStale}
                  />
                )}
              </div>
            </>
          );
        })()}
        
        {/* Bottom anchor element for reliable scrolling */}
        <div ref={bottomAnchorRef} className="h-0" aria-hidden="true" />
      </div>
    </div>
  );
}
