// Run: node --experimental-strip-types src/lib/favorites.test.ts
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

// Stub the auth client (a browser-only module) before importing the store.
registerHooks({
  resolve(specifier, ctx, next) {
    if (specifier.endsWith("auth/client")) {
      return {
        url:
          "data:text/javascript,export const getJWTToken = async () =>" +
          " globalThis.__getJWT ? globalThis.__getJWT() : globalThis.__jwt ?? null;",
        shortCircuit: true,
      };
    }
    return next(specifier, ctx);
  },
});

const store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => store.set(key, value),
  removeItem: (key: string) => store.delete(key),
};

let calls: string[] = [];
let ok = true;
(globalThis as any).fetch = async (url: string, init: any = {}) => {
  calls.push(`${init.method ?? "GET"} ${url}`);
  assert.match(init.headers?.authorization ?? "", /^Bearer /, "needs token");
  return { ok, json: async () => [] };
};

const {
  getFavorites,
  isFavorite,
  saved,
  toggleFavorite,
  reloadFavorites,
  setFavoritesUserId,
  _resetForTest,
} = await import("./favorites.ts");

const movie = { id: 1, title: "Dune", poster: null };

// --- signed out: localStorage only, no network
(globalThis as any).__jwt = undefined;
_resetForTest();
await toggleFavorite(movie);
assert.equal(isFavorite(1), true);
assert.deepEqual(calls, [], "no fetch while signed out");
assert.equal(JSON.parse(store.get("favorites")!).length, 1);

await toggleFavorite(movie); // toggles off, no duplicate
assert.equal(isFavorite(1), false);

// --- signed in: hits the API, no localStorage write
(globalThis as any).__jwt = "jwt";
store.clear();
calls = [];
_resetForTest();
await toggleFavorite(movie);
assert.deepEqual(calls, ["POST /api/favorites"]);
assert.equal(store.has("favorites"), false);

calls = [];
await toggleFavorite(movie);
assert.deepEqual(calls, [
  "DELETE /api/favorites?tmdbId=1&mediaType=movie&kind=favorite",
]);

// --- a show and a movie sharing a TMDB id are separate favorites
calls = [];
_resetForTest();
const show = {
  id: 1,
  mediaType: "tv" as const,
  title: "Dune: The Sisterhood",
  poster: null,
};
await toggleFavorite(movie);
await toggleFavorite(show);
assert.equal(isFavorite(1), true, "movie still favorited");
assert.equal(isFavorite(1, "tv"), true, "show favorited too");

await toggleFavorite(show);
assert.equal(isFavorite(1, "tv"), false, "show removed");
assert.equal(isFavorite(1), true, "movie untouched by the show's removal");
assert.deepEqual(
  calls.at(-1),
  "DELETE /api/favorites?tmdbId=1&mediaType=tv&kind=favorite",
);

// --- favorite and watchlist are independent lists for the same title
calls = [];
_resetForTest();
const wish = { ...movie, kind: "watchlist" as const };
await toggleFavorite(movie);
await toggleFavorite(wish);
assert.equal(isFavorite(1), true, "favorited");
assert.equal(isFavorite(1, "movie", "watchlist"), true, "watchlisted");
assert.deepEqual(
  saved("watchlist").map((item) => item.id),
  [1],
);
assert.deepEqual(
  saved("favorite").map((item) => item.id),
  [1],
);

await toggleFavorite(wish);
assert.equal(isFavorite(1, "movie", "watchlist"), false, "watchlist removed");
assert.equal(isFavorite(1), true, "favorite untouched");
assert.equal(
  calls.at(-1),
  "DELETE /api/favorites?tmdbId=1&mediaType=movie&kind=watchlist",
);

// --- failed request rolls the optimistic update back
ok = false;
_resetForTest();
await toggleFavorite(movie);
assert.equal(isFavorite(1), false, "rolled back after failure");

// --- series, seasons (including specials), and list kinds are independent.
ok = true;
_resetForTest();
const seasonOne = { ...show, season: 1, title: "Dune · Season 1" };
const seasonTwo = { ...show, season: 2, title: "Dune · Season 2" };
const specials = { ...show, season: 0, title: "Dune · Specials" };
await toggleFavorite(show);
await toggleFavorite(seasonOne);
await toggleFavorite(seasonTwo);
await toggleFavorite(specials);
await toggleFavorite({ ...seasonOne, kind: "watchlist" });
assert.equal(getFavorites().length, 5);
assert.equal(isFavorite(1, "tv"), true);
assert.equal(isFavorite(1, "tv", "favorite", 0), true);
assert.equal(isFavorite(1, "tv", "favorite", 1), true);
ok = false;
await toggleFavorite(seasonOne);
assert.equal(
  isFavorite(1, "tv", "favorite", 1),
  true,
  "failed season removal rolls back",
);
assert.equal(
  isFavorite(1, "tv"),
  true,
  "failed season removal leaves the series alone",
);
ok = true;
await toggleFavorite(seasonOne);
assert.equal(isFavorite(1, "tv", "favorite", 1), false);
assert.equal(isFavorite(1, "tv", "favorite", 2), true);
assert.equal(isFavorite(1, "tv", "watchlist", 1), true);
assert.equal(
  calls.at(-1),
  "DELETE /api/favorites?tmdbId=1&mediaType=tv&kind=favorite&season=1",
);
await toggleFavorite(specials);
assert.equal(
  calls.at(-1),
  "DELETE /api/favorites?tmdbId=1&mediaType=tv&kind=favorite&season=0",
);

// --- garbage in storage is filtered, not fatal
ok = true;
(globalThis as any).__jwt = undefined;
store.set(
  "favorites",
  '[{"id":"nope"},null,{"id":2,"title":"Arrival","kind":"evil"}]',
);
_resetForTest();
await toggleFavorite({ id: 3, title: "Her", poster: null });
assert.deepEqual(
  getFavorites()
    .map((item) => item.id)
    .sort(),
  [3],
);

store.set("favorites", "not json");
_resetForTest();
assert.deepEqual(getFavorites(), []);

// --- account rows never become guest saves or migrate to the next account.
const jwtFor = (sub: string) =>
  `header.${Buffer.from(JSON.stringify({ sub })).toString("base64url")}.signature`;
const accountA = {
  id: 101,
  title: "A private watchlist",
  poster: null,
  kind: "watchlist" as const,
};
const accountB = { id: 202, title: "B favorite", poster: null };
const guest = { id: 303, title: "Guest save", poster: null };
const writes: { token: string; method: string; id: number }[] = [];
const accountFetch: typeof fetch = async (_url, init) => {
  const authorization = (init?.headers as Record<string, string>).authorization;
  const method = init?.method ?? "GET";
  if (method !== "GET") {
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    writes.push({ token: authorization, method, id: body?.id ?? 0 });
    return new Response("{}");
  }
  return new Response(
    JSON.stringify(
      authorization === `Bearer ${jwtFor("a")}` ? [accountA] : [accountB],
    ),
  );
};
store.clear();
_resetForTest();
(globalThis as any).__jwt = jwtFor("a");
globalThis.fetch = accountFetch;
await reloadFavorites();
assert.deepEqual(getFavorites(), [accountA]);
(globalThis as any).__jwt = null;
await toggleFavorite(guest);
assert.deepEqual(
  JSON.parse(store.get("favorites")!),
  [guest],
  "signed-out writes contain no former account rows",
);
(globalThis as any).__jwt = jwtFor("b");
await reloadFavorites();
assert.deepEqual(
  writes,
  [{ token: `Bearer ${jwtFor("b")}`, method: "POST", id: guest.id }],
  "only guest data migrates to the next account",
);
assert.deepEqual(
  JSON.parse(store.get("favorites")!),
  [],
  "successful guest imports clear their local copy",
);
assert.deepEqual(getFavorites(), [accountB]);

// Direct switches must decide add/remove using the new account's rows.
(globalThis as any).__jwt = jwtFor("a");
await reloadFavorites();
(globalThis as any).__jwt = jwtFor("b");
writes.length = 0;
await toggleFavorite(accountA);
assert.equal(
  writes[0].method,
  "POST",
  "an A-only favorite is added to B, not deleted based on A's stale cache",
);
assert.equal(writes[0].token, `Bearer ${jwtFor("b")}`);

// A late A load cannot overwrite B after the session observer has switched.
store.clear();
_resetForTest();
let releaseLoad!: (response: Response) => void;
let startedLoad!: () => void;
const loadStarted = new Promise<void>((resolve) => {
  startedLoad = resolve;
});
(globalThis as any).__jwt = jwtFor("a");
globalThis.fetch = async (url, init) => {
  if (
    (init?.headers as Record<string, string>).authorization ===
    `Bearer ${jwtFor("a")}`
  ) {
    startedLoad();
    return new Promise<Response>((resolve) => {
      releaseLoad = resolve;
    });
  }
  return accountFetch(url, init);
};
const oldLoad = reloadFavorites();
await loadStarted;
(globalThis as any).__jwt = jwtFor("b");
setFavoritesUserId("b");
assert.deepEqual(
  getFavorites(),
  [],
  "session changes clear private rows immediately",
);
await reloadFavorites();
releaseLoad(new Response(JSON.stringify([accountA])));
await oldLoad;
assert.deepEqual(
  getFavorites(),
  [accountB],
  "late A response cannot replace B's cache",
);

// A late failed delete cannot restore A's removed item into B's cache.
(globalThis as any).__jwt = jwtFor("a");
globalThis.fetch = accountFetch;
await reloadFavorites();
let releaseDelete!: (response: Response) => void;
let startedDelete!: () => void;
const deleteStarted = new Promise<void>((resolve) => {
  startedDelete = resolve;
});
globalThis.fetch = async (url, init) => {
  if (init?.method === "DELETE") {
    startedDelete();
    return new Promise<Response>((resolve) => {
      releaseDelete = resolve;
    });
  }
  return accountFetch(url, init);
};
const oldDelete = toggleFavorite(accountA);
await deleteStarted;
(globalThis as any).__jwt = jwtFor("b");
setFavoritesUserId("b");
await reloadFavorites();
releaseDelete(new Response("{}", { status: 500 }));
assert.equal((await oldDelete).ok, false);
assert.deepEqual(
  getFavorites(),
  [accountB],
  "old account rollback cannot contaminate the new cache",
);

// If auth changes during a request without an observer, response checks still clear A.
(globalThis as any).__jwt = jwtFor("a");
setFavoritesUserId("a");
await reloadFavorites();
let releaseUnobserved!: (response: Response) => void;
let startedUnobserved!: () => void;
const unobservedStarted = new Promise<void>((resolve) => {
  startedUnobserved = resolve;
});
globalThis.fetch = async (url, init) => {
  if (
    (init?.headers as Record<string, string>).authorization ===
    `Bearer ${jwtFor("a")}`
  ) {
    startedUnobserved();
    return new Promise<Response>((resolve) => {
      releaseUnobserved = resolve;
    });
  }
  return accountFetch(url, init);
};
const unobservedLoad = reloadFavorites();
await unobservedStarted;
(globalThis as any).__jwt = jwtFor("b");
releaseUnobserved(new Response(JSON.stringify([accountA])));
await unobservedLoad;
await reloadFavorites();
assert.deepEqual(getFavorites(), [accountB]);
// A click whose initial token is delayed must not be rebound to a new account.
(globalThis as any).__jwt = jwtFor("a");
globalThis.fetch = accountFetch;
await reloadFavorites();
let releaseToken!: (jwt: string) => void;
let startedToken!: () => void;
const tokenStarted = new Promise<void>((resolve) => {
  startedToken = resolve;
});
(globalThis as any).__getJWT = () => {
  startedToken();
  delete (globalThis as any).__getJWT;
  return new Promise<string>((resolve) => {
    releaseToken = resolve;
  });
};
writes.length = 0;
const oldClick = toggleFavorite(accountA);
await tokenStarted;
(globalThis as any).__jwt = jwtFor("b");
setFavoritesUserId("b");
await reloadFavorites();
releaseToken(jwtFor("a"));
assert.equal(
  (await oldClick).ok,
  false,
  "an old account's click is cancelled during token acquisition",
);
assert.deepEqual(
  writes,
  [],
  "an old click never writes with the new account's token",
);
assert.deepEqual(getFavorites(), [accountB]);

// Token outages preserve account ownership and are handled by fire-and-forget loads.
(globalThis as any).__getJWT = () => {
  throw new TypeError("Auth unavailable");
};
await reloadFavorites();
assert.equal((await toggleFavorite(accountA)).ok, false);
assert.deepEqual(getFavorites(), [accountB]);
assert.deepEqual(JSON.parse(store.get("favorites") ?? "[]"), []);
delete (globalThis as any).__getJWT;
console.log("favorites ok (including account transitions and stale responses)");
