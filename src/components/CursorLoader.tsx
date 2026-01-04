'use client';

interface CursorLoaderProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeMap = {
  sm: 'w-4 h-4',
  md: 'w-8 h-8',
  lg: 'w-12 h-12',
};

export function CursorLoader({ size = 'md', className = '' }: CursorLoaderProps) {
  return (
    <div className={`${sizeMap[size]} ${className}`}>
      <video
        autoPlay
        loop
        muted
        playsInline
        className="w-full h-full object-contain"
      >
        <source src="/brand/cursor-loading-padded.webm" type="video/webm" />
        <source src="/brand/cursor-loading-padded.mp4" type="video/mp4" />
      </video>
    </div>
  );
}
