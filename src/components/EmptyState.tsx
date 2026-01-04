'use client';

import { useRef, useEffect } from 'react';

interface EmptyStateProps {
  visible?: boolean;
}

export function EmptyState({ visible = true }: EmptyStateProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (video) {
      video.play();
      // Pause on the last frame when video ends
      video.onended = () => {
        video.pause();
      };
    }
  }, []);

  return (
    <div 
      className={`flex-1 flex flex-col items-center justify-center gap-3 text-center px-4 transition-opacity duration-200 ${
        visible ? 'opacity-50' : 'opacity-0 pointer-events-none'
      }`}
    >
      <div className="w-16 h-16">
        <video
          ref={videoRef}
          muted
          playsInline
          className="w-full h-full object-contain"
        >
          <source src="/brand/cursor-loading-padded.webm" type="video/webm" />
          <source src="/brand/cursor-loading-padded.mp4" type="video/mp4" />
        </video>
      </div>
      <div className="space-y-1">
        <h2 className="text-white text-lg font-medium">
          Run cloud agents
        </h2>
        <p className="text-zinc-500 text-base leading-relaxed">
          Start asynchronous agents that
          <br />
          plan, code, and commit in any repo
        </p>
      </div>
    </div>
  );
}
