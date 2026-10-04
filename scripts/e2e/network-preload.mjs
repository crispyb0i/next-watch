import { writeFileSync } from "node:fs";
// Loaded only by the disposable E2E child process, never by the application build.
if (
  process.env.NEXT_WATCH_E2E !== "1" ||
  process.env.NODE_ENV === "production"
) {
  throw new Error(
    "The E2E network fixture cannot run outside a local test process.",
  );
}
// The CLI's detached child identifies itself even if startup is interrupted
// before Astro can write its usual ready-state lock file.
if (process.env.ASTRO_DEV_BACKGROUND === "1") {
  writeFileSync(
    process.env.NEXT_WATCH_E2E_OWNER_FILE,
    JSON.stringify({
      pid: process.pid,
      runId: process.env.NEXT_WATCH_E2E_RUN_ID,
      checkout: process.cwd(),
      startedAt: new Date().toISOString(),
    }),
    { mode: 0o600, flag: "wx" },
  );
}
const fixture = new URL(process.env.NEXT_WATCH_E2E_TMDB_URL);
if (fixture.protocol !== "http:" || fixture.hostname !== "127.0.0.1") {
  throw new Error("The E2E catalogue must use a loopback HTTP fixture.");
}
const realFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = new URL(input instanceof Request ? input.url : input);
  if (
    url.origin === "https://api.themoviedb.org" &&
    url.pathname.startsWith("/3/")
  ) {
    const redirected = new URL(
      url.pathname.slice(2) + url.search,
      fixture.origin + fixture.pathname.replace(/\/$/, "") + "/",
    );
    // URL's leading slash would drop the fixture base path.
    redirected.pathname =
      fixture.pathname.replace(/\/$/, "") + url.pathname.slice(2);
    return realFetch(
      input instanceof Request ? new Request(redirected, input) : redirected,
      init,
    );
  }
  if (url.protocol === "http:" && url.hostname === "127.0.0.1") {
    return realFetch(input, init);
  }
  throw new Error(`E2E blocked nonlocal server request to ${url.origin}`);
};
