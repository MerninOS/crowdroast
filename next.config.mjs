import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  transpilePackages: ["@merninos/ui"],
  // When @merninos/ui is `npm link`-ed during dev, its dist lives outside
  // crowdroast/. Default turbopack uses the closest lockfile as the workspace
  // root and panics with "leaves the filesystem root" when Tailwind tries to
  // scan ../mernin-ui/dist/. Pointing the root at the parent meta repo keeps
  // both crowdroast/ and mernin-ui/ inside bounds. Production builds on Vercel
  // resolve @merninos/ui from the registry — no symlink, no upward traversal —
  // so this override is harmless there.
  turbopack: {
    root: path.join(__dirname, ".."),
  },
};

export default nextConfig;
