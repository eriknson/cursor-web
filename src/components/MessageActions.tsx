'use client';

import { useState, useRef } from 'react';
import { toast } from 'sonner';
import { theme } from '@/lib/theme';

interface MessageActionsProps {
  messageId: string;
  content: string;
  messageType: 'user_message' | 'assistant_message' | 'summary';
  className?: string;
}

export function MessageActions({ messageId, content, messageType, className = '' }: MessageActionsProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      toast.success('Message copied to clipboard');
      
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toast.error('Failed to copy message');
    }
  };

  return (
    <div
      className={`absolute top-2 right-2 flex items-center gap-1 transition-opacity ${isHovered ? 'opacity-100' : 'opacity-0'} ${className}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      role="group"
      aria-label="Message actions"
    >
      <button
        onClick={handleCopy}
        className="p-1.5 rounded-md transition-colors hover:opacity-80"
        style={{
          background: theme.bg.tertiary,
          color: theme.text.secondary,
        }}
        aria-label={copied ? 'Copied' : 'Copy message'}
        title={copied ? 'Copied!' : 'Copy message'}
      >
        {copied ? (
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              d="M13.25 4.75 6.5 11.5 3 8"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path
              d="M5.5 3.5H3.5C3.23478 3.5 2.98043 3.60536 2.79289 3.79289C2.60536 3.98043 2.5 4.23478 2.5 4.5V12.5C2.5 12.7652 2.60536 13.0196 2.79289 13.2071C2.98043 13.3946 3.23478 13.5 3.5 13.5H11.5C11.7652 13.5 12.0196 13.3946 12.2071 13.2071C12.3946 13.0196 12.5 12.7652 12.5 12.5V10.5M9.5 2.5H13.5C13.7652 2.5 14.0196 2.60536 14.2071 2.79289C14.3946 2.98043 14.5 3.23478 14.5 3.5V7.5M9.5 2.5L14.5 7.5M9.5 2.5V7.5H14.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </button>
    </div>
  );
}
