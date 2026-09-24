export interface TasteRating {
  userId: string;
  tmdbId: number;
  mediaType: string;
  rating: number | null;
  title: string;
  poster: string | null;
}
export function tasteMatches(
  viewer: string,
  rows: TasteRating[],
  names: Record<string, string>,
) {
  const key = (row: TasteRating) => `${row.mediaType}:${row.tmdbId}`;
  const seen = new Set(rows.filter((row) => row.userId === viewer).map(key));
  const byUser = new Map<string, Map<string, TasteRating>>();
  // Callers supply newest reviews first; keep only the latest per user/title.
  for (const row of rows) {
    let map = byUser.get(row.userId);
    if (!map) byUser.set(row.userId, (map = new Map()));
    if (!map.has(key(row))) map.set(key(row), row);
  }
  const mine = byUser.get(viewer) ?? new Map<string, TasteRating>();
  const results = new Map<
    string,
    {
      tmdbId: number;
      mediaType: string;
      title: string;
      poster: string | null;
      score: number;
      reasons: string[];
    }
  >();
  for (const [id, ratings] of byUser) {
    if (id === viewer) continue;
    const common = [...ratings].filter(
      ([k, r]) => r.rating != null && mine.get(k)?.rating != null,
    );
    if (common.length < 3) continue;
    const similarity =
      1 -
      common.reduce(
        (sum, [k, r]) => sum + Math.abs(r.rating! - mine.get(k)!.rating!),
        0,
      ) /
        (common.length * 4.5);
    if (similarity < 0.7) continue;
    for (const [k, row] of ratings) {
      if (
        seen.has(k) ||
        row.rating == null ||
        row.rating < 4 ||
        (row.mediaType !== "movie" && row.mediaType !== "tv")
      )
        continue;
      const reason = `${names[id] ?? "A friend"} rated it ${row.rating}/5; ${Math.round(similarity * 100)}% rating agreement across ${common.length} shared titles.`;
      const existing = results.get(k);
      if (existing) {
        existing.score = Math.max(existing.score, similarity * row.rating);
        existing.reasons.push(reason);
      } else
        results.set(k, {
          tmdbId: row.tmdbId,
          mediaType: row.mediaType,
          title: row.title,
          poster: row.poster,
          score: similarity * row.rating,
          reasons: [reason],
        });
    }
  }
  return [...results.values()]
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
    .slice(0, 30);
}
