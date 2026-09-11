import { toggleFavorite, useFavorites, type Favorite } from "../lib/favorites";
import { notify } from "../lib/notifications";

export default function FavoriteButton({
  item,
  className = "",
}: {
  item: Favorite;
  className?: string;
}) {
  const favorites = useFavorites();
  const active = favorites.some((entry) => entry.id === item.id);

  return (
    <button
      type="button"
      onClick={async () => {
        const result = await toggleFavorite(item);
        notify(
          result.ok
            ? result.removing
              ? "Removed from favorites."
              : "Added to favorites."
            : "Couldn't update favorites.",
          result.ok ? "success" : "error",
        );
      }}
      aria-pressed={active}
      aria-label={
        active ? `Unfavorite ${item.title}` : `Favorite ${item.title}`
      }
      className={`focus-visible:outline-accent grid h-8 w-8 place-items-center rounded-full bg-black/60 text-base leading-none backdrop-blur transition hover:scale-110 focus-visible:outline-2 focus-visible:outline-offset-2 ${
        active ? "text-danger" : "text-white/70 hover:text-white"
      } ${className}`}
    >
      <span aria-hidden="true">{active ? "♥" : "♡"}</span>
    </button>
  );
}
