/** Shape the client posts and the server stores. */
export type MediaType = "movie" | "tv";

export interface WatchEntryInput {
  tmdbId: number;
  mediaType?: MediaType;
  /** TV only. `0` is valid (specials). Null = whole show. */
  season?: number | null;
  /** TV only. Null = whole season or whole show. */
  episode?: number | null;
  title: string;
  poster?: string | null;
  subtitle?: string | null;
  notes?: string | null;
  /** `YYYY-MM-DD`. */
  watchedOn: string;
}

export interface WatchEntry extends WatchEntryInput {
  id: number;
  mediaType: MediaType;
}

/** Where an entry links back to, and how it reads in a list. */
export function entryHref(entry: {
  tmdbId: number;
  mediaType: MediaType;
  season?: number | null;
}) {
  if (entry.mediaType !== "tv") return `/movie?id=${entry.tmdbId}`;
  return entry.season == null
    ? `/tv?id=${entry.tmdbId}`
    : `/tv/season?id=${entry.tmdbId}&season=${entry.season}`;
}

export const todayISO = () => new Date().toISOString().slice(0, 10);

const isDate = (value: unknown) =>
  typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(Date.parse(value));

const str = (value: unknown, max: number) =>
  typeof value === "string" && value.trim() !== ""
    ? value.trim().slice(0, max)
    : null;

/**
 * Trust boundary: the client picks every value here, so parse before insert.
 * Returns the normalised row or an error message.
 */
export function parseEntry(
  body: unknown,
):
  | { ok: true; value: Required<WatchEntryInput> }
  | { ok: false; error: string } {
  const raw = (body ?? {}) as Record<string, unknown>;

  if (!Number.isInteger(raw.tmdbId) || (raw.tmdbId as number) <= 0)
    return { ok: false, error: "tmdbId must be a positive integer" };
  const title = str(raw.title, 300);
  if (!title) return { ok: false, error: "title is required" };
  if (!isDate(raw.watchedOn))
    return { ok: false, error: "watchedOn must be YYYY-MM-DD" };
  const watchedOn = raw.watchedOn as string;
  if (watchedOn > todayISO())
    return { ok: false, error: "watchedOn cannot be in the future" };

  const mediaType = raw.mediaType === "tv" ? "tv" : "movie";

  // Seasons/episodes only mean something on TV, and an episode without a
  // season is unresolvable — reject rather than silently drop it.
  const slot = (value: unknown) =>
    value == null
      ? null
      : Number.isInteger(value) && (value as number) >= 0
        ? (value as number)
        : undefined;
  const season = slot(raw.season);
  const episode = slot(raw.episode);
  if (season === undefined || episode === undefined)
    return {
      ok: false,
      error: "season and episode must be non-negative integers",
    };
  if (mediaType !== "tv" && (season != null || episode != null))
    return { ok: false, error: "season and episode are TV-only" };
  if (episode != null && season == null)
    return { ok: false, error: "episode requires a season" };

  return {
    ok: true,
    value: {
      tmdbId: raw.tmdbId as number,
      mediaType,
      season,
      episode,
      title,
      poster: str(raw.poster, 300),
      subtitle: str(raw.subtitle, 100),
      notes: str(raw.notes, 5000),
      watchedOn,
    },
  };
}
