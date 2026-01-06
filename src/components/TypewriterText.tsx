'use client';

import { useState, useEffect, useRef } from 'react';

interface TypewriterTextProps {
  text: string;
  /** Characters per second (default: 400 = fast typewriter) */
  speed?: number;
  /** Called when typing animation completes */
  onComplete?: () => void;
  /** Skip animation and show full text immediately */
  skipAnimation?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export function TypewriterText({
  text,
  speed = 400,
  onComplete,
  skipAnimation = false,
  className,
  style,
}: TypewriterTextProps) {
  const [displayedLength, setDisplayedLength] = useState(skipAnimation ? text.length : 0);
  const prevTextRef = useRef(text);
  const animatingRef = useRef(false);
  
  useEffect(() => {
    // If text changed, we need to animate from where we were
    // This handles streaming text updates
    if (text !== prevTextRef.current) {
      const prevLen = prevTextRef.current.length;
      prevTextRef.current = text;
      
      // If new text is longer and starts with previous text, continue from where we were
      if (text.startsWith(prevTextRef.current.slice(0, prevLen))) {
        // Already animating? Let it continue
        if (animatingRef.current) return;
      }
    }
    
    if (skipAnimation) {
      setDisplayedLength(text.length);
      return;
    }
    
    // If we've displayed everything, we're done
    if (displayedLength >= text.length) {
      if (displayedLength === text.length && text.length > 0) {
        onComplete?.();
      }
      animatingRef.current = false;
      return;
    }
    
    animatingRef.current = true;
    
    // Calculate interval in ms from characters per second
    const intervalMs = 1000 / speed;
    
    // Batch multiple characters per frame for very high speeds
    const charsPerTick = Math.max(1, Math.floor(speed / 60));
    
    const timer = setTimeout(() => {
      setDisplayedLength(prev => Math.min(prev + charsPerTick, text.length));
    }, intervalMs * charsPerTick);
    
    return () => clearTimeout(timer);
  }, [text, displayedLength, speed, onComplete, skipAnimation]);
  
  // Reset when text completely changes (new message)
  useEffect(() => {
    if (!text.startsWith(prevTextRef.current) && text !== prevTextRef.current) {
      prevTextRef.current = text;
      if (!skipAnimation) {
        setDisplayedLength(0);
      }
    }
  }, [text, skipAnimation]);
  
  const displayedText = text.slice(0, displayedLength);
  const isTyping = displayedLength < text.length && !skipAnimation;
  
  return (
    <span className={className} style={style}>
      {displayedText}
      {isTyping && (
        <span 
          className="inline-block w-[2px] h-[1em] ml-[1px] align-middle animate-pulse"
          style={{ 
            backgroundColor: 'currentColor',
            opacity: 0.7,
          }}
        />
      )}
    </span>
  );
}

// Hook for more complex use cases
export function useTypewriter(text: string, speed = 400, skip = false) {
  const [displayedLength, setDisplayedLength] = useState(skip ? text.length : 0);
  const prevTextLenRef = useRef(0);
  
  useEffect(() => {
    if (skip) {
      setDisplayedLength(text.length);
      return;
    }
    
    // Handle streaming: if text grew, keep displaying from where we are
    if (text.length > prevTextLenRef.current) {
      prevTextLenRef.current = text.length;
    }
    
    if (displayedLength >= text.length) return;
    
    const intervalMs = 1000 / speed;
    const charsPerTick = Math.max(1, Math.floor(speed / 60));
    
    const timer = setTimeout(() => {
      setDisplayedLength(prev => Math.min(prev + charsPerTick, text.length));
    }, intervalMs * charsPerTick);
    
    return () => clearTimeout(timer);
  }, [text, displayedLength, speed, skip]);
  
  return {
    displayedText: text.slice(0, displayedLength),
    isTyping: displayedLength < text.length && !skip,
    isComplete: displayedLength >= text.length,
  };
}
