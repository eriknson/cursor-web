'use client';

import { Agent } from '@/lib/cursorClient';
import { CursorLoader } from './CursorLoader';

interface RunListProps {
  runs: Agent[];
  onSelect: (agent: Agent) => void;
}

function formatRelativeTime(dateStr: string, status: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffWeeks = Math.floor(diffDays / 7);

  let timeStr: string;
  if (diffMins < 1) timeStr = 'just now';
  else if (diffMins < 60) timeStr = `${diffMins}m ago`;
  else if (diffHours < 24) timeStr = `${diffHours}h ago`;
  else if (diffDays < 7) timeStr = `${diffDays}d ago`;
  else timeStr = `${diffWeeks}w ago`;

  // Add status prefix
  if (status === 'RUNNING' || status === 'CREATING') {
    return `Started ${timeStr}`;
  } else if (status === 'FINISHED') {
    return `Finished ${timeStr}`;
  } else if (status === 'STOPPED' || status === 'ERROR') {
    return `Stopped ${timeStr}`;
  }
  return timeStr;
}

function getRepoName(agent: Agent): string {
  // Repository format is "github.com/owner/repo-name"
  // We want the last part (repo name)
  const repository = agent.source.repository;
  const parts = repository.split('/');
  
  // Get the last part which is the repo name
  const repoName = parts[parts.length - 1];
  if (repoName && repoName !== 'github.com') {
    return repoName;
  }
  
  return repository;
}

export function RunList({ runs, onSelect }: RunListProps) {
  if (runs.length === 0) {
    return null;
  }

  return (
    <div className="space-y-1">
      {runs.map((agent) => {
        const isActive = agent.status === 'RUNNING' || agent.status === 'CREATING';
        
        return (
          <button
            key={agent.id}
            onClick={() => onSelect(agent)}
            className="w-full text-left px-2 py-3 hover:bg-zinc-900/50 rounded-lg transition-colors cursor-pointer"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <span className="text-zinc-200 text-[16px] md:text-[15px] truncate block">
                  {agent.name || 'Agent task'}
                </span>
                <div className="flex items-center gap-2 mt-1 text-xs text-zinc-600">
                  <span>{getRepoName(agent)}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {isActive ? (
                  <>
                    <span className="text-xs text-zinc-500 shimmer-text">Building</span>
                    <CursorLoader size="sm" className="w-3 h-3" />
                  </>
                ) : (
                  <span className="text-xs text-zinc-600 whitespace-nowrap">
                    {formatRelativeTime(agent.createdAt, agent.status)}
                  </span>
                )}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
