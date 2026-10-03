import { pagination } from "./pagination.ts";

export interface ActivityTarget {
  tmdbId: number;
  mediaType: "movie" | "tv";
  season?: number | null;
  episode?: number | null;
}

export function activityLabel(entry: ActivityTarget) {
  if (entry.mediaType === "movie") return "Movie";
  if (entry.episode != null) return "Episode";
  return entry.season != null ? "Season" : "TV show";
}

export function activityHref(entry: ActivityTarget) {
  if (entry.mediaType === "movie") return `/movie?id=${entry.tmdbId}`;
  if (entry.season == null) return `/tv?id=${entry.tmdbId}`;
  const season = `/tv/season?id=${entry.tmdbId}&season=${entry.season}`;
  return entry.episode == null
    ? season
    : `/tv/episode?id=${entry.tmdbId}&season=${entry.season}&episode=${entry.episode}`;
}

export function runtimePath(entry: ActivityTarget): string | null {
  if (!Number.isSafeInteger(entry.tmdbId) || entry.tmdbId <= 0) return null;
  if (entry.mediaType === "movie") return `/movie/${entry.tmdbId}`;
  if (
    entry.season == null ||
    entry.episode == null ||
    !Number.isSafeInteger(entry.season) ||
    !Number.isSafeInteger(entry.episode) ||
    entry.season < 0 ||
    entry.episode <= 0
  )
    return null;
  return `/tv/${entry.tmdbId}/season/${entry.season}/episode/${entry.episode}`;
}

export async function fetchRuntime(path: string, signal?: AbortSignal) {
  const response = await fetch(`/api/tmdb?${new URLSearchParams({ path })}`, {
    signal,
  });
  if (!response.ok) throw new Error("Runtime unavailable");
  const data: { runtime?: unknown } | null = await response.json();
  return typeof data?.runtime === "number" &&
    Number.isFinite(data.runtime) &&
    data.runtime > 0
    ? data.runtime
    : null;
}

export function formatRuntime(minutes: number) {
  const duration = Math.round(minutes);
  if (duration < 60) return `${duration} min`;
  const remainder = duration % 60;
  return `${Math.floor(duration / 60)}h${remainder ? ` ${remainder}m` : ""}`;
}

export function profilePage(params: URLSearchParams): {
  view: "watched" | "reviews" | null;
  limit: number;
  offset: number;
} {
  const view = params.get("view");
  if (view !== null && view !== "watched" && view !== "reviews") {
    throw new Error("Invalid profile view");
  }
  const limit = view ? 24 : 12;
  const { offset } = pagination(
    new URLSearchParams({
      limit: String(limit),
      offset: params.get("offset") ?? "0",
    }),
  );
  if ((!view && offset !== 0) || offset % limit !== 0) {
    throw new Error("Invalid profile page");
  }
  return { view, limit, offset };
}
