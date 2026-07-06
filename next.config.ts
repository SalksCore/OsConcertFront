import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },
  async rewrites() {
    return [
      {
        source: "/api-proxy/:path*",
        destination: "http://51.91.214.135:3333/:path*",
      },
    ];
  },
};

export default nextConfig;
