import type { TvShowDetails, EpisodeDetails } from "../lib/tmdb";
import { useState } from "react";
import { useShowProgress } from "./ShowProgress";
import { episodeWatched } from "../lib/progress";
import { useQuery } from "@tanstack/react-query";
import {
  episodeCode,
  getEpisodeDetails,
  getTvShowDetails,
  posterUrl,
  stillUrl,
} from "../lib/tmdb";
import { episodeHref, episodeNeighbours } from "../lib/episodeNav";
import QueryProvider from "./QueryProvider";
import { CastGrid } from "./MediaDetail";
import WatchLogButton from "./WatchLogButton";
import FavoriteButton from "./FavoriteButton";
import { DetailSkeleton } from "./Skeleton";

function CrewLine({
  label,
  people,
}: {
  label: string;
  people: { id: number; credit_id: string; name: string }[];
}) {
  if (people.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-x-2">
      <dt className="text-text-primary font-semibold">{label}</dt>
      <dd>
        {people.map((person, index) => (
          <span key={person.credit_id}>
            {index > 0 && ", "}
            <a
              href={`/person?id=${person.id}`}
              className="hover:text-accent underline-offset-2 transition hover:underline"
            >
              {person.name}
            </a>
          </span>
        ))}
      </dd>
    </div>
  );
}

function EpisodeLink({
  tvId,
  target,
  direction,
}: {
  tvId: number;
  target: { season: number; episode: number } | null;
  direction: "previous" | "next";
}) {
  const isNext = direction === "next";
  // Empty span holds the grid position so a lone "Next" stays right-aligned.
  if (!target) return <span />;

  return (
    <a
      href={episodeHref(tvId, target)}
      rel={direction}
      className={`border-border/60 text-text-muted hover:border-accent hover:text-text-primary focus-visible:outline-accent flex flex-col rounded-2xl border px-4 py-3 text-sm transition focus-visible:outline-2 ${
        isNext ? "items-end text-right" : "items-start"
      }`}
    >
      <span className="text-xs font-semibold">
        {isNext ? "Next →" : "← Previous"}
      </span>
      <span className="text-text-primary font-mono text-sm">
        {episodeCode(target.season, target.episode)}
      </span>
    </a>
  );
}

function EpisodeDetailInner({
  tvId,
  seasonNumber,
  episodeNumber,
  initialShow,
  initialData,
}: {
  tvId: number;
  seasonNumber: number;
  episodeNumber: number;
  initialShow?: TvShowDetails;
  initialData?: EpisodeDetails;
}) {
  const progressQuery = useShowProgress(tvId);
  const [revealed, setRevealed] = useState(false);
  const showSpoilers =
    revealed ||
    episodeWatched(progressQuery.data ?? [], seasonNumber, episodeNumber);
  const showQuery = useQuery({
    initialData: initialShow,
    queryKey: ["tv", tvId],
    queryFn: ({ signal }) => getTvShowDetails(tvId, signal),
  });
  const episodeQuery = useQuery({
    initialData,
    queryKey: ["tv-episode", tvId, seasonNumber, episodeNumber],
    queryFn: ({ signal }) =>
      getEpisodeDetails(tvId, seasonNumber, episodeNumber, signal),
  });

  if (showQuery.isError || episodeQuery.isError) {
    return (
      <p className="rounded-card bg-danger-surface/60 text-danger border-danger/40 mx-auto max-w-3xl border px-4 py-3 text-center text-sm">
        Couldn't load this episode.
      </p>
    );
  }

  if (!episodeQuery.data || !showQuery.data) return <DetailSkeleton />;

  const episode = episodeQuery.data;
  const show = showQuery.data;
  const code = episodeCode(episode.season_number, episode.episode_number);
  const still = showSpoilers ? stillUrl(episode.still_path, "w780") : null;
  const aired =
    Boolean(episode.air_date) &&
    episode.air_date! <= new Date().toISOString().slice(0, 10);
  const crewBy = (...jobs: string[]) =>
    episode.crew.filter((member) => jobs.includes(member.job));
  const directors = crewBy("Director");
  const writers = crewBy("Writer", "Story", "Screenplay");
  const { previous, next } = episodeNeighbours(show.seasons ?? [], {
    season: episode.season_number,
    episode: episode.episode_number,
  });

  return (
    <div className="w-full">
      <nav className="text-text-muted flex flex-wrap items-center gap-2 text-sm font-semibold">
        <a href={`/tv?id=${tvId}`} className="hover:text-accent">
          {show.name}
        </a>
        <span aria-hidden="true">/</span>
        <a
          href={`/tv/season?id=${tvId}&season=${seasonNumber}`}
          className="hover:text-accent"
        >
          Season {seasonNumber}
        </a>
      </nav>

      {!episodeWatched(
        progressQuery.data ?? [],
        seasonNumber,
        episodeNumber,
      ) && (
        <button
          className="mt-5 underline"
          onClick={() => setRevealed(!revealed)}
        >
          {revealed ? "Hide spoilers" : "Show episode spoilers"}
        </button>
      )}
      {still && (
        <div className="border-border/50 relative mt-4 aspect-video overflow-hidden rounded-3xl border">
          <img src={still} alt="" className="h-full w-full object-cover" />
          <div className="from-surface via-surface/40 absolute inset-0 bg-linear-to-t to-transparent" />
        </div>
      )}

      <div className="mt-8 flex items-start gap-4">
        <div className="min-w-0">
          <p className="text-text-muted font-mono text-sm">{code}</p>
          <h1 className="text-text-primary mt-1 text-3xl font-black tracking-tighter text-balance sm:text-4xl">
            {episode.name}
          </h1>
        </div>
        {/* The episode's own TMDB id, so favoriting an episode never collides
            with favoriting its show. */}
        <FavoriteButton
          item={{
            id: episode.id,
            title: `${show.name} ${code}`,
            poster: stillUrl(episode.still_path) ?? posterUrl(show.poster_path),
            subtitle: episode.name,
            rating: episode.vote_average,
            href: episodeHref(tvId, {
              season: episode.season_number,
              episode: episode.episode_number,
            }),
          }}
          className="mt-1 shrink-0"
        />
        {aired && (
          <WatchLogButton
            item={{
              tmdbId: tvId,
              mediaType: "tv",
              season: episode.season_number,
              episode: episode.episode_number,
              title: show.name,
              poster: posterUrl(show.poster_path),
              subtitle: `${code} · ${episode.name}`,
            }}
          />
        )}
      </div>

      <div className="text-text-muted mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
        {episode.air_date && (
          <time dateTime={episode.air_date}>{episode.air_date}</time>
        )}
        {episode.runtime && <span>{episode.runtime} min</span>}
        {episode.vote_average > 0 && (
          <span className="text-star border-star/30 bg-star/10 rounded-full border px-2.5 py-0.5 font-bold">
            ★ {episode.vote_average.toFixed(1)}
          </span>
        )}
      </div>

      {showSpoilers && episode.overview && (
        <p className="text-text-muted mt-5 leading-relaxed">
          {episode.overview}
        </p>
      )}

      {(directors.length > 0 || writers.length > 0) && (
        <dl className="text-text-muted mt-6 space-y-1 text-sm">
          <CrewLine label="Directed by" people={directors} />
          <CrewLine label="Written by" people={writers} />
        </dl>
      )}

      {showSpoilers && (
        <CastGrid cast={episode.guest_stars} title="Guest stars" />
      )}

      <nav className="border-border/60 mt-14 flex items-stretch justify-between gap-3 border-t pt-6">
        <EpisodeLink tvId={tvId} target={previous} direction="previous" />
        <EpisodeLink tvId={tvId} target={next} direction="next" />
      </nav>
    </div>
  );
}

export default function EpisodeDetail({
  tvId,
  seasonNumber,
  episodeNumber,
  initialShow,
  initialData,
}: {
  tvId: number | null;
  seasonNumber: number | null;
  episodeNumber: number | null;
  initialShow?: TvShowDetails;
  initialData?: EpisodeDetails;
}) {
  return (
    <QueryProvider>
      {tvId != null && seasonNumber != null && episodeNumber != null ? (
        <EpisodeDetailInner
          initialShow={initialShow}
          initialData={initialData}
          tvId={tvId}
          seasonNumber={seasonNumber}
          episodeNumber={episodeNumber}
        />
      ) : (
        <p className="text-text-muted text-center text-sm">
          No episode specified.
        </p>
      )}
    </QueryProvider>
  );
}
