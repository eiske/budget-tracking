import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // The E2E suite builds into its own directory so it never touches a running `npm run dev`.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    // Importing re-sends the statement text with the form, so allow more than the 1MB default.
    // Must stay above MAX_TOTAL_BYTES (3MB, all selected files together) plus form overhead.
    serverActions: { bodySizeLimit: "4mb" },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
