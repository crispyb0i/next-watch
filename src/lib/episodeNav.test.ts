// Run: node --experimental-strip-types src/lib/episodeNav.test.ts
import assert from "node:assert/strict";
import { episodeHref, episodeNeighbours } from "./episodeNav.ts";

const seasons = [
  { season_number: 0, episode_count: 4 }, // specials
  { season_number: 1, episode_count: 7 },
  { season_number: 2, episode_count: 13 },
];

// Middle of a season.
assert.deepEqual(episodeNeighbours(seasons, { season: 1, episode: 3 }), {
  previous: { season: 1, episode: 2 },
  next: { season: 1, episode: 4 },
});

// Season boundary crosses over, skipping specials entirely.
assert.deepEqual(episodeNeighbours(seasons, { season: 1, episode: 7 }).next, {
  season: 2,
  episode: 1,
});
assert.deepEqual(
  episodeNeighbours(seasons, { season: 2, episode: 1 }).previous,
  { season: 1, episode: 7 },
);

// Ends of the run have nowhere to go.
assert.equal(
  episodeNeighbours(seasons, { season: 1, episode: 1 }).previous,
  null,
);
assert.equal(episodeNeighbours(seasons, { season: 2, episode: 13 }).next, null);

// Specials themselves aren't in the chain.
assert.deepEqual(episodeNeighbours(seasons, { season: 0, episode: 1 }), {
  previous: null,
  next: null,
});

// Unaired seasons TMDB reports with 0 episodes don't create dead links.
assert.equal(
  episodeNeighbours([...seasons, { season_number: 3, episode_count: 0 }], {
    season: 2,
    episode: 13,
  }).next,
  null,
);

// Out-of-order input still resolves in airing order.
assert.deepEqual(
  episodeNeighbours([...seasons].reverse(), { season: 1, episode: 7 }).next,
  { season: 2, episode: 1 },
);

assert.equal(
  episodeHref(1396, { season: 2, episode: 1 }),
  "/tv/episode?id=1396&season=2&episode=1",
);

console.log("episodeNav: ok");
