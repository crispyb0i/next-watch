import type { Favorite, MediaType } from "./favorites";

export type WatchlistType = "all" | MediaType;
export type WatchlistSort = "saved" | "title" | "title-desc" | "rating";

export function filterWatchlist(
  items: readonly Favorite[],
  query: string,
  mediaType: WatchlistType,
  sort: WatchlistSort,
) {
  const search = query.trim().toLocaleLowerCase();
  const result = items.filter(
    (item) =>
      (mediaType === "all" || (item.mediaType ?? "movie") === mediaType) &&
      item.title.toLocaleLowerCase().includes(search),
  );
  const byTitle = (a: Favorite, b: Favorite) =>
    a.title.localeCompare(b.title, undefined, {
      sensitivity: "base",
      numeric: true,
    });

  if (sort === "title") result.sort(byTitle);
  else if (sort === "title-desc") result.sort((a, b) => byTitle(b, a));
  else if (sort === "rating")
    result.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || byTitle(a, b));

  return result;
}
