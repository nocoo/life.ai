import type { NextConfig } from "next";
import rootPackage from "../package.json";

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_APP_VERSION: rootPackage.version,
  },
  // Set turbopack root to dashboard directory (monorepo has multiple lockfiles)
  turbopack: {
    root: __dirname,
  },
  // Allow cross-origin requests from reverse proxy domains
  allowedDevOrigins: [
    "localhost",
    "*.hexly.ai",
    "*.dev.hexly.ai",
  ],
  // Allow loading images from external domains (e.g., Google avatars)
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
    ],
    // Disable image optimization for local assets (avoids sharp dependency issues)
    unoptimized: true,
  },
};

export default nextConfig;
