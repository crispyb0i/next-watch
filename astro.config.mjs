// @ts-check
import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";

import react from "@astrojs/react";

import vercel from "@astrojs/vercel";
import vercelAssetCache from "./scripts/vercelAssetCache.ts";

// https://astro.build/config
export default defineConfig({
  integrations: [react(), vercelAssetCache()],

  // Hover-prefetch every internal link so clicks feel instant.
  prefetch: { prefetchAll: true, defaultStrategy: "hover" },

  vite: {
    // Production builds must not race the running dev server for Vite cache.
    cacheDir:
      process.env.NODE_ENV === "production"
        ? "node_modules/.vite-production"
        : "node_modules/.vite",
    // Discover navigation dependencies up front so loading ClientRouter does not
    // re-optimize shared chunks and invalidate the dev toolbar's module URLs.
    optimizeDeps: {
      include: [
        "astro/virtual-modules/transitions-events.js",
        "astro/virtual-modules/transitions-router.js",
        "astro/virtual-modules/transitions-swap-functions.js",
        "astro/virtual-modules/transitions-types.js",
      ],
    },
    plugins: [tailwindcss()],
  },

  adapter: vercel(),
});
