import type { TrendingItem } from "./tmdb";

/** Multiple roles in one title should still produce one filmography card. */
export function personFilmography(credits: TrendingItem[]): TrendingItem[] {
  const unique = new Map<string, TrendingItem>();
  for (const credit of credits) {
    const key = `${credit.media_type}-${credit.id}`;
    if (!unique.has(key)) unique.set(key, credit);
  }
  return [...unique.values()].sort((a, b) => {
    const dateA = a.media_type === "movie" ? a.release_date : a.first_air_date;
    const dateB = b.media_type === "movie" ? b.release_date : b.first_air_date;
    return (dateB ?? "").localeCompare(dateA ?? "");
  });
}
