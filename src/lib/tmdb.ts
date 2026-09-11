const TMDB_BASE_URL = "https://api.themoviedb.org/3";

export interface Movie {
  id: number;
  title: string;
  release_date: string;
  poster_path: string | null;
  overview: string;
  vote_average: number;
}

export interface TvShow {
  id: number;
  name: string;
  first_air_date: string;
  poster_path: string | null;
  overview: string;
  vote_average: number;
}

export interface Genre {
  id: number;
  name: string;
}

export interface Video {
  id: string;
  key: string;
  name: string;
  site: string;
  type: string;
  official: boolean;
  published_at: string;
}

export interface MovieDetails extends Movie {
  backdrop_path: string | null;
  genres: Genre[];
  runtime: number | null;
  tagline: string;
  vote_average: number;
  vote_count: number;
  videos?: { results: Video[] };
}

export interface Season {
  id: number;
  /** 0 for specials. */
  season_number: number;
  name: string;
  overview: string;
  air_date: string | null;
  episode_count: number;
  poster_path: string | null;
}

export interface Episode {
  id: number;
  episode_number: number;
  season_number: number;
  name: string;
  overview: string;
  air_date: string | null;
  runtime: number | null;
  still_path: string | null;
  vote_average: number;
}

export interface SeasonDetails extends Season {
  episodes: Episode[];
}

export interface EpisodeDetails extends Episode {
  vote_count: number;
  guest_stars: CastMember[];
  crew: { id: number; credit_id: string; name: string; job: string }[];
}

export interface TvShowDetails extends TvShow {
  backdrop_path: string | null;
  genres: Genre[];
  episode_run_time: number[];
  number_of_seasons: number;
  number_of_episodes: number;
  seasons: Season[];
  tagline: string;
  vote_average: number;
  vote_count: number;
  videos?: { results: Video[] };
}

export interface CastMember {
  id: number;
  name: string;
  character: string;
  profile_path: string | null;
}

export interface Credits {
  id: number;
  cast: CastMember[];
}

export interface PersonDetails {
  id: number;
  name: string;
  biography: string;
  birthday: string | null;
  deathday: string | null;
  place_of_birth: string | null;
  profile_path: string | null;
  known_for_department: string;
}

export type TrendingMediaType = "all" | "movie" | "tv";
export type TimeWindow = "day" | "week";

export type TrendingItem =
  (Movie & { media_type: "movie" }) | (TvShow & { media_type: "tv" });

interface TmdbListResponse<T> {
  results: T[];
}

async function tmdbFetch<T>(
  path: string,
  params: Record<string, string> = {},
  signal?: AbortSignal,
): Promise<T> {
  const apiKey = import.meta.env.PUBLIC_TMDB_API_KEY;
  const url = new URL(`${TMDB_BASE_URL}${path}`);
  url.searchParams.set("api_key", apiKey);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const res = await fetch(url, { signal });
  if (!res.ok) {
    throw new Error(`TMDB request failed: ${res.status} ${path}`);
  }

  return res.json() as Promise<T>;
}

/** `/search/multi` rows — discriminated by `media_type`. */
export type MultiResult =
  | (Movie & { media_type: "movie" })
  | (TvShow & { media_type: "tv" })
  | {
      media_type: "person";
      id: number;
      name: string;
      profile_path: string | null;
      known_for_department: string | null;
    };

export async function searchMulti(
  query: string,
  signal?: AbortSignal,
): Promise<MultiResult[]> {
  const data = await tmdbFetch<TmdbListResponse<MultiResult>>(
    "/search/multi",

    { query },

    signal,
  );
  return data.results;
}

export async function getTrending(
  mediaType: TrendingMediaType = "all",
  timeWindow: TimeWindow = "day",
  signal?: AbortSignal,
): Promise<TrendingItem[]> {
  const data = await tmdbFetch<TmdbListResponse<TrendingItem>>(
    `/trending/${mediaType}/${timeWindow}`,
    {},
    signal,
  );
  return data.results;
}

export async function getMovieDetails(
  movieId: number,
  signal?: AbortSignal,
): Promise<MovieDetails> {
  return tmdbFetch<MovieDetails>(
    `/movie/${movieId}`,
    { append_to_response: "videos" },
    signal,
  );
}

export async function getTvShowDetails(
  tvId: number,
  signal?: AbortSignal,
): Promise<TvShowDetails> {
  return tmdbFetch<TvShowDetails>(
    `/tv/${tvId}`,
    { append_to_response: "videos" },
    signal,
  );
}

/** TMDB list endpoints that return `Movie` rows. */
export type MovieListName =
  "upcoming" | "now_playing" | "top_rated" | "popular";
/** TMDB list endpoints that return `TvShow` rows. */
export type TvListName =
  "airing_today" | "on_the_air" | "top_rated" | "popular";

export async function getMovieList(
  name: MovieListName,
  signal?: AbortSignal,
): Promise<Movie[]> {
  const data = await tmdbFetch<TmdbListResponse<Movie>>(
    `/movie/${name}`,
    {},
    signal,
  );
  return data.results;
}

export async function getTvList(
  name: TvListName,
  signal?: AbortSignal,
): Promise<TvShow[]> {
  const data = await tmdbFetch<TmdbListResponse<TvShow>>(
    `/tv/${name}`,
    {},
    signal,
  );
  return data.results;
}

export async function getMovieCredits(
  movieId: number,
  signal?: AbortSignal,
): Promise<Credits> {
  return tmdbFetch<Credits>(`/movie/${movieId}/credits`, {}, signal);
}

export async function getSeasonDetails(
  tvId: number,
  seasonNumber: number,
  signal?: AbortSignal,
): Promise<SeasonDetails> {
  return tmdbFetch<SeasonDetails>(
    `/tv/${tvId}/season/${seasonNumber}`,
    {},
    signal,
  );
}

export async function getEpisodeDetails(
  tvId: number,
  seasonNumber: number,
  episodeNumber: number,
  signal?: AbortSignal,
): Promise<EpisodeDetails> {
  return tmdbFetch<EpisodeDetails>(
    `/tv/${tvId}/season/${seasonNumber}/episode/${episodeNumber}`,
    {},
    signal,
  );
}

export async function getTvShowCredits(
  tvId: number,
  signal?: AbortSignal,
): Promise<Credits> {
  return tmdbFetch<Credits>(`/tv/${tvId}/credits`, {}, signal);
}

export async function getPersonDetails(
  personId: number,
  signal?: AbortSignal,
): Promise<PersonDetails> {
  return tmdbFetch<PersonDetails>(`/person/${personId}`, {}, signal);
}

interface CombinedCreditsResponse {
  cast: TrendingItem[];
}

export async function getPersonCredits(
  personId: number,
  signal?: AbortSignal,
): Promise<TrendingItem[]> {
  const data = await tmdbFetch<CombinedCreditsResponse>(
    `/person/${personId}/combined_credits`,
    {},
    signal,
  );
  return data.cast;
}

export function posterUrl(path: string | null, size: "w200" | "w500" = "w200") {
  return path ? `https://image.tmdb.org/t/p/${size}${path}` : null;
}

export function backdropUrl(
  path: string | null,
  size: "w780" | "w1280" | "original" = "w1280",
) {
  return path ? `https://image.tmdb.org/t/p/${size}${path}` : null;
}

export function profileUrl(path: string | null, size: "w185" = "w185") {
  return path ? `https://image.tmdb.org/t/p/${size}${path}` : null;
}

export function stillUrl(path: string | null, size: "w300" | "w780" = "w300") {
  return path ? `https://image.tmdb.org/t/p/${size}${path}` : null;
}

/** Best embeddable trailer: official beats unofficial, trailers beat teasers,
 *  newer beats older. YouTube only — that's all we can embed. */
export function pickTrailer(videos: Video[] | undefined): Video | null {
  const score = (video: Video) =>
    (video.official ? 2 : 0) + (video.type === "Trailer" ? 1 : 0);

  return (
    (videos ?? [])
      .filter(
        (video) =>
          video.site === "YouTube" &&
          (video.type === "Trailer" || video.type === "Teaser"),
      )
      .sort(
        (a, b) =>
          score(b) - score(a) ||
          (b.published_at ?? "").localeCompare(a.published_at ?? ""),
      )[0] ?? null
  );
}

/** `S02E07`, the format everyone already reads. */
export const episodeCode = (season: number, episode: number) =>
  `S${String(season).padStart(2, "0")}E${String(episode).padStart(2, "0")}`;
