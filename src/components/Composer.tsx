'use client';

import { useState, useRef, useEffect } from 'react';
import { CursorLoader } from './CursorLoader';
import { trackComposerSubmit } from '@/lib/analytics';

// Hook to handle mobile keyboard viewport issues (iOS, Android, etc.)
// Returns keyboard height and isOpen state so parent can adjust layout
function useMobileKeyboard(): { keyboardHeight: number; isOpen: boolean } {
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const initialViewportHeight = useRef(0);
  const lastHeight = useRef(0);
  
  useEffect(() => {
    // Detect mobile devices (iOS, Android, etc.)
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) ||
      window.innerWidth < 768; // Also treat small screens as mobile
    
    if (!isMobile) return;
    
    const vv = window.visualViewport;
    if (!vv) {
      // Fallback for browsers without visualViewport API
      const handleResize = () => {
        const currentHeight = window.innerHeight;
        if (initialViewportHeight.current === 0) {
          initialViewportHeight.current = currentHeight;
        }
        
        const heightDiff = initialViewportHeight.current - currentHeight;
        // Keyboard is likely open if viewport shrunk significantly (>150px)
        if (heightDiff > 150) {
          setKeyboardHeight(heightDiff);
          setIsOpen(true);
        } else {
          setKeyboardHeight(0);
          setIsOpen(false);
          // Reset initial height if keyboard closed (viewport returned to normal)
          if (currentHeight > initialViewportHeight.current * 0.9) {
            initialViewportHeight.current = currentHeight;
          }
        }
      };
      
      window.addEventListener('resize', handleResize);
      initialViewportHeight.current = window.innerHeight;
      
      return () => {
        window.removeEventListener('resize', handleResize);
      };
    }
    
    // Store initial viewport height (full screen without keyboard)
    initialViewportHeight.current = window.innerHeight;
    lastHeight.current = vv.height;
    
    const handleViewportChange = () => {
      const currentHeight = vv.height;
      const windowHeight = window.innerHeight;
      
      // Calculate keyboard height from difference between window and visual viewport
      const currentKeyboardHeight = windowHeight - currentHeight;
      
      // Detect keyboard state: significant height difference indicates keyboard is open
      // Use a threshold to avoid false positives from small viewport changes
      const threshold = 100;
      
      if (currentKeyboardHeight > threshold) {
        setKeyboardHeight(currentKeyboardHeight);
        setIsOpen(true);
      } else {
        // Keyboard closed - reset if viewport returned close to initial height
        if (currentHeight > initialViewportHeight.current * 0.9) {
          initialViewportHeight.current = windowHeight;
        }
        setKeyboardHeight(0);
        setIsOpen(false);
      }
      
      lastHeight.current = currentHeight;
    };
    
    // Listen to viewport changes
    vv.addEventListener('resize', handleViewportChange);
    vv.addEventListener('scroll', handleViewportChange);
    
    // Also listen to window resize as fallback
    window.addEventListener('resize', handleViewportChange);
    
    return () => {
      vv.removeEventListener('resize', handleViewportChange);
      vv.removeEventListener('scroll', handleViewportChange);
      window.removeEventListener('resize', handleViewportChange);
    };
  }, []);
  
  return { keyboardHeight, isOpen };
}

// Default model to use
const DEFAULT_MODEL = 'composer-1';

interface ComposerProps {
  onSubmit: (prompt: string, model: string) => void;
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

  // Get mobile keyboard state to adjust composer position and trigger scroll
  const { keyboardHeight, isOpen: isKeyboardOpen } = useMobileKeyboard();

  // Scroll conversation to bottom when keyboard opens (with delay for smooth animation)
  useEffect(() => {
    if (isKeyboardOpen && keyboardHeight > 0) {
      // Use requestAnimationFrame to ensure DOM is updated before scrolling
      const scrollToBottom = () => {
        const scrollContainer = document.querySelector('[data-scroll-container]');
        if (scrollContainer) {
          // Use scrollIntoView on bottom anchor if available, otherwise scroll container
          const bottomAnchor = scrollContainer.querySelector('[data-bottom-anchor]');
          if (bottomAnchor) {
            bottomAnchor.scrollIntoView({ behavior: 'smooth', block: 'end' });
          } else {
            scrollContainer.scrollTo({
              top: scrollContainer.scrollHeight,
              behavior: 'smooth'
            });
          }
        }
      };
      
      // Small delay to allow keyboard animation to start
      const timer = setTimeout(scrollToBottom, 100);
      // Also try immediately in case keyboard opens instantly
      requestAnimationFrame(scrollToBottom);
      
      return () => clearTimeout(timer);
    }
  }, [isKeyboardOpen, keyboardHeight]);

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
    
    trackComposerSubmit(false);
    onSubmit(value.trim(), DEFAULT_MODEL);
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

  // Calculate safe transform value (avoid accessing window during SSR)
  const transformValue = typeof window !== 'undefined' && keyboardHeight > 100
    ? `translateY(-${Math.min(keyboardHeight, window.innerHeight * 0.5)}px)`
    : undefined;

  return (
    <div 
      className="relative transition-transform duration-200 ease-out"
      style={{ 
        // Move composer up when mobile keyboard is visible
        // Only apply transform if keyboard is significantly open to avoid jitter
        transform: transformValue,
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
