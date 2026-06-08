import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  transpilePackages: ["@repo/utils", "@repo/types", "@repo/validation"],
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

export default nextConfig;
