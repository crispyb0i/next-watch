import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { assetCacheRoutes } from "../../scripts/vercelAssetCache.ts";

const immutable = "public, max-age=31536000, immutable";
const adapterRule = {
  src: "^/_astro/(.*)$",
  headers: { "cache-control": immutable },
  continue: true,
};

test("asset headers precede filesystem while redirects and private routes stay intact", () => {
  const redirect = { src: "^/old$", dest: "/new", status: 308 };
  const privateRoute = {
    src: "^/api/private$",
    headers: { "cache-control": "private, no-store" },
    dest: "_render",
  };
  const config = {
    version: 3,
    routes: [redirect, { handle: "filesystem" }, adapterRule, privateRoute],
  };
  const original = structuredClone(config);
  const result = assetCacheRoutes(config, [
    "_astro/app.Abc123_-.js",
    "_astro/style.Def456_-.css",
    "_astro/nested/app.Abc123_-.js",
    "_astro/app.js",
    "_astro/source.Abc123_-.js.map",
    "_astro/image.Abc123_-.png",
    "outside.Abc123_-.js",
    "_astro/../api/private.Abc123_-.js",
  ]);
  assert.deepEqual(
    config,
    original,
    "does not mutate adapter output in memory",
  );
  assert.equal(result.version, 3);
  assert.deepEqual(result.routes[0], redirect);
  assert.equal(
    result.routes.findIndex((route) => route.handle === "filesystem"),
    4,
  );
  assert.deepEqual(result.routes.at(-1), privateRoute);
  const cached = result.routes.filter(
    (route) => route.headers?.["cache-control"] === immutable,
  );
  assert.equal(cached.length, 3);
  for (const route of cached) {
    assert.deepEqual(route.methods, ["GET", "HEAD"]);
    assert.equal(route.caseSensitive, true);
    for (const url of [
      "/",
      "/api/private",
      "/movie?id=1",
      "/_astro/app.js",
      "/_astro/unknown.Abc123_-.js",
      "/_astro/app.Abc123_-.js/extra",
      "/_astro/appXAbc123_-.js",
      "/_astro/source.Abc123_-.js.map",
    ])
      assert.equal(new RegExp(route.src!).test(url), false, url);
  }
});

test("unexpected Vercel output fails instead of silently broadening caching", () => {
  assert.throws(
    () => assetCacheRoutes({ routes: [] }, []),
    /asset cache rule changed/,
  );
  assert.throws(
    () => assetCacheRoutes({ routes: [adapterRule] }, []),
    /filesystem/,
  );
  for (const changed of [
    { ...adapterRule, dest: "_render" },
    { ...adapterRule, headers: { ...adapterRule.headers, "x-custom": "keep" } },
  ]) {
    assert.throws(
      () =>
        assetCacheRoutes({ routes: [{ handle: "filesystem" }, changed] }, []),
      /asset cache rule changed/,
    );
  }
  assert.throws(
    () =>
      assetCacheRoutes(
        { routes: [{ handle: "filesystem" }, adapterRule, { ...adapterRule }] },
        [],
      ),
    /asset cache rule changed/,
  );
  const alreadyOrdered = assetCacheRoutes(
    { routes: [adapterRule, { handle: "filesystem" }] },
    ["_astro/app.Abc123_-.js"],
  );
  assert.equal(alreadyOrdered.routes[0].src, "^/_astro/app\\.Abc123_-\\.js$");
});

test(
  "real Astro/Vercel builds cache only emitted hashed assets and bust changed versions",
  { timeout: 120_000 },
  async () => {
    const repo = process.cwd();
    const root = await realpath(
      await mkdtemp(path.join(tmpdir(), "next-watch-asset-cache-")),
    );
    const saved = process.env.ASSET_CACHE_TEST_ARTIFACTS;
    try {
      await symlink(
        path.join(repo, "node_modules"),
        path.join(root, "node_modules"),
        "dir",
      );
      await mkdir(path.join(root, "src/pages/api"), { recursive: true });
      await mkdir(path.join(root, "public/_astro"), { recursive: true });
      await writeFile(
        path.join(root, "package.json"),
        JSON.stringify({
          type: "module",
          dependencies: { astro: "*", "@astrojs/vercel": "*" },
        }),
      );
      await writeFile(
        path.join(root, "astro.config.mjs"),
        `
      import { defineConfig } from 'astro/config';
      import vercel from '@astrojs/vercel';
      import assetCache from ${JSON.stringify(pathToFileURL(path.join(repo, "scripts/vercelAssetCache.ts")).href)};
      export default defineConfig({ adapter: vercel(), integrations: [assetCache()], build: { inlineStylesheets: 'never' }, vite: { build: { assetsInlineLimit: 0 }, cacheDir: ${JSON.stringify(path.join(root, ".vite"))} } });
    `,
      );
      await writeFile(
        path.join(root, "src/pages/index.astro"),
        `
      ---
      import '../version.css';
      ---
      <html><head><title>Asset cache fixture</title></head><body>
      <h1 id="version">Loading</h1><a href="/">Home</a><a href="/next">Next</a>
      <script>import '../version.js';</script></body></html>
    `,
      );
      await writeFile(
        path.join(root, "src/pages/next.astro"),
        `---\nimport Home from './index.astro';\n---\n<Home />`,
      );
      await writeFile(
        path.join(root, "src/pages/api/private.ts"),
        `export const prerender = false; export const GET = () => new Response('private', { headers: { 'Cache-Control': 'private, no-store' } });`,
      );
      // Even a copied public file with a hash-looking name must not be captured.
      await writeFile(
        path.join(root, "public/_astro/manual.Abc123_-.js"),
        "window.manual = true;",
      );
      await writeFile(
        path.join(root, "public/_astro/plain.js"),
        "window.plain = true;",
      );
      const outputs: { js: string[]; css: string[] }[] = [];
      for (const version of ["one", "two"]) {
        await writeFile(
          path.join(root, "src/version.js"),
          `document.querySelector('#version').textContent = '${version}';`,
        );
        await writeFile(
          path.join(root, "src/version.css"),
          `body { color: ${version === "one" ? "red" : "blue"}; }`,
        );
        const result = spawnSync(
          process.execPath,
          [
            path.join(repo, "node_modules/astro/bin/astro.mjs"),
            "build",
            "--root",
            root,
          ],
          {
            cwd: root,
            encoding: "utf8",
            env: {
              ...process.env,
              NODE_ENV: "production",
              ASTRO_TELEMETRY_DISABLED: "1",
            },
            timeout: 55_000,
          },
        );
        assert.equal(result.status, 0, result.stderr + result.stdout);
        const output = path.join(root, ".vercel/output");
        if (saved) {
          const destination = path.join(saved, version);
          await rm(destination, { recursive: true, force: true });
          await mkdir(destination, { recursive: true });
          await cp(
            path.join(output, "static"),
            path.join(destination, "static"),
            { recursive: true },
          );
          await cp(
            path.join(output, "config.json"),
            path.join(destination, "config.json"),
          );
        }
        const config = JSON.parse(
          await readFile(path.join(output, "config.json"), "utf8"),
        );
        const filesystem = config.routes.findIndex(
          (route: { handle?: string }) => route.handle === "filesystem",
        );
        assert.ok(filesystem > 0, result.stdout + result.stderr);
        const cacheRules = config.routes.filter(
          (route: { headers?: Record<string, string> }) =>
            route.headers?.["cache-control"] === immutable,
        );
        assert.ok(
          cacheRules.length >= 2,
          "real client JS and CSS were emitted",
        );
        assert.ok(
          cacheRules.every(
            (route: unknown) => config.routes.indexOf(route) < filesystem,
          ),
        );
        const html = await readFile(
          path.join(output, "static/index.html"),
          "utf8",
        );
        const assets = [
          ...html.matchAll(/(?:src|href)="(\/_astro\/[^"?]+\.(?:js|css))"/g),
        ].map((match) => match[1]);
        assert.ok(assets.some((url) => url.endsWith(".js")));
        assert.ok(assets.some((url) => url.endsWith(".css")));
        for (const url of assets) {
          assert.ok(
            cacheRules.some((route: { src: string }) =>
              new RegExp(route.src).test(url),
            ),
            url,
          );
          await readFile(path.join(output, "static", url));
        }
        for (const url of [
          "/",
          "/next",
          "/api/private",
          "/auth/sign-in",
          "/favorites",
          "/favicon.ico",
          "/_astro/plain.js",
          "/_astro/manual.Abc123_-.js",
          "/_astro/unknown.Abc123_-.css",
        ])
          assert.equal(
            cacheRules.some((route: { src: string }) =>
              new RegExp(route.src).test(url),
            ),
            false,
            url,
          );
        outputs.push({
          js: assets.filter((url) => url.endsWith(".js")),
          css: assets.filter((url) => url.endsWith(".css")),
        });
      }
      assert.notDeepEqual(
        outputs[0].js,
        outputs[1].js,
        "JS content change changes its URL",
      );
      assert.notDeepEqual(
        outputs[0].css,
        outputs[1].css,
        "CSS content change changes its URL",
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);
