/**
 * =============================================================================
 * CURSOR CLOUD AGENTS - THEME REFERENCE
 * =============================================================================
 * 
 * This file documents the color theme system used throughout the app.
 * All colors are defined as CSS custom properties in globals.css and 
 * should be referenced using these variable names.
 * 
 * The app supports light and dark themes, automatically adapting based on
 * the presence of the `.dark` class on the document root.
 * 
 * USAGE:
 * - In CSS/Tailwind: Use inline styles with var(--color-theme-*)
 * - Example: style={{ color: 'var(--color-theme-text-primary)' }}
 * - Example: style={{ background: 'var(--color-theme-bg-card)' }}
 * 
 * DO NOT use hardcoded colors like:
 * - text-white, text-neutral-*, text-gray-*
 * - bg-white/*, bg-neutral-*, bg-gray-*
 * - border-white/*, border-neutral-*
 * 
 * Instead, always use the theme CSS variables defined below.
 */

// =============================================================================
// THEME CSS VARIABLE REFERENCE
// =============================================================================

/**
 * CORE COLORS
 * These are the foundational colors that derive other theme colors
 * 
 * --color-theme-bg         Main background color
 * --color-theme-card       Card/surface background color
 * --color-theme-fg         Primary foreground/text color
 * --color-theme-fg-02      Secondary foreground color
 * --color-theme-accent     Brand accent color (orange)
 */

/**
 * TEXT COLORS
 * Use these for all text elements
 * 
 * --color-theme-text-primary     Primary text (high emphasis) - use for headings, important text
 * --color-theme-text-secondary   Secondary text (medium emphasis) - use for body text
 * --color-theme-text-tertiary    Tertiary text (low emphasis) - use for captions, metadata
 * --color-theme-text-quaternary  Quaternary text (very low emphasis) - use for placeholders
 * --color-theme-text-inverted    Inverted text - for text on primary backgrounds
 */

/**
 * BACKGROUND COLORS
 * Use these for all background/surface elements
 * 
 * --color-theme-bg-primary       Primary bg (uses fg color) - use for buttons, badges
 * --color-theme-bg-secondary     Secondary bg (8% fg) - use for selected states, hover
 * --color-theme-bg-tertiary      Tertiary bg (6% fg) - use for subtle hover states
 * --color-theme-bg-quaternary    Quaternary bg (2.5% fg) - use for very subtle backgrounds
 * --color-theme-bg-card          Card background - use for cards, dropdowns, modals
 * --color-theme-bg-card-hover    Card hover state - use for card hover backgrounds
 */

/**
 * BORDER COLORS
 * Use these for all border/divider elements
 * 
 * --color-theme-border-strong    Strong border (80% fg) - use for focused inputs
 * --color-theme-border-primary   Primary border (12% fg) - use for card borders
 * --color-theme-border-secondary Secondary border (8% fg) - use for input borders
 * --color-theme-border-tertiary  Tertiary border (4% fg) - use for subtle dividers
 */

/**
 * ICON COLORS
 * Use these for icon elements
 * 
 * --color-theme-status-icon   Status icons (checkmarks, status indicators)
 * --color-theme-action-icon   Action icons (buttons, interactive elements)
 */

// =============================================================================
// SEMANTIC STATUS COLORS
// =============================================================================

/**
 * For status-specific colors (success, error, warning), use these approaches:
 * 
 * SUCCESS:
 *   - Text: Use a muted green or the theme text colors
 *   - Example: style={{ color: '#63A11A' }} for explicit green
 *   - Or use var(--brand-green-400) for brand consistency
 * 
 * ERROR:
 *   - Text: Use a muted red
 *   - Example: style={{ color: '#ef4444' }} or Tailwind text-red-400
 * 
 * WARNING:
 *   - Text: Use amber/yellow
 *   - Example: var(--brand-warning) or Tailwind text-amber-500
 * 
 * These semantic colors are exceptions where hardcoded or brand colors are acceptable.
 */

// =============================================================================
// THEME UTILITY CONSTANTS
// =============================================================================

/**
 * CSS variable names for use with inline styles
 * Import and use like: style={{ color: theme.text.primary }}
 */
export const theme = {
  // Text
  text: {
    primary: 'var(--color-theme-text-primary)',
    secondary: 'var(--color-theme-text-secondary)',
    tertiary: 'var(--color-theme-text-tertiary)',
    quaternary: 'var(--color-theme-text-quaternary)',
    inverted: 'var(--color-theme-text-inverted)',
  },
  
  // Backgrounds
  bg: {
    main: 'var(--color-theme-bg)',
    primary: 'var(--color-theme-bg-primary)',
    secondary: 'var(--color-theme-bg-secondary)',
    tertiary: 'var(--color-theme-bg-tertiary)',
    quaternary: 'var(--color-theme-bg-quaternary)',
    card: 'var(--color-theme-bg-card)',
    cardHover: 'var(--color-theme-bg-card-hover)',
  },
  
  // Borders
  border: {
    strong: 'var(--color-theme-border-strong)',
    primary: 'var(--color-theme-border-primary)',
    secondary: 'var(--color-theme-border-secondary)',
    tertiary: 'var(--color-theme-border-tertiary)',
  },
  
  // Core
  fg: 'var(--color-theme-fg)',
  accent: 'var(--color-theme-accent)',
  
  // Icons
  icon: {
    status: 'var(--color-theme-status-icon)',
    action: 'var(--color-theme-action-icon)',
  },
} as const;

/**
 * Common style patterns for reuse
 */
export const themeStyles = {
  // Card container
  card: {
    background: theme.bg.card,
    border: `1px solid ${theme.border.primary}`,
  },
  
  // Input field
  input: {
    background: theme.bg.card,
    border: `1px solid ${theme.border.secondary}`,
    color: theme.fg,
  },
  
  // Subtle hover background
  hoverBg: {
    background: theme.bg.tertiary,
  },
  
  // Selected/active state
  selectedBg: {
    background: theme.bg.secondary,
  },
} as const;
