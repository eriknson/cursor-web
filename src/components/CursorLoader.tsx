'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';

interface CursorLoaderProps {
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  className?: string;
  loop?: boolean;
}

const sizeMap = {
  sm: 'w-4 h-4',
  md: 'w-8 h-8',
  lg: 'w-12 h-12',
  xl: 'w-20 h-20',
  '2xl': 'w-32 h-32',
};

const pixelSizeMap = {
  sm: 16,
  md: 32,
  lg: 48,
  xl: 80,
  '2xl': 128,
};

function supportsTransparentWebm(): boolean {
  if (typeof window === 'undefined') return true;
  
  const ua = navigator.userAgent;
  // Safari (including iOS Safari) doesn't support transparent webm
  const isSafari = /^((?!chrome|android).)*safari/i.test(ua);
  const isIOS = /iPad|iPhone|iPod/.test(ua);
  
  return !isSafari && !isIOS;
}

export function CursorLoader({ size = 'md', className = '', loop = true }: CursorLoaderProps) {
  const [useVideo, setUseVideo] = useState(true);

  useEffect(() => {
    setUseVideo(supportsTransparentWebm());
  }, []);

  const pixelSize = pixelSizeMap[size];

  if (!useVideo) {
    // Only pulse when used as a loading indicator (loop=true), not as a static logo (loop=false)
    const animationClass = loop ? 'animate-pulse-opacity' : '';
    return (
      <div className={`${sizeMap[size]} ${className}`}>
        <Image
          src="/brand/cursor-cube-25d.svg"
          alt="Cursor"
          width={pixelSize}
          height={pixelSize}
          className={`w-full h-full object-contain ${animationClass}`}
        />
      </div>
    );
  }

  return (
    <div className={`${sizeMap[size]} ${className}`}>
      <video
        autoPlay
        loop={loop}
        muted
        playsInline
        className="w-full h-full object-contain"
      >
        <source src="/brand/cursor-loading-padded.webm" type="video/webm" />
      </video>
    </div>
  );
}
