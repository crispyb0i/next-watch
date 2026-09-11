import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import * as schema from "../db/schema.ts";

const pg = new PGlite();
const db = drizzle(pg, { schema });
let viewer: string | null = "alice";
let providerIds = [8];
let upstreamFails = false;
const testDb = new Proxy(db, {
  get(target, property) {
    if (property === "batch")
      return async (queries: PromiseLike<unknown>[]) => {
        await pg.exec("BEGIN");
        try {
          const results = [];
          for (const query of queries) results.push(await query);
          await pg.exec("COMMIT");
          return results;
        } catch (error) {
          await pg.exec("ROLLBACK");
          throw error;
        }
      };
    return Reflect.get(target, property);
  },
});
Object.assign(globalThis, {
  __testDb: testDb,
  __viewer: () => viewer,
  __tmdb: () => {
    if (upstreamFails) throw new Error("upstream unavailable");
    return {
      results: {
        US: {
          flatrate: providerIds.map((provider_id) => ({
            provider_id,
            provider_name: `Service ${provider_id}`,
            logo_path: null,
            display_priority: 1,
          })),
        },
      },
    };
  },
});
registerHooks({
  resolve(specifier, context, next) {
    if (specifier.endsWith("/db") || specifier.endsWith("/db/index.ts"))
      return {
        url: "data:text/javascript,export const db=globalThis.__testDb",
        shortCircuit: true,
      };
    if (specifier.endsWith("auth/server"))
      return {
        url:
          "data:text/javascript," +
          encodeURIComponent(
            `export const sessionUserId=async()=>globalThis.__viewer();export const syncUser=async()=>true;`,
          ),
        shortCircuit: true,
      };
    if (specifier.endsWith("server/tmdb"))
      return {
        url: "data:text/javascript,export const serverTmdb=async()=>globalThis.__tmdb()",
        shortCircuit: true,
      };
    if (specifier.startsWith(".") && context.parentURL) {
      const url = new URL(specifier, context.parentURL);
      if (existsSync(new URL(url.href + ".ts")))
        return next(url.href + ".ts", context);
    }
    return next(specifier, context);
  },
});
try {
  for (const filename of (await readdir("drizzle"))
    .filter((name) => name.endsWith(".sql"))
    .sort())
    await pg.exec(await readFile(`drizzle/${filename}`, "utf8"));
  await db.insert(schema.users).values(
    ["alice", "bob", "carol"].map((id) => ({
      id,
      email: `${id}@example.invalid`,
      name: id,
    })),
  );
  const nights = await import("../pages/api/nights.ts"),
    alerts = await import("../pages/api/alerts.ts"),
    library = await import("../pages/api/library.ts"),
    watched = await import("../pages/api/watched.ts");
  async function call(handler: any, body?: unknown, query = "") {
    const request = new Request(
      `https://app.invalid/api/test${query}`,
      body === undefined ? {} : { method: "POST", body: JSON.stringify(body) },
    );
    return handler({ request, url: new URL(request.url) });
  }
  const response = await call(nights.POST, {
    action: "create",
    title: "Friday",
  });
  assert.equal(response.status, 201);
  const { id } = await response.json();
  viewer = "carol";
  assert.equal((await call(nights.GET, undefined, `?id=${id}`)).status, 403);
  assert.equal(
    (
      await call(nights.POST, {
        action: "vote",
        id,
        tmdbId: 101,
        mediaType: "movie",
      })
    ).status,
    403,
  );
  viewer = "bob";
  assert.equal((await call(nights.POST, { action: "join", id })).status, 200);
  await db.insert(schema.favorites).values([
    {
      userId: "alice",
      tmdbId: 101,
      mediaType: "movie",
      kind: "watchlist",
      title: "Movie",
    },
    {
      userId: "alice",
      tmdbId: 101,
      mediaType: "tv",
      kind: "watchlist",
      title: "Show",
    },
    {
      userId: "bob",
      tmdbId: 102,
      mediaType: "movie",
      kind: "watchlist",
      title: "Other",
    },
  ]);
  await db.insert(schema.watchLog).values({
    userId: "bob",
    tmdbId: 101,
    mediaType: "movie",
    title: "Movie",
    watchedOn: "2024-01-01",
  });
  viewer = "alice";
  const room = await (await call(nights.GET, undefined, `?id=${id}`)).json();
  assert.deepEqual(
    room.candidates
      .map((item: any) => `${item.mediaType}:${item.tmdbId}`)
      .sort(),
    ["movie:102", "tv:101"],
  );
  await call(nights.POST, {
    action: "vote",
    id,
    tmdbId: 102,
    mediaType: "movie",
  });
  await call(nights.POST, {
    action: "vote",
    id,
    tmdbId: 102,
    mediaType: "movie",
  });
  assert.equal((await db.select().from(schema.nightVotes)).length, 1);
  viewer = "bob";
  await call(nights.POST, {
    action: "vote",
    id,
    tmdbId: 102,
    mediaType: "movie",
    remove: true,
  });
  assert.equal(
    (await db.select().from(schema.nightVotes)).length,
    1,
    "cannot remove another member vote",
  );
  viewer = "alice";
  assert.equal(
    (
      await call(alerts.POST, {
        action: "preferences",
        region: "US",
        providerIds: [8],
        watchlistPublic: false,
      })
    ).status,
    200,
  );
  await call(alerts.POST, { action: "check" });
  assert.equal((await db.select().from(schema.availabilityAlerts)).length, 2);
  await call(alerts.POST, { action: "check" });
  assert.equal(
    (await db.select().from(schema.availabilityAlerts)).length,
    2,
    "repeat checks do not duplicate alerts",
  );
  upstreamFails = true;
  const failed = await (await call(alerts.POST, { action: "check" })).json();
  assert.equal(failed.failed, 2);
  assert.equal(
    (await db.select().from(schema.availabilitySnapshots)).length,
    2,
    "upstream failure preserves last known snapshots",
  );
  upstreamFails = false;
  providerIds = [];
  await call(alerts.POST, { action: "check" });
  providerIds = [8];
  await call(alerts.POST, { action: "check" });
  assert.equal(
    (await db.select().from(schema.availabilityAlerts)).length,
    4,
    "returning availability creates a new event",
  );
  viewer = "bob";
  assert.equal((await (await call(alerts.GET)).json()).alerts.length, 0);
  await call(alerts.POST, { action: "read" });
  assert.equal(
    (await db.select().from(schema.availabilityAlerts)).filter(
      (row) => row.readAt,
    ).length,
    0,
    "mark read is owner scoped",
  );
  viewer = "alice";
  const entry = {
    tmdbId: 603,
    title: "The Matrix",
    watchedOn: "2024-01-02",
    rating: 4.5,
  };
  const payload = { version: 1, favorites: [], watched: [entry] };
  assert.equal((await call(library.POST, payload)).status, 200);
  await call(library.POST, payload);
  assert.equal(
    (
      await db
        .select()
        .from(schema.watchLog)
        .where(eq(schema.watchLog.userId, "alice"))
    ).length,
    1,
  );
  const [saved] = await db
    .select()
    .from(schema.watchLog)
    .where(eq(schema.watchLog.userId, "alice"));
  viewer = "bob";
  assert.equal(
    (
      await call(
        watched.PATCH,
        { ...entry, title: "Changed" },
        `?id=${saved.id}`,
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await db
        .select()
        .from(schema.watchLog)
        .where(eq(schema.watchLog.id, saved.id))
    )[0].title,
    "The Matrix",
  );
  viewer = "alice";
  const data = await (
    await call(watched.GET, undefined, "?limit=1&offset=0")
  ).json();
  assert.equal(data.length, 1);
  assert.equal((await call(watched.GET, undefined, "?limit=1.5")).status, 400);
  await assert.rejects(() =>
    db
      .insert(schema.follows)
      .values({ followerId: "alice", followeeId: "alice" }),
  );
  console.log(
    "Database migrations, ownership, nights, alert transitions, and import retries: passed",
  );
} finally {
  await pg.close();
}
