import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  logging: { fetches: { fullUrl: false } },
  allowedDevOrigins: ['testing.coryfi.com'],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'graph.facebook.com' },
      { protocol: 'https', hostname: '*.fbcdn.net' },
    ],
  },
  async headers() {
    return [
      {
        source: '/api/webhook',
        headers: [{ key: 'Cache-Control', value: 'no-store' }],
      },
    ];
  },
};

export default nextConfig;
