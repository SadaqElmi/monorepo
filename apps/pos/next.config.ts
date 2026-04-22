import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  transpilePackages: ["@repo/ui", "@repo/utils", "@repo/types"],
  turbopack: {
    // Monorepo: multiple package-lock.json files; pin root so resolution and
    // workspace packages stay consistent (silences Next.js inference warning).
    root: path.resolve(__dirname, "../.."),
  },
};

export default nextConfig;
