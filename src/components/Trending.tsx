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
import ImageGroup from "./ImageGroup";
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
        {/* Scrolls rather than wraps on narrow screens — see Search tabs. */}
        <div className="-mx-4 flex w-[calc(100%+2rem)] [scrollbar-width:none] items-center gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:w-auto sm:flex-wrap sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden">
          <FilterGroup label="Media type">
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
          <FilterGroup label="Time window">
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

      {isPending && <PosterGridSkeleton />}

      {/* Un-keyed on purpose — see Discover: remounting re-hides cached posters. */}
      {items && items.length > 0 && (
        <ImageGroup>
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
                  favoriteId={item.id}
                  mediaType="tv"
                />
              ),
            )}
          </ul>
        </ImageGroup>
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
