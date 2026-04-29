import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/generate-upload-url',
        destination: 'https://0oatkqbq9l.execute-api.ap-southeast-2.amazonaws.com/generate-upload-url',
      },
    ];
  },
};

export default nextConfig;
