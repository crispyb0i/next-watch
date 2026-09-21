import type { TvShowDetails, SeasonDetails } from "../lib/tmdb";
import { useState } from "react";
import { useShowProgress } from "./ShowProgress";
import { episodeWatched, seasonProgress } from "../lib/progress";
import { useQuery } from "@tanstack/react-query";
import {
  episodeCode,
  getSeasonDetails,
  getTvShowDetails,
  posterUrl,
  stillUrl,
  type Episode,
} from "../lib/tmdb";
import QueryProvider from "./QueryProvider";
import WatchLogButton from "./WatchLogButton";
import FavoriteButton from "./FavoriteButton";
import { DetailSkeleton } from "./Skeleton";

const airedYet = (airDate: string | null) =>
  Boolean(airDate) && airDate! <= new Date().toISOString().slice(0, 10);

function EpisodeRow({
  episode,
  showId,
  showName,
  poster,
  watched,
}: {
  episode: Episode;
  showId: number;
  showName: string;
  poster: string | null;
  watched: boolean;
}) {
  const [revealed, setRevealed] = useState(false);
  const showSpoilers = watched || revealed;
  const still = stillUrl(episode.still_path);
  const code = episodeCode(episode.season_number, episode.episode_number);
  const href = `/tv/episode?id=${showId}&season=${episode.season_number}&episode=${episode.episode_number}`;

  return (
    <li className="border-border/60 bg-surface-muted/30 flex flex-col gap-4 rounded-2xl border p-4 sm:flex-row">
      {/* `self-start` keeps the 16:9 box from stretching to the row height. */}
      <a
        href={href}
        className="bg-surface-muted border-border/60 hover:border-accent block w-full shrink-0 self-start overflow-hidden rounded-xl border transition sm:w-44"
      >
        {still ? (
          <img
            src={still}
            alt=""
            loading="lazy"
            decoding="async"
            className="aspect-video w-full object-cover"
          />
        ) : (
          <div className="text-text-muted grid aspect-video w-full place-items-center text-xs">
            No still
          </div>
        )}
      </a>

      <div className="min-w-0 flex-1">
        {watched ? (
          <p className="text-accent text-sm">Watched</p>
        ) : (
          <button
            className="mb-2 text-sm underline"
            onClick={() => setRevealed(!revealed)}
          >
            {revealed ? "Hide spoilers" : "Show episode spoilers"}
          </button>
        )}
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-text-primary font-bold tracking-tight">
            <a href={href} className="hover:text-accent transition">
              <span className="text-text-muted mr-2 font-mono text-xs">
                {code}
              </span>
              {episode.name}
            </a>
          </h3>
          <div className="flex shrink-0 items-center gap-2">
            <FavoriteButton
              item={{
                id: episode.id,
                title: `${showName} ${code}`,
                poster: still ?? poster,
                subtitle: episode.name,
                rating: episode.vote_average,
                href,
              }}
            />
            {airedYet(episode.air_date) && (
              <WatchLogButton
                item={{
                  tmdbId: showId,
                  mediaType: "tv",
                  season: episode.season_number,
                  episode: episode.episode_number,
                  title: showName,
                  poster,
                  subtitle: `${code} · ${episode.name}`,
                }}
              />
            )}
          </div>
        </div>

        <p className="text-text-muted mt-1 flex flex-wrap items-center gap-x-3 text-sm">
          {episode.air_date && (
            <time dateTime={episode.air_date}>{episode.air_date}</time>
          )}
          {episode.runtime && <span>{episode.runtime} min</span>}
          {episode.vote_average > 0 && (
            <span className="text-star">
              ★ {episode.vote_average.toFixed(1)}
            </span>
          )}
        </p>

        {showSpoilers && episode.overview && (
          <p className="text-text-muted mt-2 text-sm leading-relaxed">
            {episode.overview}
          </p>
        )}
      </div>
    </li>
  );
}

function SeasonDetailInner({
  tvId,
  seasonNumber,
  initialShow,
  initialData,
}: {
  tvId: number;
  seasonNumber: number;
  initialShow?: TvShowDetails;
  initialData?: SeasonDetails;
}) {
  const progressQuery = useShowProgress(tvId);
  const showQuery = useQuery({
    initialData: initialShow,
    queryKey: ["tv", tvId],
    queryFn: ({ signal }) => getTvShowDetails(tvId, signal),
  });
  const seasonQuery = useQuery({
    initialData,
    queryKey: ["tv-season", tvId, seasonNumber],
    queryFn: ({ signal }) => getSeasonDetails(tvId, seasonNumber, signal),
  });

  if (showQuery.isError || seasonQuery.isError) {
    return (
      <p className="rounded-card bg-danger-surface/60 text-danger border-danger/40 mx-auto max-w-3xl border px-4 py-3 text-center text-sm">
        Couldn't load this season.
      </p>
    );
  }

  if (!seasonQuery.data || !showQuery.data) return <DetailSkeleton />;

  const season = seasonQuery.data;
  const progress = seasonProgress(progressQuery.data ?? [], season.episodes);
  const show = showQuery.data;
  const poster = posterUrl(season.poster_path ?? show.poster_path, "w500");

  return (
    <div className="w-full">
      <a
        href={`/tv?id=${tvId}`}
        className="text-text-muted hover:text-accent text-sm font-semibold"
      >
        ← {show.name}
      </a>

      <div className="mt-4 flex flex-col gap-6 sm:flex-row sm:items-start">
        <div className="bg-surface-muted border-border/60 w-32 shrink-0 overflow-hidden rounded-2xl border sm:w-40">
          {poster ? (
            <img
              src={poster}
              alt={season.name}
              className="aspect-[2/3] w-full object-cover"
            />
          ) : (
            <div className="text-text-muted grid aspect-[2/3] w-full place-items-center text-sm">
              No image
            </div>
          )}
        </div>

        <div className="min-w-0">
          <h1 className="text-text-primary text-3xl font-black tracking-tighter">
            {season.name}
          </h1>
          <p className="text-text-muted mt-2 flex flex-wrap gap-x-3 text-sm">
            {season.air_date && <span>{season.air_date.slice(0, 4)}</span>}
            <span>
              {season.episodes.length} episode
              {season.episodes.length === 1 ? "" : "s"}
            </span>
          </p>
          {progress.total > 0 &&
            progress.watched === progress.total &&
            season.overview && (
              <p className="text-text-muted mt-4 leading-relaxed">
                {season.overview}
              </p>
            )}
        </div>
      </div>

      {progressQuery.data && (
        <div className="mt-6">
          <p>
            {progress.watched} of {progress.total} aired episodes watched
          </p>
          {progress.next && (
            <a
              className="underline"
              href={`/tv/episode?id=${tvId}&season=${progress.next.season_number}&episode=${progress.next.episode_number}`}
            >
              Next unwatched:{" "}
              {episodeCode(
                progress.next.season_number,
                progress.next.episode_number,
              )}
            </a>
          )}
        </div>
      )}
      {progressQuery.error && (
        <p role="alert">Could not load viewing progress.</p>
      )}
      <ul className="mt-10 space-y-4">
        {season.episodes.map((episode) => (
          <EpisodeRow
            key={episode.id}
            episode={episode}
            watched={episodeWatched(
              progressQuery.data ?? [],
              episode.season_number,
              episode.episode_number,
            )}
            showId={tvId}
            showName={show.name}
            poster={posterUrl(show.poster_path)}
          />
        ))}
      </ul>
    </div>
  );
}

export default function SeasonDetail({
  tvId,
  seasonNumber,
  initialShow,
  initialData,
}: {
  tvId: number | null;
  seasonNumber: number | null;
  initialShow?: TvShowDetails;
  initialData?: SeasonDetails;
}) {
  return (
    <QueryProvider>
      {tvId != null && seasonNumber != null ? (
        <SeasonDetailInner
          initialShow={initialShow}
          initialData={initialData}
          tvId={tvId}
          seasonNumber={seasonNumber}
        />
      ) : (
        <p className="text-text-muted text-center text-sm">
          No season specified.
        </p>
      )}
    </QueryProvider>
  );
}
