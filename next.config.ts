import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  experimental: {
    serverActions: {
      bodySizeLimit: "11mb"
    }
  }
};

export default nextConfig;
