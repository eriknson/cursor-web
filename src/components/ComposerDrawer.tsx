'use client';

import { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import { CursorLoader } from './CursorLoader';
import { trackComposerSubmit } from '@/lib/analytics';

// Available models for the picker
const MODELS = [
  { id: 'composer-1', label: 'Composer 1' },
  { id: 'gpt-5.2', label: 'GPT-5.2' },
  { id: 'opus-4.5', label: 'Opus 4.5' },
] as const;

type ModelId = (typeof MODELS)[number]['id'];
const DEFAULT_MODEL: ModelId = MODELS[0].id;

// Quick, snappy easing curve
const EASE_CURVE = 'cubic-bezier(0.2, 0, 0, 1)';
const DURATION = '100ms';

// Hook to track keyboard visibility on iOS for proper positioning
function useKeyboardHeight() {
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const handleResize = () => {
      const height = window.innerHeight - vv.height;
      setKeyboardHeight(height > 100 ? height : 0);
    };

    vv.addEventListener('resize', handleResize);
    vv.addEventListener('scroll', handleResize);

    return () => {
      vv.removeEventListener('resize', handleResize);
      vv.removeEventListener('scroll', handleResize);
    };
  }, []);

  return keyboardHeight;
}

interface ComposerDrawerProps {
  onSubmit: (prompt: string, model: string) => void;
  isLoading: boolean;
  disabled: boolean;
  placeholder?: string;
  onInputChange?: (hasInput: boolean) => void;
}

export interface ComposerDrawerRef {
  focus: () => void;
}

export const ComposerDrawer = forwardRef<ComposerDrawerRef, ComposerDrawerProps>(({
  onSubmit,
  isLoading,
  disabled,
  placeholder = 'Ask Cursor to build, plan, fix anything',
  onInputChange,
}, ref) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [value, setValue] = useState('');
  const [selectedModel, setSelectedModel] = useState(DEFAULT_MODEL);
  const [selectWidth, setSelectWidth] = useState<number | undefined>(undefined);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const lastSubmitRef = useRef<number>(0);
  const keyboardHeight = useKeyboardHeight();

  // Get the label for the selected model
  const selectedModelLabel = MODELS.find(m => m.id === selectedModel)?.label ?? '';

  // Measure the selected label width and update select width
  useEffect(() => {
    if (measureRef.current) {
      const width = measureRef.current.offsetWidth;
      // Add padding: 12px left + 24px right (for dropdown arrow) + small buffer
      setSelectWidth(width + 12 + 24 + 4);
    }
  }, [selectedModelLabel]);

  // Auto-resize textarea when content changes (only when expanded)
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea && isExpanded && value) {
      textarea.style.height = 'auto';
      const minHeight = 72;
      const maxHeight = 200;
      const newHeight = Math.min(Math.max(textarea.scrollHeight, minHeight), maxHeight);
      textarea.style.height = newHeight + 'px';
    }
  }, [value, isExpanded]);

  // Focus textarea when expanding
  useEffect(() => {
    if (isExpanded && textareaRef.current) {
      textareaRef.current.focus();
      const timer = setTimeout(() => textareaRef.current?.focus(), 50);
      return () => clearTimeout(timer);
    }
  }, [isExpanded]);

  // Notify parent when input changes
  useEffect(() => {
    onInputChange?.(value.trim().length > 0);
  }, [value, onInputChange]);

  // Expose focus method via ref
  useImperativeHandle(ref, () => ({
    focus: () => {
      setIsExpanded(true);
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 100);
    },
  }));

  // Handle escape key to collapse
  useEffect(() => {
    if (!isExpanded) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setIsExpanded(false);
        textareaRef.current?.blur();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isExpanded]);

  // Prevent body scroll when expanded
  useEffect(() => {
    if (isExpanded) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isExpanded]);

  const handleSubmit = useCallback(() => {
    if (!value.trim() || isLoading || disabled) return;

    const now = Date.now();
    if (now - lastSubmitRef.current < 350) return;
    lastSubmitRef.current = now;

    trackComposerSubmit(false);
    onSubmit(value.trim(), selectedModel);
    setValue('');
    setIsExpanded(false);
  }, [value, isLoading, disabled, selectedModel, onSubmit]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleExpand = () => {
    if (!isExpanded) {
      setIsExpanded(true);
    }
  };

  const handleOverlayClick = () => {
    if (!value.trim()) {
      setIsExpanded(false);
      textareaRef.current?.blur();
    }
  };

  const hasContent = value.trim().length > 0;

  return (
    <>
      {/* Overlay - fades in when expanded */}
      <div
        className="fixed inset-0 z-40"
        style={{
          background: 'rgba(0, 0, 0, 0.4)',
          opacity: isExpanded ? 1 : 0,
          pointerEvents: isExpanded ? 'auto' : 'none',
          transition: `opacity ${DURATION} ${EASE_CURVE}`,
        }}
        onClick={handleOverlayClick}
        aria-hidden="true"
      />

      {/* Single continuous component that animates */}
      <div
        className="relative z-50"
        style={{
          transform: keyboardHeight > 0 && isExpanded
            ? `translateY(-${keyboardHeight}px)`
            : 'translateY(0)',
          transition: `transform ${DURATION} ${EASE_CURVE}`,
        }}
      >
        {/* Main input container */}
        <div
          onClick={!isExpanded ? handleExpand : undefined}
          className="relative flex flex-col rounded-2xl backdrop-blur-2xl cursor-text"
          style={{
            background: hasContent || isExpanded
              ? 'var(--color-theme-bg-card)'
              : 'color-mix(in oklab, var(--color-theme-bg) 60%, rgba(128, 128, 128, 0.08))',
            border: hasContent || isExpanded
              ? '1px solid var(--color-theme-border-primary)'
              : '1px solid var(--color-theme-border-tertiary)',
            boxShadow: isExpanded
              ? '0 -4px 32px rgba(0, 0, 0, 0.12), 0 -2px 12px rgba(0, 0, 0, 0.08)'
              : 'none',
            transition: `box-shadow ${DURATION} ${EASE_CURVE}, background ${DURATION} ${EASE_CURVE}, border ${DURATION} ${EASE_CURVE}`,
          }}
        >
          {/* Textarea row */}
          <div className="flex items-start">
            <textarea
              ref={textareaRef}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={handleExpand}
              placeholder={placeholder}
              disabled={isLoading}
              rows={1}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="sentences"
              enterKeyHint="send"
              aria-label="Message composer"
              aria-describedby="composer-help"
              className="flex-1 bg-transparent resize-none focus:outline-none disabled:opacity-50 text-[15px] leading-relaxed px-4"
              style={{
                height: isExpanded ? '72px' : 'auto',
                minHeight: isExpanded ? '72px' : '24px',
                maxHeight: '200px',
                paddingTop: '12px',
                paddingBottom: isExpanded ? '8px' : '12px',
                overflow: value.split('\n').length > 6 ? 'auto' : 'hidden',
                color: 'var(--color-theme-fg)',
                transition: `height ${DURATION} ${EASE_CURVE}, min-height ${DURATION} ${EASE_CURVE}, padding ${DURATION} ${EASE_CURVE}`,
              }}
            />

            {/* Expand icon - only visible when collapsed */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleExpand();
              }}
              className="flex-shrink-0 w-7 h-7 mr-3 mt-2 flex items-center justify-center rounded-full cursor-pointer"
              style={{
                background: 'transparent',
                opacity: isExpanded ? 0 : 1,
                pointerEvents: isExpanded ? 'none' : 'auto',
                transition: `opacity ${DURATION} ${EASE_CURVE}`,
              }}
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                style={{ stroke: 'var(--color-theme-text-quaternary)' }}
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14 10l6-6m0 0h-5m5 0v5M10 14l-6 6m0 0h5m-5 0v-5" />
              </svg>
            </button>
          </div>

          {/* Bottom bar - animates in when expanded */}
          <div
            className="flex items-center justify-between px-3 gap-2 overflow-hidden"
            style={{
              height: isExpanded ? '44px' : '0px',
              opacity: isExpanded ? 1 : 0,
              paddingBottom: isExpanded ? '12px' : '0px',
              transition: `height ${DURATION} ${EASE_CURVE}, opacity ${DURATION} ${EASE_CURVE}, padding ${DURATION} ${EASE_CURVE}`,
            }}
          >
            {/* Model picker */}
            <div className="relative h-8 flex items-center">
              {/* Hidden span to measure selected label width */}
              <span
                ref={measureRef}
                className="absolute invisible whitespace-nowrap text-[13px]"
                aria-hidden="true"
              >
                {selectedModelLabel}
              </span>
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value as ModelId)}
                className="appearance-none border-none outline-none cursor-pointer text-[13px] h-8 pr-6 pl-3 rounded-full"
                style={{
                  color: 'var(--color-theme-text-tertiary)',
                  background: 'var(--color-theme-bg-tertiary)',
                  width: selectWidth ? `${selectWidth}px` : 'auto',
                  transition: `width ${DURATION} ${EASE_CURVE}`,
                }}
                onClick={(e) => e.stopPropagation()}
              >
                {MODELS.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.label}
                  </option>
                ))}
              </select>
              <svg
                className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none w-3 h-3"
                fill="none"
                viewBox="0 0 24 24"
                style={{ stroke: 'var(--color-theme-text-quaternary)' }}
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>

            {/* Send button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleSubmit();
              }}
              disabled={!value.trim() || isLoading || disabled}
              aria-label="Send message"
              className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full cursor-pointer disabled:cursor-not-allowed disabled:opacity-30"
              style={{
                background: hasContent ? 'var(--color-theme-fg)' : 'var(--color-theme-bg-tertiary)',
                transition: `background ${DURATION} ${EASE_CURVE}`,
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
      </div>
    </>
  );
});

ComposerDrawer.displayName = 'ComposerDrawer';
