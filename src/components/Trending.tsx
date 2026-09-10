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
          ? "bg-accent text-accent-contrast shadow-sm"
          : "text-text-muted hover:text-text-primary"
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
    <div className="w-full">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-text-primary text-xl font-extrabold tracking-tight">
          Trending
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <div className="border-border/60 bg-surface-muted/50 flex gap-1 rounded-full border p-1 backdrop-blur">
            {MEDIA_TYPES.map(({ label, value }) => (
              <FilterButton
                key={value}
                active={mediaType === value}
                onClick={() => setMediaType(value)}
              >
                {label}
              </FilterButton>
            ))}
          </div>
          <div className="border-border/60 bg-surface-muted/50 flex gap-1 rounded-full border p-1 backdrop-blur">
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
      </div>

      {isError && (
        <p className="rounded-card bg-danger-surface/60 text-danger border-danger/40 mt-6 border px-4 py-3 text-center text-sm">
          Something went wrong. Try again.
        </p>
      )}

      {isFetching && !items && (
        <ul className="mt-6 grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {Array.from({ length: 10 }, (_, index) => (
            <li
              key={index}
              className="border-border/40 bg-surface-muted/50 aspect-[2/3] animate-pulse rounded-2xl border"
            />
          ))}
        </ul>
      )}

      {items && items.length > 0 && (
        <ul className="mt-6 grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {items.map((item) =>
            item.media_type === "movie" ? (
              <MediaCard
                key={`movie-${item.id}`}
                href={`/movie?id=${item.id}`}
                title={item.title}
                subtitle={item.release_date?.slice(0, 4)}
                poster={posterUrl(item.poster_path)}
                rating={item.vote_average}
                favoriteId={item.id}
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
