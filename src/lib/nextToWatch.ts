import {
  episodeWatched,
  seasonProgress,
  type EpisodeProgress,
} from "./progress.ts";
import type { Episode, Season, SeasonDetails } from "./tmdb";

/** Inspect seasons in order; completed seasons need no additional TMDB request. */
export async function nextToWatch(
  seasons: Season[],
  entries: EpisodeProgress[],
  loadSeason: (season: number) => Promise<SeasonDetails>,
  today = new Date().toISOString().slice(0, 10),
): Promise<{
  next: Episode | null;
  watched: number;
  total: number;
  season: number | null;
  caughtUp: boolean;
}> {
  let hasAired = false;
  for (const season of [...seasons]
    .filter((item) => item.season_number > 0)
    .sort((a, b) => a.season_number - b.season_number)) {
    if (
      season.episode_count === 0 ||
      (season.air_date && season.air_date > today)
    )
      continue;
    const fullSeason = entries.some(
      (entry) =>
        entry.season === null ||
        (entry.season === season.season_number && entry.episode === null),
    );
    const loggedCount = new Set(
      entries
        .filter(
          (entry) =>
            entry.season === season.season_number &&
            entry.episode != null &&
            entry.episode > 0 &&
            entry.episode <= season.episode_count,
        )
        .map((entry) => entry.episode),
    ).size;
    if (
      season.air_date &&
      season.air_date <= today &&
      (fullSeason || loggedCount >= season.episode_count)
    ) {
      hasAired = true;
      continue;
    }
    const details = await loadSeason(season.season_number);
    // Always use actual episode air dates: season totals can include future episodes.
    const progress = seasonProgress(entries, details.episodes, today);
    hasAired ||= progress.total > 0;
    if (progress.next)
      return { ...progress, season: season.season_number, caughtUp: false };
    // Unknown air dates are not a reason to claim the viewer is caught up.
    if (
      details.episodes.some(
        (episode) =>
          !episode.air_date &&
          !episodeWatched(
            entries,
            episode.season_number,
            episode.episode_number,
          ),
      )
    ) {
      return {
        next: null,
        watched: 0,
        total: 0,
        season: null,
        caughtUp: false,
      };
    }
  }
  return { next: null, watched: 0, total: 0, season: null, caughtUp: hasAired };
}
