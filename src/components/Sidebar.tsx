'use client';

import { useState, useRef, useEffect } from 'react';
import { Drawer } from 'vaul';
import { StoredRun } from '@/lib/storage';
import { CursorLoader } from './CursorLoader';

function UserMenu({ userEmail, onLogout }: { userEmail?: string; onLogout: () => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  
  // Get first letter for avatar
  const avatarLetter = userEmail ? userEmail[0].toUpperCase() : '?';
  
  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-3 px-2 py-2 hover:bg-white/5 rounded-lg transition-colors cursor-pointer group"
      >
        {/* Avatar */}
        <div className="w-8 h-8 rounded-full bg-neutral-800/60 flex items-center justify-center text-neutral-400 text-sm font-medium shrink-0">
          {avatarLetter}
        </div>
        
        {/* Email */}
        <span className="flex-1 text-sm text-neutral-400 group-hover:text-neutral-200 truncate text-left transition-colors">
          {userEmail || 'Not signed in'}
        </span>
        
        {/* Chevron */}
        <svg 
          className={`w-4 h-4 text-neutral-600 transition-transform ${isOpen ? 'rotate-180' : ''}`} 
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      
      {/* Dropdown */}
      {isOpen && (
        <div className="absolute bottom-full left-0 right-0 mb-2 bg-neutral-900 border border-neutral-800 rounded-lg shadow-xl overflow-hidden z-50">
          <button
            onClick={() => {
              onLogout();
              setIsOpen(false);
            }}
            className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-neutral-400 hover:text-red-400 hover:bg-white/5 transition-colors cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
            </svg>
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

interface SidebarProps {
  runs: StoredRun[];
  onSelectRun: (run: StoredRun) => void;
  onNewAgent: () => void;
  onLogout: () => void;
  userEmail?: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

function formatRelativeTime(dateStr: string): { time: string; showAgo: boolean } {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffWeeks = Math.floor(diffDays / 7);

  if (diffMins < 1) return { time: 'just now', showAgo: false };
  if (diffMins < 60) return { time: `${diffMins}m`, showAgo: true };
  if (diffHours < 24) return { time: `${diffHours}h`, showAgo: true };
  if (diffDays < 7) return { time: `${diffDays}d`, showAgo: true };
  return { time: `${diffWeeks}w`, showAgo: true };
}

function getRepoName(repoUrl: string): string {
  const match = repoUrl.match(/github\.com\/([^\/]+\/[^\/]+)/);
  return match ? match[1].split('/')[1] : repoUrl;
}

function SidebarContent({
  runs,
  onSelectRun,
  onNewAgent,
  onLogout,
  userEmail,
  searchQuery,
  setSearchQuery,
  onClose,
}: {
  runs: StoredRun[];
  onSelectRun: (run: StoredRun) => void;
  onNewAgent: () => void;
  onLogout: () => void;
  userEmail?: string;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  onClose?: () => void;
}) {
  const handleSelectRun = (run: StoredRun) => {
    onSelectRun(run);
    onClose?.();
  };

  const handleNewAgent = () => {
    onNewAgent();
    onClose?.();
  };

  // Filter runs based on search query
  const filteredRuns = runs.filter((run) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    const name = (run.agentName || run.prompt).toLowerCase();
    const repo = getRepoName(run.repository).toLowerCase();
    return name.includes(query) || repo.includes(query);
  });

  return (
    <div className="flex flex-col h-full bg-neutral-950">
      {/* Search + New Agent */}
      <div className="px-3 pt-4 pb-3 flex items-center gap-2">
        <div className="flex-1 relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search..."
            className="w-full h-10 px-3 bg-neutral-900/40 border border-neutral-800/60 rounded-lg text-sm text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:border-neutral-700 transition-colors"
          />
        </div>
        <button
          onClick={handleNewAgent}
          className="w-10 h-10 flex items-center justify-center text-neutral-500 hover:text-white bg-neutral-900/40 border border-neutral-800/60 hover:border-neutral-700 rounded-lg transition-colors cursor-pointer"
          title="New agent"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
        </button>
      </div>

      {/* Runs list */}
      <div className="flex-1 overflow-y-auto px-2 overscroll-contain">
        {filteredRuns.length === 0 ? (
          <div className="text-center py-12 text-neutral-600 text-sm">
            {searchQuery.trim() ? 'No matching activity' : 'No activity yet'}
          </div>
        ) : (
          <div className="space-y-0.5">
            {filteredRuns.map((run) => {
              const isActive = run.status === 'RUNNING' || run.status === 'CREATING';

              return (
                <button
                  key={run.id}
                  onClick={() => handleSelectRun(run)}
                  className="w-full text-left px-3 py-2.5 hover:bg-white/5 rounded-lg transition-colors cursor-pointer group"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <span className="text-neutral-200 text-sm truncate block">
                        {run.agentName || (run.prompt.length > 35 ? run.prompt.slice(0, 35) + '...' : run.prompt)}
                      </span>
                      <span className="text-xs text-neutral-600 truncate block mt-0.5">
                        {getRepoName(run.repository)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {isActive ? (
                        <CursorLoader size="sm" className="w-3 h-3" />
                      ) : (
                        <span className="text-xs text-neutral-600 opacity-0 group-hover:opacity-100 transition-opacity">
                          {formatRelativeTime(run.createdAt).time}
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

      {/* User footer */}
      <div className="p-3 border-t border-neutral-900">
        <UserMenu userEmail={userEmail} onLogout={onLogout} />
      </div>
    </div>
  );
}

export function Sidebar({
  runs,
  onSelectRun,
  onNewAgent,
  onLogout,
  userEmail,
  isOpen,
  onOpenChange,
}: SidebarProps) {
  const [searchQuery, setSearchQuery] = useState('');

  return (
    <>
      {/* Desktop sidebar - always visible */}
      <aside className="hidden md:flex w-64 flex-col border-r border-neutral-900 shrink-0">
        <SidebarContent
          runs={runs}
          onSelectRun={onSelectRun}
          onNewAgent={onNewAgent}
          onLogout={onLogout}
          userEmail={userEmail}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
        />
      </aside>

      {/* Mobile drawer */}
      <Drawer.Root direction="left" open={isOpen} onOpenChange={onOpenChange}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 bg-black/80 z-50" />
          <Drawer.Content className="fixed left-0 top-0 bottom-0 z-50 flex flex-col w-[80vw] max-w-[300px] bg-neutral-950 border-r border-neutral-900">
            {/* Handle - vertical for left drawer */}
            <div className="absolute right-0 top-1/2 -translate-y-1/2 flex items-center justify-center w-4 h-16">
              <div className="w-0.5 h-8 rounded-full bg-neutral-700" />
            </div>

            <Drawer.Title className="sr-only">Navigation</Drawer.Title>
            <Drawer.Description className="sr-only">
              Your agent activity and navigation
            </Drawer.Description>

            <SidebarContent
              runs={runs}
              onSelectRun={onSelectRun}
              onNewAgent={onNewAgent}
              onLogout={onLogout}
              userEmail={userEmail}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              onClose={() => onOpenChange(false)}
            />
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    </>
  );
}
