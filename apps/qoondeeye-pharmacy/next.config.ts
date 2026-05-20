import type { NextConfig } from "next";
import path from "node:path";

const withBundleAnalyzer = require("@next/bundle-analyzer")({
  enabled: process.env.ANALYZE === "true",
});

const nextConfig: NextConfig = {
  transpilePackages: ["@repo/utils", "@repo/types"],
  turbopack: {
    root: path.resolve(__dirname, "../.."),
  },
  async rewrites() {
    const target = (
      process.env.NEXT_PUBLIC_API_URL ?? process.env.NEXT_PUBLIC_API_URL_LOCAL
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

export default withBundleAnalyzer(nextConfig);
