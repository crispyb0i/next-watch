// Run: node --experimental-strip-types src/lib/watchLog.test.ts
import assert from "node:assert/strict";
import { entryHref, parseEntry, todayISO } from "./watchLog.ts";

const base = { tmdbId: 27205, title: "Inception", watchedOn: "2024-05-01" };

const good = parseEntry({
  ...base,
  notes: "  bangs  ",
  venue: "",
  poster: 42,
});
assert.ok(good.ok);
assert.equal(good.value.notes, "bangs");
assert.equal(good.value.poster, null);

// Required fields.
assert.equal(parseEntry({ ...base, tmdbId: 0 }).ok, false);
assert.equal(parseEntry({ ...base, title: "   " }).ok, false);
assert.equal(parseEntry({ ...base, watchedOn: "01/05/2024" }).ok, false);
assert.equal(parseEntry({ ...base, watchedOn: "2024-13-01" }).ok, false);
assert.equal(parseEntry({ ...base, watchedOn: "2999-01-01" }).ok, false);
assert.ok(parseEntry({ ...base, watchedOn: todayISO() }).ok);
assert.equal(parseEntry(null).ok, false);

// Long text is truncated, not rejected.
const long = parseEntry({ ...base, notes: "x".repeat(9000) });
assert.ok(long.ok);
assert.equal(long.value.notes?.length, 5000);

// TV: season/episode are optional, but must be coherent.
const tvBase = { ...base, mediaType: "tv", title: "Severance" };
const wholeShow = parseEntry(tvBase);
assert.ok(wholeShow.ok);
assert.equal(wholeShow.value.season, null);
assert.equal(wholeShow.value.episode, null);

const ep = parseEntry({ ...tvBase, season: 2, episode: 7 });
assert.ok(ep.ok);
assert.equal(ep.value.season, 2);
assert.equal(ep.value.episode, 7);

// Specials live in season 0, so 0 must survive.
const special = parseEntry({ ...tvBase, season: 0, episode: 1 });
assert.ok(special.ok);
assert.equal(special.value.season, 0);

assert.equal(
  parseEntry({ ...tvBase, episode: 7 }).ok,
  false,
  "ep needs season",
);
assert.equal(parseEntry({ ...base, season: 1 }).ok, false, "movies have no S");
for (const season of [-1, 1.5, "2"])
  assert.equal(parseEntry({ ...tvBase, season }).ok, false, `season ${season}`);

// Unknown mediaType falls back to movie rather than failing the save.
const odd = parseEntry({ ...base, mediaType: "book" });
assert.ok(odd.ok);
assert.equal(odd.value.mediaType, "movie");

// Links point at the most specific page that exists.
assert.equal(entryHref({ tmdbId: 1, mediaType: "movie" }), "/movie?id=1");
assert.equal(entryHref({ tmdbId: 1, mediaType: "tv" }), "/tv?id=1");
assert.equal(
  entryHref({ tmdbId: 1, mediaType: "tv", season: 0 }),
  "/tv/season?id=1&season=0",
);

console.log("watchLog: ok");
