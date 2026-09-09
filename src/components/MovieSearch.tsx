import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { searchMovies, posterUrl } from "../lib/tmdb";
import QueryProvider from "./QueryProvider";
import MediaCard from "./MediaCard";
import Trending from "./Trending";

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timeout = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timeout);
  }, [value, delayMs]);

  return debounced;
}

function SearchIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function Spinner() {
  return (
    <svg
      className="text-accent h-5 w-5 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z"
      />
    </svg>
  );
}

function MovieSearchInner() {
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 300);

  const {
    data: movies,
    isFetching,
    isError,
  } = useQuery({
    queryKey: ["movies", debouncedQuery],
    queryFn: ({ signal }) => searchMovies(debouncedQuery, signal),
    enabled: debouncedQuery.length > 0,
  });

  const isSearchActive = debouncedQuery.length > 0;

  const showEmptyState =
    isSearchActive && !isFetching && !isError && movies?.length === 0;

  return (
    <div className="w-full">
      <div className="mx-auto w-full max-w-2xl">
        <div className="group relative">
          <span className="text-text-muted group-focus-within:text-accent pointer-events-none absolute inset-y-0 left-5 flex items-center transition">
            <SearchIcon />
          </span>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search movies..."
            className="border-border/70 bg-surface-elevated/70 text-text-primary placeholder:text-text-muted shadow-card focus:border-accent focus:ring-accent/25 w-full rounded-2xl border py-4 pr-12 pl-13 text-base backdrop-blur-xl transition outline-none focus:ring-4"
          />
          {isFetching && (
            <span className="absolute inset-y-0 right-4 flex items-center">
              <Spinner />
            </span>
          )}
        </div>

        {isError && (
          <p className="rounded-card bg-danger-surface/60 text-danger border-danger/40 mt-6 border px-4 py-3 text-center text-sm">
            Something went wrong. Try again.
          </p>
        )}

        {showEmptyState && (
          <p className="text-text-muted mt-6 text-center text-sm">
            No results for “{debouncedQuery}”.
          </p>
        )}
      </div>

      {movies && movies.length > 0 && (
        <ul className="mt-10 grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {movies.map((movie) => (
            <MediaCard
              key={movie.id}
              href={`/movie?id=${movie.id}`}
              title={movie.title}
              subtitle={movie.release_date?.slice(0, 4)}
              poster={posterUrl(movie.poster_path)}
              rating={movie.vote_average}
            />
          ))}
        </ul>
      )}

      {!isSearchActive && (
        <div className="mt-20">
          <Trending />
        </div>
      )}
    </div>
  );
}

export default function MovieSearch() {
  return (
    <QueryProvider>
      <MovieSearchInner />
    </QueryProvider>
  );
}
