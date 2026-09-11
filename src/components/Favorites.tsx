import { useFavorites, useFavoritesLoaded } from "../lib/favorites";
import MediaCard from "./MediaCard";
import ImageGroup from "./ImageGroup";
import { PosterGridSkeleton } from "./Skeleton";

export default function Favorites() {
  const favorites = useFavorites();
  const loaded = useFavoritesLoaded();

  return (
    <div className="w-full">
      <h1 className="text-text-primary text-xl font-extrabold tracking-tight">
        Favorites
      </h1>

      {!loaded ? (
        <PosterGridSkeleton count={5} />
      ) : favorites.length === 0 ? (
        <p className="text-text-muted mt-6 text-sm">
          No favorites yet. Tap the heart on any movie or show to save it.
        </p>
      ) : (
        <ImageGroup>
          <ul className="mt-6 grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {favorites.map((item) => {
              const mediaType = item.mediaType ?? "movie";
              return (
                <MediaCard
                  key={`${mediaType}-${item.id}`}
                  href={item.href ?? `/${mediaType}?id=${item.id}`}
                  title={item.title}
                  subtitle={item.subtitle}
                  poster={item.poster}
                  rating={item.rating}
                  favoriteId={item.id}
                  mediaType={mediaType}
                />
              );
            })}
          </ul>
        </ImageGroup>
      )}
    </div>
  );
}
