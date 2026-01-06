'use client';

import { useState, useRef, useEffect } from 'react';
import { theme } from '@/lib/theme';

interface UserAvatarDropdownProps {
  userEmail?: string;
  userName?: string;
  onLogout: () => void;
  showEmail?: boolean;
}

export function UserAvatarDropdown({ userEmail, userName, onLogout, showEmail = false }: UserAvatarDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  
  // Get first letter for avatar
  const avatarLetter = userEmail ? userEmail[0].toUpperCase() : '?';
  
  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
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

  return (
    <div className="relative flex items-center gap-3" ref={menuRef}>
      {/* Email - hidden on small viewports, only shown when showEmail is true */}
      {showEmail && userEmail && (
        <span 
          className="hidden min-[500px]:block text-sm truncate max-w-48"
          style={{ color: theme.text.tertiary }}
        >
          {userEmail}
        </span>
      )}
      
      {/* Avatar button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-medium transition-all cursor-pointer shrink-0"
        style={{ 
          background: theme.bg.tertiary,
          color: theme.text.secondary,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = theme.bg.secondary;
          e.currentTarget.style.color = theme.text.primary;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = theme.bg.tertiary;
          e.currentTarget.style.color = theme.text.secondary;
        }}
        title={userEmail || 'Account'}
      >
        {avatarLetter}
      </button>
      
      {/* Dropdown card */}
      {isOpen && (
        <div 
          className="absolute top-full right-0 mt-2 w-64 backdrop-blur-xl rounded-xl shadow-2xl overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-200"
          style={{
            background: theme.bg.card,
            border: `1px solid ${theme.border.primary}`,
          }}
        >
          {/* User info section */}
          <div 
            className="px-4 py-4"
            style={{ borderBottom: `1px solid ${theme.border.tertiary}` }}
          >
            <div className="flex items-center gap-3">
              {/* Larger avatar in dropdown */}
              <div 
                className="w-11 h-11 rounded-full flex items-center justify-center text-lg font-medium shrink-0"
                style={{ background: theme.bg.tertiary, color: theme.text.secondary }}
              >
                {avatarLetter}
              </div>
              <div className="flex-1 min-w-0">
                {userName && (
                  <p 
                    className="text-sm font-medium truncate"
                    style={{ color: theme.text.primary }}
                  >
                    {userName}
                  </p>
                )}
                <p 
                  className="text-sm truncate"
                  style={{ color: userName ? theme.text.tertiary : theme.text.secondary }}
                >
                  {userEmail || 'Not signed in'}
                </p>
              </div>
            </div>
          </div>
          
          {/* Actions section */}
          <div className="py-1.5">
            {/* Dashboard link */}
            <a
              href="https://cursor.com/dashboard"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors cursor-pointer"
              style={{ color: theme.text.secondary }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = theme.text.primary;
                e.currentTarget.style.background = theme.bg.tertiary;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = theme.text.secondary;
                e.currentTarget.style.background = 'transparent';
              }}
              onClick={() => setIsOpen(false)}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
              </svg>
              Go to Dashboard
            </a>
            
            {/* Sign out */}
            <button
              onClick={() => {
                onLogout();
                setIsOpen(false);
              }}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors cursor-pointer"
              style={{ color: theme.text.secondary }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = '#ef4444'; // semantic red
                e.currentTarget.style.background = theme.bg.tertiary;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = theme.text.secondary;
                e.currentTarget.style.background = 'transparent';
              }}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
              </svg>
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
