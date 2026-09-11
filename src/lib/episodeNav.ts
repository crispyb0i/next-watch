/** Minimal shapes so this stays testable without TMDB fixtures. */
interface SeasonLike {
  season_number: number;
  episode_count: number;
}

export interface EpisodeRef {
  season: number;
  episode: number;
}

/**
 * Previous/next episode in airing order, crossing season boundaries.
 * Seasons are sorted here because TMDB puts specials (season 0) first, and
 * specials are skipped — nobody wants "next" to jump from S01E07 into a
 * Christmas special.
 */
export function episodeNeighbours(
  seasons: SeasonLike[],
  current: EpisodeRef,
): { previous: EpisodeRef | null; next: EpisodeRef | null } {
  const ordered = seasons
    .filter((season) => season.season_number > 0 && season.episode_count > 0)
    .sort((a, b) => a.season_number - b.season_number);

  const flat: EpisodeRef[] = ordered.flatMap((season) =>
    Array.from({ length: season.episode_count }, (_, index) => ({
      season: season.season_number,
      episode: index + 1,
    })),
  );

  const at = flat.findIndex(
    (ref) => ref.season === current.season && ref.episode === current.episode,
  );
  if (at === -1) return { previous: null, next: null };

  return { previous: flat[at - 1] ?? null, next: flat[at + 1] ?? null };
}

export const episodeHref = (tvId: number, ref: EpisodeRef) =>
  `/tv/episode?id=${tvId}&season=${ref.season}&episode=${ref.episode}`;
