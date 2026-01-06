import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Disable dev indicators UI
  devIndicators: false,
  
  // Mark @cursor-ai/january as server-only (uses Node.js modules)
  serverExternalPackages: ['@cursor-ai/january'],
  
  // Turbopack configuration to ignore LICENSE.txt files
  turbopack: {
    rules: {
      '*.LICENSE.txt': {
        loaders: [],
        as: '*.js',
      },
    },
  },
  
  // Security headers
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
