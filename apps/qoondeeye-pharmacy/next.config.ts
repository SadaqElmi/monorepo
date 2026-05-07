import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  transpilePackages: ["@repo/utils", "@repo/types"],
  turbopack: {
    // Monorepo: multiple package-lock.json files; pin root so resolution and
    // workspace packages stay consistent (silences Next.js inference warning).
    root: path.resolve(__dirname, "../.."),
  },
  async rewrites() {
    const target = (
      process.env.API_PROXY_TARGET ?? process.env.NEXT_PUBLIC_API_URL
    )?.replace(/\/$/, "");
    if (!target) return [];
    return [
      {
        source: "/api/:path*",
        destination: `${target}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
