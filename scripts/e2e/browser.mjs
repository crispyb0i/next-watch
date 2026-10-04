import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";

const password = "LocalFixtureOnly-42!";
const alice = { email: "browser-alice@example.test", name: "Browser Alice" };
const bob = { email: "browser-bob@example.test", name: "Browser Bob" };
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function eventually(check, description, timeout = 15_000) {
  const deadline = Date.now() + timeout;
  let lastError;
  do {
    try {
      const value = await check();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await delay(50);
  } while (Date.now() < deadline);
  throw new Error(`Timed out: ${description}`, { cause: lastError });
}

function saved(id, title = `Fixture movie ${id}`, kind = "favorite") {
  return { id, title, mediaType: "movie", kind, poster: null };
}

function library(favorites = [], watched = []) {
  return { version: 1, favorites, watched };
}

function normalizedExport(value) {
  const favorites = value.favorites.map((item) => ({
    id: item.id,
    title: item.title,
    mediaType: item.mediaType,
    season: item.season ?? null,
    kind: item.kind,
  }));
  const watched = value.watched.map((item) => ({
    tmdbId: item.tmdbId,
    title: item.title,
    mediaType: item.mediaType,
    season: item.season ?? null,
    episode: item.episode ?? null,
    watchedOn: item.watchedOn,
    notes: item.notes ?? null,
  }));
  const order = (a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b));
  return { favorites: favorites.sort(order), watched: watched.sort(order) };
}

/**
 * Drives the shipped UI against the running app and a disposable SQL database.
 * Routes only abort/delay real traffic to reproduce transport failures. No
 * application API response is manufactured; SQL assertions observe real writes.
 * The runner supplies Playwright so an existing installation can be reused.
 */
export async function runBrowserTests({
  appUrl,
  query,
  artifactsDir,
  chromium,
  authFixture,
  report = () => {},
  signal,
}) {
  await mkdir(artifactsDir, { recursive: true });
  signal?.throwIfAborted();
  const browser = await chromium.launch({ headless: true });
  const onAbort = () => {
    void browser.close();
  };
  signal?.addEventListener("abort", onAbort, { once: true });
  const results = [];
  const screenshots = [];
  const contexts = [];
  const appOrigin = new URL(appUrl).origin;
  const authOrigin = new URL(authFixture.baseUrl).origin;
  const browserErrors = [];
  const blockedOrigins = new Set();
  let page;

  async function freshContext(viewport = { width: 1440, height: 1000 }) {
    const context = await browser.newContext({
      viewport,
      acceptDownloads: true,
      reducedMotion: "reduce",
    });
    contexts.push(context);
    await context.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if ([appOrigin, authOrigin].includes(url.origin)) {
        await route.continue();
      } else {
        blockedOrigins.add(url.origin);
        await route.abort("blockedbyclient");
      }
    });
    context.on("page", (tab) => {
      tab.setDefaultTimeout(15_000);
      tab.on("pageerror", (error) => browserErrors.push(error.message));
    });
    return context;
  }

  async function go(tab, pathname) {
    await tab.goto(new URL(pathname, appUrl).href, {
      waitUntil: "domcontentloaded",
    });
    // SSR controls are visible before their handlers exist. Wait for Astro's
    // eager islands so interactions exercise the application, not inert HTML.
    await tab.waitForFunction(() =>
      [
        ...document.querySelectorAll(
          'astro-island[client="load"], astro-island[client="only"]',
        ),
      ].every((island) => !island.hasAttribute("ssr")),
    );
  }

  async function signUp(tab, user) {
    await go(tab, "/auth/sign-up?redirect=/favorites");
    await tab
      .locator('astro-island[component-url*="AuthView"]:not([ssr])')
      .waitFor({ state: "attached" });
    await tab.getByLabel("Name", { exact: true }).fill(user.name);
    await tab.getByLabel("Email", { exact: true }).fill(user.email);
    await tab.getByLabel("Password", { exact: true }).fill(password);
    await tab
      .getByRole("button", { name: "Create an account", exact: true })
      .click();
    await tab.waitForURL((url) => url.pathname === "/favorites");
    await tab
      .getByRole("button", { name: "Account menu", exact: true })
      .waitFor();
    await eventually(
      async () =>
        (await query("SELECT id FROM users WHERE email = $1", [user.email]))
          .rows.length === 1,
      `signed-up ${user.name} is synchronized to PostgreSQL`,
    );
  }

  async function signIn(tab, user) {
    await go(tab, "/auth/sign-in?redirect=/favorites");
    await tab
      .locator('astro-island[component-url*="AuthView"]:not([ssr])')
      .waitFor({ state: "attached" });
    await tab.getByLabel("Email", { exact: true }).fill(user.email);
    await tab.getByLabel("Password", { exact: true }).fill(password);
    await tab.getByRole("button", { name: "Login", exact: true }).click();
    await tab.waitForURL((url) => url.pathname === "/favorites");
    await tab
      .getByRole("button", { name: "Account menu", exact: true })
      .waitFor();
  }

  async function signOut(tab) {
    await tab
      .getByRole("button", { name: "Account menu", exact: true })
      .click();
    await tab.getByRole("menuitem", { name: "Sign out", exact: true }).click();
    await tab.waitForURL((url) =>
      ["/", "/auth/sign-in"].includes(url.pathname),
    );
    await tab.getByRole("link", { name: "Sign in", exact: true }).waitFor();
  }

  async function counts(user, minId = 0, maxId = 2147483647) {
    const { rows } = await query(
      `SELECT
        (SELECT count(*)::int FROM favorites f WHERE f.user_id = u.id AND f.tmdb_id BETWEEN $2 AND $3) AS favorites,
        (SELECT count(*)::int FROM watch_log w WHERE w.user_id = u.id AND w.tmdb_id BETWEEN $2 AND $3) AS watched
       FROM users u WHERE u.email = $1`,
      [user.email, minId, maxId],
    );
    assert.equal(rows.length, 1, `SQL user exists: ${user.email}`);
    return rows[0];
  }

  async function expectCounts(user, expected, minId, maxId) {
    await eventually(
      async () => {
        assert.deepEqual(await counts(user, minId, maxId), expected);
        return true;
      },
      `database counts for ${user.name}: ${JSON.stringify(expected)}`,
    );
  }

  async function upload(tab, value, name = "fixture-library.json") {
    await tab.getByLabel("Import JSON or CSV").setInputFiles({
      name,
      mimeType: name.endsWith(".csv") ? "text/csv" : "application/json",
      buffer: Buffer.from(
        typeof value === "string" ? value : JSON.stringify(value),
      ),
    });
  }

  async function importLibrary(tab, value, expectedNew) {
    await upload(tab, value);
    await tab
      .getByRole("heading", { name: "Import preview", exact: true })
      .waitFor();
    await tab
      .getByRole("button", { name: "Import these entries", exact: true })
      .click();
    await tab
      .getByText(
        `Imported ${expectedNew} new entries. Previously imported entries were skipped.`,
        { exact: true },
      )
      .waitFor({ timeout: 60_000 });
  }

  async function exportLibrary(tab, filename) {
    const downloadEvent = tab.waitForEvent("download");
    void downloadEvent.catch(() => {});
    await tab
      .getByRole("button", { name: "Export my library", exact: true })
      .click();
    const download = await downloadEvent;
    assert.equal(download.suggestedFilename(), "next-watch-library.json");
    const destination = path.join(artifactsDir, filename);
    await download.saveAs(destination);
    return JSON.parse(await readFile(destination, "utf8"));
  }

  async function screenshot(tab, name) {
    const destination = path.join(artifactsDir, `${name}.png`);
    await tab.screenshot({ path: destination, fullPage: true });
    screenshots.push(destination);
  }

  async function check(name, run) {
    signal?.throwIfAborted();
    const started = Date.now();
    try {
      await run();
      results.push({
        name,
        status: "passed",
        durationMs: Date.now() - started,
      });
      report({ ...results.at(-1), name: `browser: ${name}` });
    } catch (error) {
      if (page && !page.isClosed())
        await screenshot(page, `failure-${results.length + 1}`).catch(() => {});
      results.push({
        name,
        status: "failed",
        durationMs: Date.now() - started,
        error: error.stack ?? String(error),
      });
      report({ ...results.at(-1), name: `browser: ${name}` });
      signal?.throwIfAborted();
      throw new Error(
        `Browser scenario failed; remaining dependent scenarios were not run: ${name}`,
        { cause: error },
      );
    }
  }

  try {
    const context = await freshContext();
    page = await context.newPage();
    await check(
      "protected route and UI sign-up create one real database user",
      async () => {
        await go(page, "/favorites");
        await page.waitForURL((url) => url.pathname === "/auth/sign-in");
        assert.equal(
          new URL(page.url()).searchParams.get("redirect"),
          "/favorites",
        );
        await signUp(page, alice);
        await page
          .getByText(
            "No favorites yet. Tap the heart on any movie or show to save it.",
            { exact: true },
          )
          .waitFor();
        await expectCounts(alice, { favorites: 0, watched: 0 });
      },
    );

    await check(
      "favorite writes survive reload, repeated clicks serialize, failed writes roll back",
      async () => {
        await go(page, "/movie?id=603");
        const favorite = page.getByRole("button", {
          name: "Favorite The Matrix",
          exact: true,
        });
        await favorite.click();
        await expectCounts(alice, { favorites: 1, watched: 0 });
        await page.reload();
        const active = page.getByRole("button", {
          name: "Unfavorite The Matrix",
          exact: true,
        });
        await active.waitFor();
        const secondMutation = page.waitForResponse(
          (response) =>
            new URL(response.url()).pathname === "/api/favorites" &&
            response.request().method() === "POST",
        );
        void secondMutation.catch(() => {});
        // Two actual clicks on the same rendered control exercise the mutation queue.
        await active.evaluate((button) => {
          button.click();
          button.click();
        });
        assert.equal((await secondMutation).status(), 201);
        await expectCounts(alice, { favorites: 1, watched: 0 });
        await active.waitFor();
        await active.click();
        await expectCounts(alice, { favorites: 0, watched: 0 });
        let failed = false;
        const failSave = async (route) => {
          if (route.request().method() === "POST" && !failed) {
            failed = true;
            await route.abort("failed");
          } else await route.continue();
        };
        await page.route("**/api/favorites", failSave);
        await favorite.click();
        await page
          .getByText("Couldn't update favorites.", { exact: true })
          .waitFor();
        assert.equal(failed, true);
        await favorite.waitFor();
        await expectCounts(alice, { favorites: 0, watched: 0 });
        await page.unroute("**/api/favorites", failSave);
        await favorite.click();
        await expectCounts(alice, { favorites: 1, watched: 0 });
      },
    );

    await check(
      "JSON and CSV preview, cancel, date validation, repeated import and home progress",
      async () => {
        await go(page, "/library");
        const fixture = library(
          [
            saved(603, "The Matrix"),
            saved(272, "Batman Begins", "watchlist"),
            {
              ...saved(1399, "Game of Thrones — Specials", "watchlist"),
              mediaType: "tv",
              season: 0,
            },
          ],
          [
            {
              tmdbId: 603,
              title: "The Matrix",
              mediaType: "movie",
              watchedOn: "2024-02-29",
              notes: "Synthetic rewatch",
            },
            {
              tmdbId: 1399,
              title: "Game of Thrones",
              mediaType: "tv",
              season: 1,
              episode: 1,
              watchedOn: "2024-03-01",
              notes: null,
            },
            ...Array.from({ length: 99 }, (_, i) => ({
              tmdbId: 800000 + i,
              title: `Pagination fixture ${i}`,
              mediaType: "movie",
              watchedOn: "2024-03-02",
              notes: null,
            })),
          ],
        );
        await upload(page, fixture);
        await page
          .getByRole("heading", { name: "Import preview", exact: true })
          .waitFor();
        await expectCounts(alice, { favorites: 1, watched: 0 });
        await page.getByRole("button", { name: "Cancel", exact: true }).click();
        await expectCounts(alice, { favorites: 1, watched: 0 });
        await upload(
          page,
          library(
            [],
            [
              {
                tmdbId: 777,
                title: "Impossible date",
                watchedOn: "2025-02-29",
                mediaType: "movie",
              },
            ],
          ),
        );
        await page
          .getByRole("alert")
          .filter({ hasText: /watchedOn must be YYYY-MM-DD/ })
          .waitFor();
        assert.equal(
          await page
            .getByRole("button", { name: "Import these entries", exact: true })
            .count(),
          0,
        );
        await expectCounts(alice, { favorites: 1, watched: 0 });
        await importLibrary(page, fixture, 103);
        await expectCounts(alice, { favorites: 3, watched: 101 });
        await importLibrary(page, fixture, 0);
        await expectCounts(alice, { favorites: 3, watched: 101 });
        const csv =
          'TMDB ID,Title,Media Type,Watched Date,Notes\n901,"Le film, ""Special""",movie,2024-02-29,"comma, quote and café"\n';
        await upload(page, csv, "quoted-history.csv");
        await page
          .getByRole("link", { name: 'Le film, "Special"', exact: true })
          .waitFor();
        await page
          .getByRole("button", { name: "Import these entries", exact: true })
          .click();
        await page
          .getByText(
            "Imported 1 new entries. Previously imported entries were skipped.",
            { exact: true },
          )
          .waitFor();
        const { rows } = await query(
          "SELECT title, notes, watched_on::text FROM watch_log w JOIN users u ON w.user_id = u.id WHERE u.email = $1 AND tmdb_id = 901",
          [alice.email],
        );
        assert.deepEqual(rows, [
          {
            title: 'Le film, "Special"',
            notes: "comma, quote and café",
            watched_on: "2024-02-29",
          },
        ]);
        await screenshot(page, "desktop-library");

        // The signed-in home chunk must resolve and derive progress from the
        // episode already imported through the real API, without another write.
        await go(page, "/");
        const watching = page.getByRole("region", {
          name: "Currently watching",
          exact: true,
        });
        await watching
          .getByRole("heading", { name: "Game of Thrones", exact: true })
          .waitFor();
        const nextEpisode = watching.getByRole("link", {
          name: /^Up next: S01E02/,
        });
        await nextEpisode.waitFor();
        assert.equal(
          await nextEpisode.getAttribute("href"),
          "/tv/episode?id=1399&season=1&episode=2",
        );
        const progress = watching.getByRole("progressbar", {
          name: "Game of Thrones season progress",
          exact: true,
        });
        assert.equal(await progress.getAttribute("aria-valuenow"), "1");
        assert.equal(await progress.getAttribute("aria-valuemax"), "2");
        await screenshot(page, "signed-in-home-progress");
        await nextEpisode.click();
        await page.waitForURL(
          (url) =>
            url.pathname === "/tv/episode" &&
            url.searchParams.get("id") === "1399" &&
            url.searchParams.get("season") === "1" &&
            url.searchParams.get("episode") === "2",
        );
        await page
          .getByRole("heading", { name: "Local Episode 2", exact: true })
          .waitFor();
        await expectCounts(alice, { favorites: 3, watched: 102 });
      },
    );

    await check(
      "downloaded export round-trips into a second account without changing the first",
      async () => {
        await go(page, "/library");
        const exported = await exportLibrary(page, "alice-export.json");
        assert.equal(exported.version, 1);
        assert.equal(exported.favorites.length, 3);
        assert.equal(exported.watched.length, 102);
        const dbFavorites = await query(
          `SELECT f.tmdb_id AS id, f.title, f.media_type AS "mediaType", NULLIF(f.season, -1) AS season, f.kind FROM favorites f JOIN users u ON u.id = f.user_id WHERE u.email = $1`,
          [alice.email],
        );
        const dbWatched = await query(
          `SELECT w.tmdb_id AS "tmdbId", w.title, w.media_type AS "mediaType", w.season, w.episode, w.watched_on::text AS "watchedOn", w.notes FROM watch_log w JOIN users u ON u.id = w.user_id WHERE u.email = $1`,
          [alice.email],
        );
        assert.deepEqual(
          normalizedExport(exported),
          normalizedExport({
            favorites: dbFavorites.rows,
            watched: dbWatched.rows,
          }),
        );
        await importLibrary(page, exported, 0);
        await expectCounts(alice, { favorites: 3, watched: 102 });
        const bobContext = await freshContext();
        const bobPage = await bobContext.newPage();
        await signUp(bobPage, bob);
        await expectCounts(bob, { favorites: 0, watched: 0 });
        await go(bobPage, "/library");
        await importLibrary(bobPage, exported, 105);
        await expectCounts(bob, { favorites: 3, watched: 102 });
        const copy = await exportLibrary(bobPage, "bob-export.json");
        assert.deepEqual(normalizedExport(copy), normalizedExport(exported));
        await expectCounts(alice, { favorites: 3, watched: 102 });
        await bobContext.close();
      },
    );

    await check(
      "favorites load failure exposes Retry and recovers from the real API",
      async () => {
        let failRead = true;
        const abortRead = async (route) => {
          if (route.request().method() === "GET" && failRead)
            await route.abort("failed");
          else await route.continue();
        };
        await page.route("**/api/favorites", abortRead);
        await go(page, "/favorites");
        await page
          .getByRole("alert")
          .filter({ hasText: "Could not load saved items" })
          .waitFor();
        failRead = false;
        await page.getByRole("button", { name: "Retry", exact: true }).click();
        await page.getByRole("link", { name: /\bThe Matrix\b/ }).waitFor();
        await page.unroute("**/api/favorites", abortRead);
        await expectCounts(alice, { favorites: 3, watched: 102 });
      },
    );

    await check(
      "lost import response retries committed batches without duplicate database rows",
      async () => {
        await go(page, "/library");
        const fixture = library(
          Array.from({ length: 12 }, (_, i) =>
            saved(910000 + i, `Lost response ${i}`),
          ),
        );
        let responseLost = false;
        const loseResponse = async (route) => {
          if (route.request().method() === "POST" && !responseLost) {
            responseLost = true;
            const response = await route.fetch();
            assert.equal(
              response.status(),
              200,
              "real API committed the first batch",
            );
            await route.abort("failed");
          } else await route.continue();
        };
        await page.route("**/api/library", loseResponse);
        await upload(page, fixture);
        await page
          .getByRole("button", { name: "Import these entries", exact: true })
          .click();
        await page
          .getByRole("alert")
          .filter({ hasText: "retrying safely skips" })
          .waitFor();
        assert.equal(responseLost, true);
        await expectCounts(
          alice,
          { favorites: 10, watched: 0 },
          910000,
          910099,
        );
        await page.unroute("**/api/library", loseResponse);
        await page
          .getByRole("button", { name: "Import these entries", exact: true })
          .click();
        await page
          .getByText(
            "Imported 2 new entries. Previously imported entries were skipped.",
            { exact: true },
          )
          .waitFor();
        await expectCounts(
          alice,
          { favorites: 12, watched: 0 },
          910000,
          910099,
        );
        await importLibrary(page, fixture, 0);
        await expectCounts(
          alice,
          { favorites: 12, watched: 0 },
          910000,
          910099,
        );
      },
    );

    await check(
      "cross-tab account switching cancels import continuation and clears private UI",
      async () => {
        await go(page, "/library");
        const fixture = library(
          Array.from({ length: 21 }, (_, i) =>
            saved(920000 + i, `Interrupted Alice ${i}`),
          ),
        );
        let release;
        const held = new Promise((resolve) => {
          release = resolve;
        });
        let secondBatch;
        const reachedSecond = new Promise((resolve) => {
          secondBatch = resolve;
        });
        let requests = 0;
        const pauseSecond = async (route) => {
          if (route.request().method() !== "POST") return route.continue();
          requests += 1;
          if (requests === 2) {
            secondBatch();
            await held;
            await route.continue().catch(() => {});
          } else await route.continue();
        };
        await page.route("**/api/library", pauseSecond);
        const abortedRequest = page.waitForEvent("requestfailed", {
          predicate: (request) =>
            new URL(request.url()).pathname === "/api/library" &&
            request.failure()?.errorText.includes("ABORTED"),
          timeout: 30_000,
        });
        // Attach an immediate rejection handler; this event is awaited after switching.
        void abortedRequest.catch(() => {});
        try {
          await upload(page, fixture);
          await page
            .getByRole("button", { name: "Import these entries", exact: true })
            .click();
          await Promise.race([
            reachedSecond,
            delay(15_000).then(() => {
              throw new Error("Second real import request did not start");
            }),
          ]);
          await expectCounts(
            alice,
            { favorites: 10, watched: 0 },
            920000,
            920099,
          );
          const accountTab = await context.newPage();
          await go(accountTab, "/favorites");
          await signOut(accountTab);
          await signIn(accountTab, bob);
          await page.bringToFront();
          await eventually(async () => {
            const preview = await page
              .getByRole("heading", { name: "Import preview", exact: true })
              .count();
            const privateTitle = await page
              .getByText("Interrupted Alice 0 · favorite", { exact: true })
              .count();
            return preview === 0 && privateTitle === 0;
          }, "Alice's pending import disappears after cross-tab account switch");
          await abortedRequest;
          release();
          await page.unroute("**/api/library", pauseSecond);
          await go(page, "/library");
          await page
            .getByRole("button", { name: "Export my library", exact: true })
            .waitFor();
          const switched = await exportLibrary(
            page,
            "switched-bob-export.json",
          );
          assert.equal(
            switched.favorites.some((item) => item.id >= 910000),
            false,
          );
          await expectCounts(
            alice,
            { favorites: 10, watched: 0 },
            920000,
            920099,
          );
          await expectCounts(bob, { favorites: 0, watched: 0 }, 920000, 920099);
          assert.equal(
            requests,
            2,
            "no further Alice batches run with Bob's session",
          );
          await signOut(accountTab);
          await signIn(accountTab, alice);
          await go(page, "/library");
          await importLibrary(page, fixture, 11);
          await expectCounts(
            alice,
            { favorites: 21, watched: 0 },
            920000,
            920099,
          );
          await accountTab.close();
        } finally {
          release();
          await page.unroute("**/api/library", pauseSecond);
        }
      },
    );

    await check(
      "desktop and narrow mobile layouts keep library and navigation reachable",
      async () => {
        for (const width of [320, 390, 768, 1440]) {
          await page.setViewportSize({ width, height: 900 });
          await go(page, "/library");
          await page
            .getByRole("heading", {
              name: "Your library, your data",
              exact: true,
            })
            .waitFor();
          const dimensions = await page.evaluate(() => ({
            width: innerWidth,
            scroll: document.documentElement.scrollWidth,
            overflowing: [...document.querySelectorAll("body *")]
              .map((element) => ({
                tag: element.tagName.toLowerCase(),
                type: element.getAttribute("type"),
                className: (element.getAttribute("class") ?? "").slice(0, 100),
                x: element.getBoundingClientRect().x,
                width: element.getBoundingClientRect().width,
                right: element.getBoundingClientRect().right,
              }))
              .filter(
                (element) =>
                  element.width > 0 &&
                  (element.x < -2 || element.right > innerWidth + 2),
              )
              .slice(0, 8),
          }));
          assert.ok(
            dimensions.scroll <= dimensions.width + 2,
            `No page-wide overflow at ${width}px: ${JSON.stringify(dimensions)}`,
          );
          const button = await page
            .getByRole("button", { name: "Export my library", exact: true })
            .boundingBox();
          assert.ok(
            button && button.x >= 0 && button.x + button.width <= width + 1,
          );
          if (width < 1280) {
            await page.getByLabel("Navigation menu", { exact: true }).click();
            await page
              .getByRole("link", { name: "Favorites", exact: true })
              .filter({ visible: true })
              .click();
          } else await go(page, "/favorites");
          await page
            .getByRole("heading", { name: "Favorites", exact: true })
            .waitFor();
          await page.getByRole("link", { name: /\bThe Matrix\b/ }).waitFor();
          const favoritesWidth = await page.evaluate(
            () => document.documentElement.scrollWidth,
          );
          assert.ok(
            favoritesWidth <= width + 2,
            `Favorites grid fits ${width}px viewport`,
          );
          await screenshot(page, `favorites-${width}px`);
        }
      },
    );

    await check(
      "sign-out, rejected password, session expiry and reauthentication preserve account data",
      async () => {
        await signOut(page);
        await go(page, "/auth/sign-in?redirect=/favorites");
        await page
          .locator('astro-island[component-url*="AuthView"]:not([ssr])')
          .waitFor({ state: "attached" });
        await page.getByLabel("Email", { exact: true }).fill(alice.email);
        await page
          .getByLabel("Password", { exact: true })
          .fill("Definitely-wrong-password");
        await page.getByRole("button", { name: "Login", exact: true }).click();
        await page
          .getByText(/Invalid email or password/i)
          .first()
          .waitFor();
        assert.equal(new URL(page.url()).pathname, "/auth/sign-in");
        await signIn(page, alice);
        const { rows } = await query("SELECT id FROM users WHERE email = $1", [
          alice.email,
        ]);
        await authFixture.controls.expireSession(rows[0].id);
        await page.reload();
        await page.waitForURL((url) => url.pathname === "/auth/sign-in");
        assert.equal(
          await page.getByRole("link", { name: /\bThe Matrix\b/ }).count(),
          0,
        );
        await signIn(page, alice);
        await page.getByRole("link", { name: /\bThe Matrix\b/ }).waitFor();
        await expectCounts(alice, { favorites: 36, watched: 102 });
        await expectCounts(bob, { favorites: 3, watched: 102 });
      },
    );
    await check("no uncaught browser runtime errors", async () => {
      assert.deepEqual(browserErrors, []);
    });
  } finally {
    signal?.removeEventListener("abort", onAbort);
    await Promise.allSettled(contexts.map((context) => context.close()));
    await browser.close();
  }
  return {
    passed:
      results.length > 0 &&
      results.every((result) => result.status === "passed"),
    failed: results.filter((result) => result.status === "failed").length,
    results,
    screenshots,
    browserErrors,
    blockedOrigins: [...blockedOrigins],
    authScope:
      "The shipped Neon SDK/UI and application JWT/JWKS contract run against a local provider fixture; external Neon delivery, OAuth and provider operations are not exercised.",
  };
}
