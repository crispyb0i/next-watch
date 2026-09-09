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

export interface MovieDetails extends Movie {
  backdrop_path: string | null;
  genres: Genre[];
  runtime: number | null;
  tagline: string;
  vote_average: number;
  vote_count: number;
}

export interface TvShowDetails extends TvShow {
  backdrop_path: string | null;
  genres: Genre[];
  episode_run_time: number[];
  number_of_seasons: number;
  number_of_episodes: number;
  tagline: string;
  vote_average: number;
  vote_count: number;
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

export async function searchMovies(
  query: string,
  signal?: AbortSignal,
): Promise<Movie[]> {
  const data = await tmdbFetch<TmdbListResponse<Movie>>(
    "/search/movie",
    { query },
    signal,
  );
  return data.results;
}

export async function searchTvShows(
  query: string,
  signal?: AbortSignal,
): Promise<TvShow[]> {
  const data = await tmdbFetch<TmdbListResponse<TvShow>>(
    "/search/tv",
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
  return tmdbFetch<MovieDetails>(`/movie/${movieId}`, {}, signal);
}

export async function getTvShowDetails(
  tvId: number,
  signal?: AbortSignal,
): Promise<TvShowDetails> {
  return tmdbFetch<TvShowDetails>(`/tv/${tvId}`, {}, signal);
}

export async function getMovieCredits(
  movieId: number,
  signal?: AbortSignal,
): Promise<Credits> {
  return tmdbFetch<Credits>(`/movie/${movieId}/credits`, {}, signal);
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
  size: "w780" | "w1280" = "w780",
) {
  return path ? `https://image.tmdb.org/t/p/${size}${path}` : null;
}

export function profileUrl(path: string | null, size: "w185" = "w185") {
  return path ? `https://image.tmdb.org/t/p/${size}${path}` : null;
}
