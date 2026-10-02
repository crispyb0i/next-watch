import { useState } from "react";
import { mediaHref } from "../lib/mediaHref";
import {
  filterWatchlist,
  type WatchlistSort,
  type WatchlistType,
} from "../lib/watchlist";
import {
  reloadFavorites,
  useFavoritesError,
  useFavoritesLoaded,
  useSaved,
  type SaveKind,
} from "../lib/favorites";
import MediaCard from "./MediaCard";
import ImageGroup from "./ImageGroup";
import { PosterGridSkeleton } from "./Skeleton";
import AuthGate from "./AuthGate";
import FavoriteButton from "./FavoriteButton";
import WatchLogButton from "./WatchLogButton";

const control =
  "bg-surface-muted/60 border-border/60 text-text-primary focus-visible:outline-accent mt-1 min-h-11 w-full rounded-xl border px-3 py-2 text-sm focus-visible:outline-2";

const copy = {
  favorite: {
    heading: "Favorites",
    empty: "No favorites yet. Tap the heart on any movie or show to save it.",
  },
  watchlist: {
    heading: "Watchlist",
    empty: "Nothing on your watchlist. Tap + on any movie or show to add it.",
  },
} as const;

export default function Favorites({ kind = "favorite" }: { kind?: SaveKind }) {
  return (
    <AuthGate>
      <FavoritesList kind={kind} />
    </AuthGate>
  );
}

function FavoritesList({ kind }: { kind: SaveKind }) {
  const error = useFavoritesError();
  const items = useSaved(kind);
  const loaded = useFavoritesLoaded();
  const [query, setQuery] = useState("");
  const [mediaType, setMediaType] = useState<WatchlistType>("all");
  const [sort, setSort] = useState<WatchlistSort>("saved");
  const isWatchlist = kind === "watchlist";
  const visible = isWatchlist
    ? filterWatchlist(items, query, mediaType, sort)
    : items;
  const filtered = query.length > 0 || mediaType !== "all";

  return (
    <div className="w-full">
      {error && (
        <p role="alert" className="text-danger mt-4">
          {error}{" "}
          <button className="underline" onClick={() => void reloadFavorites()}>
            Retry
          </button>
        </p>
      )}
      <h1 className="text-text-primary text-xl font-extrabold tracking-tight">
        {copy[kind].heading}
      </h1>

      {isWatchlist && loaded && items.length > 0 && (
        <div className="mt-5 space-y-3">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
            <label className="text-text-secondary text-sm font-semibold">
              Search watchlist
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search saved titles"
                className={control}
              />
            </label>
            <label className="text-text-secondary text-sm font-semibold">
              Type
              <select
                value={mediaType}
                onChange={(event) =>
                  setMediaType(event.target.value as WatchlistType)
                }
                className={control}
              >
                <option value="all">Movies & TV</option>
                <option value="movie">Movies</option>
                <option value="tv">TV shows</option>
              </select>
            </label>
            <label className="text-text-secondary text-sm font-semibold">
              Sort by
              <select
                value={sort}
                onChange={(event) =>
                  setSort(event.target.value as WatchlistSort)
                }
                className={control}
              >
                <option value="saved">Saved order</option>
                <option value="title">Title A–Z</option>
                <option value="title-desc">Title Z–A</option>
                <option value="rating">TMDB rating: highest first</option>
              </select>
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <p role="status" className="text-text-muted">
              {visible.length} of {items.length} saved titles
            </p>
            {filtered && (
              <button
                type="button"
                className="focus-visible:outline-accent rounded px-2 py-1 underline focus-visible:outline-2"
                onClick={() => {
                  setQuery("");
                  setMediaType("all");
                }}
              >
                Clear filters
              </button>
            )}
          </div>
        </div>
      )}

      {!loaded ? (
        <PosterGridSkeleton count={5} />
      ) : items.length === 0 ? (
        <p className="text-text-muted mt-6 text-sm">{copy[kind].empty}</p>
      ) : visible.length === 0 ? (
        <p className="text-text-muted mt-6 text-sm">
          No saved titles match your filters.
        </p>
      ) : (
        <ImageGroup>
          <ul className="mt-6 grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {visible.map((item) => {
              const mediaType = item.mediaType ?? "movie";
              const href = mediaHref(item.href, mediaType, item.id);
              return (
                <MediaCard
                  key={`${mediaType}-${item.id}`}
                  href={href}
                  title={item.title}
                  subtitle={item.subtitle}
                  poster={item.poster}
                  rating={item.rating}
                  actions={
                    isWatchlist ? (
                      <>
                        {mediaType === "movie" && href.startsWith("/movie?") ? (
                          <WatchLogButton
                            item={{
                              tmdbId: item.id,
                              mediaType,
                              title: item.title,
                              poster: item.poster,
                              subtitle: item.subtitle,
                            }}
                          />
                        ) : (
                          <a
                            href={href}
                            aria-label={`Track episodes of ${item.title}`}
                            className="border-border/60 hover:border-accent focus-visible:outline-accent rounded-full border px-3 py-1.5 text-sm font-semibold focus-visible:outline-2"
                          >
                            Track episodes
                          </a>
                        )}
                        <FavoriteButton item={item} activeLabel="Remove" />
                      </>
                    ) : undefined
                  }
                />
              );
            })}
          </ul>
        </ImageGroup>
      )}
    </div>
  );
}
