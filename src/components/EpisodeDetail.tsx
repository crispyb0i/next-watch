import type { TvShowDetails, EpisodeDetails } from "../lib/tmdb";
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
import ReviewButton from "./ReviewButton";
import AddToListButton from "./AddToListButton";
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
    <div className="min-w-0">
      <dt className="text-text-muted text-xs font-medium">{label}</dt>
      <dd className="text-text-primary mt-1.5 leading-6 font-semibold">
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
  const still = stillUrl(episode.still_path, "original");
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
      <nav
        aria-label="Episode breadcrumb"
        className="text-text-muted flex flex-wrap items-center gap-2 text-sm font-semibold"
      >
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

      {still && (
        <div
          aria-hidden="true"
          className="relative mt-6 aspect-video max-h-[28rem] overflow-hidden rounded-t-2xl"
        >
          <img
            src={still}
            alt=""
            className="h-full w-full object-cover object-center"
          />
          <div className="from-surface/30 to-surface/30 absolute inset-0 bg-linear-to-r via-transparent" />
          <div className="from-surface/0 via-surface/60 to-surface absolute inset-0 bg-linear-to-b from-35% via-70% to-100%" />
        </div>
      )}

      <div className={still ? "relative z-10 -mt-10 sm:-mt-20" : "mt-8"}>
        <p className="text-accent-hover font-mono text-sm font-semibold">
          {code}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-2">
          <h1 className="text-text-primary min-w-0 text-[38px] leading-[1.08] font-black tracking-tight text-balance md:text-[42px] lg:text-[44px]">
            {episode.name}
          </h1>
          {episode.vote_average > 0 && (
            <span
              className="text-star inline-flex shrink-0 items-center gap-1.5 text-lg leading-none font-semibold"
              title="TMDB rating"
            >
              <span aria-hidden="true">★</span>
              <span className="sr-only">TMDB rating: </span>
              <span>
                {(episode.vote_average / 2).toFixed(1)}
                <span className="text-text-muted ml-0.5 text-xs font-normal">
                  /5
                </span>
              </span>
            </span>
          )}
        </div>

        <div className="text-text-muted mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
          {episode.air_date && (
            <time dateTime={episode.air_date}>{episode.air_date}</time>
          )}
          {episode.runtime && <span>{episode.runtime} min</span>}
        </div>

        <div
          role="group"
          aria-label="Episode actions"
          className="mt-5 flex flex-wrap items-center gap-2"
        >
          {/* The episode's own TMDB id, so favoriting an episode never collides
            with favoriting its show. */}
          <FavoriteButton
            compact
            item={{
              id: episode.id,
              title: `${show.name} ${code}`,
              poster:
                stillUrl(episode.still_path) ?? posterUrl(show.poster_path),
              subtitle: episode.name,
              rating: episode.vote_average,
              href: episodeHref(tvId, {
                season: episode.season_number,
                episode: episode.episode_number,
              }),
            }}
            className="shrink-0"
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
          <ReviewButton
            compact
            item={{
              tmdbId: tvId,
              mediaType: "tv",
              season: episode.season_number,
              episode: episode.episode_number,
              title: `${show.name} ${code}`,
              poster: posterUrl(show.poster_path),
              subtitle: episode.name,
            }}
          />
          <AddToListButton
            compact
            item={{
              tmdbId: tvId,
              mediaType: "tv",
              season: episode.season_number,
              episode: episode.episode_number,
              title: `${show.name} ${code}`,
              poster: posterUrl(show.poster_path),
              subtitle: episode.name,
            }}
          />
        </div>

        {episode.overview && (
          <div className="mt-6 max-w-[700px]">
            <h2 className="text-text-primary text-lg font-extrabold tracking-tight">
              Overview
            </h2>
            <p className="text-text-muted mt-2.5 text-[15px] leading-8">
              {episode.overview}
            </p>
          </div>
        )}

        {(directors.length > 0 || writers.length > 0) && (
          <dl className="border-border/50 bg-surface-muted/50 mt-6 grid max-w-[700px] gap-5 rounded-2xl border p-5 text-sm sm:grid-cols-2">
            <CrewLine label="Director" people={directors} />
            <CrewLine label="Writers" people={writers} />
          </dl>
        )}
      </div>

      <CastGrid cast={episode.guest_stars} title="Guest stars" />

      <nav
        aria-label="Episode navigation"
        className="border-border/60 mt-12 flex items-stretch justify-between gap-3 border-t pt-6"
      >
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
