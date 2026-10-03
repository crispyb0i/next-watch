import assert from "node:assert/strict";
import { test } from "node:test";
import { nextToWatch } from "./nextToWatch.ts";
import type { Episode, SeasonDetails } from "./tmdb.ts";

const episode = (
  number: number,
  air_date: string | null = "2025-01-01",
  season_number = 1,
): Episode => ({
  id: number,
  episode_number: number,
  season_number,
  air_date,
  name: `Episode ${number}`,
  overview: "",
  runtime: 40,
  still_path: null,
  vote_average: 8,
});
const season = (
  number: number,
  episodes: Episode[],
  air_date: string | null = "2025-01-01",
): SeasonDetails => ({
  id: number,
  season_number: number,
  name: `Season ${number}`,
  air_date,
  episode_count: episodes.length,
  episodes,
  overview: "",
  poster_path: null,
});
const one = season(1, [episode(1), episode(2), episode(3, "2030-01-01")]);

test("next episode uses aired dates, deduplicates rewatches and ignores specials", async () => {
  const result = await nextToWatch(
    [season(0, [episode(1, "2025-01-01", 0)]), one],
    [
      { season: 1, episode: 1 },
      { season: 1, episode: 1 },
    ],
    async (number) => {
      assert.equal(number, 1);
      return one;
    },
    "2026-01-01",
  );
  assert.equal(result.next?.episode_number, 2);
  assert.equal(result.watched, 1);
  assert.equal(result.total, 2);
  assert.equal(result.caughtUp, false);
});

test("caught up excludes unaired episodes and never means finished", async () => {
  const result = await nextToWatch(
    [one],
    [
      { season: 1, episode: 1 },
      { season: 1, episode: 2 },
    ],
    async () => one,
    "2026-01-01",
  );
  assert.equal(result.next, null);
  assert.equal(result.caughtUp, true);
  const future = season(1, [episode(1, "2030-01-01")], "2030-01-01");
  assert.equal(
    (
      await nextToWatch(
        [future],
        [],
        async () => {
          throw new Error("Should not fetch a future season");
        },
        "2026-01-01",
      )
    ).caughtUp,
    false,
  );
});

test("next episode crosses seasons and respects whole-season and whole-show logs", async () => {
  const two = season(2, [episode(1, "2025-02-01", 2)]);
  const result = await nextToWatch(
    [two, one],
    [{ season: 1, episode: null }],
    async (number) => {
      assert.equal(number, 2);
      return two;
    },
    "2026-01-01",
  );
  assert.equal(result.next?.season_number, 2);
  assert.equal(
    (
      await nextToWatch(
        [one, two],
        [{ season: null, episode: null }],
        async () => {
          throw new Error("Whole show already logged");
        },
        "2026-01-01",
      )
    ).caughtUp,
    true,
  );
});

test("unknown dates and upstream failures cannot claim caught up", async () => {
  const unknown = season(1, [episode(1, null)], null);
  assert.equal(
    (await nextToWatch([unknown], [], async () => unknown)).caughtUp,
    false,
  );
  await assert.rejects(
    () =>
      nextToWatch([one], [], async () => {
        throw new Error("Unavailable");
      }),
    /Unavailable/,
  );
  const result = await nextToWatch(
    [one],
    [
      { season: 1, episode: 0 },
      { season: 1, episode: 20 },
      { season: 1, episode: 30 },
    ],
    async () => one,
    "2026-01-01",
  );
  assert.equal(result.next?.episode_number, 1);
});
