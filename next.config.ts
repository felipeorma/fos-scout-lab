import type { NextConfig } from "next";

// Build para GitHub Pages (npm run build:pages): export estático servido bajo
// https://<usuario>.github.io/fos-scout-lab/. Las rutas /api/* no existen ahí;
// lib/remoteData.ts provee los reemplazos del lado del cliente.
const isGitHubPages = process.env.GITHUB_PAGES === "true";
const repoBase = "/fos-scout-lab";

const nextConfig: NextConfig = isGitHubPages
  ? {
      output: "export",
      basePath: repoBase,
      assetPrefix: `${repoBase}/`,
      images: { unoptimized: true },
    }
  : {};

export default nextConfig;
