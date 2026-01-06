'use client';

import { useState, useRef, useEffect } from 'react';
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

// Default model to use
const DEFAULT_MODEL = 'composer-1';

export type AgentMode = 'cloud' | 'sdk';

interface ComposerProps {
  onSubmit: (prompt: string, mode: AgentMode, model: string) => void;
  isLoading: boolean;
  disabled: boolean;
  placeholder?: string;
  // Callback when input value changes (for hiding empty state)
  onInputChange?: (hasInput: boolean) => void;
}

export function Composer({
  onSubmit,
  isLoading,
  disabled,
  placeholder = 'Ask Cursor to build, plan, fix anything',
  onInputChange,
}: ComposerProps) {
  const [value, setValue] = useState('');
  const [isFocused, setIsFocused] = useState(false);
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

  // Auto-resize textarea - grows with content
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      // Reset height to auto to get the correct scrollHeight
      textarea.style.height = 'auto';
      // Set height based on content, with min and max constraints
      const minHeight = 24; // Single line height
      const maxHeight = 200; // Max before scrolling
      const newHeight = Math.min(Math.max(textarea.scrollHeight, minHeight), maxHeight);
      textarea.style.height = newHeight + 'px';
    }
  }, [value]);

  // Auto-focus when not loading
  useEffect(() => {
    if (!isLoading && textareaRef.current) {
      // Small delay to ensure DOM is ready, especially on mobile
      const timer = setTimeout(() => {
        textareaRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isLoading]);

  // Notify parent when input changes
  useEffect(() => {
    onInputChange?.(value.trim().length > 0);
  }, [value, onInputChange]);

  const handleSubmit = () => {
    if (!value.trim() || isLoading || disabled) return;
    
    // Debounce rapid submits to avoid double-launch
    const now = Date.now();
    if (now - lastSubmitRef.current < 350) {
      return;
    }
    lastSubmitRef.current = now;
    
    onSubmit(value.trim(), 'cloud', DEFAULT_MODEL);
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

  // Determine if composer is expanded (focused or has content)
  const isExpanded = isFocused || value.length > 0;

  // Check if we have text content for styling changes
  const hasContent = value.trim().length > 0;

  return (
    <div 
      className="relative transition-transform duration-200 ease-out"
      style={{ 
        // Move composer up when iOS keyboard is visible
        transform: keyboardHeight > 0 ? `translateY(-${keyboardHeight}px)` : undefined 
      }}
    >
      <div 
        className="relative flex items-center transition-all duration-200 rounded-2xl backdrop-blur-2xl"
        style={{
          background: hasContent 
            ? 'var(--color-theme-bg-card)' 
            : 'color-mix(in oklab, var(--color-theme-bg) 50%, rgba(128, 128, 128, 0.12))',
          border: hasContent 
            ? '1px solid var(--color-theme-border-primary)' 
            : '1px solid var(--color-theme-border-tertiary)',
        }}
      >
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          placeholder={placeholder}
          disabled={isLoading}
          rows={1}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="sentences"
          enterKeyHint="send"
          className="flex-1 bg-transparent resize-none focus:outline-none disabled:opacity-50 text-[15px]
            transition-all duration-200 px-4 py-3"
          style={{ 
            minHeight: '24px',
            maxHeight: '200px',
            overflow: value.split('\n').length > 8 ? 'auto' : 'hidden',
            color: 'var(--color-theme-fg)',
          }}
        />
        
        <button
          onClick={handleSubmit}
          disabled={!value.trim() || isLoading || disabled}
          className="flex-shrink-0 w-7 h-7 mr-3 flex items-center justify-center rounded-full
            transition-all duration-200 cursor-pointer disabled:cursor-not-allowed disabled:opacity-30"
          style={{
            background: hasContent ? 'var(--color-theme-fg)' : 'transparent',
          }}
        >
          {isLoading ? (
            <CursorLoader size="sm" />
          ) : (
            <svg 
              className="w-4 h-4"
              fill="none" 
              viewBox="0 0 24 24"
              style={{ stroke: hasContent ? 'var(--color-theme-bg)' : 'var(--color-theme-text-tertiary)' }}
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}
