'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { Agent } from '@/lib/cursorClient';
import { CursorLoader } from './CursorLoader';
import { CachedRepo } from '@/lib/storage';
import { theme } from '@/lib/theme';

interface HomeActivityListProps {
  agents: Agent[];
  onSelectAgent: (agent: Agent) => void;
  /** Optional: prefetch conversation data for an agent (e.g. on hover) */
  onPrefetchAgent?: (agent: Agent) => void;
  isLoading?: boolean;
  /** Filter agents by this repository. If null, shows all. */
  selectedRepo?: CachedRepo | null;
  /** Hide the internal search bar (when provided by parent) */
  hideSearch?: boolean;
  /** Optional external search query (e.g. a header search bar) */
  searchQuery?: string;
}

// Group agents by date category
function getDateGroup(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const lastWeek = new Date(today);
  lastWeek.setDate(lastWeek.getDate() - 7);

  if (date >= today) {
    return 'Today';
  } else if (date >= yesterday) {
    return 'Yesterday';
  } else if (date >= lastWeek) {
    return 'Last 7 Days';
  } else {
    return 'Older';
  }
}

// Format relative time
function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffWeeks = Math.floor(diffDays / 7);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return `${diffWeeks}w ago`;
}

// Get repo name from agent
function getRepoName(agent: Agent): string {
  const repository = agent.source.repository;
  const parts = repository.split('/');
  const repoName = parts[parts.length - 1];
  if (repoName && repoName !== 'github.com') {
    return repoName;
  }
  return repository;
}

// Normalize repository string for comparison
// Handles formats like "github.com/owner/repo", "owner/repo", or just "repo"
function normalizeRepo(repo: string): { full: string; name: string; ownerAndName: string } {
  const normalized = repo.toLowerCase().trim().replace(/\/+$/, ''); // Remove trailing slashes
  const parts = normalized.split('/');
  const name = parts[parts.length - 1] || normalized;
  
  // Extract owner/name (last two parts if available)
  let ownerAndName = name;
  if (parts.length >= 2) {
    const owner = parts[parts.length - 2];
    if (owner && owner !== 'github.com') {
      ownerAndName = `${owner}/${name}`;
    }
  }
  
  return { full: normalized, name, ownerAndName };
}

// Check if an agent belongs to a repository
function agentMatchesRepo(agent: Agent, selectedRepo: CachedRepo): boolean {
  const agentRepo = normalizeRepo(agent.source.repository);
  const selected = normalizeRepo(selectedRepo.repository);
  
  // Try exact match first (most precise)
  if (agentRepo.full === selected.full) return true;
  
  // Try owner/name match (e.g., "eriknson/living-site")
  if (agentRepo.ownerAndName === selected.ownerAndName) return true;
  
  // Try just name match as fallback (e.g., "living-site")
  // Only if the names are meaningful (not empty or too short)
  if (agentRepo.name.length > 2 && agentRepo.name === selected.name) return true;
  
  // Also try matching the selected repo name against the agent's full path
  // This handles edge cases where formats differ
  if (agentRepo.full.endsWith(`/${selected.name}`)) return true;
  if (selected.full.endsWith(`/${agentRepo.name}`)) return true;
  
  return false;
}

// Small icon component - consistent visual treatment for agent states
function AgentIcon({ agent }: { agent: Agent }) {
  const { status, target } = agent;
  const hasPr = Boolean(target?.prUrl);
  
  // Icon based on status and outcome
  switch (status) {
    case 'CREATING':
    case 'RUNNING':
      // Cursor logo animation for active work
      return (
        <span className="w-[18px] h-[18px] flex items-center justify-center shrink-0">
          <CursorLoader size="sm" />
        </span>
      );
    
    case 'ERROR':
      // Warning/error icon - semantic red color is acceptable
      return (
        <span className="w-[18px] h-[18px] flex items-center justify-center shrink-0">
          <svg className="w-[18px] h-[18px] text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
        </span>
      );
    
    case 'EXPIRED':
      // Clock icon for expired
      return (
        <span className="w-[18px] h-[18px] flex items-center justify-center shrink-0">
          <svg className="w-[18px] h-[18px]" style={{ color: theme.icon.status }} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </span>
      );
    
    case 'STOPPED':
      // Stop icon for manually stopped
      return (
        <span className="w-[18px] h-[18px] flex items-center justify-center shrink-0">
          <svg className="w-[18px] h-[18px]" style={{ color: theme.icon.status }} fill="currentColor" viewBox="0 0 24 24">
            <path d="M6 6h12v12H6z" />
          </svg>
        </span>
      );
    
    case 'FINISHED':
    default:
      // GitHub PR icon if there's a PR
      if (hasPr) {
        return (
          <span className="w-[18px] h-[18px] flex items-center justify-center shrink-0">
            <svg className="w-[18px] h-[18px]" style={{ color: theme.icon.status }} fill="currentColor" viewBox="0 0 16 16">
              <path d="M1.5 3.25a2.25 2.25 0 1 1 3 2.122v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.25 2.25 0 0 1 1.5 3.25Zm5.677-.177L9.573.677A.25.25 0 0 1 10 .854V2.5h1A2.5 2.5 0 0 1 13.5 5v5.628a2.251 2.251 0 1 1-1.5 0V5a1 1 0 0 0-1-1h-1v1.646a.25.25 0 0 1-.427.177L7.177 3.427a.25.25 0 0 1 0-.354ZM3.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm0 9.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Zm8.25.75a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Z"/>
            </svg>
          </span>
        );
      }
      // Checkmark for finished without PR
      return (
        <span className="w-[18px] h-[18px] flex items-center justify-center shrink-0">
          <svg className="w-[18px] h-[18px]" style={{ color: theme.icon.status }} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </span>
      );
  }
}

// Agent list item with animation
function AgentItem({ 
  agent, 
  onSelect,
  onPrefetch,
  animationDelay = 0,
}: { 
  agent: Agent; 
  onSelect: () => void;
  onPrefetch?: () => void;
  animationDelay?: number;
}) {
  return (
    <button
      onClick={onSelect}
      className="w-full flex items-start gap-2.5 px-4 py-3 rounded-xl transition-all duration-200 cursor-pointer text-left animate-fade-in-up"
      style={{ 
        animationDelay: `${animationDelay}ms`,
        animationFillMode: 'backwards',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = theme.bg.card;
        onPrefetch?.();
      }}
      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
      onFocus={() => onPrefetch?.()}
    >
      <div className="mt-0.5">
        <AgentIcon agent={agent} />
      </div>
      
      <div className="flex-1 min-w-0">
        <p 
          className="text-[15px] font-medium truncate leading-tight"
          style={{ color: theme.text.primary }}
        >
          {agent.name || 'Agent task'}
        </p>
        <p className="text-sm mt-0.5" style={{ color: theme.text.tertiary }}>
          {agent.model || 'Composer 1'}
          <span className="mx-1.5 opacity-50">·</span>
          {formatRelativeTime(agent.createdAt)}
        </p>
      </div>
    </button>
  );
}

// Date group section with staggered animations
function DateGroup({ 
  title, 
  agents, 
  onSelectAgent,
  onPrefetchAgent,
  startIndex = 0,
}: { 
  title: string; 
  agents: Agent[]; 
  onSelectAgent: (agent: Agent) => void;
  onPrefetchAgent?: (agent: Agent) => void;
  startIndex?: number;
}) {
  if (agents.length === 0) return null;
  
  return (
    <div className="mb-2">
      <h3 
        className="text-sm font-medium px-4 py-2 animate-fade-in" 
        style={{ animationDelay: `${startIndex * 12}ms`, color: theme.text.tertiary }}
      >
        {title}
      </h3>
      <div>
        {agents.map((agent, idx) => (
          <AgentItem 
            key={agent.id} 
            agent={agent} 
            onSelect={() => onSelectAgent(agent)}
            onPrefetch={onPrefetchAgent ? () => onPrefetchAgent(agent) : undefined}
            animationDelay={(startIndex + idx) * 12}
          />
        ))}
      </div>
    </div>
  );
}

export function HomeActivityList({ 
  agents, 
  onSelectAgent,
  onPrefetchAgent,
  isLoading = false,
  selectedRepo,
  hideSearch = false,
  searchQuery: externalSearchQuery,
}: HomeActivityListProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const effectiveSearchQuery = externalSearchQuery ?? searchQuery;
  
  // Filter and group agents
  const { today, yesterday, lastWeek, older } = useMemo(() => {
    // Filter by selected repository using robust matching
    let repoFiltered = agents;
    if (selectedRepo) {
      repoFiltered = agents.filter((agent) => agentMatchesRepo(agent, selectedRepo));
    }
    
    // Filter by search query
    const filtered = repoFiltered.filter((agent) => {
      if (!effectiveSearchQuery.trim()) return true;
      const query = effectiveSearchQuery.toLowerCase();
      const name = (agent.name || '').toLowerCase();
      const repo = getRepoName(agent).toLowerCase();
      const summary = (agent.summary || '').toLowerCase();
      return name.includes(query) || summary.includes(query) || repo.includes(query);
    });

    // Group by date
    const groups = {
      today: [] as Agent[],
      yesterday: [] as Agent[],
      lastWeek: [] as Agent[],
      older: [] as Agent[],
    };

    filtered.forEach((agent) => {
      const group = getDateGroup(agent.createdAt);
      switch (group) {
        case 'Today':
          groups.today.push(agent);
          break;
        case 'Yesterday':
          groups.yesterday.push(agent);
          break;
        case 'Last 7 Days':
          groups.lastWeek.push(agent);
          break;
        default:
          groups.older.push(agent);
      }
    });

    return groups;
  }, [agents, effectiveSearchQuery, selectedRepo]);

  const filteredCount = today.length + yesterday.length + lastWeek.length + older.length;
  const resultsLabel = `${filteredCount} run${filteredCount === 1 ? '' : 's'}`;
  const activityLabel = effectiveSearchQuery.trim() ? 'Search results' : 'Recent activity';
  const hasResults = today.length > 0 || yesterday.length > 0 || lastWeek.length > 0 || older.length > 0;

  // Calculate running indices for staggered animations
  const todayStartIndex = 0;
  const yesterdayStartIndex = today.length;
  const lastWeekStartIndex = yesterdayStartIndex + yesterday.length;
  const olderStartIndex = lastWeekStartIndex + lastWeek.length;

  const emptyState = useMemo(() => {
    const trimmedQuery = effectiveSearchQuery.trim();
    if (trimmedQuery) {
      return {
        title: `No matches for "${trimmedQuery}"`,
        description: 'Try a different keyword or clear the search.',
        hints: ['Search by repo name', 'Search by run summary'],
      };
    }

    if (selectedRepo) {
      return {
        title: `No runs for ${selectedRepo.name} yet`,
        description: 'Describe a task below to launch the first agent for this repo.',
        hints: ['Plan a feature', 'Fix a bug', 'Review a PR'],
      };
    }

    return {
      title: 'No agents yet',
      description: 'Describe a task below to launch your first agent.',
      hints: ['Plan a feature', 'Fix a bug', 'Review a PR'],
    };
  }, [effectiveSearchQuery, selectedRepo]);

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* Search bar - only show when not hidden by parent */}
      {!hideSearch && (
        <div 
          className="px-4 py-4 sticky top-14 z-10 backdrop-blur-xl relative"
          style={{ background: 'color-mix(in oklab, var(--color-theme-bg) 90%, transparent)' }}
        >
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search Agents"
            className="w-full h-11 px-4 rounded-xl text-[15px] focus:outline-none transition-colors"
            style={{
              background: theme.bg.card,
              border: '1px solid var(--color-theme-border-secondary)',
              color: 'var(--color-theme-fg)',
            }}
          />
        </div>
      )}

      {/* Activity list */}
      <div 
        key={selectedRepo?.repository || 'default'}
        data-scroll-container
        className="flex-1 overflow-y-auto scrollbar-hidden pt-4 pb-44" 
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <CursorLoader size="lg" className="w-16 h-16" />
          </div>
        ) : !hasResults ? (
          <div 
            className="text-center py-12 text-sm px-4 animate-fade-in"
          >
            <div
              className="rounded-2xl border px-5 py-5"
              style={{
                background: theme.bg.card,
                borderColor: theme.border.secondary,
              }}
            >
              <p className="text-sm font-medium" style={{ color: theme.text.primary }}>
                {emptyState.title}
              </p>
              <p className="text-xs mt-1" style={{ color: theme.text.tertiary }}>
                {emptyState.description}
              </p>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {emptyState.hints.map((hint) => (
                  <div
                    key={hint}
                    className="text-xs px-3 py-2 rounded-xl"
                    style={{
                      background: theme.bg.secondary,
                      color: theme.text.tertiary,
                    }}
                  >
                    {hint}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="px-4 pb-2">
              <div className="flex items-center justify-between">
                <p
                  className="text-[11px] uppercase tracking-[0.2em]"
                  style={{ color: theme.text.quaternary }}
                >
                  {activityLabel}
                </p>
                <p className="text-xs" style={{ color: theme.text.quaternary }}>
                  {resultsLabel}
                </p>
              </div>
            </div>
            <DateGroup title="Today" agents={today} onSelectAgent={onSelectAgent} onPrefetchAgent={onPrefetchAgent} startIndex={todayStartIndex} />
            <DateGroup title="Yesterday" agents={yesterday} onSelectAgent={onSelectAgent} onPrefetchAgent={onPrefetchAgent} startIndex={yesterdayStartIndex} />
            <DateGroup title="Last 7 Days" agents={lastWeek} onSelectAgent={onSelectAgent} onPrefetchAgent={onPrefetchAgent} startIndex={lastWeekStartIndex} />
            <DateGroup title="Older" agents={older} onSelectAgent={onSelectAgent} onPrefetchAgent={onPrefetchAgent} startIndex={olderStartIndex} />
          </>
        )}
      </div>
    </div>
  );
}
