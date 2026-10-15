import type { NextConfig } from "next";

/**
 * Two targets from one codebase.
 *
 * GITHUB_PAGES=true builds a static export for GitHub Pages: every route
 * prerenders, all the work happens in the browser against the HTTP API, so
 * nothing is lost by exporting. basePath is set because a project page is
 * served from /NAV_Fetcher rather than the domain root.
 *
 * Without it this is an ordinary Next build, so `npm run dev` and
 * `npm run start` behave normally for local work. `output: "export"` is not set
 * unconditionally on purpose -- `next start` cannot serve an exported app, and
 * setting it broke running the app locally.
 */
const isPages = process.env.GITHUB_PAGES === "true";
const repo = "/NAV_Fetcher";

const nextConfig: NextConfig = {
  ...(isPages
    ? {
        output: "export" as const,
        basePath: repo,
        assetPrefix: repo,
        trailingSlash: true,     // /mis -> /mis/index.html, which Pages serves
      }
    : {}),
  images: { unoptimized: true },
};

export default nextConfig;
