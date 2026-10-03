import assert from "node:assert/strict";
import test from "node:test";
import type { TrendingItem } from "./tmdb.ts";
import { personFilmography } from "./personCredits.ts";

const movie = (id: number, date = ""): TrendingItem => ({
  id,
  title: `Movie ${id}`,
  media_type: "movie",
  release_date: date,
  poster_path: null,
  overview: "",
  vote_average: 0,
});

const show = (id: number, date = ""): TrendingItem => ({
  id,
  name: `Show ${id}`,
  media_type: "tv",
  first_air_date: date,
  poster_path: null,
  overview: "",
  vote_average: 0,
});

test("filmography merges repeated roles but keeps movie and TV identities separate", () => {
  const film = movie(12, "2025-03-01");
  const series = show(12, "2024-01-01");
  assert.deepEqual(personFilmography([film, { ...film }, series]), [
    film,
    series,
  ]);
});

test("filmography orders both media types by date, places undated credits last and keeps missing artwork", () => {
  const older = movie(1, "2020-01-01");
  const newer = show(2, "2025-06-01");
  const undated = movie(3);
  const credits = [undated, older, newer];
  assert.deepEqual(personFilmography(credits), [newer, older, undated]);
  assert.deepEqual(credits, [undated, older, newer]);
  assert.deepEqual(personFilmography([]), []);
});
