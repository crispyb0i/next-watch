import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { registerHooks } from "node:module";
import { after, before, beforeEach, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import * as schema from "../db/schema.ts";
import { listItemHref, parseListItem } from "./lists.ts";

const pg = new PGlite();
const db = drizzle(pg, { schema });
let viewer: string | null = "alice";
let profileReady = true;
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
  __listTestDb: testDb,
  __listViewer: () => viewer,
  __listProfileReady: () => profileReady,
});
registerHooks({
  resolve(specifier, context, next) {
    if (specifier.endsWith("/db"))
      return {
        url: "data:text/javascript,export const db=globalThis.__listTestDb",
        shortCircuit: true,
      };
    if (specifier.endsWith("auth/server"))
      return {
        url: "data:text/javascript,export const sessionUserId=async()=>globalThis.__listViewer();export const syncUser=async()=>globalThis.__listProfileReady();",
        shortCircuit: true,
      };
    if (specifier.startsWith(".") && context.parentURL) {
      const url = new URL(`${specifier}.ts`, context.parentURL);
      if (existsSync(url)) return next(url.href, context);
    }
    return next(specifier, context);
  },
});

const api = await import("../pages/api/lists.ts");
const { readList } = await import("./server/lists.ts");
const fields = {
  title: "Rainy Sundays",
  description: "Comfort watches",
  shared: false,
};
const movie = {
  tmdbId: 42,
  mediaType: "movie",
  title: "Movie",
  poster: "https://image.tmdb.org/t/p/w500/poster.jpg",
};
async function call(body?: unknown, id?: string) {
  const url = new URL(
    `https://next-watch.test/api/lists${id === undefined ? "" : `?id=${id}`}`,
  );
  const request = new Request(
    url,
    body === undefined ? {} : { method: "POST", body: JSON.stringify(body) },
  );
  return (body === undefined ? api.GET : api.POST)({
    request,
    url,
  } as Parameters<typeof api.GET>[0]);
}
async function create(extra = {}) {
  const response = await call({ action: "create", ...fields, ...extra });
  assert.equal(response.status, 201);
  return (await response.json()).id as string;
}

before(async () => {
  for (const file of (await readdir("drizzle"))
    .filter((file) => file.endsWith(".sql"))
    .sort())
    await pg.exec(await readFile(`drizzle/${file}`, "utf8"));
  await db.insert(schema.users).values(
    ["alice", "bob"].map((id) => ({
      id,
      name: id,
      email: `${id}@example.invalid`,
    })),
  );
});
beforeEach(() => {
  viewer = "alice";
  profileReady = true;
});
after(async () => {
  await pg.close();
});

test("lists default to private in storage and expose shared links only to viewers", async () => {
  const id = await create();
  const own = await readList(id, "alice");
  assert.equal(own?.isOwner, true);
  assert.equal(own?.shared, false);
  assert.equal(await readList(id, "bob"), null);
  assert.equal(await readList(id, null), null);
  viewer = null;
  assert.equal((await call(undefined, id)).status, 404);
  assert.equal((await call()).status, 401);
  assert.equal((await call({ action: "create", ...fields })).status, 401);
  viewer = "alice";
  assert.equal(
    (await call({ action: "update", id, ...fields, shared: true })).status,
    200,
  );
  viewer = null;
  const response = await call(undefined, id);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const shared = await response.json();
  assert.equal(shared.title, fields.title);
  assert.equal(shared.isOwner, false);
  assert.equal(shared.ownerName, "alice");
  assert.equal("userId" in shared, false);
  assert.equal(JSON.stringify(shared).includes("@example.invalid"), false);
  viewer = "alice";
  await call({ action: "update", id, ...fields, shared: false });
  assert.equal(await readList(id, null), null);
  assert.equal(await readList(id, "bob"), null);
});

test("shared-list visitors cannot rename, share, delete, add or remove entries", async () => {
  const id = await create({ shared: true, item: movie });
  const itemId = (await readList(id, "alice"))!.items[0].id;
  for (const visitor of [null, "bob"]) {
    viewer = visitor;
    for (const body of [
      { action: "update", ...fields, title: "Stolen", shared: false },
      { action: "delete" },
      { action: "add", item: { ...movie, tmdbId: 9 } },
      { action: "remove", itemId },
    ])
      assert.equal((await call({ ...body, id })).status, visitor ? 404 : 401);
  }
  const list = await readList(id, "alice");
  assert.equal(list?.title, fields.title);
  assert.equal(list?.items.length, 1);
  assert.equal(list?.shared, true);
  assert.deepEqual(await (await call()).json(), []);
});

test("lists deduplicate titles while keeping movie, show, season and episode identities", async () => {
  const id = await create({ item: movie });
  const titles = [
    movie,
    { ...movie, mediaType: "tv" },
    { ...movie, mediaType: "tv", season: 0 },
    { ...movie, mediaType: "tv", season: 0, episode: 1 },
    { ...movie, mediaType: "tv", season: 0, episode: 2 },
  ];
  for (const item of titles) {
    assert.equal((await call({ action: "add", id, item })).status, 200);
    assert.equal((await call({ action: "add", id, item })).status, 200);
  }
  const list = (await readList(id, "alice"))!;
  assert.equal(list.items.length, 5);
  assert.deepEqual(list.items.map(listItemHref), [
    "/movie?id=42",
    "/tv?id=42",
    "/tv/season?id=42&season=0",
    "/tv/episode?id=42&season=0&episode=1",
    "/tv/episode?id=42&season=0&episode=2",
  ]);
  const other = await create({ item: movie });
  const foreignItem = (await readList(other, "alice"))!.items[0].id;
  await call({ action: "remove", id, itemId: foreignItem });
  assert.equal((await readList(other, "alice"))!.items.length, 1);
  await call({ action: "remove", id, itemId: list.items[0].id });
  assert.equal((await readList(id, "alice"))!.items.length, 4);
  const summaries = await (await call()).json();
  assert.equal(
    summaries.find((list: { id: string }) => list.id === id).itemCount,
    4,
  );
});

test("list validation rejects malformed requests, unsafe artwork and incomplete accounts", async () => {
  for (const body of [
    null,
    [],
    {},
    { action: "create", ...fields, title: " " },
    { action: "create", ...fields, title: "x".repeat(101) },
    { action: "create", ...fields, shared: "true" },
    { action: "create", ...fields, description: "x".repeat(2001) },
    { action: "create", ...fields, item: {} },
  ])
    assert.equal((await call(body)).status, 400);
  const id = await create();
  for (const item of [
    { ...movie, tmdbId: 0 },
    { ...movie, tmdbId: 2 ** 31 },
    { ...movie, mediaType: "person" },
    { ...movie, season: 1 },
    { ...movie, mediaType: "tv", episode: 1 },
    { ...movie, mediaType: "tv", season: -1 },
    { ...movie, mediaType: "tv", season: 0, episode: 0 },
    { ...movie, poster: "https://evil.invalid/tracker.jpg" },
    { ...movie, poster: "javascript:alert(1)" },
    { ...movie, title: " " },
    { ...movie, title: "Bad\u0000title" },
    { ...movie, subtitle: "x".repeat(301) },
  ])
    assert.equal((await call({ action: "add", id, item })).status, 400);
  assert.equal((await readList(id, "alice"))!.items.length, 0);
  assert.equal((await call({ action: "remove", id, itemId: -1 })).status, 400);
  assert.equal((await call({ action: "unknown", id })).status, 400);
  assert.equal((await call(undefined, "bad-id")).status, 404);
  const request = new Request("https://next-watch.test/api/lists", {
    method: "POST",
    body: "{",
  });
  assert.equal(
    (await api.POST({ request } as Parameters<typeof api.POST>[0])).status,
    400,
  );
  profileReady = false;
  assert.equal((await call({ action: "create", ...fields })).status, 403);
});

test("list deletion cascades only its own entries and leaves viewing data untouched", async () => {
  const id = await create({ shared: true, item: movie });
  const keep = await create({ item: movie });
  await db.insert(schema.watchLog).values({
    userId: "alice",
    tmdbId: 42,
    title: "Movie",
    watchedOn: "2026-10-02",
  });
  await call({ action: "delete", id });
  assert.equal(await readList(id, null), null);
  assert.deepEqual(
    await db
      .select()
      .from(schema.customListItems)
      .where(eq(schema.customListItems.listId, id)),
    [],
  );
  assert.equal((await readList(keep, "alice"))!.items.length, 1);
  assert.equal((await db.select().from(schema.watchLog)).length, 1);
});

test("database constraints and create-with-item transactions preserve list integrity", async () => {
  const id = await create();
  for (const item of [
    { tmdbId: 0, mediaType: "movie" },
    { tmdbId: 4, mediaType: "person" },
    { tmdbId: 4, mediaType: "movie", season: 1 },
    { tmdbId: 4, mediaType: "tv", episode: 1 },
  ])
    await assert.rejects(() =>
      db.insert(schema.customListItems).values({
        listId: id,
        title: "Invalid",
        ...item,
      } as typeof schema.customListItems.$inferInsert),
    );
  const before = (await db.select().from(schema.customLists)).length;
  await pg.exec(
    "CREATE FUNCTION reject_list_item() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Test storage failure'; END; $$; CREATE TRIGGER reject_list_item BEFORE INSERT ON custom_list_items FOR EACH ROW EXECUTE FUNCTION reject_list_item();",
  );
  try {
    await assert.rejects(() =>
      call({ action: "create", ...fields, item: movie }),
    );
  } finally {
    await pg.exec(
      "DROP TRIGGER reject_list_item ON custom_list_items; DROP FUNCTION reject_list_item();",
    );
  }
  assert.equal((await db.select().from(schema.customLists)).length, before);
  assert.equal(
    parseListItem({
      ...movie,
      poster: "https://image.tmdb.org.evil.invalid/t/p/w500/a.jpg",
    }),
    null,
  );
});

test("missing list migrations return a recoverable error instead of exposing database details", async () => {
  await pg.exec("ALTER TABLE custom_lists RENAME TO custom_lists_unavailable");
  try {
    const response = await call();
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(
      (await response.json()).error,
      "Lists are temporarily unavailable. Please try again later.",
    );
  } finally {
    await pg.exec(
      "ALTER TABLE custom_lists_unavailable RENAME TO custom_lists",
    );
  }
});
