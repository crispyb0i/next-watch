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

const MEDIA_TYPES: { label: string; value: TrendingMediaType }[] = [
  { label: "All", value: "all" },
  { label: "Movies", value: "movie" },
  { label: "TV", value: "tv" },
];

const TIME_WINDOWS: { label: string; value: TimeWindow }[] = [
  { label: "Today", value: "day" },
  { label: "This week", value: "week" },
];

function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
        active
          ? "bg-accent text-white"
          : "border-border bg-surface text-text-muted hover:text-text-primary border"
      }`}
    >
      {children}
    </button>
  );
}

function TrendingInner() {
  const [mediaType, setMediaType] = useState<TrendingMediaType>("all");
  const [timeWindow, setTimeWindow] = useState<TimeWindow>("day");

  const {
    data: items,
    isFetching,
    isError,
  } = useQuery({
    queryKey: ["trending", mediaType, timeWindow],
    queryFn: ({ signal }) => getTrending(mediaType, timeWindow, signal),
  });

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-text-primary text-lg font-bold">Trending</h2>
        <div className="flex flex-wrap gap-2">
          {MEDIA_TYPES.map(({ label, value }) => (
            <FilterButton
              key={value}
              active={mediaType === value}
              onClick={() => setMediaType(value)}
            >
              {label}
            </FilterButton>
          ))}
          <span className="bg-border mx-1 w-px" aria-hidden="true" />
          {TIME_WINDOWS.map(({ label, value }) => (
            <FilterButton
              key={value}
              active={timeWindow === value}
              onClick={() => setTimeWindow(value)}
            >
              {label}
            </FilterButton>
          ))}
        </div>
      </div>

      {isError && (
        <p className="rounded-card mt-6 border border-red-200 bg-red-50 px-4 py-3 text-center text-sm text-red-600 dark:border-red-900 dark:bg-red-950 dark:text-red-400">
          Something went wrong. Try again.
        </p>
      )}

      {isFetching && !items && (
        <p className="text-text-muted mt-6 text-center text-sm">Loading…</p>
      )}

      {items && items.length > 0 && (
        <ul className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
          {items.map((item) =>
            item.media_type === "movie" ? (
              <MediaCard
                key={`movie-${item.id}`}
                href={`/movie?id=${item.id}`}
                title={item.title}
                subtitle={item.release_date?.slice(0, 4)}
                poster={posterUrl(item.poster_path)}
              />
            ) : (
              <MediaCard
                key={`tv-${item.id}`}
                href={`/tv?id=${item.id}`}
                title={item.name}
                subtitle={item.first_air_date?.slice(0, 4)}
                poster={posterUrl(item.poster_path)}
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
