'use client';

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

export function CursorLoader({ size = 'md', className = '', loop = true }: CursorLoaderProps) {
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
        <source src="/brand/cursor-loading-padded.mp4" type="video/mp4" />
      </video>
    </div>
  );
}
