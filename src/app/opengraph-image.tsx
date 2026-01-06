import { ImageResponse } from 'next/og';

// Image metadata - standard OG image size that works across all platforms
export const size = {
  width: 1200,
  height: 630,
};

export const contentType = 'image/png';

// Generate the OG image
export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#14120B',
        }}
      >
        {/* Cursor Cube SVG - centered and sized appropriately */}
        <svg
          width="280"
          height="320"
          viewBox="0 0 466.73 532.09"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            fill="#edecec"
            d="M457.43,125.94L244.42,2.96c-6.84-3.95-15.28-3.95-22.12,0L9.3,125.94c-5.75,3.32-9.3,9.46-9.3,16.11v247.99c0,6.65,3.55,12.79,9.3,16.11l213.01,122.98c6.84,3.95,15.28,3.95,22.12,0l213.01-122.98c5.75-3.32,9.3-9.46,9.3-16.11v-247.99c0-6.65-3.55-12.79-9.3-16.11h-.01ZM444.05,151.99l-205.63,356.16c-1.39,2.4-5.06,1.42-5.06-1.36v-233.21c0-4.66-2.49-8.97-6.53-11.31L24.87,145.67c-2.4-1.39-1.42-5.06,1.36-5.06h411.26c5.84,0,9.49,6.33,6.57,11.39h-.01Z"
          />
        </svg>
      </div>
    ),
    {
      ...size,
    }
  );
}
