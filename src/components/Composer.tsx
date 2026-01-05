'use client';

import { useState, useRef, useEffect } from 'react';
import { CachedRepo } from '@/lib/storage';
import { CursorLoader } from './CursorLoader';

// Hook to handle iOS keyboard viewport issues
// Returns keyboard height so parent can adjust layout
function useIOSKeyboard(): number {
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const initialViewportHeight = useRef(0);
  
  useEffect(() => {
    // Check if we're on iOS/mobile Safari
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || 
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    
    if (!isIOS) return;
    
    const vv = window.visualViewport;
    if (!vv) return;
    
    // Store initial viewport height (full screen without keyboard)
    initialViewportHeight.current = window.innerHeight;
    
    const handleViewportChange = () => {
      // Calculate keyboard height from difference between layout and visual viewport
      const currentKeyboardHeight = window.innerHeight - vv.height;
      
      // Only set if keyboard is actually visible (threshold to avoid false positives)
      if (currentKeyboardHeight > 100) {
        setKeyboardHeight(currentKeyboardHeight);
      } else {
        setKeyboardHeight(0);
      }
    };
    
    vv.addEventListener('resize', handleViewportChange);
    
    return () => {
      vv.removeEventListener('resize', handleViewportChange);
    };
  }, []);
  
  return keyboardHeight;
}

const AVAILABLE_MODELS = [
  'composer-1',
  'opus-4.5',
  'gpt-5.2',
] as const;

export type AgentMode = 'cloud' | 'sdk';

interface ComposerProps {
  onSubmit: (prompt: string, mode: AgentMode, model: string) => void;
  isLoading: boolean;
  disabled: boolean;
  placeholder?: string;
  repos: CachedRepo[];
  selectedRepo: CachedRepo | null;
  onSelectRepo: (repo: CachedRepo) => void;
  isLoadingRepos: boolean;
  // Conversation mode - when active, hide repo selector and show conversation UI
  isConversationMode?: boolean;
  // Whether the agent is finished (for placeholder text)
  isAgentFinished?: boolean;
  activeRepoName?: string;
  // Callback when input value changes (for hiding empty state)
  onInputChange?: (hasInput: boolean) => void;
}

export function Composer({
  onSubmit,
  isLoading,
  disabled,
  placeholder,
  repos,
  selectedRepo,
  onSelectRepo,
  isLoadingRepos,
  isConversationMode = false,
  isAgentFinished = false,
  activeRepoName,
  onInputChange,
}: ComposerProps) {
  const [value, setValue] = useState('');
  const [selectedModel, setSelectedModel] = useState<string>(AVAILABLE_MODELS[0]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastSubmitRef = useRef<number>(0);

  // Get iOS keyboard height to adjust composer position
  const keyboardHeight = useIOSKeyboard();

  // Scroll conversation to bottom when keyboard opens
  useEffect(() => {
    if (keyboardHeight > 0) {
      const scrollContainer = document.querySelector('[data-scroll-container]');
      if (scrollContainer) {
        scrollContainer.scrollTo({
          top: scrollContainer.scrollHeight,
          behavior: 'smooth'
        });
      }
    }
  }, [keyboardHeight]);

  // Auto-resize textarea - grows with content, no max height
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = textarea.scrollHeight + 'px';
    }
  }, [value]);

  // Auto-focus when in new chat mode (not conversation mode)
  // This brings up the keyboard on mobile for immediate typing
  useEffect(() => {
    if (!isConversationMode && !isLoading && textareaRef.current) {
      // Small delay to ensure DOM is ready, especially on mobile
      const timer = setTimeout(() => {
        textareaRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isConversationMode, isLoading]);

  // Notify parent when input changes
  useEffect(() => {
    onInputChange?.(value.trim().length > 0);
  }, [value, onInputChange]);

  const handleSubmit = () => {
    if (!value.trim() || isLoading || disabled) return;

    const now = Date.now();
    if (now - lastSubmitRef.current < 350) {
      // Debounce rapid submits to avoid double-launch
      return;
    }
    lastSubmitRef.current = now;

    onSubmit(value.trim(), 'cloud', selectedModel);
    setValue('');
    
    // Blur the textarea to dismiss keyboard and trigger viewport fix
    textareaRef.current?.blur();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleRepoChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const repo = repos.find((r) => r.repository === e.target.value);
    if (repo) {
      onSelectRepo(repo);
    }
  };

  const emptyStateText = isConversationMode
    ? isAgentFinished 
      ? 'Continue working on this...'
      : 'Add follow-up instructions...'
    : !value.trim() && !selectedRepo 
      ? 'Ask, plan, build anything' 
      : placeholder;

  return (
    <div 
      className="relative transition-transform duration-200 ease-out"
      style={{ 
        // Move composer up when iOS keyboard is visible
        transform: keyboardHeight > 0 ? `translateY(-${keyboardHeight}px)` : undefined 
      }}
    >
      <div className="relative rounded-xl bg-white/[0.03] border border-white/[0.08] focus-within:border-white/[0.15] transition-colors">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={emptyStateText || 'Ask, plan, build anything'}
          disabled={isLoading}
          rows={1}
          autoFocus={!isConversationMode}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="sentences"
          enterKeyHint="send"
          className="w-full px-4 pt-4 pb-14 bg-transparent text-zinc-100 placeholder:text-zinc-500 resize-none focus:outline-none disabled:opacity-50 text-[16px] md:text-[15px] overflow-hidden"
        />
        
        <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {/* Model selector - native select with pill styling */}
            <div className="relative inline-flex items-center gap-1.5 h-7 pl-2.5 pr-2 text-xs text-zinc-400 bg-zinc-800/60 rounded-full hover:bg-zinc-800 hover:text-zinc-200 transition-colors cursor-pointer">
              {/* Infinity icon */}
              <svg className="w-3.5 h-3.5 flex-shrink-0 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M18.178 8c5.096 0 5.096 8 0 8-5.095 0-7.133-8-12.739-8-4.585 0-4.585 8 0 8 5.606 0 7.644-8 12.74-8z" />
              </svg>
              <span className="pointer-events-none">{selectedModel}</span>
              <svg className="w-2.5 h-2.5 opacity-50 flex-shrink-0 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              >
                {AVAILABLE_MODELS.map((model) => (
                  <option key={model} value={model} className="bg-zinc-900 text-zinc-200">
                    {model}
                  </option>
                ))}
              </select>
            </div>

            {/* Repo selector - native select with pill styling, or static display in conversation mode */}
            {isConversationMode ? (
              // Conversation mode - show repo name as static indicator (no dropdown)
              <div className="inline-flex items-center gap-1.5 h-7 pl-2.5 pr-2.5 text-xs text-zinc-500 bg-zinc-800/40 rounded-full">
                {/* Folder icon */}
                <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 00-1.883 2.542l.857 6a2.25 2.25 0 002.227 1.932H19.05a2.25 2.25 0 002.227-1.932l.857-6a2.25 2.25 0 00-1.883-2.542m-16.5 0V6A2.25 2.25 0 016 3.75h3.879a1.5 1.5 0 011.06.44l2.122 2.12a1.5 1.5 0 001.06.44H18A2.25 2.25 0 0120.25 9v.776" />
                </svg>
                <span>{activeRepoName || selectedRepo?.name || 'Repository'}</span>
              </div>
            ) : isLoadingRepos ? (
              <div className="inline-flex items-center gap-1.5 h-7 pl-2 pr-2.5 text-xs text-zinc-500 bg-zinc-800/40 rounded-full cursor-not-allowed">
                <CursorLoader size="sm" className="pointer-events-none" />
                <span>Loading repositories</span>
              </div>
            ) : (
              <div className="relative inline-flex items-center gap-1.5 h-7 pl-2.5 pr-2 text-xs text-zinc-400 bg-zinc-800/60 rounded-full hover:bg-zinc-800 hover:text-zinc-200 transition-colors cursor-pointer">
                {/* Folder icon */}
                <svg className="w-3 h-3 flex-shrink-0 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 00-1.883 2.542l.857 6a2.25 2.25 0 002.227 1.932H19.05a2.25 2.25 0 002.227-1.932l.857-6a2.25 2.25 0 00-1.883-2.542m-16.5 0V6A2.25 2.25 0 016 3.75h3.879a1.5 1.5 0 011.06.44l2.122 2.12a1.5 1.5 0 001.06.44H18A2.25 2.25 0 0120.25 9v.776" />
                </svg>
                <span className="pointer-events-none">{selectedRepo?.name || (repos.length === 0 ? 'No repos' : 'Select repo')}</span>
                <svg className="w-2.5 h-2.5 opacity-50 flex-shrink-0 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
                <select
                  value={selectedRepo?.repository || ''}
                  onChange={handleRepoChange}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                >
                  {repos.length === 0 ? (
                    <option value="" className="bg-zinc-900 text-zinc-500">No repos</option>
                  ) : (
                    repos.map((repo) => (
                      <option key={repo.repository} value={repo.repository} className="bg-zinc-900 text-zinc-200">
                        {repo.name}
                      </option>
                    ))
                  )}
                </select>
              </div>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={handleSubmit}
              disabled={!value.trim() || isLoading || disabled}
              className="w-7 h-7 flex items-center justify-center rounded-full text-zinc-400 bg-zinc-800/60 hover:bg-zinc-800 hover:text-zinc-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              {isLoading ? (
                <CursorLoader size="sm" />
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
