import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@alteron/document-model",
    "@alteron/fig-format",
    "@alteron/fig-import",
  ],
  serverExternalPackages: ["better-sqlite3"],
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
    };
    return config;
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "80mb",
    },
  },
};

export default nextConfig;
