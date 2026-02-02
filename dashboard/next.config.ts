import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";

const dirname = fileURLToPath(new URL(".", import.meta.url));

const nextConfig: NextConfig = {
  turbopack: {
    root: dirname
  }
};

export default nextConfig;
