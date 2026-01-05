"use client";

import React from "react";

interface ShimmerTextProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * ShimmerText - A text component with an animated shimmer effect
 * 
 * Use this for loading states and pending content indicators.
 * The shimmer sweeps from right to left with a bright highlight.
 * Uses the .shimmer-text CSS class defined in globals.css for theme-aware colors.
 */
export const ShimmerText = ({ children, className = "" }: ShimmerTextProps) => (
  <span className={`shimmer-text ${className}`}>
    {children}
  </span>
);

export default ShimmerText;
