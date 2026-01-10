'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { theme } from '@/lib/theme';

interface MarkdownRendererProps {
  content: string;
  className?: string;
  isStreaming?: boolean;
}

// Copy button component for code blocks
function CopyButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      toast.success('Copied to clipboard');
      
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toast.error('Failed to copy');
    }
  };

  return (
    <button
      onClick={handleCopy}
      className="absolute top-2 right-2 p-1.5 rounded-md opacity-0 group-hover:opacity-100 transition-opacity"
      style={{
        background: 'rgba(0, 0, 0, 0.3)',
        color: theme.text.secondary,
      }}
      aria-label="Copy code"
      title="Copy code"
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
  );
}

export function MarkdownRenderer({ content, className = '', isStreaming = false }: MarkdownRendererProps) {
  return (
    <div className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          // Code blocks with copy button
          code({ node, className: codeClassName, children, ...props }) {
            const match = /language-(\w+)/.exec(codeClassName || '');
            const isInline = !match;
            
            if (isInline) {
              return (
                <code
                  className="px-1.5 py-0.5 rounded text-inherit text-[0.9em] font-mono"
                  style={{ background: 'var(--color-theme-bg-tertiary)' }}
                  {...props}
                >
                  {children}
                </code>
              );
            }
            
            const codeString = String(children).replace(/\n$/, '');
            
            return (
              <div className="relative group my-3">
                <pre
                  className="overflow-x-auto rounded-lg p-4 text-sm font-mono"
                  style={{
                    background: theme.bg.tertiary,
                    border: `1px solid ${theme.border.tertiary}`,
                    color: theme.text.primary,
                  }}
                >
                  <code className={codeClassName} {...props}>
                    {children}
                  </code>
                </pre>
                <CopyButton code={codeString} />
              </div>
            );
          },
          // Paragraphs
          p({ children }) {
            return <p className="mb-2 last:mb-0">{children}</p>;
          },
          // Headings
          h1({ children }) {
            return <h1 className="text-xl font-semibold mb-2 mt-4 first:mt-0">{children}</h1>;
          },
          h2({ children }) {
            return <h2 className="text-lg font-semibold mb-2 mt-4 first:mt-0">{children}</h2>;
          },
          h3({ children }) {
            return <h3 className="text-base font-semibold mb-2 mt-3 first:mt-0">{children}</h3>;
          },
          // Lists
          ul({ children }) {
            return <ul className="list-disc list-inside mb-2 space-y-1">{children}</ul>;
          },
          ol({ children }) {
            return <ol className="list-decimal list-inside mb-2 space-y-1">{children}</ol>;
          },
          li({ children }) {
            return <li className="ml-2">{children}</li>;
          },
          // Links
          a({ href, children }) {
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:opacity-80 transition-opacity"
                style={{ color: theme.text.secondary }}
              >
                {children}
              </a>
            );
          },
          // Blockquotes
          blockquote({ children }) {
            return (
              <blockquote
                className="border-l-4 pl-4 my-2 italic"
                style={{
                  borderColor: theme.border.tertiary,
                  color: theme.text.tertiary,
                }}
              >
                {children}
              </blockquote>
            );
          },
          // Horizontal rules
          hr() {
            return (
              <hr
                className="my-4"
                style={{ borderColor: theme.border.tertiary }}
              />
            );
          },
          // Tables (from GFM)
          table({ children }) {
            return (
              <div className="overflow-x-auto my-3">
                <table className="min-w-full border-collapse">
                  {children}
                </table>
              </div>
            );
          },
          thead({ children }) {
            return (
              <thead style={{ background: theme.bg.tertiary }}>
                {children}
              </thead>
            );
          },
          th({ children }) {
            return (
              <th className="px-3 py-2 text-left border" style={{ borderColor: theme.border.tertiary }}>
                {children}
              </th>
            );
          },
          td({ children }) {
            return (
              <td className="px-3 py-2 border" style={{ borderColor: theme.border.tertiary }}>
                {children}
              </td>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
