import assert from "node:assert/strict";
import { test } from "node:test";
import {
  activityHref,
  activityLabel,
  fetchRuntime,
  formatRuntime,
  profilePage,
  runtimePath,
} from "./profileActivity.ts";

test("profile activity preserves movie, show, season and special-episode destinations", () => {
  const movie = { tmdbId: 42, mediaType: "movie" as const };
  const show = { tmdbId: 42, mediaType: "tv" as const };
  const season = { ...show, season: 0 };
  const episode = { ...season, episode: 1 };
  assert.deepEqual([movie, show, season, episode].map(activityLabel), [
    "Movie",
    "TV show",
    "Season",
    "Episode",
  ]);
  assert.deepEqual([movie, show, season, episode].map(activityHref), [
    "/movie?id=42",
    "/tv?id=42",
    "/tv/season?id=42&season=0",
    "/tv/episode?id=42&season=0&episode=1",
  ]);
  assert.equal(runtimePath(movie), "/movie/42");
  assert.equal(runtimePath(episode), "/tv/42/season/0/episode/1");
  for (const entry of [
    show,
    season,
    { ...show, episode: 1 },
    { ...episode, episode: 0 },
    { ...episode, season: -1 },
    { ...movie, tmdbId: Infinity },
  ]) {
    assert.equal(runtimePath(entry), null);
  }
});

test("runtime metadata uses the proxy and omits missing or invalid durations", async (t) => {
  const controller = new AbortController();
  let payload: unknown = { runtime: 94 };
  t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
    assert.equal(
      new URL(url, "https://example.test").searchParams.get("path"),
      "/movie/42",
    );
    assert.equal(init.signal, controller.signal);
    return Response.json(payload);
  });
  assert.equal(await fetchRuntime("/movie/42", controller.signal), 94);
  assert.equal(formatRuntime(94), "1h 34m");
  assert.equal(formatRuntime(120), "2h");
  assert.equal(formatRuntime(32), "32 min");
  for (const runtime of [null, 0, -1, "94"]) {
    payload = { runtime };
    assert.equal(await fetchRuntime("/movie/42", controller.signal), null);
  }
  payload = null;
  assert.equal(await fetchRuntime("/movie/42", controller.signal), null);
});

test("runtime failures and cancelled requests stay separate from profile content", async (t) => {
  const fetch = t.mock.method(
    globalThis,
    "fetch",
    async () => new Response(null, { status: 503 }),
  );
  await assert.rejects(fetchRuntime("/movie/42"), /Runtime unavailable/);
  fetch.mock.mockImplementation(async () => {
    throw new TypeError("Network offline");
  });
  await assert.rejects(fetchRuntime("/movie/42"), /Network offline/);
  fetch.mock.mockImplementation(async () => {
    throw new DOMException("Cancelled", "AbortError");
  });
  await assert.rejects(fetchRuntime("/movie/42"), { name: "AbortError" });
  fetch.mock.mockImplementation(async () => new Response("invalid json"));
  await assert.rejects(fetchRuntime("/movie/42"), SyntaxError);
});

test("profile pagination keeps overview and public history scopes separate", () => {
  assert.deepEqual(profilePage(new URLSearchParams()), {
    view: null,
    limit: 12,
    offset: 0,
  });
  assert.deepEqual(profilePage(new URLSearchParams("view=watched&offset=24")), {
    view: "watched",
    limit: 24,
    offset: 24,
  });
  assert.deepEqual(profilePage(new URLSearchParams("view=reviews")), {
    view: "reviews",
    limit: 24,
    offset: 0,
  });
  for (const query of [
    "view=drafts",
    "view=unknown",
    "offset=24",
    "view=reviews&offset=-1",
    "view=watched&offset=NaN",
    "view=reviews&offset=1.5",
    "view=reviews&offset=1000001",
    "view=watched&offset=1",
  ]) {
    assert.throws(() => profilePage(new URLSearchParams(query)));
  }
});
