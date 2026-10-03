export type ListItemInput = {
  tmdbId: number;
  mediaType?: "movie" | "tv";
  season?: number | null;
  episode?: number | null;
  title: string;
  poster?: string | null;
  subtitle?: string | null;
};

export type ListItem = ListItemInput & { id: number };
export type ListSummary = {
  id: string;
  title: string;
  description: string;
  shared: boolean;
  itemCount: number;
};
export type ListDetail = Omit<ListSummary, "itemCount"> & {
  ownerName: string;
  isOwner: boolean;
  items: ListItem[];
};

export const validListId = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

export const listHref = (id: string) => `/lists/${encodeURIComponent(id)}`;

export function listItemHref(item: ListItemInput) {
  const type = item.mediaType ?? "movie";
  if (type === "tv" && item.season != null) {
    return item.episode != null
      ? `/tv/episode?id=${item.tmdbId}&season=${item.season}&episode=${item.episode}`
      : `/tv/season?id=${item.tmdbId}&season=${item.season}`;
  }
  return `/${type}?id=${item.tmdbId}`;
}

export function parseListDetails(body: Record<string, unknown>) {
  if (
    typeof body.title !== "string" ||
    !body.title.trim() ||
    body.title.length > 100 ||
    body.title.includes("\u0000")
  )
    return { error: "Enter a list name of 1–100 characters." } as const;
  if (
    typeof body.description !== "string" ||
    body.description.length > 2000 ||
    body.description.includes("\u0000")
  )
    return {
      error: "Enter a description of at most 2,000 characters.",
    } as const;
  if (typeof body.shared !== "boolean")
    return { error: "Choose whether this list is shared." } as const;
  return {
    value: {
      title: body.title.trim(),
      description: body.description.trim(),
      shared: body.shared,
    },
  } as const;
}

export function parseListItem(raw: unknown) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const item = raw as Record<string, unknown>;
  const integer = (n: unknown, min: number) =>
    typeof n === "number" &&
    Number.isInteger(n) &&
    n >= min &&
    n <= 2_147_483_647;
  const mediaType = item.mediaType ?? "movie";
  if (!integer(item.tmdbId, 1) || (mediaType !== "movie" && mediaType !== "tv"))
    return null;
  if (
    typeof item.title !== "string" ||
    !item.title.trim() ||
    item.title.length > 300 ||
    item.title.includes("\u0000")
  )
    return null;
  if (item.season != null && (mediaType !== "tv" || !integer(item.season, 0)))
    return null;
  if (
    item.episode != null &&
    (item.season == null || !integer(item.episode, 1))
  )
    return null;
  if (
    item.subtitle != null &&
    (typeof item.subtitle !== "string" ||
      item.subtitle.length > 300 ||
      item.subtitle.includes("\u0000"))
  )
    return null;
  // Shared lists must not embed arbitrary third-party tracking images.
  if (
    item.poster != null &&
    (typeof item.poster !== "string" ||
      !/^https:\/\/image\.tmdb\.org\/t\/p\/(?:w\d+|original)\/[a-zA-Z0-9_.-]+$/.test(
        item.poster,
      ))
  )
    return null;
  return {
    tmdbId: item.tmdbId as number,
    mediaType: mediaType as "movie" | "tv",
    season: (item.season as number | null | undefined) ?? -1,
    episode: (item.episode as number | null | undefined) ?? -1,
    title: item.title.trim(),
    poster: (item.poster as string | null | undefined) ?? null,
    subtitle: (item.subtitle as string | null | undefined) ?? null,
  };
}
