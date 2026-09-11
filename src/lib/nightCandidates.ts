export interface NightCandidate {
  tmdbId: number;
  mediaType: string;
  title: string;
  poster: string | null;
}
export function shortlist(
  saved: NightCandidate[],
  watched: { tmdbId: number; mediaType: string }[],
) {
  const key = (item: { tmdbId: number; mediaType: string }) =>
    `${item.mediaType}:${item.tmdbId}`;
  const seen = new Set(watched.map(key));
  return [
    ...new Map(
      saved
        .filter((item) => !seen.has(key(item)))
        .map((item) => [key(item), item]),
    ).values(),
  ];
}
