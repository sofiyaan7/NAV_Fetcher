import type { NextConfig } from "next";

/**
 * Static export, so the app can be served from GitHub Pages as plain files.
 *
 * Everything here renders in the browser and talks to the Python API over HTTP,
 * so there is no server work to do at request time and nothing is lost by
 * exporting. basePath is set because a project page is served from a
 * subdirectory (/NAV_Fetcher) rather than the domain root.
 */
const isPages = process.env.GITHUB_PAGES === "true";
const repo = "/NAV_Fetcher";

const nextConfig: NextConfig = {
  output: "export",
  basePath: isPages ? repo : undefined,
  assetPrefix: isPages ? repo : undefined,
  trailingSlash: true,            // /mis -> /mis/index.html, which Pages serves
  images: { unoptimized: true },  // no image optimiser on a static host
};

export default nextConfig;
