import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { searchMulti, posterUrl, profileUrl } from "../lib/tmdb";
import type { MultiResult } from "../lib/tmdb";
import QueryProvider from "./QueryProvider";
import MediaCard from "./MediaCard";
import Trending from "./Trending";
import ImageGroup from "./ImageGroup";
import { PosterGridSkeleton } from "./Skeleton";

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

interface UserResult {
  id: string;
  name: string | null;
  image: string | null;
}

const TABS = [
  ["all", "All"],
  ["movie", "Movies"],
  ["tv", "TV"],
  ["person", "People"],
  ["users", "Users"],
] as const;

type Tab = (typeof TABS)[number][0];

/** Card props per TMDB media type — keeps the render branch-free. */
function toCard(item: MultiResult) {
  if (item.media_type === "person")
    return {
      href: `/person?id=${item.id}`,
      title: item.name,
      subtitle: item.known_for_department,
      poster: profileUrl(item.profile_path),
      rating: null,
    };
  // ponytail: no `favoriteId` for TV — `favorites` is keyed on
  // (userId, tmdbId) with no `mediaType`, so a show and a movie sharing an id
  // would collide. Add the column, then pass it here.
  if (item.media_type === "tv")
    return {
      href: `/tv?id=${item.id}`,
      title: item.name,
      subtitle: item.first_air_date?.slice(0, 4),
      poster: posterUrl(item.poster_path),
      rating: item.vote_average,
    };
  return {
    href: `/movie?id=${item.id}`,
    title: item.title,
    subtitle: item.release_date?.slice(0, 4),
    poster: posterUrl(item.poster_path),
    rating: item.vote_average,
    favoriteId: item.id,
  };
}

function SearchInner() {
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<Tab>("all");
  // `@name` is the power-user shortcut into the Users tab.
  const isUserQuery = query.startsWith("@");
  const activeTab: Tab = isUserQuery ? "users" : tab;
  const debouncedQuery = useDebouncedValue(
    isUserQuery ? query.slice(1) : query,
    300,
  );

  const media = useQuery({
    queryKey: ["search", debouncedQuery],
    queryFn: ({ signal }) => searchMulti(debouncedQuery, signal),
    enabled: activeTab !== "users" && debouncedQuery.length > 0,
  });

  const people = useQuery({
    queryKey: ["users", debouncedQuery],
    queryFn: ({ signal }) =>
      fetch(`/api/users?q=${encodeURIComponent(debouncedQuery)}`, {
        signal,
      }).then((r): Promise<UserResult[]> => {
        if (!r.ok) throw new Error("user search failed");
        return r.json();
      }),
    enabled: activeTab === "users" && debouncedQuery.length > 1,
  });

  const { isFetching, isError } = activeTab === "users" ? people : media;

  const results = (media.data ?? []).filter(
    (item) => activeTab === "all" || item.media_type === activeTab,
  );
  const users = people.data ?? [];
  const count = activeTab === "users" ? users.length : results.length;

  const isSearchActive = debouncedQuery.length > 0;
  const showEmptyState = isSearchActive && !isFetching && !isError && !count;

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
            placeholder="Search movies, TV, people…"
            aria-label="Search"
            className="border-border/70 bg-surface-elevated/70 text-text-primary placeholder:text-text-muted shadow-card focus:border-accent focus:ring-accent/25 w-full rounded-2xl border py-4 pr-12 pl-13 text-base backdrop-blur-xl transition outline-none focus:ring-4"
          />
          {isFetching && (
            <span className="absolute inset-y-0 right-4 flex items-center">
              <Spinner />
            </span>
          )}
        </div>

        <div
          role="tablist"
          aria-label="Result type"
          className="mt-4 flex flex-wrap justify-center gap-2"
        >
          {TABS.map(([value, label]) => (
            <button
              key={value}
              role="tab"
              type="button"
              aria-selected={activeTab === value}
              onClick={() => {
                setTab(value);
                if (isUserQuery && value !== "users") setQuery(query.slice(1));
              }}
              className={`rounded-full border px-4 py-1.5 text-sm transition ${
                activeTab === value
                  ? "border-accent bg-accent/15 text-accent"
                  : "border-border/60 text-text-muted hover:text-text-primary"
              }`}
            >
              {label}
            </button>
          ))}
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

      {isSearchActive && isFetching && !count && (
        <div className="mt-10">
          <PosterGridSkeleton />
        </div>
      )}

      {activeTab === "users" && users.length > 0 && (
        <ul className="mx-auto mt-10 grid w-full max-w-2xl gap-3">
          {users.map((user) => (
            <li key={user.id}>
              <a
                href={`/u/${user.id}`}
                className="border-border/60 bg-surface-elevated/60 hover:border-accent/60 flex items-center gap-4 rounded-2xl border px-4 py-3 transition"
              >
                {user.image ? (
                  <img
                    src={user.image}
                    alt=""
                    width={40}
                    height={40}
                    loading="lazy"
                    className="h-10 w-10 rounded-full object-cover"
                  />
                ) : (
                  <span className="bg-surface-muted text-text-muted flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold">
                    {(user.name ?? "?").slice(0, 2).toUpperCase()}
                  </span>
                )}
                <span className="text-text-primary text-sm font-semibold">
                  {user.name}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}

      {activeTab !== "users" && results.length > 0 && (
        <ImageGroup key={`${debouncedQuery}:${activeTab}`}>
          <ul className="mt-10 grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {results.map((item) => (
              <MediaCard
                key={`${item.media_type}:${item.id}`}
                {...toCard(item)}
              />
            ))}
          </ul>
        </ImageGroup>
      )}

      {!isSearchActive && (
        <div className="mt-20">
          <Trending />
        </div>
      )}
    </div>
  );
}

export default function Search() {
  return (
    <QueryProvider>
      <SearchInner />
    </QueryProvider>
  );
}
