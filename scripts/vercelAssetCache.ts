import { readFile, stat, writeFile } from "node:fs/promises";
import type { AstroIntegration } from "astro";

type Route = {
  src?: string;
  handle?: string;
  headers?: Record<string, string>;
  [key: string]: unknown;
};
type OutputConfig = { routes: Route[]; [key: string]: unknown };
const immutable = "public, max-age=31536000, immutable";
const escapeRegex = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Fix @astrojs/vercel 11.0.10's header rule after the filesystem handler.
 * Only actual client build outputs qualify, never files copied from public/.
 */
export function assetCacheRoutes(
  config: OutputConfig,
  emittedFiles: Iterable<string>,
  assetsDirectory = "_astro",
): OutputConfig {
  if (!Array.isArray(config.routes)) throw new Error("Missing Vercel routes");
  const adapterRules = config.routes.filter(
    (route) =>
      route.src === `^/${assetsDirectory}/(.*)$` &&
      route.headers?.["cache-control"] === immutable,
  );
  // Fail the build if an adapter upgrade changes the contract. Do not silently
  // ship a broad or ineffective cache policy.
  const adapterRule = adapterRules[0];
  if (
    adapterRules.length !== 1 ||
    adapterRule.continue !== true ||
    Object.keys(adapterRule).some(
      (key) => !["src", "headers", "continue"].includes(key),
    ) ||
    Object.keys(adapterRule.headers!).length !== 1
  )
    throw new Error("Vercel asset cache rule changed; review integration");
  const routes = config.routes.filter((route) => route !== adapterRule);
  const filesystem = routes.findIndex((route) => route.handle === "filesystem");
  if (filesystem < 0) throw new Error("Missing Vercel filesystem handler");
  const files = [...new Set(emittedFiles)].filter(
    (file) =>
      file.startsWith(`${assetsDirectory}/`) &&
      !file.split("/").some((part) => part === "." || part === "..") &&
      /\.[\w-]{8,}\.(?:js|css)$/.test(file),
  );
  const assetRoutes = files.sort().map((file) => ({
    src: `^/${escapeRegex(file)}$`,
    caseSensitive: true,
    methods: ["GET", "HEAD"],
    headers: { "cache-control": immutable },
    continue: true,
  }));
  routes.splice(filesystem, 0, ...assetRoutes);
  return { ...config, routes };
}

export default function vercelAssetCache(): AstroIntegration {
  let root: URL;
  let assetsDirectory: string;
  const emittedFiles = new Set<string>();
  return {
    name: "next-watch:vercel-asset-cache",
    hooks: {
      "astro:config:done": ({ config }) => {
        root = config.root;
        assetsDirectory = config.build.assets;
      },
      "astro:build:start": () => emittedFiles.clear(),
      "astro:build:setup": ({ updateConfig }) => {
        updateConfig({
          plugins: [
            {
              name: "next-watch:emitted-client-assets",
              // Astro 7 invokes build:setup once for the server, then builds
              // its client environment through the same Vite builder.
              applyToEnvironment: () => true,
              writeBundle(_options, bundle) {
                for (const file of Object.values(bundle)) {
                  // Page CSS is also extracted during SSR/prerender builds.
                  // Server JavaScript must not enter the browser cache rule.
                  if (
                    this.environment.name === "client" ||
                    (file.type === "asset" && file.fileName.endsWith(".css"))
                  ) {
                    emittedFiles.add(file.fileName);
                  }
                }
              },
            },
          ],
        });
      },
      // The adapter has written routing here. Its later copy hook copies this
      // completed client directory into .vercel/output/static.
      "astro:build:done": async ({ dir }) => {
        const file = new URL(".vercel/output/config.json", root);
        const config = JSON.parse(await readFile(file, "utf8")) as OutputConfig;
        const staticFiles: string[] = [];
        for (const emitted of emittedFiles) {
          try {
            const output = new URL(emitted, dir);
            if ((await stat(output)).isFile()) staticFiles.push(emitted);
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
          }
        }
        const fixed = assetCacheRoutes(config, staticFiles, assetsDirectory);
        await writeFile(file, JSON.stringify(fixed, null, 2) + "\n");
      },
    },
  };
}
