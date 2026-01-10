'use client';

import { useEffect, useCallback } from 'react';

interface KeyboardShortcuts {
  onFocusComposer?: () => void;
  onShowHelp?: () => void;
  onScrollToTop?: () => void;
  onScrollToBottom?: () => void;
}

export function useKeyboardShortcuts({
  onFocusComposer,
  onShowHelp,
  onScrollToTop,
  onScrollToBottom,
}: KeyboardShortcuts) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Check if user is typing in an input/textarea
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';
      
      // Cmd/Ctrl+K - Focus composer
      if ((e.metaKey || e.ctrlKey) && e.key === 'k' && !isInput) {
        e.preventDefault();
        onFocusComposer?.();
        return;
      }
      
      // Cmd/Ctrl+/ - Show shortcuts help
      if ((e.metaKey || e.ctrlKey) && e.key === '/') {
        e.preventDefault();
        onShowHelp?.();
        return;
      }
      
      // Cmd/Ctrl+↑ - Scroll to top
      if ((e.metaKey || e.ctrlKey) && e.key === 'ArrowUp' && !isInput) {
        e.preventDefault();
        onScrollToTop?.();
        return;
      }
      
      // Cmd/Ctrl+↓ - Scroll to bottom
      if ((e.metaKey || e.ctrlKey) && e.key === 'ArrowDown' && !isInput) {
        e.preventDefault();
        onScrollToBottom?.();
        return;
      }
    },
    [onFocusComposer, onShowHelp, onScrollToTop, onScrollToBottom]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);
}
