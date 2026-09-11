import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  getMovieList,
  getTvList,
  posterUrl,
  type Movie,
  type MovieListName,
  type TvShow,
  type TvListName,
} from "../lib/tmdb";
import QueryProvider from "./QueryProvider";
import MediaCard from "./MediaCard";
import ImageGroup from "./ImageGroup";
import { PosterGridSkeleton } from "./Skeleton";
import { FilterButton, FilterGroup } from "./FilterButton";

type Tab = "movie" | "tv";

const MOVIE_LISTS: { label: string; value: MovieListName }[] = [
  { label: "Upcoming", value: "upcoming" },
  { label: "Now playing", value: "now_playing" },
  { label: "Top rated", value: "top_rated" },
  { label: "Popular", value: "popular" },
];

const TV_LISTS: { label: string; value: TvListName }[] = [
  { label: "Airing today", value: "airing_today" },
  { label: "On the air", value: "on_the_air" },
  { label: "Top rated", value: "top_rated" },
  { label: "Popular", value: "popular" },
];

function DiscoverInner() {
  const [tab, setTab] = useState<Tab>("movie");
  const [movieList, setMovieList] = useState<MovieListName>("upcoming");
  const [tvList, setTvList] = useState<TvListName>("airing_today");
  const list = tab === "movie" ? movieList : tvList;

  const {
    data: items,
    isPending,
    isError,
  } = useQuery({
    queryKey: ["discover", tab, list],
    queryFn: ({ signal }): Promise<(Movie | TvShow)[]> =>
      tab === "movie"
        ? getMovieList(list as MovieListName, signal)
        : getTvList(list as TvListName, signal),
    // Keep the current grid up while a new list loads — no skeleton flash.
    placeholderData: (previous) => previous,
  });

  return (
    <div className="w-full">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-text-primary text-xl font-extrabold tracking-tight">
          Discover
        </h1>
        <FilterGroup label="Media type">
          <FilterButton
            active={tab === "movie"}
            onClick={() => setTab("movie")}
          >
            Movies
          </FilterButton>
          <FilterButton active={tab === "tv"} onClick={() => setTab("tv")}>
            TV
          </FilterButton>
        </FilterGroup>
      </div>

      {/* Scrolls rather than wraps on narrow screens — see Search tabs. */}
      <div className="-mx-4 mt-4 flex [scrollbar-width:none] gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden">
        <FilterGroup label="List">
          {(tab === "movie" ? MOVIE_LISTS : TV_LISTS).map(
            ({ label, value }) => (
              <FilterButton
                key={value}
                active={list === value}
                onClick={() =>
                  tab === "movie"
                    ? setMovieList(value as MovieListName)
                    : setTvList(value as TvListName)
                }
              >
                {label}
              </FilterButton>
            ),
          )}
        </FilterGroup>
      </div>

      {isError && (
        <p
          role="alert"
          className="rounded-card bg-danger-surface/60 text-danger border-danger/40 mt-6 border px-4 py-3 text-center text-sm"
        >
          Couldn't load this list. Try again.
        </p>
      )}

      {isPending && <PosterGridSkeleton />}

      {items && items.length === 0 && !isPending && (
        <p className="text-text-muted mt-6 text-sm">Nothing here right now.</p>
      )}

      {/* ImageGroup is deliberately un-keyed: remounting it resets the reveal
          state and flashes skeletons over posters the browser already cached. */}
      {items && items.length > 0 && (
        <ImageGroup>
          <ul className="mt-6 grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {items.map((item) =>
              "title" in item ? (
                <MediaCard
                  key={item.id}
                  href={`/movie?id=${item.id}`}
                  title={item.title}
                  subtitle={item.release_date?.slice(0, 4)}
                  poster={posterUrl(item.poster_path)}
                  rating={item.vote_average}
                />
              ) : (
                <MediaCard
                  key={item.id}
                  href={`/tv?id=${item.id}`}
                  title={item.name}
                  subtitle={item.first_air_date?.slice(0, 4)}
                  poster={posterUrl(item.poster_path)}
                  rating={item.vote_average}
                />
              ),
            )}
          </ul>
        </ImageGroup>
      )}
    </div>
  );
}

export default function Discover() {
  return (
    <QueryProvider>
      <DiscoverInner />
    </QueryProvider>
  );
}
