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
          " globalThis.__jwt ?? null;",
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

const { getFavorites, isFavorite, toggleFavorite, _resetForTest } =
  await import("./favorites.ts");

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
assert.deepEqual(calls, ["DELETE /api/favorites?tmdbId=1"]);

// --- failed request rolls the optimistic update back
ok = false;
_resetForTest();
await toggleFavorite(movie);
assert.equal(isFavorite(1), false, "rolled back after failure");

// --- garbage in storage is filtered, not fatal
ok = true;
(globalThis as any).__jwt = undefined;
store.set("favorites", '[{"id":"nope"},null,{"id":2,"title":"Arrival"}]');
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

console.log("favorites ok");
