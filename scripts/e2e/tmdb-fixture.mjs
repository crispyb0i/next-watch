/** Deterministic local TMDB upstream. No real movie service or image requests. */
import { createServer } from "node:http";

const list = (results) => ({
  page: 1,
  results,
  total_pages: 1,
  total_results: results.length,
});
const provider = {
  provider_id: 900001,
  provider_name: "Local Test Cinema",
  logo_path: null,
  display_priority: 1,
};
const providers = {
  results: {
    US: { link: "https://example.test/watch", flatrate: [provider] },
    GB: { link: "https://example.test/watch", flatrate: [provider] },
  },
};
const common = {
  poster_path: null,
  backdrop_path: null,
  vote_average: 8,
  vote_count: 100,
  overview: "Deterministic local end-to-end test movie data.",
  tagline: "A synthetic test fixture",
  status: "Released",
  homepage: "",
  genres: [{ id: 878, name: "Science Fiction" }],
  videos: { results: [] },
  credits: { cast: [], crew: [] },
  external_ids: {},
  recommendations: list([]),
  similar: list([]),
  "watch/providers": providers,
};

export const fixtureMovies = [
  {
    ...common,
    id: 603,
    title: "The Matrix",
    release_date: "1999-03-31",
    runtime: 136,
    budget: 0,
    revenue: 0,
    release_dates: { results: [] },
    media_type: "movie",
  },
  {
    ...common,
    id: 272,
    title: "Batman Begins",
    release_date: "2005-06-10",
    runtime: 140,
    budget: 0,
    revenue: 0,
    release_dates: { results: [] },
    media_type: "movie",
  },
];

const episodes = [1, 2].map((number) => ({
  id: 63000 + number,
  episode_number: number,
  season_number: 1,
  name: `Local Episode ${number}`,
  overview: "A local episode fixture.",
  air_date: `2011-04-${number === 1 ? "17" : "24"}`,
  runtime: 60,
  still_path: null,
  vote_average: 8,
  vote_count: 100,
  guest_stars: [],
  crew: [],
  external_ids: {},
  videos: { results: [] },
}));
const season = {
  id: 3624,
  season_number: 1,
  name: "Season 1",
  overview: "A local season fixture.",
  air_date: "2011-04-17",
  episode_count: 2,
  poster_path: null,
  episodes,
};
export const fixtureShows = [
  {
    ...common,
    id: 1399,
    name: "Game of Thrones",
    first_air_date: "2011-04-17",
    episode_run_time: [60],
    number_of_seasons: 1,
    number_of_episodes: 2,
    seasons: [season],
    aggregate_credits: { cast: [], crew: [] },
    created_by: [],
    content_ratings: { results: [] },
    media_type: "tv",
  },
];

export async function startTmdbFixture({ port = 0 } = {}) {
  const failures = new Map();
  const stats = { requests: {}, unknownPaths: [] };
  const server = createServer((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    const path = url.pathname.replace(/^\/3(?=\/|$)/, "");
    stats.requests[path] = (stats.requests[path] ?? 0) + 1;
    res.setHeader("content-type", "application/json");
    res.setHeader("cache-control", "no-store");
    const queue = failures.get(path);
    if (queue?.length) {
      res.writeHead(queue.shift());
      res.end(
        JSON.stringify({ status_message: "Temporary local fixture failure." }),
      );
      return;
    }
    let data;
    if (req.method !== "GET") {
      res.writeHead(405);
      res.end(JSON.stringify({ status_message: "Only GET is modeled." }));
      return;
    }
    if (/^\/search\/(multi|movie|tv|person)$/.test(path)) {
      const type = path.split("/")[2];
      const query = (url.searchParams.get("query") ?? "").toLowerCase();
      data = list(
        [...fixtureMovies, ...fixtureShows].filter(
          (item) =>
            (type === "multi" || type === item.media_type) &&
            (item.title ?? item.name).toLowerCase().includes(query),
        ),
      );
    } else if (/^\/trending\/(all|movie|tv|person)\/(day|week)$/.test(path)) {
      const type = path.split("/")[2];
      data = list(
        [...fixtureMovies, ...fixtureShows].filter(
          (item) => type === "all" || type === item.media_type,
        ),
      );
    } else if (
      /^\/movie\/(popular|top_rated|upcoming|now_playing)$/.test(path)
    ) {
      data = list(fixtureMovies);
    } else if (
      /^\/tv\/(popular|top_rated|airing_today|on_the_air)$/.test(path)
    ) {
      data = list(fixtureShows);
    } else if (/^\/watch\/providers\/(movie|tv)$/.test(path)) {
      data = { results: [provider] };
    } else if (/^\/(movie|tv)\/\d+\/watch\/providers$/.test(path)) {
      const [, type, id] = path.split("/");
      if (
        [...fixtureMovies, ...fixtureShows].some(
          (item) => item.id === Number(id) && item.media_type === type,
        )
      )
        data = providers;
    } else if (path === "/tv/1399/season/1") {
      data = season;
    } else if (/^\/tv\/1399\/season\/1\/episode\/[12]$/.test(path)) {
      data = episodes[Number(path.split("/").at(-1)) - 1];
    } else {
      const match = path.match(/^\/(movie|tv)\/(\d+)$/);
      if (match)
        data = [...fixtureMovies, ...fixtureShows].find(
          (item) =>
            item.media_type === match[1] && item.id === Number(match[2]),
        );
    }
    if (!data) {
      stats.unknownPaths.push(path);
      res.writeHead(404);
      res.end(JSON.stringify({ status_message: "Unknown local fixture." }));
      return;
    }
    res.end(JSON.stringify(data));
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  return {
    baseUrl: `http://127.0.0.1:${server.address().port}/3`,
    movies: fixtureMovies,
    shows: fixtureShows,
    controls: {
      stats,
      failNext(path, status = 503) {
        const queue = failures.get(path) ?? [];
        queue.push(status);
        failures.set(path, queue);
      },
    },
    async close() {
      await new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      });
    },
  };
}
