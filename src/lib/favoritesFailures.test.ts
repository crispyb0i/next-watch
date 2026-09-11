import assert from "node:assert/strict";
import { registerHooks } from "node:module";
registerHooks({
  resolve(specifier, context, next) {
    if (specifier.endsWith("auth/client"))
      return {
        url: 'data:text/javascript,export const getJWTToken=async()=>"test-token"',
        shortCircuit: true,
      };
    return next(specifier, context);
  },
});
const local = new Map<string, string>();
Object.assign(globalThis, {
  localStorage: {
    getItem: (key: string) => local.get(key) ?? null,
    setItem: (key: string, value: string) => local.set(key, value),
    removeItem: (key: string) => local.delete(key),
  },
});
const { reloadFavorites, toggleFavorite, getFavorites, _resetForTest } =
  await import("./favorites.ts");
const one = { id: 1, title: "One", poster: null },
  two = { id: 2, title: "Two", poster: null };
local.set("favorites", JSON.stringify([one, two]));
globalThis.fetch = async (_url, init) =>
  new Response(JSON.stringify(init?.method === "POST" ? {} : []), {
    status: init?.method === "POST" ? 500 : 200,
  });
await reloadFavorites();
assert.equal(JSON.parse(local.get("favorites")!).length, 2);
assert.equal(getFavorites().length, 2);
globalThis.fetch = async () => {
  throw new TypeError("offline");
};
_resetForTest([]);
assert.equal((await toggleFavorite(one)).ok, false);
assert.deepEqual(getFavorites(), []);
let failFirst: (response: Response) => void = () => {};
globalThis.fetch = async (_url, init) =>
  JSON.parse(String(init?.body)).id === 1
    ? new Promise((resolve) => {
        failFirst = resolve;
      })
    : new Response("{}");
const first = toggleFavorite(one);
await new Promise((resolve) => setTimeout(resolve, 0));
await toggleFavorite(two);
failFirst(new Response("{}", { status: 500 }));
await first;
assert.deepEqual(
  getFavorites().map((item) => item.id),
  [2],
  "unrelated successful save survives rollback",
);
local.clear();
_resetForTest([]);
let active = 0,
  max = 0;
globalThis.fetch = async () => {
  active++;
  max = Math.max(max, active);
  await new Promise((resolve) => setTimeout(resolve, 5));
  active--;
  return new Response("{}");
};
await Promise.all([toggleFavorite(one), toggleFavorite(one)]);
assert.equal(max, 1);
assert.deepEqual(getFavorites(), []);
console.log("Favorites failure paths: passed");
