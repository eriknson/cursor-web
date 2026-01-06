'use client';

import { useState, useRef, useEffect } from 'react';
import { CursorLoader } from './CursorLoader';
import { trackComposerSubmit } from '@/lib/analytics';

// Hook to handle mobile keyboard viewport issues across all devices
// Returns keyboard height so parent can adjust layout
function useMobileKeyboard(): { keyboardHeight: number; isKeyboardVisible: boolean } {
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const initialViewportHeight = useRef(0);
  const lastHeightRef = useRef(0);
  
  useEffect(() => {
    // Detect mobile devices (iOS, Android, etc.)
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) ||
      window.innerWidth <= 768;
    
    if (!isMobile) {
      return;
    }
    
    const vv = window.visualViewport;
    if (!vv) {
      // Fallback for browsers without visualViewport API
      const handleResize = () => {
        const currentHeight = window.innerHeight;
        if (initialViewportHeight.current === 0) {
          initialViewportHeight.current = currentHeight;
        }
        
        const heightDiff = initialViewportHeight.current - currentHeight;
        if (heightDiff > 150) {
          setKeyboardHeight(heightDiff);
          setIsKeyboardVisible(true);
        } else {
          setKeyboardHeight(0);
          setIsKeyboardVisible(false);
          // Reset initial height if keyboard is fully closed
          if (heightDiff < 50) {
            initialViewportHeight.current = currentHeight;
          }
        }
      };
      
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    }
    
    // Store initial viewport height (full screen without keyboard)
    initialViewportHeight.current = window.innerHeight;
    lastHeightRef.current = vv.height;
    
    const handleViewportChange = () => {
      const currentVisualHeight = vv.height;
      const currentWindowHeight = window.innerHeight;
      
      // Calculate keyboard height from difference between window and visual viewport
      const heightDiff = currentWindowHeight - currentVisualHeight;
      
      // Detect keyboard visibility with threshold to avoid false positives
      // Use a threshold of 150px to account for browser chrome and small viewport changes
      if (heightDiff > 150) {
        setKeyboardHeight(heightDiff);
        setIsKeyboardVisible(true);
        lastHeightRef.current = currentVisualHeight;
      } else {
        // Only hide keyboard if we're close to the original height
        // This prevents flickering during transitions
        const heightChange = Math.abs(currentVisualHeight - lastHeightRef.current);
        if (heightChange > 50 || heightDiff < 50) {
          setKeyboardHeight(0);
          setIsKeyboardVisible(false);
          // Reset initial height when keyboard is fully closed
          if (heightDiff < 50) {
            initialViewportHeight.current = currentWindowHeight;
          }
        }
      }
    };
    
    // Also handle focus/blur events for more reliable detection
    const handleFocus = () => {
      // Small delay to let viewport settle
      setTimeout(() => {
        handleViewportChange();
      }, 100);
    };
    
    const handleBlur = () => {
      // Delay to allow keyboard to close
      setTimeout(() => {
        handleViewportChange();
      }, 300);
    };
    
    vv.addEventListener('resize', handleViewportChange);
    window.addEventListener('focus', handleFocus);
    window.addEventListener('blur', handleBlur);
    
    return () => {
      vv.removeEventListener('resize', handleViewportChange);
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);
  
  return { keyboardHeight, isKeyboardVisible };
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

  // Get mobile keyboard height to adjust composer position
  const { keyboardHeight, isKeyboardVisible } = useMobileKeyboard();

  // Scroll conversation to bottom when keyboard opens
  useEffect(() => {
    if (isKeyboardVisible && keyboardHeight > 0) {
      // Use requestAnimationFrame to ensure DOM has updated
      requestAnimationFrame(() => {
        const scrollContainer = document.querySelector('[data-scroll-container]');
        if (scrollContainer) {
          // Scroll to bottom with smooth behavior
          scrollContainer.scrollTo({
            top: scrollContainer.scrollHeight,
            behavior: 'smooth'
          });
          
          // Also ensure the bottom anchor is visible
          const bottomAnchor = scrollContainer.querySelector('[data-bottom-anchor]');
          if (bottomAnchor) {
            bottomAnchor.scrollIntoView({ block: 'end', behavior: 'smooth' });
          }
        }
      });
    }
  }, [isKeyboardVisible, keyboardHeight]);

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
    
    // On mobile, blur the textarea to dismiss keyboard
    // Use a small delay to ensure the submit completes first
    if (window.innerWidth <= 768) {
      setTimeout(() => {
        textareaRef.current?.blur();
      }, 100);
    }
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
        // Move composer up when mobile keyboard is visible
        // Use a slightly smaller offset to account for safe area insets
        transform: isKeyboardVisible && keyboardHeight > 0 
          ? `translateY(-${Math.max(0, keyboardHeight - 20)}px)` 
          : undefined,
        // Ensure composer stays above keyboard
        zIndex: 50,
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
          onFocus={() => {
            setIsFocused(true);
            // Ensure input is scrolled into view on mobile
            if (window.innerWidth <= 768) {
              setTimeout(() => {
                textareaRef.current?.scrollIntoView({ 
                  behavior: 'smooth', 
                  block: 'nearest' 
                });
              }, 300);
            }
          }}
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
            // Prevent zoom on iOS when focusing input
            fontSize: '16px', // iOS zooms if font-size < 16px
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
