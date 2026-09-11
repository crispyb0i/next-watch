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
          No favorites yet. Tap the heart on any movie to save it.
        </p>
      ) : (
        <ImageGroup>
          <ul className="mt-6 grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {favorites.map((movie) => (
              <MediaCard
                key={movie.id}
                href={movie.href ?? `/movie?id=${movie.id}`}
                title={movie.title}
                subtitle={movie.subtitle}
                poster={movie.poster}
                rating={movie.rating}
                favoriteId={movie.id}
              />
            ))}
          </ul>
        </ImageGroup>
      )}
    </div>
  );
}
