import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import {
  mkdir,
  readFile,
  readdir,
  writeFile,
  copyFile,
} from "node:fs/promises";
import { createServer } from "node:net";
import { resolve, dirname, isAbsolute } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const args = new Set(process.argv.slice(2));
if (
  [...args].some(
    (arg) => !["--integration-only", "--api-only", "--help"].includes(arg),
  )
) {
  throw new Error(
    "Usage: node scripts/e2e/run.mjs [--integration-only | --api-only]",
  );
}
if (args.has("--help")) {
  console.log(
    "Local PostgreSQL E2E. See scripts/e2e/README.md. --integration-only runs the existing follows integration; --api-only adds adversarial API checks without Chromium.",
  );
  process.exit(0);
}
// A test process must never silently consume the developer's application secrets.
const envFiles = (await readdir(root)).filter(
  (name) => /^\.env(?:\.|$)/.test(name) && !name.endsWith(".example"),
);
assert.equal(
  envFiles.length,
  0,
  "Run E2E from an isolated checkout without .env files.",
);
const lockPath = resolve(root, ".astro/dev.json");
try {
  const lock = JSON.parse(await readFile(lockPath, "utf8"));
  try {
    process.kill(lock.pid, 0);
    throw new Error(
      "A server is already running in this checkout. Use a separate checkout for E2E.",
    );
  } catch (error) {
    if (error.code !== "ESRCH") throw error;
  }
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const runId = `${new Date().toISOString().replace(/[:.]/g, "-")}-${process.pid}`;
const artifactsDir = resolve(root, ".e2e-artifacts", runId);
await mkdir(artifactsDir, { recursive: true });
const result = {
  runId,
  startedAt: new Date().toISOString(),
  status: "running",
  tests: [],
  cleanup: "pending",
  limitations: [
    "Local identity-provider contract; hosted provider, mail delivery and OAuth are not exercised.",
    "Deterministic local TMDB fixture; no external catalogue availability is tested.",
  ],
};
const abort = new AbortController();
let database, auth, tmdb, appLock, appOwner, childEnv, cleanupPromise;
let fatalError;
const ownerPath = resolve(artifactsDir, "app-owner.json");
const astro = resolve(root, "node_modules/astro/bin/astro.mjs");
const baseEnv = Object.fromEntries(
  ["PATH", "HOME", "TMPDIR", "USER", "LANG"]
    .filter((name) => process.env[name])
    .map((name) => [name, process.env[name]]),
);
const save = () =>
  writeFile(
    resolve(artifactsDir, "results.json"),
    JSON.stringify(result, null, 2) + "\n",
  );
const report = (entry) => {
  result.tests.push(entry);
  console.log(
    `${entry.status === "passed" ? "PASS" : "FAIL"} ${entry.name}${entry.error ? `: ${entry.error}` : ""}`,
  );
};
async function command(argv, name, env) {
  try {
    const output = await execFile(process.execPath, argv, {
      cwd: root,
      env,
      timeout: 180_000,
      maxBuffer: 5 * 1024 * 1024,
      signal: abort.signal,
    });
    await writeFile(
      resolve(artifactsDir, `${name}.log`),
      output.stdout + output.stderr,
    );
    return output;
  } catch (error) {
    await writeFile(
      resolve(artifactsDir, `${name}.log`),
      (error.stdout ?? "") + (error.stderr ?? ""),
    );
    throw new Error(`${name} failed; see ${name}.log`, { cause: error });
  }
}
async function cleanup() {
  return (cleanupPromise ??= (async () => {
    const errors = [];
    if (appOwner) {
      try {
        let current;
        try {
          current = JSON.parse(await readFile(lockPath, "utf8"));
        } catch (error) {
          if (error.code !== "ENOENT") throw error;
        }
        if (current && current.pid !== appOwner.pid)
          throw new Error("Server ownership changed; refusing to stop it.");
        if (current) {
          await execFile(process.execPath, [astro, "dev", "stop"], {
            cwd: root,
            env: childEnv,
            timeout: 15_000,
          });
        } else {
          // This PID was stamped by this run's detached child before startup.
          try {
            process.kill(appOwner.pid, "SIGTERM");
          } catch (error) {
            if (error.code !== "ESRCH") throw error;
          }
        }
      } catch (error) {
        errors.push(`app: ${error.message}`);
      }
      await copyFile(
        resolve(root, ".astro/dev.log"),
        resolve(artifactsDir, "app.log"),
      ).catch(() => {});
    }
    for (const [name, resource] of [
      ["catalogue", tmdb],
      ["auth", auth],
      ["database", database],
    ]) {
      try {
        await (resource?.close ?? resource?.stop)?.call(resource);
      } catch (error) {
        errors.push(`${name}: ${error.message}`);
      }
    }
    result.cleanup = errors.length ? errors : "passed";
    if (errors.length) result.status = "failed";
    await save();
  })());
}
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    result.status = "interrupted";
    abort.abort(new Error(`Interrupted by ${signal}`));
    // Resource creation resolves before its ownership handle is available.
    // Once setup returns, the abort checkpoint below enters the same cleanup.
    // Active suites close their resources after the abort checkpoint.
    // Do not race teardown against in-progress resource creation.
  });
}
// Convert unexpected asynchronous failures into the same abort-and-cleanup path.
// Never resume test work after one: active suites observe the abort signal.
function abortAfterFatalError(error) {
  fatalError ??= error instanceof Error ? error : new Error(String(error));
  result.status = "failed";
  result.error = fatalError.message;
  abort.abort(fatalError);
}
process.on("unhandledRejection", abortAfterFatalError);
process.on("uncaughtException", abortAfterFatalError);
async function chromiumModule() {
  const supplied = process.env.NEXT_WATCH_PLAYWRIGHT_MODULE;
  if (supplied) {
    assert.ok(
      isAbsolute(supplied),
      "NEXT_WATCH_PLAYWRIGHT_MODULE must be an absolute installed module path.",
    );
    return import(pathToFileURL(supplied).href);
  }
  for (const name of ["playwright", "playwright-core"]) {
    try {
      return await import(name);
    } catch (error) {
      if (error.code !== "ERR_MODULE_NOT_FOUND") throw error;
    }
  }
  throw new Error(
    "Use an already installed Playwright module via NEXT_WATCH_PLAYWRIGHT_MODULE; the harness never installs software.",
  );
}
async function availablePort() {
  const server = createServer();
  await new Promise((resolve, reject) =>
    server.once("error", reject).listen(0, "127.0.0.1", resolve),
  );
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}
try {
  const playwright =
    !args.has("--integration-only") && !args.has("--api-only")
      ? await chromiumModule()
      : null;
  const { createDisposableDatabase } = await import("./database.mjs");
  database = await createDisposableDatabase();
  result.database = {
    container: database.containerName,
    migrations: database.migrations,
    engine: "PostgreSQL 18 in disposable Docker container",
  };
  await writeFile(
    resolve(artifactsDir, "state.json"),
    JSON.stringify(
      { runId, checkout: root, containerName: database.containerName },
      null,
      2,
    ) + "\n",
  );
  await save();
  abort.signal.throwIfAborted();
  const testEnv = {
    ...baseEnv,
    ...database.env,
    NODE_ENV: "test",
    ASTRO_TELEMETRY_DISABLED: "1",
  };
  await command(
    ["--experimental-strip-types", "scripts/test-integration.mjs"],
    "integration",
    testEnv,
  );
  report({
    name: "existing follows integration on disposable PostgreSQL",
    status: "passed",
  });
  if (!args.has("--integration-only")) {
    const { startAuthFixture } = await import("./auth-fixture.mjs");
    const { startTmdbFixture } = await import("./tmdb-fixture.mjs");
    auth = await startAuthFixture();
    tmdb = await startTmdbFixture();
    abort.signal.throwIfAborted();
    childEnv = {
      ...testEnv,
      NEON_AUTH_BASE_URL: auth.baseUrl,
      PUBLIC_NEON_AUTH_URL: auth.baseUrl,
      TMDB_API_KEY: "local-e2e-fixture",
      NEXT_WATCH_E2E_TMDB_URL: tmdb.baseUrl,
      NEXT_WATCH_E2E_OWNER_FILE: ownerPath,
      NEXT_WATCH_E2E_RUN_ID: runId,
      NODE_OPTIONS: `--import=${pathToFileURL(resolve(root, "scripts/e2e/network-preload.mjs")).href}`,
    };
    const port = await availablePort();
    try {
      await command(
        [
          astro,
          "dev",
          "--background",
          "--host",
          "127.0.0.1",
          "--port",
          String(port),
        ],
        "app-start",
        childEnv,
      );
    } finally {
      try {
        const stamp = JSON.parse(await readFile(ownerPath, "utf8"));
        assert.equal(stamp.runId, runId);
        assert.equal(stamp.checkout, root);
        appOwner = stamp;
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    }
    assert.ok(appOwner, "The E2E child did not identify its ownership.");
    appLock = JSON.parse(await readFile(lockPath, "utf8"));
    assert.equal(appLock.pid, appOwner.pid);
    assert.equal(new URL(appLock.url).hostname, "127.0.0.1");
    result.appUrl = appLock.url;
    console.log(`Local app: ${appLock.url}`);
    await writeFile(
      resolve(artifactsDir, "state.json"),
      JSON.stringify(
        {
          runId,
          checkout: root,
          containerName: database.containerName,
          app: appLock,
        },
        null,
        2,
      ) + "\n",
    );
    abort.signal.throwIfAborted();
    const { runAdversarialTests } = await import("./adversarial.mjs");
    result.api = await runAdversarialTests({
      appUrl: appLock.url,
      query: database.query,
      auth,
      report,
      signal: abort.signal,
    });
    if (playwright) {
      const { runBrowserTests } = await import("./browser.mjs");
      const browserResult = await runBrowserTests({
        appUrl: appLock.url,
        query: database.query,
        artifactsDir,
        chromium: playwright.chromium,
        authFixture: auth,
        tmdbFixture: tmdb,
        report,
        signal: abort.signal,
      });
      result.browser = browserResult;
    }
  }
  abort.signal.throwIfAborted();
  result.status =
    result.tests.some((entry) => entry.status === "failed") ||
    (!args.has("--integration-only") &&
      (!result.api || result.api.failed !== 0 || !result.api.tests?.length)) ||
    (playwright &&
      (!result.browser ||
        result.browser.passed !== true ||
        !result.browser.results?.length))
      ? "failed"
      : "passed";
} catch (error) {
  result.status =
    result.status === "interrupted" && !fatalError ? "interrupted" : "failed";
  result.error = error.message;
  console.error(error.stack);
} finally {
  await cleanup();
  result.finishedAt = new Date().toISOString();
  await save();
  console.log(`E2E ${result.status}. Evidence: ${artifactsDir}`);
  process.exitCode =
    result.status === "passed" && result.cleanup === "passed" ? 0 : 1;
  process.off("unhandledRejection", abortAfterFatalError);
  process.off("uncaughtException", abortAfterFatalError);
}
