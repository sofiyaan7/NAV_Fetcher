import type { NextConfig } from "next";

/**
 * Two targets from one codebase.
 *
 * GITHUB_PAGES=true builds a static export for GitHub Pages: every route
 * prerenders and all the work happens in the browser against the HTTP API, so
 * nothing is lost by exporting. basePath is set because a project page is
 * served from /NAV_Fetcher rather than the domain root.
 *
 * Without it this is an ordinary Next build, so `npm run dev` and
 * `npm run start` behave normally. `output: "export"` is deliberately not set
 * unconditionally -- `next start` cannot serve an exported app.
 */
const isPages = process.env.GITHUB_PAGES === "true";
const repo = "/NAV_Fetcher";

const nextConfig: NextConfig = {
  // Tailwind v4 is compiled through this loader. Dropping it does not fail the
  // build -- it emits a stylesheet with no utility classes in it, so the app
  // serves completely unstyled. It must stay.
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  images: { unoptimized: true },
  ...(isPages
    ? {
        output: "export" as const,
        basePath: repo,
        assetPrefix: repo,
        trailingSlash: true,   // /mis -> /mis/index.html, which Pages serves
      }
    : {}),
};

export default nextConfig;
