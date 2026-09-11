import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { searchMulti, posterUrl, profileUrl } from "../lib/tmdb";
import type { MultiResult } from "../lib/tmdb";
import QueryProvider from "./QueryProvider";
import MediaCard from "./MediaCard";
import Trending from "./Trending";
import ImageGroup from "./ImageGroup";
import { PosterGridSkeleton } from "./Skeleton";

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
  if (item.media_type === "tv")
    return {
      href: `/tv?id=${item.id}`,
      title: item.name,
      subtitle: item.first_air_date?.slice(0, 4),
      poster: posterUrl(item.poster_path),
      rating: item.vote_average,
      favoriteId: item.id,
      mediaType: "tv" as const,
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
  // Only a submit moves `query` into `submitted`, so typing costs no requests.
  const [submitted, setSubmitted] = useState("");
  const [tab, setTab] = useState<Tab>("all");
  // `@name` is the power-user shortcut into the Users tab.
  const isUserQuery = submitted.startsWith("@");
  const activeTab: Tab = isUserQuery ? "users" : tab;
  const term = isUserQuery ? submitted.slice(1) : submitted;

  const media = useQuery({
    queryKey: ["search", term],
    queryFn: ({ signal }) => searchMulti(term, signal),
    enabled: activeTab !== "users" && term.length > 0,
  });

  const people = useQuery({
    queryKey: ["users", term],
    queryFn: ({ signal }) =>
      fetch(`/api/users?q=${encodeURIComponent(term)}`, {
        signal,
      }).then((r): Promise<UserResult[]> => {
        if (!r.ok) throw new Error("user search failed");
        return r.json();
      }),
    enabled: activeTab === "users" && term.length > 1,
  });

  const { isFetching, isError } = activeTab === "users" ? people : media;

  const results = (media.data ?? []).filter(
    (item) => activeTab === "all" || item.media_type === activeTab,
  );
  const users = people.data ?? [];
  const count = activeTab === "users" ? users.length : results.length;

  const isSearchActive = term.length > 0;
  const showEmptyState = isSearchActive && !isFetching && !isError && !count;

  return (
    <div className="w-full">
      <div className="mx-auto w-full max-w-2xl">
        <form
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            setSubmitted(query.trim());
          }}
          className="group relative"
        >
          <span className="text-text-muted group-focus-within:text-accent pointer-events-none absolute inset-y-0 left-4 flex items-center transition sm:left-5">
            <SearchIcon />
          </span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            // iOS shows a "Search" key and submits on Enter with these.
            enterKeyHint="search"
            autoCapitalize="none"
            autoCorrect="off"
            placeholder="Search movies, TV, people…"
            aria-label="Search"
            className="border-border/70 bg-surface-elevated/70 text-text-primary placeholder:text-text-muted shadow-card focus:border-accent focus:ring-accent/25 w-full rounded-2xl border py-3.5 pr-28 pl-11 text-base backdrop-blur-xl transition outline-none focus:ring-4 sm:py-4 sm:pr-32 sm:pl-13 [&::-webkit-search-cancel-button]:hidden"
          />
          <div className="absolute inset-y-0 right-2 flex items-center gap-1.5">
            {isFetching && <Spinner />}
            <button
              type="submit"
              disabled={!query.trim()}
              className="bg-accent text-accent-contrast hover:bg-accent-hover focus-visible:outline-accent rounded-xl px-4 py-2 text-sm font-bold transition focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-40"
            >
              Search
            </button>
          </div>
        </form>

        {/* Horizontal scroll instead of wrapping: five pills never fit one
            phone row, and a stray second row reads as a layout bug. */}
        <div
          role="tablist"
          aria-label="Result type"
          className="-mx-4 mt-4 flex [scrollbar-width:none] gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:justify-center sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden"
        >
          {TABS.map(([value, label]) => (
            <button
              key={value}
              role="tab"
              type="button"
              aria-selected={activeTab === value}
              onClick={() => {
                setTab(value);
                if (isUserQuery && value !== "users") {
                  setQuery(term);
                  setSubmitted(term);
                }
              }}
              className={`shrink-0 rounded-full border px-4 py-2 text-sm whitespace-nowrap transition ${
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
            No results for “{term}”.
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
        <ImageGroup key={`${term}:${activeTab}`}>
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
