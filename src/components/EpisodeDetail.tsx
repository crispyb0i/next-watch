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
import { mediaLinks, peopleForJobs } from "../lib/mediaFacts";
import QueryProvider from "./QueryProvider";
import { CastGrid } from "./MediaDetail";
import WatchLogButton from "./WatchLogButton";
import FavoriteButton from "./FavoriteButton";
import ReviewButton from "./ReviewButton";
import AddToListButton from "./AddToListButton";
import { DetailSkeleton } from "./Skeleton";
import Trailer from "./Trailer";

function CrewLine({
  label,
  people,
}: {
  label: string;
  people: { id: number; name: string }[];
}) {
  if (people.length === 0) return null;

  return (
    <div className="min-w-0">
      <dt className="text-text-muted text-xs font-medium">{label}</dt>
      <dd className="text-text-primary mt-1.5 leading-6 font-semibold">
        {people.map((person, index) => (
          <span key={person.id}>
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
  const crew = episode.credits?.crew ?? episode.crew ?? [];
  const directors = peopleForJobs(crew, ["Director"]);
  const writers = peopleForJobs(crew, [
    "Writer",
    "Story",
    "Screenplay",
    "Teleplay",
  ]);
  const crewJobs = [...new Set(crew.map((member) => member.job))]
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
  const links = mediaLinks(undefined, {
    imdb_id: episode.external_ids?.imdb_id,
  });
  const episodeType =
    episode.episode_type === "finale"
      ? "Finale"
      : episode.episode_type === "mid_season"
        ? "Mid-season finale"
        : null;
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

      <header
        className={
          still
            ? "relative mt-6 grid min-h-[22rem] max-w-3xl items-end overflow-hidden rounded-t-2xl sm:aspect-[17/10]"
            : "mt-8"
        }
      >
        {still && (
          <div aria-hidden="true" className="absolute inset-0">
            <img
              src={still}
              alt=""
              className="h-full w-full object-cover object-center"
            />
            <div className="from-surface/30 to-surface/30 absolute inset-0 bg-linear-to-r via-transparent" />
            <div className="from-surface/0 via-surface/80 to-surface absolute inset-0 bg-linear-to-b from-30% via-65% to-100%" />
          </div>
        )}

        <div className={still ? "relative z-10 pt-36 pb-5" : "pb-5"}>
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
                {episode.vote_count > 0 && (
                  <span className="text-text-muted text-xs font-normal">
                    ({episode.vote_count.toLocaleString("en-US")} vote
                    {episode.vote_count === 1 ? "" : "s"})
                  </span>
                )}
              </span>
            )}
          </div>

          <div className="text-text-muted mt-6 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
            {episode.air_date && (
              <time dateTime={episode.air_date}>
                {new Date(`${episode.air_date}T00:00:00Z`).toLocaleDateString(
                  "en-US",
                  {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                    timeZone: "UTC",
                  },
                )}
              </time>
            )}
            {episode.runtime && <span>{episode.runtime} min</span>}
            {episodeType && (
              <span className="bg-accent/15 text-accent-hover rounded-full px-2.5 py-1 text-xs font-semibold">
                {episodeType}
              </span>
            )}
            {links.map((link) => (
              <a
                key={link.label}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-accent underline underline-offset-4"
              >
                {link.label}
              </a>
            ))}
          </div>
        </div>
      </header>

      <div>
        <div
          role="group"
          aria-label="Episode actions"
          className="flex flex-wrap items-center gap-2"
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
          <div className="mt-7 max-w-[700px]">
            <h2 className="text-text-primary text-lg font-extrabold tracking-tight">
              Overview
            </h2>
            <p className="text-text-muted mt-3 text-[15px] leading-8">
              {episode.overview}
            </p>
          </div>
        )}

        {(directors.length > 0 ||
          writers.length > 0 ||
          episode.production_code?.trim()) && (
          <dl className="mt-6 flex max-w-[700px] flex-wrap gap-x-10 gap-y-4 text-sm">
            <CrewLine label="Director" people={directors} />
            <CrewLine label="Writers" people={writers} />
            {episode.production_code?.trim() && (
              <div>
                <dt className="text-text-muted text-xs font-medium">
                  Production code
                </dt>
                <dd className="text-text-primary mt-1.5 font-semibold">
                  {episode.production_code}
                </dd>
              </div>
            )}
          </dl>
        )}
      </div>

      <CastGrid cast={episode.credits?.cast ?? []} expandable />
      <CastGrid
        cast={episode.credits?.guest_stars ?? episode.guest_stars ?? []}
        title="Guest stars"
        expandable
      />

      {crewJobs.length > 0 && (
        <section className="mt-14" aria-labelledby="episode-crew-heading">
          <h2
            id="episode-crew-heading"
            className="text-text-primary text-xl font-extrabold tracking-tight"
          >
            Crew
          </h2>
          <dl className="border-border/50 bg-surface-muted/50 mt-6 grid gap-5 rounded-2xl border p-5 text-sm sm:grid-cols-2 lg:grid-cols-3">
            {crewJobs.map((job) => (
              <CrewLine
                key={job}
                label={job}
                people={peopleForJobs(crew, [job])}
              />
            ))}
          </dl>
        </section>
      )}

      <Trailer videos={episode.videos?.results} />

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
