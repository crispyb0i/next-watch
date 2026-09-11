export interface EpisodeProgress {
  season: number | null;
  episode: number | null;
}
export function episodeWatched(
  entries: EpisodeProgress[],
  season: number,
  episode: number,
) {
  return entries.some(
    (entry) =>
      entry.season === null ||
      (entry.season === season &&
        (entry.episode === null || entry.episode === episode)),
  );
}
export function seasonProgress<
  T extends {
    season_number: number;
    episode_number: number;
    air_date: string | null;
  },
>(
  entries: EpisodeProgress[],
  episodes: T[],
  today = new Date().toISOString().slice(0, 10),
) {
  const aired = episodes.filter(
    (episode) => episode.air_date && episode.air_date <= today,
  );
  const watched = aired.filter((episode) =>
    episodeWatched(entries, episode.season_number, episode.episode_number),
  );
  return {
    watched: watched.length,
    total: aired.length,
    next:
      aired.find(
        (episode) =>
          !episodeWatched(
            entries,
            episode.season_number,
            episode.episode_number,
          ),
      ) ?? null,
  };
}
