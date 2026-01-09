'use client';

import { useEffect, useLayoutEffect, useState, useCallback, useRef, useMemo } from 'react';
import { toast } from 'sonner';
import Image from 'next/image';
import { Agent, Message, getAgentStatus, getAgentConversation, getGitHubBranchCommitsUrl, parseRepository, fetchVercelPreviewUrl, AuthError, RateLimitError, NotFoundError } from '@/lib/cursorClient';
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
  // Summary from before the pending follow-up (passed from parent for reliable timing)
  frozenSummary?: string;
}

const INITIAL_POLL_INTERVAL = 800;
const NORMAL_POLL_INTERVAL = 1500;
const BACKOFF_POLL_INTERVAL = 3000;
// Fetch conversation every 2nd poll (~3 seconds) for more responsive updates
const CONVERSATION_POLL_FREQUENCY = 2;
// Watchdog timeout - if no poll happens within this time, force restart polling
const POLLING_WATCHDOG_MS = 10000;

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

// Extended message type that includes historical summaries
interface DisplayItem {
  id: string;
  type: 'user_message' | 'assistant_message' | 'summary' | 'commit';
  text: string;
  agent?: Agent; // For commit items
  isPending?: boolean;
}

// Cloud Agent View - chronological conversation with inline summaries
function CloudAgentView({
  agent,
  messages,
  isActive,
  scrollRef,
  isPending,
  initialPrompt,
  pendingFollowUp,
  historicalSummary,
}: {
  agent: Agent | null;
  messages: Message[];
  isActive: boolean;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  isPending?: boolean;
  initialPrompt: string;
  pendingFollowUp?: string;
  // Summary that was shown before the current follow-up (frozen in history)
  historicalSummary?: string;
}) {
  // Build a chronological display list with summaries at correct positions
  const displayItems = useMemo(() => {
    const items: DisplayItem[] = [];
    
    // Filter messages as before
    const filteredMessages = messages.filter((msg) => {
      if (msg.type === 'user_message') {
        if (msg.text === initialPrompt) return false;
        if (agent?.name && msg.text === agent.name) return false;
      }
      return true;
    });
    
    // Find the index of the first user message that came after agent responses
    // This is where we should insert the historical summary
    let followUpIndex = -1;
    let hasSeenAgentMessage = false;
    
    for (let i = 0; i < filteredMessages.length; i++) {
      const msg = filteredMessages[i];
      if (msg.type === 'assistant_message') {
        hasSeenAgentMessage = true;
      } else if (msg.type === 'user_message' && hasSeenAgentMessage) {
        followUpIndex = i;
        break;
      }
    }
    
    // Build the display list with historical summary at the right position
    for (let i = 0; i < filteredMessages.length; i++) {
      const msg = filteredMessages[i];
      
      // Insert historical summary before the follow-up user message
      if (historicalSummary && i === followUpIndex) {
        items.push({
          id: 'historical-summary',
          type: 'summary',
          text: historicalSummary,
        });
      }
      
      items.push({
        id: msg.id,
        type: msg.type,
        text: msg.text,
      });
    }
    
    // If no follow-up was found but we have historical summary, append it after all messages
    if (historicalSummary && followUpIndex === -1) {
      items.push({
        id: 'historical-summary',
        type: 'summary',
        text: historicalSummary,
      });
    }
    
    // Add pending follow-up if not already in messages
    if (pendingFollowUp) {
      const pendingAlreadyInMessages = filteredMessages.some(
        msg => msg.type === 'user_message' && msg.text === pendingFollowUp
      );
      if (!pendingAlreadyInMessages) {
        // If we have historical summary and no follow-up was found yet, add summary first
        if (historicalSummary && followUpIndex === -1 && !items.some(i => i.type === 'summary')) {
          items.push({
            id: 'historical-summary',
            type: 'summary',
            text: historicalSummary,
          });
        }
        items.push({
          id: 'pending-followup',
          type: 'user_message',
          text: pendingFollowUp,
          isPending: true,
        });
      }
    }
    
    return items;
  }, [messages, initialPrompt, agent?.name, historicalSummary, pendingFollowUp]);
  
  const agentMessages = displayItems.filter(m => m.type === 'assistant_message');
  const lastItem = displayItems[displayItems.length - 1];
  
  // Waiting for response if last item is user message or we have a pending follow-up
  const isWaitingForResponse = isActive && (lastItem?.type === 'user_message' || !!pendingFollowUp);
  
  // Get initial loading phase message (before any real messages arrive)
  const hasAnyAgentContent = agentMessages.length > 0 || !!agent?.name;
  const initialPhaseMessage = useInitialLoadingPhase(isActive, hasAnyAgentContent);
  
  // Get REAL status from agent data
  const realStatusMessage = getAgentStatusMessage(agent, isPending || false);
  
  // Use initial phase message when we have no real content, otherwise use real status
  const statusMessage = !hasAnyAgentContent && initialPhaseMessage 
    ? initialPhaseMessage 
    : realStatusMessage;

  // Show thinking when: pending, no agent messages yet, or waiting for response to follow-up
  const showThinking = isPending || (isActive && agentMessages.length === 0) || isWaitingForResponse;
  
  // Determine if the latest agent message is being actively worked on
  const latestAgentMessage = agentMessages[agentMessages.length - 1];
  const isLatestMessageActive = latestAgentMessage && isActive && !isWaitingForResponse;
  
  // Always show shimmer on something when active - either the message or thinking text
  const needsShimmerIndicator = isActive && !showThinking && latestAgentMessage;
  
  // Show current summary only if:
  // 1. Agent is terminal (not active)
  // 2. Has a summary
  // 3. Summary is different from historical (or no historical)
  const showCurrentSummary = !isActive && agent?.summary && agent.summary !== historicalSummary;

  return (
    <div>
      {/* Conversation thread - shows messages, summaries, and follow-ups in chronological order */}
      {displayItems.map((item, idx) => {
        const prevItem = displayItems[idx - 1];
        const spacingClass = 'pt-3';

        // User message
        if (item.type === 'user_message') {
          return (
            <div key={item.id} className={`flex justify-end ${spacingClass}`}>
              <div 
                className="max-w-[85%] px-4 py-2.5 rounded-2xl"
                style={{ background: theme.bg.tertiary }}
              >
                <p 
                  className="text-[14px] leading-relaxed"
                  style={{ color: theme.text.primary }}
                >
                  {item.text}
                </p>
              </div>
            </div>
          );
        }

        // Historical summary (frozen in conversation history)
        if (item.type === 'summary') {
          const isFirstInSequence = prevItem?.type !== 'assistant_message' && prevItem?.type !== 'summary';
          return (
            <div key={item.id}>
              {isFirstInSequence && <CursorAvatarHeader />}
              <div className={`flex items-start sm:gap-2.5 ${isFirstInSequence ? 'pt-1.5 sm:pt-3' : spacingClass}`}>
                <div className="hidden sm:block">
                  {isFirstInSequence ? <CursorAvatar /> : <div className="w-6 flex-shrink-0" />}
                </div>
                <div 
                  className="max-w-[85%] sm:max-w-[70%] px-3 py-2 rounded-2xl"
                  style={{ background: theme.bg.quaternary }}
                >
                  <div 
                    className="text-[13px] leading-[1.7]"
                    style={{ color: theme.text.tertiary }}
                  >
                    {renderWithCodeTags(item.text)}
                  </div>
                </div>
              </div>
            </div>
          );
        }

        // Agent message
        const isLatestAgent = item.type === 'assistant_message' && 
          displayItems.filter(m => m.type === 'assistant_message').pop()?.id === item.id;
        const isActiveMessage = isLatestAgent && isActive && !isWaitingForResponse;
        const isFirstInSequence = prevItem?.type !== 'assistant_message';
        
        return (
          <div key={item.id}>
            {isFirstInSequence && <CursorAvatarHeader />}
            <div 
              className={`flex items-start sm:gap-2.5 ${isFirstInSequence ? 'pt-1.5 sm:pt-3' : spacingClass}`}
            >
              <div className="hidden sm:block">
                {isFirstInSequence ? <CursorAvatar /> : <div className="w-6 flex-shrink-0" />}
              </div>
              <div 
                className="max-w-[85%] sm:max-w-[70%] px-3 py-2 rounded-2xl"
                style={{ background: theme.bg.quaternary }}
              >
                <div 
                  className="text-[13px] leading-[1.7] whitespace-pre-wrap transition-colors"
                  style={{ color: isActiveMessage ? theme.text.primary : theme.text.secondary }}
                >
                  <AgentResponseText 
                    text={item.text} 
                    isActive={isActiveMessage}
                    skipAnimation={!isActiveMessage}
                  />
                </div>
              </div>
            </div>
          </div>
        );
      })}

      {/* Thinking indicator */}
      {showThinking && (
        <div>
          {agentMessages.length === 0 && <CursorAvatarHeader />}
          <div className={`flex items-start sm:gap-2.5 ${agentMessages.length === 0 ? 'pt-1.5 sm:pt-3' : 'pt-3'}`}>
            <div className="hidden sm:block">
              {agentMessages.length === 0 ? <CursorAvatar /> : <div className="w-6 flex-shrink-0" />}
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
      
      {/* Active working indicator */}
      {needsShimmerIndicator && (
        <div className="flex items-start sm:gap-2.5 pt-3">
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

      {/* Current summary - only shown when terminal and different from historical */}
      {showCurrentSummary && (
        <div>
          <div className="flex items-start sm:gap-2.5 pt-3">
            <div className="hidden sm:block w-6 flex-shrink-0" />
            <div 
              className="max-w-[85%] sm:max-w-[70%] px-3 py-2 rounded-2xl"
              style={{ background: theme.bg.quaternary }}
            >
              <div 
                className="text-[13px] leading-[1.7]"
                style={{ color: theme.text.primary }}
              >
                {renderWithCodeTags(agent.summary!)}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Commit confirmation */}
      {agent && agent.status === 'FINISHED' && !isActive && showCurrentSummary && (
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
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isSearching, setIsSearching] = useState(true);
  const [retryCount, setRetryCount] = useState(0);
  
  const MAX_RETRIES = 12; // Poll for up to 2 minutes (12 x 10s)
  const POLL_INTERVAL = 10000; // 10 seconds
  
  // Fetch Vercel preview URL with polling while deployment builds
  useEffect(() => {
    const parsed = parseRepository(agent.source.repository);
    if (!parsed) {
      console.log('[Preview] Could not parse repository:', agent.source.repository);
      setIsSearching(false);
      return;
    }
    
    let cancelled = false;
    let timeoutId: NodeJS.Timeout | null = null;
    
    const fetchPreview = async () => {
      if (cancelled) return;
      
      console.log('[Preview] Fetching preview URL for:', parsed.owner, parsed.repo, agent.target.branchName, `(attempt ${retryCount + 1})`);
      
      const url = await fetchVercelPreviewUrl(parsed.owner, parsed.repo, agent.target.branchName);
      
      if (cancelled) return;
      
      if (url) {
        console.log('[Preview] Found:', url);
        setPreviewUrl(url);
        setIsSearching(false);
      } else if (retryCount < MAX_RETRIES) {
        // Schedule retry
        console.log('[Preview] Not found yet, retrying in 10s...');
        timeoutId = setTimeout(() => {
          if (!cancelled) {
            setRetryCount(prev => prev + 1);
          }
        }, POLL_INTERVAL);
      } else {
        // Max retries reached
        console.log('[Preview] Max retries reached, giving up');
        setIsSearching(false);
      }
    };
    
    fetchPreview();
    
    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [agent.source.repository, agent.target.branchName, retryCount]);
  
  // Construct GitHub URL for viewing the commit
  const githubCommitsUrl = getGitHubBranchCommitsUrl(agent.source.repository, agent.target.branchName);
  const timeAgo = agent.createdAt ? formatTimeAgo(agent.createdAt) : '';
  const repoName = extractRepoName(agent.source.repository);
  
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
    <div className="space-y-1">
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
      
      {/* Preview deployment link or loading state */}
      {previewUrl ? (() => {
        // Add Vercel protection bypass secret if configured
        const bypassSecret = process.env.NEXT_PUBLIC_VERCEL_PROTECTION_BYPASS_SECRET;
        const finalPreviewUrl = bypassSecret
          ? `${previewUrl}${previewUrl.includes('?') ? '&' : '?'}x-vercel-protection-bypass=${bypassSecret}`
          : previewUrl;
        
        return (
          <div className="flex items-center gap-1.5 sm:pl-[34px]">
            {/* External link icon */}
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
                d="M6.5 3.5H3.5C3.23478 3.5 2.98043 3.60536 2.79289 3.79289C2.60536 3.98043 2.5 4.23478 2.5 4.5V12.5C2.5 12.7652 2.60536 13.0196 2.79289 13.2071C2.98043 13.3946 3.23478 13.5 3.5 13.5H11.5C11.7652 13.5 12.0196 13.3946 12.2071 13.2071C12.3946 13.0196 12.5 12.7652 12.5 12.5V9.5M9.5 2.5H13.5M13.5 2.5V6.5M13.5 2.5L7 9"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            
            <a
              href={finalPreviewUrl}
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
              Preview deployment
            </a>
          </div>
        );
      })() : isSearching && (
        <div className="flex items-center gap-1.5 sm:pl-[34px]">
          {/* Loading spinner icon */}
          <svg 
            width="12" 
            height="12" 
            viewBox="0 0 16 16" 
            fill="none" 
            xmlns="http://www.w3.org/2000/svg"
            className="flex-shrink-0 animate-spin"
            style={{ color: theme.text.tertiary }}
          >
            <path
              d="M8 1.5V4M8 12v2.5M3.5 8H1M15 8h-2.5M4.25 4.25L2.5 2.5M13.5 13.5l-1.75-1.75M4.25 11.75L2.5 13.5M13.5 2.5l-1.75 1.75"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          
          <span 
            className="text-xs"
            style={{ color: theme.text.tertiary }}
          >
            Building preview...
          </span>
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
  onAuthFailure,
  preloadedData,
  previousTurns = [],
  refreshTrigger = 0,
  initialStatus,
  pendingFollowUp,
  onFollowUpConfirmed,
  frozenSummary,
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
  const lastSuccessfulPollRef = useRef<number>(Date.now()); // Watchdog tracking
  
  // Track when a restart happened so we can preserve historical summaries
  const lastRefreshTriggerRef = useRef(refreshTrigger);
  
  // Historical summary - snapshot of summary when follow-up was sent
  // This gets frozen in the conversation history so follow-ups appear after it
  const [historicalSummary, setHistoricalSummary] = useState<string | null>(null);
  
  // Keep a ref of the last known summary so we can capture it reliably
  // This updates synchronously on every render, so it's always current
  const lastKnownSummaryRef = useRef<string | null>(null);
  if (agent?.summary) {
    lastKnownSummaryRef.current = agent.summary;
  }
  // Also capture from preloaded data
  if (preloadedData?.agent?.summary && !lastKnownSummaryRef.current) {
    lastKnownSummaryRef.current = preloadedData.agent.summary;
  }
  
  // Track recent refresh to prevent premature polling stop after follow-up
  const recentRefreshRef = useRef(false);
  
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
  
  // Track previous pendingFollowUp to detect when a new one arrives
  const prevPendingFollowUpRef = useRef<string | undefined>(undefined);
  
  // Capture historical summary when a pending follow-up first appears
  // Priority: frozenSummary prop > current agent.summary > lastKnownSummaryRef
  useEffect(() => {
    const hadNoPending = !prevPendingFollowUpRef.current;
    const hasNewPending = !!pendingFollowUp;
    
    // When pendingFollowUp transitions from nothing to something
    if (hadNoPending && hasNewPending && !historicalSummary) {
      // Use frozenSummary prop first (most reliable), then local sources
      const summaryToCapture = frozenSummary || agent?.summary || lastKnownSummaryRef.current;
      if (summaryToCapture) {
        setHistoricalSummary(summaryToCapture);
      }
    }
    
    prevPendingFollowUpRef.current = pendingFollowUp;
  }, [pendingFollowUp, frozenSummary, agent?.summary, historicalSummary]);
  
  // Also set historical summary directly from prop if provided
  useEffect(() => {
    if (frozenSummary && !historicalSummary) {
      setHistoricalSummary(frozenSummary);
    }
  }, [frozenSummary, historicalSummary]);
  
  // Also capture on refreshTrigger as a backup (for cases where pendingFollowUp timing differs)
  useEffect(() => {
    if (refreshTrigger > lastRefreshTriggerRef.current) {
      // Capture the current summary if we haven't already
      if (!historicalSummary) {
        const summaryToCapture = frozenSummary || agent?.summary || lastKnownSummaryRef.current;
        if (summaryToCapture) {
          setHistoricalSummary(summaryToCapture);
        }
      }
      lastRefreshTriggerRef.current = refreshTrigger;
    }
  }, [refreshTrigger, frozenSummary, agent?.summary, historicalSummary]);
  
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
  
  // Clear historical summary when agent changes (new conversation)
  useEffect(() => {
    setHistoricalSummary(null);
  }, [agentId]);
  
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
    if (!agentId || !apiKey || agentId === 'pending') return false;
    
    // Prevent concurrent fetches, but with a safety timeout to avoid getting stuck
    if (fetchInFlightRef.current) {
      return false;
    }
    
    fetchInFlightRef.current = true;
    let gotData = false;
    let agentStatusAfterFetch: string | undefined;
    
    try {
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
        lastSuccessfulPollRef.current = Date.now();
      } catch (err) {
        if (err instanceof AuthError) {
          onAuthFailureRef.current?.();
          setError('Authentication failed');
          toast.error('Session expired. Please re-enter your API key.');
          return false;
        }
        if (err instanceof RateLimitError) {
          rateLimitedRef.current = true;
          // Don't show toast every time - only on first rate limit
        } else if (isInitial) {
          setError('Failed to load agent');
          toast.error('Failed to load agent data');
        }
        // Continue - we might still get conversation data
      }

      // Determine if we should fetch conversation
      const agentIsTerminal = agentStatusAfterFetch === 'FINISHED' || 
                              agentStatusAfterFetch === 'ERROR' || 
                              agentStatusAfterFetch === 'STOPPED' ||
                              agentStatusAfterFetch === 'EXPIRED';
      
      // Fetch conversation more aggressively - every poll when running, or on specific triggers
      const shouldFetchConversation = forceConversation || 
        isInitial || 
        agentIsTerminal ||
        (pollCountRef.current % CONVERSATION_POLL_FREQUENCY === 0);
      
      if (shouldFetchConversation) {
        try {
          const conv = await getAgentConversation(apiKey, agentId);
          const fetchedMessages = conv.messages || [];
          
          // APPEND-ONLY message accumulation - never remove messages we've seen
          // This ensures the conversation only grows, preventing flicker/stuck states
          setMessages(prevMessages => {
            if (prevMessages.length === 0) {
              // First fetch - just use what we got
              messageIdsRef.current = new Set(fetchedMessages.map(m => m.id));
              return fetchedMessages;
            }
            
            // Build a map of existing messages by ID for quick lookup
            const existingById = new Map(prevMessages.map(m => [m.id, m]));
            
            // Find truly new messages (not seen before)
            const newMessages = fetchedMessages.filter(m => !existingById.has(m.id));
            
            if (newMessages.length === 0) {
              // No new messages - keep existing (don't touch anything)
              return prevMessages;
            }
            
            // Append new messages to existing ones
            // This preserves our history and only adds new content
            const merged = [...prevMessages, ...newMessages];
            messageIdsRef.current = new Set(merged.map(m => m.id));
            return merged;
          });
          
          gotData = true;
          lastSuccessfulPollRef.current = Date.now();
        } catch (err) {
          if (err instanceof AuthError) {
            onAuthFailureRef.current?.();
            setError('Authentication failed');
            return gotData;
          }
          // NotFoundError (409/404) means conversation doesn't exist yet - this is normal for new agents
          if (err instanceof NotFoundError) {
            gotData = true; // Consider this successful (just no messages yet)
          }
          // For rate limits, just continue - next poll will try again
        }
      }
    } finally {
      // ALWAYS release the lock, even if errors occurred
      fetchInFlightRef.current = false;
    }

    return gotData;
  }, [agentId, apiKey]);

  const scheduleNextPoll = useCallback(function scheduleNextPollFn() {
    if (pollingRef.current) clearTimeout(pollingRef.current);
    
    let interval = NORMAL_POLL_INTERVAL;
    
    if (rateLimitedRef.current) {
      interval = BACKOFF_POLL_INTERVAL;
    } else if (pollCountRef.current < 30) {
      // More aggressive polling for first 30 polls (~24 seconds)
      // This covers the typical "thinking" phase before first response
      interval = INITIAL_POLL_INTERVAL;
    }
    
    // Small jitter to avoid thundering herd (but keep it small for responsiveness)
    const jitter = Math.random() * 100;
    interval = Math.max(500, interval + jitter);
    
    pollingRef.current = setTimeout(async () => {
      const agentIdToCheck = currentAgentIdRef.current;
      if (!agentIdToCheck || agentIdToCheck === 'pending') return;
      
      pollCountRef.current++;
      
      try {
        await fetchAll();
      } catch (err) {
        // Don't let errors break the polling loop
        console.error('Poll error:', err);
      }
      
      // Check terminal state using the cached agent from fetchAll
      const currentStatus = latestAgentRef.current?.status;
      const terminal = currentStatus === 'FINISHED' || 
                      currentStatus === 'ERROR' || 
                      currentStatus === 'STOPPED' ||
                      currentStatus === 'EXPIRED';
      
      // Only stop polling if we successfully got a terminal status
      if (terminal) {
        // When agent finishes, do a few more fetches to get final messages/summary
        // Spread out over time to catch delayed updates
        const finalFetches = [500, 1500, 3000];
        for (const delay of finalFetches) {
          setTimeout(async () => {
            if (currentAgentIdRef.current === agentIdToCheck) {
              try {
                await fetchAll(false, true);
              } catch {
                // Ignore errors on final fetches
              }
            }
          }, delay);
        }
        return;
      }
      
      // Continue polling if agent is still current
      if (currentAgentIdRef.current === agentIdToCheck) {
        scheduleNextPollFn();
      }
    }, interval);
  }, [fetchAll]);
  
  // Watchdog: ensure polling hasn't silently stopped for active agents
  useEffect(() => {
    if (!agentId || agentId === 'pending') return;
    
    const watchdog = setInterval(() => {
      const currentStatus = latestAgentRef.current?.status;
      const isActiveAgent = currentStatus === 'RUNNING' || currentStatus === 'CREATING';
      
      // If agent is active and we haven't had a successful poll in too long, restart polling
      if (isActiveAgent && currentAgentIdRef.current === agentId) {
        const timeSinceLastPoll = Date.now() - lastSuccessfulPollRef.current;
        if (timeSinceLastPoll > POLLING_WATCHDOG_MS) {
          console.warn('Polling watchdog triggered - restarting polling');
          lastSuccessfulPollRef.current = Date.now();
          fetchAll(false, true).then(() => {
            scheduleNextPoll();
          });
        }
      }
    }, POLLING_WATCHDOG_MS / 2);
    
    return () => clearInterval(watchdog);
  }, [agentId, fetchAll, scheduleNextPoll]);

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

  // When agent becomes terminal, stop regular polling
  // (Final fetches for summary are handled in scheduleNextPoll)
  // But don't stop if we just had a refresh (follow-up) - give it time to transition back to RUNNING
  useEffect(() => {
    if (isTerminal && agentId && agentId !== 'pending' && !recentRefreshRef.current) {
      stopPolling();
    }
  }, [isTerminal, stopPolling, agentId]);

  // Restart polling when refreshTrigger changes (e.g., after follow-up to finished agent)
  useEffect(() => {
    if (refreshTrigger > 0 && agentId && agentId !== 'pending') {
      // Mark as recently refreshed to prevent premature terminal-state polling stop
      recentRefreshRef.current = true;
      
      // Reset rate limit state and restart polling
      pollCountRef.current = 0;
      rateLimitedRef.current = false;
      lastSuccessfulPollRef.current = Date.now();
      
      // Fetch immediately then schedule next poll
      fetchAll(false, true).then(() => {
        scheduleNextPoll();
      });
      
      // Clear the recent refresh flag after enough time for agent to transition
      const clearTimer = setTimeout(() => {
        recentRefreshRef.current = false;
      }, 5000);
      
      return () => clearTimeout(clearTimer);
    }
  }, [refreshTrigger, agentId, fetchAll, scheduleNextPoll]);

  // Track previous message count to detect new messages
  const prevMessageCountRef = useRef(0);
  
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
  
  // Auto-scroll when new messages arrive (for active agents)
  useEffect(() => {
    if (messages.length > prevMessageCountRef.current) {
      // New messages arrived - scroll to bottom with small delay for render
      const t = setTimeout(scrollToBottom, 50);
      prevMessageCountRef.current = messages.length;
      return () => clearTimeout(t);
    }
    prevMessageCountRef.current = messages.length;
  }, [messages.length, scrollToBottom]);

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
      style={{ 
        WebkitOverflowScrolling: 'touch',
        // Prevent layout shifts when keyboard opens
        overscrollBehavior: 'contain',
      }}
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
                    historicalSummary={historicalSummary || undefined}
                  />
                )}
              </div>
            </>
          );
        })()}
        
        {/* Bottom anchor element for reliable scrolling */}
        <div 
          ref={bottomAnchorRef} 
          data-bottom-anchor
          className="h-0" 
          aria-hidden="true" 
        />
      </div>
    </div>
  );
}
