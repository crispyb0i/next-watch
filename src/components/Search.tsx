import { useQuery } from "@tanstack/react-query";
import { searchPage } from "../lib/tmdb";
import { SearchBox, toCard, type Tab } from "./SearchBox";
import QueryProvider from "./QueryProvider";
import MediaCard from "./MediaCard";
import Trending from "./Trending";
import ImageGroup from "./ImageGroup";
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

  const results = (media.data?.results ?? []).filter(
    (item) => activeTab === "all" || item.media_type === activeTab,
  );
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
        <h1 className="text-text-primary mb-6 text-2xl font-extrabold tracking-tight">
          Search
        </h1>
        <SearchBox initialQuery={initialQuery} tab={activeTab} />
        {/* Horizontal scroll instead of wrapping: five pills never fit one
            phone row, and a stray second row reads as a layout bug. */}
        <div
          role="group"
          aria-label="Result type"
          className="-mx-4 mt-4 flex [scrollbar-width:none] gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:justify-center sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden"
        >
          {TABS.map(([value, label]) => (
            <button
              key={value}
              role="button"
              type="button"
              aria-pressed={activeTab === value}
              onClick={() => {
                location.href = `/search?${new URLSearchParams({ q: value === "users" ? submitted : term, tab: value })}`;
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

      {activeTab !== "users" && isSearchActive && !isError && media.data && (
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
        <div className="mt-20">
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
      <SearchInner
        key={`${props.initialQuery}:${props.initialTab}:${props.initialPage}`}
        {...props}
      />
    </QueryProvider>
  );
}
