import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { searchMovies, posterUrl } from "../lib/tmdb";
import QueryProvider from "./QueryProvider";
import MediaCard from "./MediaCard";

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

  const showEmptyState =
    debouncedQuery.length > 0 &&
    !isFetching &&
    !isError &&
    movies?.length === 0;

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="relative">
        <span className="text-text-muted pointer-events-none absolute inset-y-0 left-4 flex items-center">
          <SearchIcon />
        </span>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search movies..."
          className="border-border bg-surface text-text-primary placeholder:text-text-muted focus:border-accent focus:ring-accent/30 w-full rounded-full border py-3.5 pr-12 pl-12 text-base shadow-sm transition outline-none focus:ring-4"
        />
        {isFetching && (
          <span className="absolute inset-y-0 right-4 flex items-center">
            <Spinner />
          </span>
        )}
      </div>

      {isError && (
        <p className="rounded-card mt-6 border border-red-200 bg-red-50 px-4 py-3 text-center text-sm text-red-600 dark:border-red-900 dark:bg-red-950 dark:text-red-400">
          Something went wrong. Try again.
        </p>
      )}

      {showEmptyState && (
        <p className="text-text-muted mt-6 text-center text-sm">
          No results for “{debouncedQuery}”.
        </p>
      )}

      {movies && movies.length > 0 && (
        <ul className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
          {movies.map((movie) => (
            <MediaCard
              key={movie.id}
              href={`/movie?id=${movie.id}`}
              title={movie.title}
              subtitle={movie.release_date?.slice(0, 4)}
              poster={posterUrl(movie.poster_path)}
            />
          ))}
        </ul>
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
