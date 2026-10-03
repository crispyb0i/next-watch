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
let syncAllowed = true;
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
  __syncAllowed: () => syncAllowed,
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
            `export const sessionUserId=async()=>globalThis.__viewer();export const syncUser=async()=>globalThis.__syncAllowed();`,
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
    .sort()) {
    if (filename === "0015_review_drafts.sql") {
      await pg.exec(
        "INSERT INTO users (id, email) VALUES ('migration-user', 'migration@example.invalid'); INSERT INTO reviews (user_id, tmdb_id, title, review) VALUES ('migration-user', 1, 'Existing title', 'Existing plain text');",
      );
    }
    if (filename === "0017_season_actions.sql") {
      await pg.exec(
        "INSERT INTO favorites (user_id, tmdb_id, media_type, kind, title) VALUES ('migration-user', 700, 'tv', 'watchlist', 'Existing saved show');",
      );
    }
    await pg.exec(await readFile(`drizzle/${filename}`, "utf8"));
  }
  const [migratedReview] = await db
    .select()
    .from(schema.reviews)
    .where(eq(schema.reviews.userId, "migration-user"));
  assert.equal(migratedReview.status, "published");
  assert.equal(migratedReview.review, "Existing plain text");
  assert.equal(migratedReview.document, null);
  assert.equal(migratedReview.season, null);
  assert.equal(migratedReview.episode, null);
  const [migratedFavorite] = await db
    .select()
    .from(schema.favorites)
    .where(eq(schema.favorites.userId, "migration-user"));
  assert.equal(migratedFavorite.season, -1);
  assert.equal(migratedFavorite.title, "Existing saved show");
  await db.delete(schema.users).where(eq(schema.users.id, "migration-user"));
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
  const reviewApi = await import("../pages/api/reviews.ts");
  const reviewDocument = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "Unfinished thoughts",
            marks: [{ type: "bold" }],
          },
        ],
      },
    ],
  };
  const draftInput = {
    tmdbId: 603,
    title: "The Matrix",
    mediaType: "movie",
    rating: 4.5,
    document: reviewDocument,
    status: "draft",
  };
  const draftResponse = await call(reviewApi.POST, draftInput);
  assert.equal(draftResponse.status, 201);
  const draft = await draftResponse.json();
  assert.equal(draft.status, "draft");
  assert.equal(draft.review, "Unfinished thoughts");
  assert.deepEqual(draft.document, reviewDocument);
  assert.equal((await call(reviewApi.POST, draftInput)).status, 409);
  assert.deepEqual(
    await (await call(reviewApi.GET, undefined, "?tmdbId=603")).json(),
    draft,
  );
  assert.equal((await (await call(reviewApi.GET)).json()).length, 1);
  assert.equal(
    (await (await call(reviewApi.GET, undefined, "?status=published")).json())
      .length,
    0,
  );
  assert.equal(
    (await call(reviewApi.GET, undefined, "?status=other")).status,
    400,
  );
  assert.equal(
    (await call(reviewApi.GET, undefined, "?limit=101")).status,
    400,
  );
  for (const status of ["draft", "all"]) {
    assert.deepEqual(
      await (
        await call(reviewApi.GET, undefined, `?userId=alice&status=${status}`)
      ).json(),
      [],
    );
  }
  viewer = "bob";
  assert.equal((await (await call(reviewApi.GET)).json()).length, 0);
  assert.equal(
    await (await call(reviewApi.GET, undefined, "?tmdbId=603")).json(),
    null,
  );
  assert.equal(
    (await call(reviewApi.PATCH, draftInput, `?id=${draft.id}`)).status,
    404,
  );
  await call(reviewApi.DELETE, undefined, `?id=${draft.id}`);
  assert.equal((await db.select().from(schema.reviews)).length, 1);
  viewer = null;
  assert.deepEqual(
    await (await call(reviewApi.GET, undefined, "?userId=alice")).json(),
    [],
  );
  assert.equal((await call(reviewApi.GET)).status, 401);
  assert.equal((await call(reviewApi.POST, draftInput)).status, 401);
  assert.equal(
    (await call(reviewApi.PATCH, draftInput, `?id=${draft.id}`)).status,
    401,
  );
  assert.equal(
    (await call(reviewApi.DELETE, undefined, `?id=${draft.id}`)).status,
    401,
  );
  viewer = "alice";
  const { status: _status, ...legacyEdit } = draftInput;
  assert.equal(
    (await (await call(reviewApi.PATCH, legacyEdit, `?id=${draft.id}`)).json())
      .status,
    "draft",
  );
  for (const invalid of [
    { status: "secret" },
    { rating: 5.5 },
    { document: { type: "script" } },
    {
      document: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "x".repeat(5001) }],
          },
        ],
      },
    },
  ]) {
    assert.equal(
      (
        await call(
          reviewApi.PATCH,
          { ...draftInput, ...invalid },
          `?id=${draft.id}`,
        )
      ).status,
      400,
    );
  }
  const published = await call(
    reviewApi.PATCH,
    { ...draftInput, status: "published" },
    `?id=${draft.id}`,
  );
  assert.equal(published.status, 200);
  assert.equal((await published.json()).status, "published");
  assert.equal(
    (await (await call(reviewApi.GET, undefined, "?userId=alice")).json())
      .length,
    1,
  );
  assert.equal(
    (await (await call(reviewApi.GET, undefined, "?status=draft")).json())
      .length,
    0,
  );
  assert.equal(
    (await (await call(reviewApi.GET, undefined, "?limit=1&offset=1")).json())
      .length,
    0,
  );
  await call(reviewApi.DELETE, undefined, `?id=${draft.id}`);
  assert.equal((await db.select().from(schema.reviews)).length, 0);
  const legacy = await call(reviewApi.POST, {
    tmdbId: 604,
    title: "Legacy review",
    review: "Plain text",
  });
  assert.equal((await legacy.json()).status, "published");
  await db.delete(schema.reviews);
  // Whole-show, movie, and episode reviews with the same TMDB ID stay separate.
  const episodeInput = {
    tmdbId: 1399,
    mediaType: "tv",
    season: 1,
    episode: 1,
    title: "Example show S01E01",
    subtitle: "The first episode",
    rating: 4,
    document: reviewDocument,
    status: "draft",
  };
  const episodeRows = [];
  for (const target of [
    { mediaType: "tv", season: null, episode: null },
    { mediaType: "movie", season: null, episode: null },
    { season: 1, episode: 1 },
    { season: 1, episode: 2 },
    { season: 2, episode: 1 },
    { season: 0, episode: 1 },
    { season: 1, episode: null },
    { season: 0, episode: null },
  ]) {
    const input = { ...episodeInput, ...target };
    const created = await call(reviewApi.POST, input);
    assert.equal(created.status, 201);
    const row = await created.json();
    episodeRows.push(row);
    const query = new URLSearchParams({
      tmdbId: "1399",
      mediaType: input.mediaType,
    });
    if (input.season !== null) query.set("season", String(input.season));
    if (input.episode !== null) query.set("episode", String(input.episode));
    assert.deepEqual(
      await (await call(reviewApi.GET, undefined, `?${query}`)).json(),
      row,
    );
    assert.equal((await call(reviewApi.POST, input)).status, 409);
  }
  const firstEpisode = episodeRows[2];
  const firstEpisodeQuery = "?tmdbId=1399&mediaType=tv&season=1&episode=1";
  assert.equal(
    await (
      await call(
        reviewApi.GET,
        undefined,
        "?tmdbId=1399&mediaType=tv&season=1&episode=3",
      )
    ).json(),
    null,
  );
  for (const invalid of [
    { season: null },
    { season: -1 },
    { episode: 0 },
    { season: 1.5 },
    { episode: 2.5 },
    { season: "1" },
    { episode: "1" },
    { season: 2_147_483_648 },
    { mediaType: "movie" },
    { mediaType: "episode" },
  ]) {
    assert.equal(
      (await call(reviewApi.POST, { ...episodeInput, ...invalid })).status,
      400,
    );
    assert.equal(
      (
        await call(
          reviewApi.PATCH,
          { ...episodeInput, ...invalid },
          `?id=${firstEpisode.id}`,
        )
      ).status,
      400,
    );
  }
  for (const query of [
    "mediaType=tv&episode=1",
    "mediaType=tv&season=-1&episode=1",
    "mediaType=tv&season=1&episode=0",
    "mediaType=tv&season=&episode=1",
    "mediaType=tv&season=1&episode=abc",
    "mediaType=movie&season=1&episode=1",
  ])
    assert.equal(
      (await call(reviewApi.GET, undefined, `?tmdbId=1399&${query}`)).status,
      400,
    );
  // The database also enforces valid season/episode coordinates.
  for (const target of [
    { season: -1, episode: null },
    { season: null, episode: 1 },
    { season: -1, episode: 1 },
    { season: 1, episode: 0 },
    { mediaType: "movie" as const, season: 1, episode: 1 },
  ])
    await assert.rejects(() =>
      db.insert(schema.reviews).values({
        userId: "alice",
        tmdbId: 9999,
        title: "Invalid",
        mediaType: "tv",
        ...target,
      }),
    );
  // Editing never moves a review onto another episode or the whole show.
  assert.equal(
    (
      await call(
        reviewApi.PATCH,
        { ...episodeInput, episode: 2 },
        `?id=${firstEpisode.id}`,
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await call(
        reviewApi.PATCH,
        { ...episodeInput, season: null, episode: null },
        `?id=${firstEpisode.id}`,
      )
    ).status,
    404,
  );
  viewer = "bob";
  assert.equal(
    await (await call(reviewApi.GET, undefined, firstEpisodeQuery)).json(),
    null,
  );
  assert.equal(
    (await call(reviewApi.PATCH, episodeInput, `?id=${firstEpisode.id}`))
      .status,
    404,
  );
  await call(reviewApi.DELETE, undefined, `?id=${firstEpisode.id}`);
  assert.equal((await db.select().from(schema.reviews)).length, 8);
  assert.equal(
    (
      await (
        await call(reviewApi.GET, undefined, "?userId=alice&status=draft")
      ).json()
    ).length,
    0,
  );
  viewer = null;
  assert.equal(
    (await call(reviewApi.GET, undefined, firstEpisodeQuery)).status,
    401,
  );
  assert.equal((await call(reviewApi.POST, episodeInput)).status, 401);
  assert.equal(
    (await call(reviewApi.PATCH, episodeInput, `?id=${firstEpisode.id}`))
      .status,
    401,
  );
  assert.equal(
    (await call(reviewApi.DELETE, undefined, `?id=${firstEpisode.id}`)).status,
    401,
  );
  viewer = "alice";
  const publishedEpisode = await call(
    reviewApi.PATCH,
    { ...episodeInput, status: "published" },
    `?id=${firstEpisode.id}`,
  );
  assert.equal(publishedEpisode.status, 200);
  const publishedRow = await publishedEpisode.json();
  assert.equal(publishedRow.season, 1);
  assert.equal(publishedRow.episode, 1);
  assert.deepEqual(publishedRow.document, reviewDocument);
  assert.deepEqual(
    await (await call(reviewApi.GET, undefined, "?userId=alice")).json(),
    [publishedRow],
  );
  await call(reviewApi.DELETE, undefined, `?id=${firstEpisode.id}`);
  assert.equal(
    await (await call(reviewApi.GET, undefined, firstEpisodeQuery)).json(),
    null,
  );
  assert.equal((await db.select().from(schema.reviews)).length, 7);
  const seasonRow = episodeRows[6];
  assert.equal(
    (
      await call(
        reviewApi.PATCH,
        { ...episodeInput, season: 0, episode: null },
        `?id=${seasonRow.id}`,
      )
    ).status,
    404,
  );
  const publishedSeason = await call(
    reviewApi.PATCH,
    { ...episodeInput, episode: null, status: "published" },
    `?id=${seasonRow.id}`,
  );
  assert.equal(publishedSeason.status, 200);
  const seasonReview = await publishedSeason.json();
  assert.equal(seasonReview.season, 1);
  assert.equal(seasonReview.episode, null);
  assert.deepEqual(seasonReview.document, reviewDocument);
  assert.deepEqual(
    await (await call(reviewApi.GET, undefined, "?userId=alice")).json(),
    [seasonReview],
  );
  const { reviewHref } = await import("./reviews.ts");
  assert.equal(reviewHref(seasonReview), "/tv/season?id=1399&season=1");
  assert.equal(reviewHref(episodeRows[7]), "/tv/season?id=1399&season=0");
  viewer = "bob";
  assert.equal(
    await (
      await call(reviewApi.GET, undefined, "?tmdbId=1399&mediaType=tv&season=1")
    ).json(),
    null,
  );
  assert.equal(
    (
      await call(
        reviewApi.PATCH,
        { ...episodeInput, episode: null },
        `?id=${seasonRow.id}`,
      )
    ).status,
    404,
  );
  await call(reviewApi.DELETE, undefined, `?id=${seasonRow.id}`);
  viewer = "alice";
  assert.equal(
    (
      await (
        await call(
          reviewApi.GET,
          undefined,
          "?tmdbId=1399&mediaType=tv&season=1",
        )
      ).json()
    ).id,
    seasonRow.id,
  );
  await call(reviewApi.DELETE, undefined, `?id=${seasonRow.id}`);
  assert.equal((await db.select().from(schema.reviews)).length, 6);
  await db.delete(schema.reviews);
  console.log(
    "Episode reviews: isolation, migration, validation, ownership, drafts, publication and deletion passed",
  );
  // A friend's unfinished rating must not become a public recommendation.
  await db
    .insert(schema.follows)
    .values({ followerId: "alice", followeeId: "bob" });
  for (const userId of ["alice", "bob"]) {
    await db.insert(schema.reviews).values(
      [701, 702, 703].map((tmdbId) => ({
        userId,
        tmdbId,
        title: "Shared title",
        rating: 5,
      })),
    );
  }
  const [secret] = await db
    .insert(schema.reviews)
    .values({
      userId: "bob",
      tmdbId: 704,
      title: "Unfinished recommendation",
      rating: 5,
      status: "draft",
    })
    .returning();
  const taste = await import("../pages/api/taste.ts");
  await db.insert(schema.reviews).values({
    userId: "bob",
    tmdbId: 705,
    mediaType: "tv",
    season: 1,
    episode: 1,
    title: "Episode rating should not recommend the whole show",
    rating: 5,
  });
  await db.insert(schema.reviews).values({
    userId: "bob",
    tmdbId: 706,
    mediaType: "tv",
    season: 0,
    title: "Season rating must not recommend the entire show",
    rating: 5,
  });
  assert.deepEqual(await (await call(taste.GET)).json(), []);
  await db
    .update(schema.reviews)
    .set({ status: "published" })
    .where(eq(schema.reviews.id, secret.id));
  const suggestions = await (await call(taste.GET)).json();
  assert.equal(suggestions.length, 1);
  assert.equal(suggestions[0].tmdbId, 704);
  await db.delete(schema.follows);
  await db.delete(schema.reviews);
  console.log(
    "Review draft persistence, publication, validation, ownership and privacy: passed",
  );
  const favoriteApi = await import("../pages/api/favorites.ts");
  const savedShow = { tmdbId: 1399, mediaType: "tv", title: "Example show" };
  for (const kind of ["favorite", "watchlist"]) {
    for (const season of [null, 0, 1, 2]) {
      const input = { ...savedShow, kind, season };
      assert.equal((await call(favoriteApi.POST, input)).status, 201);
      assert.equal((await call(favoriteApi.POST, input)).status, 201);
    }
  }
  const savedRows = await (await call(favoriteApi.GET)).json();
  assert.equal(savedRows.length, 8);
  assert.deepEqual(
    savedRows
      .filter((row: any) => row.kind === "watchlist")
      .map((row: any) => row.season)
      .sort(),
    [0, 1, 2, null].sort(),
  );
  assert.equal(
    savedRows.find((row: any) => row.season === 0).href,
    "/tv/season?id=1399&season=0",
  );
  for (const input of [
    { season: -1 },
    { season: 1.5 },
    { season: "1" },
    { season: 2_147_483_648 },
    { season: 1, mediaType: "movie" },
  ]) {
    assert.equal(
      (await call(favoriteApi.POST, { ...savedShow, ...input })).status,
      400,
    );
  }
  for (const query of ["season=", "season=-1", "season=abc", "season=1.5"]) {
    assert.equal(
      (
        await call(
          favoriteApi.DELETE,
          undefined,
          `?tmdbId=1399&mediaType=tv&${query}`,
        )
      ).status,
      400,
    );
  }
  await assert.rejects(() =>
    db.insert(schema.favorites).values({
      userId: "alice",
      tmdbId: 22,
      mediaType: "movie",
      season: 1,
      title: "Invalid movie season",
    }),
  );
  viewer = "bob";
  assert.deepEqual(await (await call(favoriteApi.GET)).json(), []);
  await call(
    favoriteApi.DELETE,
    undefined,
    "?tmdbId=1399&mediaType=tv&kind=watchlist&season=1",
  );
  viewer = null;
  assert.equal(
    (await call(favoriteApi.POST, { ...savedShow, season: 1 })).status,
    401,
  );
  assert.equal(
    (
      await call(
        favoriteApi.DELETE,
        undefined,
        "?tmdbId=1399&mediaType=tv&season=1",
      )
    ).status,
    401,
  );
  viewer = "alice";
  assert.equal((await (await call(favoriteApi.GET)).json()).length, 8);
  await call(
    favoriteApi.DELETE,
    undefined,
    "?tmdbId=1399&mediaType=tv&kind=watchlist&season=1",
  );
  const remainingSaved = await (await call(favoriteApi.GET)).json();
  assert.equal(remainingSaved.length, 7);
  assert.ok(
    remainingSaved.some(
      (row: any) => row.season === 1 && row.kind === "favorite",
    ),
  );
  assert.ok(
    remainingSaved.some(
      (row: any) => row.season === null && row.kind === "watchlist",
    ),
  );
  assert.ok(
    remainingSaved.some(
      (row: any) => row.season === 2 && row.kind === "watchlist",
    ),
  );
  // Export/import must retain season keys, including specials, and deduplicate.
  await db.delete(schema.favorites);
  const savedExport = { version: 1, watched: [], favorites: savedRows };
  assert.equal(
    (await (await call(library.POST, savedExport)).json()).imported,
    8,
  );
  assert.equal(
    (await (await call(library.POST, savedExport)).json()).imported,
    0,
  );
  const importedSaved = await (await call(favoriteApi.GET)).json();
  assert.equal(importedSaved.filter((row: any) => row.season === 0).length, 2);
  assert.equal(
    importedSaved.find((row: any) => row.season === 1).href,
    "/tv/season?id=1399&season=1",
  );
  assert.equal(
    (
      await call(library.POST, {
        ...savedExport,
        favorites: [{ ...savedRows[0], mediaType: "movie", season: 1 }],
      })
    ).status,
    400,
  );
  await db.delete(schema.favorites);
  console.log(
    "Season favorites/watchlists: migration, identity, deletion, ownership, validation and import round-trip passed",
  );
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
  assert.equal(
    (await (await call(watched.GET, undefined, "?month=2024-01")).json())
      .length,
    1,
  );
  assert.deepEqual(
    await (await call(watched.GET, undefined, "?month=2024-02")).json(),
    [],
  );
  assert.equal(
    (await call(watched.GET, undefined, "?month=2024-13")).status,
    400,
  );
  viewer = null;
  assert.equal(
    (await call(watched.GET, undefined, "?month=2024-01")).status,
    401,
  );
  viewer = "alice";
  assert.equal((await call(watched.GET, undefined, "?limit=1.5")).status, 400);
  await assert.rejects(() =>
    db
      .insert(schema.follows)
      .values({ followerId: "alice", followeeId: "alice" }),
  );
  console.log(
    "Database migrations, ownership, nights, alert transitions, and import retries: passed",
  );

  const statuses = await import("../pages/api/viewing-status.ts");
  const statusInput = {
    tmdbId: 81001,
    title: "A series",
    poster: null,
    status: "watching",
  };
  const ownStatus = async (tmdbId = 81001) =>
    (await (await call(statuses.GET)).json()).find(
      (entry: any) => entry.tmdbId === tmdbId,
    );
  viewer = null;
  assert.equal((await call(statuses.GET)).status, 401);
  assert.equal((await call(statuses.POST, statusInput)).status, 401);
  viewer = "alice";
  for (const invalid of [
    null,
    [],
    {},
    { ...statusInput, status: "__proto__" },
    { ...statusInput, status: "caught_up" },
    { ...statusInput, tmdbId: 0 },
    { ...statusInput, tmdbId: 1.5 },
    { ...statusInput, tmdbId: 2147483648 },
    { ...statusInput, title: " " },
    { ...statusInput, title: "a".repeat(301) },
    { ...statusInput, poster: "javascript:alert(1)" },
  ]) {
    assert.equal((await call(statuses.POST, invalid)).status, 400);
  }
  syncAllowed = false;
  assert.equal((await call(statuses.POST, statusInput)).status, 403);
  syncAllowed = true;
  assert.equal(
    (
      await call(statuses.POST, {
        ...statusInput,
        status: "want_to_watch",
        userId: "bob",
      })
    ).status,
    200,
  );
  assert.equal((await ownStatus()).status, "want_to_watch");
  assert.ok(
    (await (await call(favoriteApi.GET)).json()).some(
      (row: any) => row.id === 81001 && row.kind === "watchlist",
    ),
  );
  // Keep season watchlists and favorites independent from the series status.
  await call(favoriteApi.POST, {
    tmdbId: 81001,
    title: "Season 1",
    mediaType: "tv",
    season: 1,
    kind: "watchlist",
  });
  await call(favoriteApi.POST, {
    tmdbId: 81001,
    title: "A series",
    mediaType: "tv",
    kind: "favorite",
  });
  const episodeLog = {
    tmdbId: 81001,
    mediaType: "tv",
    title: "A series · Pilot",
    season: 1,
    episode: 1,
    watchedOn: "2025-01-01",
  };
  assert.equal((await call(watched.POST, episodeLog)).status, 201);
  assert.equal((await ownStatus()).status, "watching");
  const remaining = (await (await call(favoriteApi.GET)).json()).filter(
    (row: any) => row.id === 81001,
  );
  assert.equal(remaining.length, 2);
  assert.ok(remaining.some((row: any) => row.season === 1));
  assert.ok(remaining.some((row: any) => row.kind === "favorite"));
  const history = await db
    .select()
    .from(schema.watchLog)
    .where(eq(schema.watchLog.tmdbId, 81001));
  for (const status of ["paused", "dropped", "finished", "watching"]) {
    await call(statuses.POST, { ...statusInput, status });
    assert.equal((await ownStatus()).status, status);
    assert.deepEqual(
      await db
        .select()
        .from(schema.watchLog)
        .where(eq(schema.watchLog.tmdbId, 81001)),
      history,
    );
  }
  await call(statuses.POST, { ...statusInput, status: "paused" });
  await call(watched.POST, { ...episodeLog, episode: 2 });
  assert.equal(
    (await ownStatus()).status,
    "paused",
    "logging history must not silently resume a paused series",
  );
  viewer = "bob";
  assert.equal(await ownStatus(), undefined);
  await call(statuses.POST, { ...statusInput, status: "dropped" });
  viewer = "alice";
  assert.equal((await ownStatus()).status, "paused");
  await call(favoriteApi.POST, {
    tmdbId: 81001,
    title: "A series",
    mediaType: "tv",
    kind: "watchlist",
  });
  assert.equal((await ownStatus()).status, "want_to_watch");
  await call(
    favoriteApi.DELETE,
    undefined,
    "?tmdbId=81001&mediaType=tv&kind=watchlist",
  );
  assert.equal(
    (await ownStatus()).status,
    "watching",
    "removing a watchlist entry falls back to existing viewing history",
  );
  await call(watched.POST, { ...episodeLog, season: null, episode: null });
  assert.equal((await ownStatus()).status, "finished");
  // Legacy/imported logs without explicit statuses appear without a backfill.
  await db
    .insert(schema.watchLog)
    .values({ ...episodeLog, tmdbId: 81002, mediaType: "tv", userId: "alice" });
  assert.equal((await ownStatus(81002)).status, "watching");
  assert.equal(
    (await call(statuses.GET)).headers.get("cache-control"),
    "no-store",
  );
  await assert.rejects(() =>
    db.insert(schema.showStatuses).values({
      userId: "alice",
      tmdbId: 81003,
      title: "Invalid",
      status: "unknown" as any,
    }),
  );
  // A failed watchlist write must roll the status change back, too.
  await pg.exec(
    "CREATE FUNCTION reject_status_fixture() RETURNS trigger AS $$ BEGIN IF NEW.tmdb_id = 81004 THEN RAISE EXCEPTION 'fixture failure'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql; CREATE TRIGGER reject_status_fixture BEFORE INSERT ON favorites FOR EACH ROW EXECUTE FUNCTION reject_status_fixture();",
  );
  await assert.rejects(() =>
    call(statuses.POST, {
      ...statusInput,
      tmdbId: 81004,
      status: "want_to_watch",
    }),
  );
  assert.equal(await ownStatus(81004), undefined);
  await pg.exec(
    "DROP TRIGGER reject_status_fixture ON favorites; DROP FUNCTION reject_status_fixture();",
  );
  // A missing migration is recoverable and cannot leave a half-written log.
  const countBeforeFailure = (await db.select().from(schema.watchLog)).length;
  await pg.exec(
    "ALTER TABLE show_statuses RENAME TO unavailable_show_statuses",
  );
  const unavailable = await call(statuses.GET);
  assert.equal(unavailable.status, 503);
  assert.match(
    (await unavailable.json()).error,
    /Viewing statuses are temporarily unavailable/,
  );
  assert.equal((await call(statuses.POST, statusInput)).status, 503);
  await assert.rejects(() =>
    call(watched.POST, { ...episodeLog, tmdbId: 81005 }),
  );
  assert.equal(
    (await db.select().from(schema.watchLog)).length,
    countBeforeFailure,
  );
  await pg.exec(
    "ALTER TABLE unavailable_show_statuses RENAME TO show_statuses",
  );
  console.log(
    "Viewing statuses: migration, validation, ownership, history preservation, legacy progress, watchlist synchronization and atomic rollback passed",
  );
} finally {
  await pg.close();
}
