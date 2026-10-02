import assert from "node:assert/strict";
import { test } from "node:test";
import { filterWatchlist } from "./watchlist.ts";
import type { Favorite } from "./favorites.ts";

const items: Favorite[] = [
  { id: 1, title: "Zulu", poster: null, rating: null },
  { id: 1, mediaType: "tv", title: "Alpha Show", poster: null, rating: 8 },
  { id: 2, mediaType: "movie", title: "Alpha Movie", poster: null, rating: 8 },
];

test("watchlist search and type filters compose without confusing movie/TV IDs", () => {
  assert.deepEqual(filterWatchlist(items, " ALPHA ", "movie", "saved"), [
    items[2],
  ]);
  assert.deepEqual(filterWatchlist(items, "", "tv", "saved"), [items[1]]);
  assert.deepEqual(filterWatchlist(items, "missing", "all", "saved"), []);
  assert.deepEqual(filterWatchlist(items, "", "movie", "saved"), [
    items[0],
    items[2],
  ]);
});

test("sorting keeps the saved order intact and puts unrated titles last", () => {
  const original = [...items];
  for (const sort of ["title", "rating"] as const) {
    assert.deepEqual(filterWatchlist(items, "", "all", sort), [
      items[2],
      items[1],
      items[0],
    ]);
  }
  assert.deepEqual(filterWatchlist(items, "", "all", "title-desc"), [
    items[0],
    items[1],
    items[2],
  ]);
  assert.deepEqual(items, original);
  assert.deepEqual(filterWatchlist(items, "", "all", "saved"), original);
});
