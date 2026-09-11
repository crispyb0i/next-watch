// @ts-check
import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";

import react from "@astrojs/react";

import vercel from "@astrojs/vercel";

// https://astro.build/config
export default defineConfig({
  integrations: [react()],

  // Hover-prefetch every internal link so clicks feel instant.
  prefetch: { prefetchAll: true, defaultStrategy: "hover" },

  vite: {
    plugins: [tailwindcss()],
  },

  adapter: vercel(),
});
