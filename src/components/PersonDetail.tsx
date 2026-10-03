import type { PersonDetails } from "../lib/tmdb";
import { useId, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getPersonCredits,
  getPersonDetails,
  posterUrl,
  profileUrl,
} from "../lib/tmdb";
import QueryProvider from "./QueryProvider";
import MediaCard from "./MediaCard";
import { DetailSkeleton, PosterGridSkeleton } from "./Skeleton";
import { personFilmography } from "../lib/personCredits";
import ImageViewer from "./ImageViewer";

const creditPageSize = 10;

function Biography({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const textId = useId();
  const canExpand = text.length > 900;
  const preview = canExpand
    ? `${text.slice(0, 900).replace(/\s+\S*$/, "")}…`
    : text;

  return (
    <section className="mt-6 max-w-[700px]" aria-label="Biography">
      <h2 className="text-text-primary text-lg font-extrabold tracking-tight">
        Biography
      </h2>
      <p
        id={textId}
        className="text-text-muted mt-2.5 text-[15px] leading-8 whitespace-pre-line"
      >
        {text
          ? expanded
            ? text
            : preview
          : "A biography hasn't been added yet."}
      </p>
      {canExpand && (
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={textId}
          onClick={() => setExpanded(!expanded)}
          className="text-accent-hover hover:text-accent focus-visible:outline-accent mt-2 min-h-11 rounded-lg text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-4"
        >
          {expanded ? "Show less" : "Read full biography"}
          <span aria-hidden="true" className="ml-1.5">
            {expanded ? "↑" : "↓"}
          </span>
        </button>
      )}
    </section>
  );
}

function personalDate(value: string): string {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en-US", {
        dateStyle: "long",
        timeZone: "UTC",
      }).format(date);
}

function Filmography({ personId }: { personId: number }) {
  const [filter, setFilter] = useState<"all" | "movie" | "tv">("all");
  const [visibleCount, setVisibleCount] = useState(creditPageSize);
  const {
    data: credits,
    isPending,
    isError,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ["person-credits", personId],
    queryFn: ({ signal }) => getPersonCredits(personId, signal),
  });

  const titles = personFilmography(credits ?? []);
  const filtered = titles.filter(
    (item) => filter === "all" || item.media_type === filter,
  );
  const filters = [
    { value: "all", label: "All", count: titles.length },
    {
      value: "movie",
      label: "Movies",
      count: titles.filter((item) => item.media_type === "movie").length,
    },
    {
      value: "tv",
      label: "TV shows",
      count: titles.filter((item) => item.media_type === "tv").length,
    },
  ] as const;

  return (
    <section
      aria-labelledby="filmography-heading"
      className="border-border/50 mt-12 border-t pt-8 sm:mt-14"
    >
      <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2
            id="filmography-heading"
            className="text-text-primary text-2xl font-extrabold tracking-tight"
          >
            Filmography
          </h2>
          <p className="text-text-muted mt-1.5 text-sm">
            Movies and TV appearances, newest first.
          </p>
        </div>
        {!isPending && !isError && titles.length > 0 && (
          <div
            role="group"
            aria-label="Filter filmography"
            className="border-border/60 flex w-fit max-w-full flex-wrap gap-1 rounded-2xl border p-1"
          >
            {filters.map(({ value, label, count }) => (
              <button
                key={value}
                type="button"
                aria-pressed={filter === value}
                onClick={() => {
                  setFilter(value);
                  setVisibleCount(creditPageSize);
                }}
                className={`focus-visible:outline-accent min-h-11 rounded-xl px-3 text-sm font-semibold transition focus-visible:outline-2 ${filter === value ? "bg-accent/20 text-accent-hover" : "text-text-muted hover:text-text-primary"}`}
              >
                {label} <span className="ml-1 text-xs opacity-75">{count}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {isPending ? (
        <PosterGridSkeleton count={creditPageSize} />
      ) : isError ? (
        <div className="border-border/60 bg-surface-elevated/60 mt-6 rounded-2xl border p-6 text-center">
          <p role="alert" className="text-text-muted text-sm">
            Couldn't load this filmography.
          </p>
          <button
            type="button"
            disabled={isFetching}
            onClick={() => void refetch()}
            className="text-accent-hover focus-visible:outline-accent mt-2 min-h-11 rounded-lg px-3 text-sm font-semibold focus-visible:outline-2 disabled:opacity-60"
          >
            {isFetching ? "Retrying…" : "Try again"}
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <p
          role="status"
          className="border-border/60 text-text-muted mt-6 rounded-2xl border border-dashed px-6 py-10 text-center text-sm"
        >
          {filter === "all"
            ? "No credits have been added yet."
            : `No ${filter === "movie" ? "movie" : "TV"} credits have been added yet.`}
        </p>
      ) : (
        <>
          <ul className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-5 md:grid-cols-4 lg:grid-cols-5">
            {filtered
              .slice(0, visibleCount)
              .map((item) =>
                item.media_type === "movie" ? (
                  <MediaCard
                    key={`movie-${item.id}`}
                    href={`/movie?id=${item.id}`}
                    title={item.title}
                    subtitle={item.release_date?.slice(0, 4)}
                    poster={posterUrl(item.poster_path)}
                    rating={item.vote_average}
                  />
                ) : (
                  <MediaCard
                    key={`tv-${item.id}`}
                    href={`/tv?id=${item.id}`}
                    title={item.name}
                    subtitle={item.first_air_date?.slice(0, 4)}
                    poster={posterUrl(item.poster_path)}
                    rating={item.vote_average}
                  />
                ),
              )}
          </ul>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <p role="status" className="text-text-muted text-xs">
              Showing {Math.min(visibleCount, filtered.length)} of{" "}
              {filtered.length} titles
            </p>
            {visibleCount < filtered.length && (
              <button
                type="button"
                onClick={() =>
                  setVisibleCount((count) => count + creditPageSize)
                }
                className="border-border/60 text-text-primary hover:border-accent focus-visible:outline-accent min-h-11 rounded-full border px-5 py-2 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-4"
              >
                Show more
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}

function PersonDetailInner({
  personId,
  initialData,
}: {
  personId: number;
  initialData?: PersonDetails;
}) {
  const { data: person, isError } = useQuery({
    initialData,
    queryKey: ["person", personId],
    queryFn: ({ signal }) => getPersonDetails(personId, signal),
  });

  if (isError) {
    return (
      <p className="rounded-card bg-danger-surface/60 text-danger border-danger/40 mx-auto max-w-3xl border px-4 py-3 text-center text-sm">
        Couldn't load this person.
      </p>
    );
  }

  if (!person) return <DetailSkeleton backdrop={false} />;

  const photo = profileUrl(person.profile_path, "h632");

  return (
    <div className="relative w-full">
      <div
        aria-hidden="true"
        className="from-accent/10 pointer-events-none absolute -top-14 -right-4 -left-4 -z-10 h-80 rounded-b-3xl bg-linear-to-b to-transparent sm:-right-6 sm:-left-6"
      />
      <div className="flex flex-col gap-7 md:flex-row md:items-start md:gap-8">
        <div className="bg-surface-muted shadow-card border-border/60 w-52 max-w-full shrink-0 overflow-hidden rounded-2xl border sm:w-60 md:w-[280px]">
          {photo ? (
            <ImageViewer
              src={photo}
              fullSrc={profileUrl(person.profile_path, "original")}
              alt={`${person.name} portrait`}
            />
          ) : (
            <div className="text-text-muted flex aspect-[2/3] w-full items-center justify-center text-sm">
              No photo
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <h1 className="text-text-primary text-[38px] leading-[1.08] font-black tracking-tight text-balance md:text-[42px] lg:text-[44px]">
            {person.name}
          </h1>

          {person.known_for_department && (
            <span className="bg-accent/15 text-accent-hover ring-accent/25 mt-4 inline-flex rounded-full px-3 py-1 text-xs font-semibold ring-1">
              {person.known_for_department}
            </span>
          )}
          <Biography key={personId} text={person.biography} />

          {(person.birthday || person.deathday || person.place_of_birth) && (
            <div className="border-border/50 bg-surface-elevated/60 mt-6 max-w-[700px] rounded-2xl border p-5 sm:px-6">
              <dl className="grid gap-x-6 gap-y-5 text-sm sm:grid-cols-2">
                {person.birthday && (
                  <div>
                    <dt className="text-text-muted text-xs font-medium">
                      Born
                    </dt>
                    <dd className="text-text-primary mt-1.5 font-semibold">
                      <time dateTime={person.birthday}>
                        {personalDate(person.birthday)}
                      </time>
                    </dd>
                  </div>
                )}
                {person.deathday && (
                  <div>
                    <dt className="text-text-muted text-xs font-medium">
                      Died
                    </dt>
                    <dd className="text-text-primary mt-1.5 font-semibold">
                      <time dateTime={person.deathday}>
                        {personalDate(person.deathday)}
                      </time>
                    </dd>
                  </div>
                )}
                {person.place_of_birth && (
                  <div>
                    <dt className="text-text-muted text-xs font-medium">
                      Place of birth
                    </dt>
                    <dd className="text-text-primary mt-1.5 leading-6 font-semibold">
                      {person.place_of_birth}
                    </dd>
                  </div>
                )}
              </dl>
            </div>
          )}
        </div>
      </div>

      <Filmography key={personId} personId={personId} />
    </div>
  );
}

export default function PersonDetail({
  personId,
  initialData,
}: {
  personId: number | null;
  initialData?: PersonDetails;
}) {
  return (
    <QueryProvider>
      {personId ? (
        <PersonDetailInner personId={personId} initialData={initialData} />
      ) : (
        <p className="text-text-muted text-center text-sm">
          No person specified.
        </p>
      )}
    </QueryProvider>
  );
}
