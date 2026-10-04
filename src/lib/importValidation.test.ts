import assert from "node:assert/strict";
import test from "node:test";
import { parseEntry } from "./watchLog.ts";
import { parseLibrary } from "./libraryTransfer.ts";

const maxInteger = 2_147_483_647;
const entry = { tmdbId: 1, title: "Local fixture", watchedOn: "2020-02-29" };

test("watch IDs and TV coordinates fit PostgreSQL integer columns", () => {
  for (const value of [maxInteger + 1, Number.MAX_SAFE_INTEGER, Infinity]) {
    assert.equal(parseEntry({ ...entry, tmdbId: value }).ok, false);
    assert.equal(
      parseEntry({ ...entry, mediaType: "tv", season: value }).ok,
      false,
    );
    assert.equal(
      parseEntry({ ...entry, mediaType: "tv", season: 0, episode: value }).ok,
      false,
    );
  }
  assert.equal(parseEntry({ ...entry, tmdbId: maxInteger }).ok, true);
  assert.equal(
    parseEntry({
      ...entry,
      mediaType: "tv",
      season: maxInteger,
      episode: maxInteger,
    }).ok,
    true,
  );
  assert.equal(
    parseEntry({ ...entry, mediaType: "tv", season: 0, episode: 0 }).ok,
    true,
  );
});

test("library validation rejects oversized IDs before accepting a mixed batch", () => {
  const valid = { id: 1, title: "Valid fixture" };
  for (const id of [maxInteger + 1, Number.MAX_SAFE_INTEGER])
    assert.throws(
      () =>
        parseLibrary({
          version: 1,
          favorites: [valid, { ...valid, id }],
          watched: [],
        }),
      /Saved entry 2 is invalid/,
    );
  const result = parseLibrary({
    version: 1,
    favorites: [{ ...valid, id: maxInteger }],
    watched: [],
  });
  assert.equal(result.favorites[0].id, maxInteger);
});

test("library watch import applies the same integer limits as direct logging", () => {
  for (const invalid of [
    { ...entry, tmdbId: maxInteger + 1 },
    { ...entry, mediaType: "tv", season: maxInteger + 1 },
    { ...entry, mediaType: "tv", season: 0, episode: maxInteger + 1 },
  ])
    assert.throws(
      () => parseLibrary({ version: 1, favorites: [], watched: [invalid] }),
      /Watch entry 1:/,
    );
});
