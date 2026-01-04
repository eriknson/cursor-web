'use client';

import { Drawer } from 'vaul';
import { StoredRun } from '@/lib/storage';
import { CursorLoader } from './CursorLoader';

interface ActivityDrawerProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  runs: StoredRun[];
  onSelectRun: (run: StoredRun) => void;
}

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

function getRepoName(repoUrl: string): string {
  const match = repoUrl.match(/github\.com\/([^\/]+\/[^\/]+)/);
  return match ? match[1].split('/')[1] : repoUrl;
}

export function ActivityDrawer({
  isOpen,
  onOpenChange,
  runs,
  onSelectRun,
}: ActivityDrawerProps) {
  const handleSelectRun = (run: StoredRun) => {
    onSelectRun(run);
    onOpenChange(false);
  };

  return (
    <Drawer.Root direction="right" open={isOpen} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-black/80 z-50" />
        <Drawer.Content className="fixed right-0 top-0 bottom-0 z-50 flex flex-col w-[80vw] md:w-[50vw] bg-neutral-950 border-l border-neutral-900">
          {/* Handle - vertical for right drawer */}
          <div className="absolute left-0 top-1/2 -translate-y-1/2 flex items-center justify-center w-4 h-16">
            <div className="w-0.5 h-8 rounded-full bg-neutral-700" />
          </div>

          {/* Header */}
          <header className="flex items-center justify-between px-5 pt-5 pb-4">
            <Drawer.Title className="text-base font-medium text-white">
              Activity
            </Drawer.Title>
            <Drawer.Close className="text-neutral-600 hover:text-white transition-colors p-1">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </Drawer.Close>
          </header>
          <Drawer.Description className="sr-only">
            Your recent agent activity and runs
          </Drawer.Description>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-3 pb-safe">
            {runs.length === 0 ? (
              <div className="text-center py-12 text-neutral-600 text-sm">
                No activity yet
              </div>
            ) : (
              <div className="space-y-1">
                {runs.map((run) => {
                  const isActive = run.status === 'RUNNING' || run.status === 'CREATING';
                  
                  return (
                    <button
                      key={run.id}
                      onClick={() => handleSelectRun(run)}
                      className="w-full text-left px-3 py-3 hover:bg-white/5 rounded-lg transition-colors cursor-pointer"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <span className="text-neutral-200 text-sm truncate block">
                            {run.agentName || (run.prompt.length > 40 ? run.prompt.slice(0, 40) + '...' : run.prompt)}
                          </span>
                          <div className="flex items-center gap-2 mt-1 text-xs text-neutral-600">
                            <span>{getRepoName(run.repository)}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {isActive ? (
                            <>
                              <span className="text-xs text-neutral-500 shimmer-text">Building</span>
                              <CursorLoader size="sm" className="w-3 h-3" />
                            </>
                          ) : (
                            <span className="text-xs text-neutral-600 whitespace-nowrap">
                              {formatRelativeTime(run.createdAt)}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
