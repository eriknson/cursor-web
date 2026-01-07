# Mobile Optimization PR - Risk Assessment

## Overview
This PR optimizes mobile chat and keyboard mechanics. Below is a risk assessment and explanation of design decisions.

## Potential Risks & Mitigations

### ✅ LOW RISK - Keyboard Detection Changes
**Risk**: The renamed `useIOSKeyboard` → `useMobileKeyboard` hook might behave differently
**Mitigation**: 
- Maintains backward compatibility with iOS
- Adds Android support with fallback detection
- Uses same visualViewport API with improved thresholds
- Tested thresholds (150px) prevent false positives

### ✅ LOW RISK - Composer Positioning
**Risk**: Transform calculations might cause layout shifts
**Mitigation**:
- Uses smooth transitions (200ms ease-out)
- Accounts for safe area insets (20px offset)
- Only applies when keyboard is actually visible
- Uses `requestAnimationFrame` for smooth updates

### ⚠️ MEDIUM RISK - Body Scroll Prevention
**Risk**: Making body `position: fixed` could break:
- Dropdowns/modals that need document scroll
- Third-party components
- Browser extensions

**Mitigation**:
- Only applied on mobile (`@media (max-width: 768px)`)
- Dropdowns use absolute positioning relative to parents (verified)
- No modals found in codebase that would be affected
- App container handles all scrolling internally

**Recommendation**: Test dropdowns (RepoPicker, UserAvatarDropdown) on mobile after merge

### ⚠️ MEDIUM RISK - Pull-to-Refresh Disabled
**Why we disabled it**: 
- Pull-to-refresh on mobile browsers can interfere with chat scrolling
- Users might accidentally trigger refresh when trying to scroll up
- Can cause layout jumps when keyboard is open

**What we actually did**:
- Changed from `overscroll-behavior-y: none` on body (too aggressive)
- Now only prevents pull-to-refresh within scroll containers (`overscroll-behavior-y: contain`)
- Page-level pull-to-refresh still works if needed
- This is a common pattern for chat apps (Slack, Discord, etc.)

**Risk**: Users might expect pull-to-refresh to work
**Mitigation**: 
- Only disabled within conversation scroll area
- Page-level refresh still works
- Common UX pattern for chat interfaces

### ✅ LOW RISK - Font Size Changes
**Risk**: `font-size: 16px !important` might override intentional styling
**Mitigation**:
- Only applied to `textarea` (composer input)
- Prevents iOS zoom-on-focus (required for good UX)
- Other inputs not affected
- iOS requires ≥16px to prevent auto-zoom

### ✅ LOW RISK - Viewport Height Changes
**Risk**: Using `100dvh` might not work on older browsers
**Mitigation**:
- Added fallback with `-webkit-fill-available`
- Uses `@supports` queries for progressive enhancement
- Desktop unaffected (uses standard `100vh`)

### ✅ LOW RISK - Touch Target Sizes
**Risk**: `min-height: 44px` might break existing button layouts
**Mitigation**:
- Only applied to buttons without `.no-min-size` class
- Can be opted out if needed
- Follows iOS/Android accessibility guidelines

## Testing Recommendations

Before merging, test on:
1. ✅ iOS Safari (iPhone)
2. ✅ Android Chrome
3. ✅ Dropdowns (RepoPicker, UserAvatarDropdown) - verify they still work
4. ✅ Keyboard open/close transitions
5. ✅ Scrolling behavior when keyboard is open
6. ✅ Composer positioning

## Rollback Plan

If issues arise:
1. Revert `body { position: fixed }` in mobile media query
2. Remove `overscroll-behavior-y: contain` from scroll containers
3. Keep keyboard detection improvements (they're safe)

## Summary

**Overall Risk Level**: LOW-MEDIUM

The changes are generally safe because:
- Most changes are mobile-specific and won't affect desktop
- Dropdowns use relative positioning (not affected by body fixed)
- Keyboard detection improvements are additive
- Viewport changes have fallbacks

**Main concern**: Body scroll prevention could theoretically affect future modals/overlays, but current codebase has none.

**Recommendation**: ✅ Safe to merge with mobile testing
