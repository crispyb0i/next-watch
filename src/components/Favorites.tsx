import { mediaHref } from "../lib/mediaHref";
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

      {!loaded ? (
        <PosterGridSkeleton count={5} />
      ) : items.length === 0 ? (
        <p className="text-text-muted mt-6 text-sm">{copy[kind].empty}</p>
      ) : (
        <ImageGroup>
          <ul className="mt-6 grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {items.map((item) => {
              const mediaType = item.mediaType ?? "movie";
              return (
                <MediaCard
                  key={`${mediaType}-${item.id}`}
                  href={mediaHref(item.href, mediaType, item.id)}
                  title={item.title}
                  subtitle={item.subtitle}
                  poster={item.poster}
                  rating={item.rating}
                />
              );
            })}
          </ul>
        </ImageGroup>
      )}
    </div>
  );
}
