import { useQuery } from "@tanstack/react-query";
import { searchPage } from "../lib/tmdb";
import { SearchBox, toCard, type Tab } from "./SearchBox";
import QueryProvider from "./QueryProvider";
import MediaCard from "./MediaCard";
import Trending from "./Trending";
import { PosterGridSkeleton } from "./Skeleton";

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

/** Card props per TMDB media type — keeps the render branch-free. */
function SearchInner({
  initialQuery = "",
  initialTab = "all",
  initialPage = 1,
}: {
  initialQuery?: string;
  initialTab?: Tab;
  initialPage?: number;
}) {
  // Full results stay tied to the submitted URL while suggestions follow typing.
  const submitted = initialQuery;
  const tab = initialTab;
  // `@name` is the power-user shortcut into the Users tab.
  const isUserQuery = submitted.startsWith("@");
  const activeTab: Tab = isUserQuery ? "users" : tab;
  const term = isUserQuery ? submitted.slice(1) : submitted;
  const media = useQuery({
    queryKey: ["search", term, activeTab, initialPage],
    queryFn: ({ signal }) =>
      searchPage(
        term,
        activeTab === "users" ? "all" : activeTab,
        initialPage,
        signal,
      ),
    enabled: activeTab !== "users" && term.length > 0,
    placeholderData: term.length > 0 ? (previous) => previous : undefined,
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
    placeholderData: term.length > 1 ? (previous) => previous : undefined,
  });

  const { isFetching, isError, refetch } =
    activeTab === "users" ? people : media;

  // Keep the previous grid while fetching; each result carries its own type.
  const results = media.data?.results ?? [];
  const users = people.data ?? [];
  const count = activeTab === "users" ? users.length : results.length;

  const isSearchActive = term.length > 0;
  const showEmptyState =
    isSearchActive &&
    (activeTab !== "users" || term.length > 1) &&
    !isFetching &&
    !isError &&
    !count;

  return (
    <div className="w-full">
      <div className="mx-auto w-full max-w-2xl">
        <h1 className="text-text-primary mb-4 text-2xl font-extrabold tracking-tight sm:mb-6">
          Search
        </h1>
        <SearchBox initialQuery={initialQuery} tab={activeTab} />
        <div
          role="group"
          aria-label="Result type"
          className="border-border/60 bg-surface-muted/50 mt-3 grid grid-cols-5 gap-1 rounded-2xl border p-1 sm:mt-4 sm:flex sm:flex-wrap sm:justify-center sm:gap-2 sm:rounded-none sm:border-0 sm:bg-transparent sm:p-0"
        >
          {TABS.map(([value, label]) => (
            <a
              key={value}
              aria-current={activeTab === value ? "page" : undefined}
              href={`/search?${new URLSearchParams({ q: value === "users" ? submitted : term, tab: value })}`}
              className={`focus-visible:outline-accent flex min-h-11 min-w-0 items-center justify-center rounded-xl border px-1 py-2 text-xs font-medium whitespace-nowrap transition focus-visible:outline-2 focus-visible:outline-offset-2 sm:rounded-full sm:px-4 sm:text-sm ${
                activeTab === value
                  ? "border-accent/30 bg-accent/20 text-accent-hover sm:border-accent sm:bg-accent/15 sm:text-accent"
                  : "text-text-muted hover:text-text-primary sm:border-border/60 border-transparent"
              }`}
            >
              {label}
            </a>
          ))}
        </div>

        <p role="status" className="sr-only">
          {isFetching ? "Updating search results…" : ""}
        </p>

        {isError && (
          <p
            role="alert"
            className="rounded-card bg-danger-surface/60 text-danger border-danger/40 mt-6 border px-4 py-3 text-center text-sm"
          >
            Something went wrong.{" "}
            <button
              type="button"
              className="underline"
              disabled={isFetching}
              onClick={() => void refetch()}
            >
              {isFetching ? "Retrying…" : "Try again."}
            </button>
          </p>
        )}

        {activeTab === "users" && term.length === 1 && (
          <p className="text-text-muted mt-6">
            Enter at least two characters to find users.
          </p>
        )}
        {showEmptyState && (
          <p className="text-text-muted mt-6 text-center text-sm">
            No results for “{term}”.
          </p>
        )}
      </div>

      {isSearchActive && isFetching && !count && (
        <div className="mt-6 sm:mt-10">
          <PosterGridSkeleton count={20} className="mt-0" />
        </div>
      )}

      {activeTab === "users" && users.length > 0 && (
        <ul
          aria-busy={isFetching}
          className="mx-auto mt-6 grid w-full max-w-2xl gap-3 sm:mt-10"
        >
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
        <ul
          aria-busy={isFetching}
          className="mt-6 grid grid-cols-2 gap-5 sm:mt-10 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"
        >
          {results.map((item) => (
            <MediaCard
              key={`${item.media_type}:${item.id}`}
              {...toCard(item)}
            />
          ))}
        </ul>
      )}

      {activeTab !== "users" &&
        isSearchActive &&
        !isError &&
        media.data &&
        !media.isPlaceholderData && (
          <nav
            aria-label="Search pages"
            className="mt-8 flex items-center justify-center gap-6"
          >
            {initialPage > 1 && (
              <a
                className="underline"
                href={`/search?${new URLSearchParams({ q: submitted, tab: activeTab, page: String(initialPage - 1) })}`}
              >
                Previous page
              </a>
            )}
            <span aria-live="polite">
              Page {initialPage} · {media.data.total_results ?? count} results
            </span>
            {initialPage < Math.min(media.data.total_pages ?? 1, 500) && (
              <a
                className="underline"
                href={`/search?${new URLSearchParams({ q: submitted, tab: activeTab, page: String(initialPage + 1) })}`}
              >
                Next page
              </a>
            )}
          </nav>
        )}
      {!isSearchActive && (
        <div className="mt-8 sm:mt-20">
          <Trending />
        </div>
      )}
    </div>
  );
}

export default function Search(props: {
  initialQuery?: string;
  initialTab?: Tab;
  initialPage?: number;
}) {
  return (
    <QueryProvider>
      <SearchInner {...props} />
    </QueryProvider>
  );
}
