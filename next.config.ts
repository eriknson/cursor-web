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
};

export default nextConfig;
