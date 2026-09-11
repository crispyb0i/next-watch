// Run: node --experimental-strip-types --test src/lib/tmdb.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  flattenAggregateCast,
  movieCertification,
  pickRelated,
  tvCertification,
} from "./tmdb.ts";

test("pickRelated prefers recommendations, falls back to similar", () => {
  const recs = { results: [{ id: 1 }] };
  const similar = { results: [{ id: 2 }] };

  assert.deepEqual(pickRelated(recs, similar), [{ id: 1 }]);
  assert.deepEqual(pickRelated({ results: [] }, similar), [{ id: 2 }]);
  assert.deepEqual(pickRelated(undefined, similar), [{ id: 2 }]);
  assert.deepEqual(pickRelated(undefined, undefined), []);
});

test("flattenAggregateCast keeps first role and drops the roles array", () => {
  const flat = flattenAggregateCast({
    id: 1,
    cast: [
      {
        id: 7,
        name: "Bryan Cranston",
        profile_path: null,
        roles: [
          { character: "Walter White", episode_count: 62 },
          { character: "Heisenberg", episode_count: 3 },
        ],
      },
      { id: 8, name: "Extra", profile_path: null, roles: [] },
    ],
  });

  assert.deepEqual(flat, [
    {
      id: 7,
      name: "Bryan Cranston",
      profile_path: null,
      character: "Walter White",
    },
    { id: 8, name: "Extra", profile_path: null, character: "" },
  ]);
  assert.ok(!("roles" in flat[0]));
});

test("movieCertification prefers theatrical, skips blanks, scopes by region", () => {
  const details = {
    release_dates: {
      results: [
        {
          iso_3166_1: "US",
          release_dates: [
            { certification: "", type: 1 },
            { certification: "R", type: 5 },
            { certification: "PG-13", type: 3 },
          ],
        },
        {
          iso_3166_1: "GB",
          release_dates: [{ certification: "15", type: 5 }],
        },
      ],
    },
  } as any;

  assert.equal(movieCertification(details, "US"), "PG-13");
  // No theatrical entry -> first rated entry.
  assert.equal(movieCertification(details, "GB"), "15");
  assert.equal(movieCertification(details, "JP"), null);
  assert.equal(movieCertification({} as any, "US"), null);
});

test("tvCertification scopes by region and treats empty as missing", () => {
  const details = {
    content_ratings: {
      results: [
        { iso_3166_1: "US", rating: "TV-MA" },
        { iso_3166_1: "DE", rating: "" },
      ],
    },
  } as any;

  assert.equal(tvCertification(details, "US"), "TV-MA");
  assert.equal(tvCertification(details, "DE"), null);
  assert.equal(tvCertification(details, "FR"), null);
  assert.equal(tvCertification({} as any, "US"), null);
});
