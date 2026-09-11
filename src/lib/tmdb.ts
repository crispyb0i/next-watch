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
  credits?: Credits;
  recommendations?: TmdbListResponse<Movie>;
  similar?: TmdbListResponse<Movie>;
  "watch/providers"?: WatchProvidersResponse;
  release_dates?: { results: ReleaseDatesResult[] };
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
  aggregate_credits?: AggregateCredits;
  recommendations?: TmdbListResponse<TvShow>;
  similar?: TmdbListResponse<TvShow>;
  "watch/providers"?: WatchProvidersResponse;
  content_ratings?: { results: ContentRating[] };
}

export interface WatchProvider {
  provider_id: number;
  provider_name: string;
  logo_path: string | null;
  display_priority: number;
}

export interface WatchProviderCountry {
  link: string;
  /** Subscription streaming. */
  flatrate?: WatchProvider[];
  rent?: WatchProvider[];
  buy?: WatchProvider[];
  /** Ad-supported free. */
  ads?: WatchProvider[];
  free?: WatchProvider[];
}

export interface WatchProvidersResponse {
  results: Record<string, WatchProviderCountry | undefined>;
}

interface ReleaseDatesResult {
  iso_3166_1: string;
  release_dates: { certification: string; type: number }[];
}

interface ContentRating {
  iso_3166_1: string;
  rating: string;
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

/** `/tv` aggregate cast: roles span seasons, so `character` is a list. */
export interface AggregateCredits {
  id: number;
  cast: (Omit<CastMember, "character"> & {
    roles: { character: string; episode_count: number }[];
  })[];
}

/** Aggregate cast -> flat `CastMember`, keeping the most-seen role. */
export function flattenAggregateCast(
  credits: AggregateCredits | undefined,
): CastMember[] {
  return (credits?.cast ?? []).map(({ roles, ...member }) => ({
    ...member,
    character: roles[0]?.character ?? "",
  }));
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

export interface TmdbListResponse<T> {
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
    {
      append_to_response:
        "videos,credits,recommendations,similar,watch/providers,release_dates",
    },
    signal,
  );
}

export async function getTvShowDetails(
  tvId: number,
  signal?: AbortSignal,
): Promise<TvShowDetails> {
  return tmdbFetch<TvShowDetails>(
    `/tv/${tvId}`,
    {
      append_to_response:
        "videos,aggregate_credits,recommendations,similar,watch/providers,content_ratings",
    },
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

export function providerLogoUrl(path: string | null, size: "w92" = "w92") {
  return path ? `https://image.tmdb.org/t/p/${size}${path}` : null;
}

/** Region for region-scoped TMDB data (providers, certifications).
 *  ponytail: browser locale only — swap for a user setting when one exists. */
export function userRegion(): string {
  const region =
    typeof navigator === "undefined"
      ? undefined
      : new Intl.Locale(navigator.language).region;
  return region ?? "US";
}

/** Movie certification (`PG-13`) for a region. Type 3 is theatrical, the one
 *  people recognise; any other entry beats showing nothing. */
export function movieCertification(
  details: MovieDetails,
  region: string,
): string | null {
  const entries =
    details.release_dates?.results.find(
      (result) => result.iso_3166_1 === region,
    )?.release_dates ?? [];

  const rated = entries.filter((entry) => entry.certification);
  const theatrical = rated.find((entry) => entry.type === 3);
  return theatrical?.certification ?? rated[0]?.certification ?? null;
}

/** TV content rating (`TV-MA`) for a region. */
export function tvCertification(
  details: TvShowDetails,
  region: string,
): string | null {
  const rating = details.content_ratings?.results.find(
    (result) => result.iso_3166_1 === region,
  )?.rating;
  return rating || null;
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

/** Recommendations are sparse for obscure titles — fall back to `similar`.
 *  Both come free on the detail request, so this costs nothing. */
export function pickRelated<T>(
  recommendations: TmdbListResponse<T> | undefined,
  similar: TmdbListResponse<T> | undefined,
): T[] {
  const recs = recommendations?.results ?? [];
  return recs.length > 0 ? recs : (similar?.results ?? []);
}

/** `S02E07`, the format everyone already reads. */
export const episodeCode = (season: number, episode: number) =>
  `S${String(season).padStart(2, "0")}E${String(episode).padStart(2, "0")}`;
