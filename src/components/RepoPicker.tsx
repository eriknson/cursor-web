'use client';

import { useState, useRef, useEffect } from 'react';
import { CachedRepo } from '@/lib/storage';
import { CursorLoader } from './CursorLoader';
import { theme } from '@/lib/theme';

// Special value for "All Repositories" option
export const ALL_REPOS_OPTION: CachedRepo = {
  owner: '',
  name: 'All Repositories',
  repository: '__all__',
};

// Format a timestamp as relative time (e.g., "2d ago", "3h ago")
function formatRelativeTime(isoTimestamp: string | undefined): string | null {
  if (!isoTimestamp) return null;
  
  const date = new Date(isoTimestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  
  const minutes = Math.floor(diffMs / (1000 * 60));
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);
  
  if (years > 0) return `${years}y`;
  if (months > 0) return `${months}mo`;
  if (weeks > 0) return `${weeks}w`;
  if (days > 0) return `${days}d`;
  if (hours > 0) return `${hours}h`;
  if (minutes > 0) return `${minutes}m`;
  return 'now';
}

interface RepoPickerProps {
  repos: CachedRepo[];
  selectedRepo: CachedRepo | null;
  onSelectRepo: (repo: CachedRepo) => void;
  isLoading?: boolean;
  /** If true, includes an "All Repositories" option at the top */
  showAllOption?: boolean;
}

export function RepoPicker({
  repos,
  selectedRepo,
  onSelectRepo,
  isLoading = false,
  showAllOption = false,
}: RepoPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close on escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, []);

  const handleSelect = (repo: CachedRepo) => {
    onSelectRepo(repo);
    setIsOpen(false);
  };

  const isAllSelected = selectedRepo?.repository === ALL_REPOS_OPTION.repository;
  const displayName = isAllSelected 
    ? 'All Repositories' 
    : (selectedRepo?.name || 'Select repo');

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={isLoading}
        className="flex items-center gap-2 px-1 py-1 transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
        style={{ color: theme.text.secondary }}
        onMouseEnter={(e) => e.currentTarget.style.color = theme.text.primary}
        onMouseLeave={(e) => e.currentTarget.style.color = theme.text.secondary}
      >
        {/* Cursor logo */}
        <div className="w-7 h-7 flex items-center justify-center">
          <CursorLoader size="sm" className="w-6 h-6" loop={false} />
        </div>
        
        {/* Repo name */}
        <span className="text-[15px] font-medium max-w-[140px] truncate">
          {isLoading ? 'Loading...' : displayName}
        </span>
        
        {/* Chevron */}
        <svg 
          className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} 
          style={{ color: theme.text.tertiary }}
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div 
          className="absolute top-full left-0 mt-2 w-72 max-h-80 overflow-y-auto scrollbar-hidden rounded-lg shadow-2xl z-50"
          style={{
            background: 'rgba(27, 26, 21, 0.55)',
            backdropFilter: 'blur(20px) saturate(1.2)',
            WebkitBackdropFilter: 'blur(20px) saturate(1.2)',
            border: '1px solid rgba(255, 255, 255, 0.12)',
          }}
        >
          {repos.length === 0 && !showAllOption ? (
            <div className="px-4 py-3 text-sm" style={{ color: theme.text.tertiary }}>
              No repositories found
            </div>
          ) : (
            <>
              {/* All Repositories option */}
              {showAllOption && (
                <>
                  <button
                    onClick={() => handleSelect(ALL_REPOS_OPTION)}
                    className="w-full text-left px-4 py-2.5 text-sm transition-colors cursor-pointer flex items-center gap-2"
                    style={{
                      color: isAllSelected ? theme.text.primary : theme.text.secondary,
                      background: isAllSelected ? theme.bg.secondary : 'transparent',
                    }}
                    onMouseEnter={(e) => {
                      if (!isAllSelected) {
                        e.currentTarget.style.background = theme.bg.tertiary;
                        e.currentTarget.style.color = theme.text.primary;
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isAllSelected) {
                        e.currentTarget.style.background = 'transparent';
                        e.currentTarget.style.color = theme.text.secondary;
                      }
                    }}
                  >
                    <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
                    </svg>
                    <span className="truncate">All Repositories</span>
                  </button>
                  {repos.length > 0 && (
                    <div className="h-px mx-3" style={{ background: theme.border.secondary }} />
                  )}
                </>
              )}
              {repos.map((repo) => {
                const isSelected = selectedRepo?.repository === repo.repository && !isAllSelected;
                const relativeTime = formatRelativeTime(repo.pushedAt);
                return (
                  <button
                    key={repo.repository}
                    onClick={() => handleSelect(repo)}
                    className="w-full text-left px-4 py-2.5 text-sm transition-colors cursor-pointer"
                    style={{
                      color: isSelected ? theme.text.primary : theme.text.secondary,
                      background: isSelected ? theme.bg.secondary : 'transparent',
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.background = theme.bg.tertiary;
                        e.currentTarget.style.color = theme.text.primary;
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.background = 'transparent';
                        e.currentTarget.style.color = theme.text.secondary;
                      }
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate">{repo.name}</span>
                      {relativeTime && (
                        <span 
                          className="text-xs shrink-0" 
                          style={{ color: theme.text.tertiary }}
                        >
                          {relativeTime}
                        </span>
                      )}
                    </div>
                    <span 
                      className="text-xs truncate block mt-0.5"
                      style={{ color: theme.text.tertiary }}
                    >
                      {repo.owner}
                    </span>
                  </button>
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
}
