import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getTrending,
  posterUrl,
  type TimeWindow,
  type TrendingMediaType,
} from "../lib/tmdb";
import QueryProvider from "./QueryProvider";
import MediaCard from "./MediaCard";
import { PosterGridSkeleton } from "./Skeleton";
import { FilterButton, FilterGroup } from "./FilterButton";

const MEDIA_TYPES: { label: string; value: TrendingMediaType }[] = [
  { label: "All", value: "all" },
  { label: "Movies", value: "movie" },
  { label: "TV", value: "tv" },
];

const TIME_WINDOWS: { label: string; value: TimeWindow }[] = [
  { label: "Today", value: "day" },
  { label: "This week", value: "week" },
];

function TrendingInner() {
  const [mediaType, setMediaType] = useState<TrendingMediaType>("all");
  const [timeWindow, setTimeWindow] = useState<TimeWindow>("day");

  const {
    data: items,
    isPending,
    isError,
  } = useQuery({
    queryKey: ["trending", mediaType, timeWindow],
    queryFn: ({ signal }) => getTrending(mediaType, timeWindow, signal),
    // Keep the old grid on screen while a filter change loads — no flash back
    // to skeletons for data we already have.
    placeholderData: (previous) => previous,
  });

  return (
    <div className="w-full">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-text-primary text-xl font-extrabold tracking-tight">
          Trending
        </h2>
        <label className="relative sm:hidden">
          <span className="sr-only">Trending time window</span>
          <select
            value={timeWindow}
            onChange={(event) =>
              setTimeWindow(event.target.value as TimeWindow)
            }
            className="border-border/60 bg-surface-muted/50 text-text-secondary focus-visible:outline-accent h-11 appearance-none rounded-xl border py-2 pr-8 pl-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            {TIME_WINDOWS.map(({ label, value }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            className="text-text-muted pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2"
          >
            <path
              d="m6 9 6 6 6-6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </label>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <FilterGroup
            label="Media type"
            className="flex w-full sm:w-auto [&>button]:min-h-11 [&>button]:flex-1 sm:[&>button]:min-h-0 sm:[&>button]:flex-none"
          >
            {MEDIA_TYPES.map(({ label, value }) => (
              <FilterButton
                key={value}
                active={mediaType === value}
                onClick={() => setMediaType(value)}
              >
                {label}
              </FilterButton>
            ))}
          </FilterGroup>
          <FilterGroup label="Time window" className="hidden sm:flex">
            {TIME_WINDOWS.map(({ label, value }) => (
              <FilterButton
                key={value}
                active={timeWindow === value}
                onClick={() => setTimeWindow(value)}
              >
                {label}
              </FilterButton>
            ))}
          </FilterGroup>
        </div>
      </div>

      {isError && (
        <p className="rounded-card bg-danger-surface/60 text-danger border-danger/40 mt-6 border px-4 py-3 text-center text-sm">
          Something went wrong. Try again.
        </p>
      )}

      {isPending && <PosterGridSkeleton count={20} className="mt-4 sm:mt-6" />}

      {items && items.length > 0 && (
        <ul className="mt-4 grid grid-cols-2 gap-5 sm:mt-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {items.map((item) =>
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
      )}
    </div>
  );
}

export default function Trending() {
  return (
    <QueryProvider>
      <TrendingInner />
    </QueryProvider>
  );
}
