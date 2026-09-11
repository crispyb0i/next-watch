import assert from "node:assert/strict";
import { pagination } from "./pagination.ts";
import { shortlist } from "./nightCandidates.ts";
import { tasteMatches } from "./taste.ts";
import { episodeWatched, seasonProgress } from "./progress.ts";
import { parseLibrary, parseCsv } from "./libraryTransfer.ts";
import { validateTmdb } from "./server/tmdb.ts";
for (const query of [
  "limit=Infinity",
  "offset=NaN",
  "limit=1.5",
  "offset=-1",
  "limit=101",
  "offset=9999999999999999999",
])
  assert.throws(() => pagination(new URLSearchParams(query)));
assert.deepEqual(pagination(new URLSearchParams("limit=25&offset=50")), {
  limit: 25,
  offset: 50,
});
assert.equal(validateTmdb("//evil.test", {}), false);
assert.equal(validateTmdb("/movie/1", { api_key: "not-a-key" }), false);
assert.equal(
  validateTmdb("/movie/1", { append_to_response: "account_states" }),
  false,
);
assert.equal(
  validateTmdb("/search/movie", { query: "Alien", page: "501" }),
  false,
);
assert.equal(
  validateTmdb("/search/movie", { query: "Alien", page: "2" }),
  true,
);
assert.equal(validateTmdb("/tv/1/season/0/episode/1", {}), true);
const saved = [
  { tmdbId: 1, mediaType: "movie", title: "A", poster: null },
  { tmdbId: 1, mediaType: "tv", title: "B", poster: null },
];
assert.deepEqual(
  shortlist([...saved, ...saved], [{ tmdbId: 1, mediaType: "movie" }]),
  [saved[1]],
);
const rows = [1, 2, 3].flatMap((tmdbId) =>
  ["me", "friend"].map((userId) => ({
    userId,
    tmdbId,
    mediaType: "movie",
    rating: 4,
    title: String(tmdbId),
    poster: null,
  })),
);
rows.push({
  userId: "friend",
  tmdbId: 4,
  mediaType: "movie",
  rating: 5,
  title: "New",
  poster: null,
});
const recommendations = tasteMatches("me", rows, { friend: "Pat" });
assert.equal(recommendations.length, 1);
assert.match(recommendations[0].reasons[0], /Pat.*3 shared/);
assert.equal(
  tasteMatches(
    "me",
    rows.filter((row) => row.tmdbId !== 3),
    {},
  ).length,
  0,
);
assert.equal(episodeWatched([{ season: 1, episode: null }], 1, 4), true);
assert.equal(episodeWatched([{ season: 1, episode: 1 }], 2, 1), false);
const episodes = [1, 2, 3].map((episode_number) => ({
  season_number: 1,
  episode_number,
  air_date: episode_number === 3 ? "2099-01-01" : "2020-01-01",
}));
const progress = seasonProgress(
  [
    { season: 1, episode: 1 },
    { season: 1, episode: 1 },
  ],
  episodes,
  "2024-01-01",
);
assert.equal(progress.watched, 1);
assert.equal(progress.total, 2);
assert.equal(progress.next?.episode_number, 2);
assert.throws(() =>
  parseLibrary({
    version: 1,
    favorites: [{ id: -1, title: "A" }],
    watched: [],
  }),
);
assert.throws(() =>
  parseLibrary({
    version: 1,
    favorites: [],
    watched: [{ tmdbId: 1, title: "A", watchedOn: "invalid" }],
  }),
);
assert.deepEqual(parseCsv('Title,Review\r\n"A, B","one\n""two"""\r\n'), [
  { Title: "A, B", Review: 'one\n"two"' },
]);
assert.throws(() => parseCsv('Title\n"unclosed'));
console.log("Audit boundaries: passed");
const { mediaHref } = await import("./mediaHref.ts");
assert.equal(mediaHref("//evil.test", "movie", 1), "/movie?id=1");
assert.equal(mediaHref("/\\evil.test", "tv", 2), "/tv?id=2");
assert.equal(
  mediaHref("/tv/episode?id=10&season=0&episode=2", "movie", 99),
  "/tv/episode?id=10&season=0&episode=2",
);
