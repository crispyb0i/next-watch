import { useEffect, useId, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  searchPage,
  posterUrl,
  profileUrl,
  type MultiResult,
} from "../lib/tmdb";
import QueryProvider from "./QueryProvider";
export type Tab = "all" | "movie" | "tv" | "person" | "users";
interface UserResult {
  id: string;
  name: string | null;
  image: string | null;
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

export function toCard(item: MultiResult) {
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
      mediaType: "tv" as const,
    };
  return {
    href: `/movie?id=${item.id}`,
    title: item.title,
    subtitle: item.release_date?.slice(0, 4),
    poster: posterUrl(item.poster_path),
    rating: item.vote_average,
  };
}

export function SearchBox({
  initialQuery = "",
  tab = "all",
  compact = false,
}: {
  initialQuery?: string;
  tab?: Tab;
  compact?: boolean;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [suggestionQuery, setSuggestionQuery] = useState("");
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [activeSuggestion, setActiveSuggestion] = useState(-1);
  const suggestionsId = useId();
  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setSuggestionQuery(query.trim());
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [query]);
  const suggestionTab = suggestionQuery.startsWith("@") ? "users" : tab;
  const suggestionTerm = suggestionQuery.replace(/^@/, "");
  const showSuggestions =
    suggestionsOpen && query.trim().replace(/^@/, "").length >= 2;
  const suggestionsReady = showSuggestions && suggestionQuery === query.trim();
  const suggestedMedia = useQuery({
    queryKey: ["search", suggestionTerm, suggestionTab, 1],
    queryFn: ({ signal }) =>
      searchPage(
        suggestionTerm,
        suggestionTab === "users" ? "all" : suggestionTab,
        1,
        signal,
      ),
    enabled: suggestionsReady && suggestionTab !== "users",
    staleTime: 60_000,
  });
  const suggestedUsers = useQuery({
    queryKey: ["users", suggestionTerm],
    queryFn: async ({ signal }): Promise<UserResult[]> => {
      const response = await fetch(
        `/api/users?q=${encodeURIComponent(suggestionTerm)}`,
        { signal },
      );
      if (!response.ok) throw new Error("user search failed");
      return response.json();
    },
    enabled:
      suggestionsReady &&
      (suggestionTab === "all" || suggestionTab === "users"),
    staleTime: 60_000,
  });
  const suggestionGroups = [
    ...(["movie", "tv", "person"] as const).map((type) => ({
      label: { movie: "Movies", tv: "TV shows", person: "Cast & crew" }[type],
      items: (suggestedMedia.data?.results ?? [])
        .filter(
          (item) =>
            item.media_type === type &&
            (suggestionTab === "all" || suggestionTab === type),
        )
        .slice(0, 2)
        .map(toCard),
    })),
    {
      label: "People on Next Watch",
      items:
        suggestionTab === "all" || suggestionTab === "users"
          ? (suggestedUsers.data ?? []).slice(0, 2).map((user) => ({
              href: `/u/${user.id}`,
              title: user.name ?? "Unnamed user",
              subtitle: "User profile",
              poster: user.image,
              rating: null,
            }))
          : [],
    },
  ];
  const suggestions = suggestionsReady
    ? suggestionGroups.flatMap((group) => group.items)
    : [];
  const suggestionsLoading =
    !suggestionsReady || suggestedMedia.isFetching || suggestedUsers.isFetching;
  const suggestionsError =
    (suggestionTab !== "users" && suggestedMedia.isError) ||
    ((suggestionTab === "all" || suggestionTab === "users") &&
      suggestedUsers.isError);
  useEffect(() => {
    if (showSuggestions && activeSuggestion >= 0) {
      document
        .getElementById(`${suggestionsId}-${activeSuggestion}`)
        ?.scrollIntoView({ block: "nearest" });
    }
  }, [activeSuggestion, showSuggestions, suggestionsId]);

  return (
    <form
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        location.href = `/search?${new URLSearchParams({ q: query.trim(), tab: query.trim().startsWith("@") ? "users" : tab })}`;
      }}
      action="/search"
      method="get"
      className="group relative"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setSuggestionsOpen(false);
          setActiveSuggestion(-1);
        }
      }}
    >
      <span
        className={`group-focus-within:text-accent pointer-events-none absolute inset-y-0 z-10 flex items-center transition ${compact ? "text-text-primary left-3" : "text-text-muted left-4 sm:left-5"}`}
      >
        <SearchIcon />
      </span>
      <input
        type="search"
        name="q"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setSuggestionsOpen(true);
          setActiveSuggestion(-1);
        }}
        onFocus={() => setSuggestionsOpen(true)}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === "Escape") {
            event.preventDefault();
            setSuggestionsOpen(false);
            setActiveSuggestion(-1);
          } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setSuggestionsOpen(true);
            if (suggestions.length) {
              setActiveSuggestion((current) =>
                event.key === "ArrowDown"
                  ? (current + 1) % suggestions.length
                  : (current <= 0 ? suggestions.length : current) - 1,
              );
            }
          } else if (
            event.key === "Enter" &&
            showSuggestions &&
            suggestions[activeSuggestion]
          ) {
            event.preventDefault();
            window.location.href = suggestions[activeSuggestion].href;
          }
        }}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showSuggestions}
        aria-controls={showSuggestions ? suggestionsId : undefined}
        aria-activedescendant={
          showSuggestions && suggestions[activeSuggestion]
            ? `${suggestionsId}-${activeSuggestion}`
            : undefined
        }
        autoComplete="off"
        // iOS shows a "Search" key and submits on Enter with these.
        enterKeyHint="search"
        autoCapitalize="none"
        autoCorrect="off"
        placeholder="Search movies, TV, people…"
        aria-label="Search"
        autoFocus={!compact && !initialQuery}
        className={`border-border/70 bg-surface-elevated/70 text-text-primary placeholder:text-text-muted shadow-card focus:border-accent focus:ring-accent/25 w-full border backdrop-blur-xl transition outline-none focus:ring-4 [&::-webkit-search-cancel-button]:hidden ${compact ? "h-10 rounded-full pr-3 pl-11 text-sm" : "rounded-2xl py-3.5 pr-28 pl-11 text-base sm:py-4 sm:pr-32 sm:pl-13"}`}
      />
      <div
        className={
          compact
            ? "hidden"
            : "absolute inset-y-0 right-2 flex items-center gap-1.5"
        }
      >
        {suggestionsLoading && showSuggestions && <Spinner />}
        <button
          type="submit"
          disabled={!query.trim()}
          className="bg-accent text-accent-contrast hover:bg-accent-hover focus-visible:outline-accent rounded-xl px-4 py-2 text-sm font-bold transition focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-40"
        >
          Search
        </button>
      </div>
      {showSuggestions && (
        <div className="border-border bg-surface-elevated shadow-card absolute top-full right-0 z-50 mt-2 w-full min-w-72 overflow-hidden rounded-2xl border">
          <ul
            id={suggestionsId}
            role="listbox"
            aria-label="Search suggestions"
            className="max-h-[60vh] overflow-y-auto py-2"
          >
            {suggestionsReady &&
              suggestionGroups.map((group) =>
                group.items.length ? (
                  <li key={group.label} role="presentation">
                    <p className="text-text-muted px-4 py-2 text-xs font-bold tracking-wide uppercase">
                      {group.label}
                    </p>
                    <ul role="group" aria-label={group.label}>
                      {group.items.map((item) => {
                        const index = suggestions.indexOf(item);
                        return (
                          <li key={item.href} role="presentation">
                            <a
                              id={`${suggestionsId}-${index}`}
                              href={item.href}
                              role="option"
                              aria-selected={activeSuggestion === index}
                              tabIndex={-1}
                              onMouseDown={(event) => event.preventDefault()}
                              className={`flex items-center gap-3 px-4 py-2 ${activeSuggestion === index ? "bg-accent/15" : "hover:bg-surface-muted"}`}
                            >
                              {item.poster ? (
                                <img
                                  src={item.poster}
                                  alt=""
                                  className="h-12 w-9 shrink-0 rounded object-cover"
                                />
                              ) : (
                                <span
                                  aria-hidden="true"
                                  className="bg-surface-muted h-12 w-9 shrink-0 rounded"
                                />
                              )}
                              <span className="min-w-0">
                                <span className="text-text-primary block truncate text-sm font-semibold">
                                  {item.title}
                                </span>
                                <span className="text-text-muted block text-xs">
                                  {item.subtitle}
                                </span>
                              </span>
                            </a>
                          </li>
                        );
                      })}
                    </ul>
                  </li>
                ) : null,
              )}
          </ul>
          <p
            role="status"
            className="text-text-muted border-border border-t px-4 py-3 text-xs"
          >
            {suggestionsLoading
              ? "Searching…"
              : suggestionsError
                ? "Some suggestions couldn't load. Press Enter to search."
                : suggestions.length
                  ? "Use ↑ ↓ to choose · Enter to open · Esc to close"
                  : "No suggestions found. Press Enter to search."}
          </p>
        </div>
      )}
    </form>
  );
}
export default function NavbarSearch() {
  return (
    <QueryProvider>
      <SearchBox compact />
    </QueryProvider>
  );
}
