import {
  kindOf,
  toggleFavorite,
  useFavorites,
  type Favorite,
} from "../lib/favorites";
import { notify } from "../lib/notifications";
import { requireAuth } from "../lib/auth/gate";

/** Glyph and wording per list — everything else is shared. */
const style = {
  favorite: {
    on: "♥",
    off: "♡",
    onLabel: "Favorited",
    offLabel: "Favorite",
    activeClass: "text-danger border-danger/60",
    add: (title: string) => `Favorite ${title}`,
    remove: (title: string) => `Unfavorite ${title}`,
    added: "Added to favorites.",
    removed: "Removed from favorites.",
    failed: "Couldn't update favorites.",
  },
  watchlist: {
    on: "✓",
    off: "+",
    onLabel: "In watchlist",
    offLabel: "Watchlist",
    activeClass: "text-accent border-accent/60",
    add: (title: string) => `Add ${title} to watchlist`,
    remove: (title: string) => `Remove ${title} from watchlist`,
    added: "Added to watchlist.",
    removed: "Removed from watchlist.",
    failed: "Couldn't update watchlist.",
  },
} as const;

export default function FavoriteButton({
  item,
  className = "",
}: {
  item: Favorite;
  className?: string;
}) {
  const favorites = useFavorites();
  const mediaType = item.mediaType ?? "movie";
  const kind = kindOf(item);
  const copy = style[kind];
  const active = favorites.some(
    (entry) =>
      entry.id === item.id &&
      (entry.mediaType ?? "movie") === mediaType &&
      kindOf(entry) === kind,
  );

  return (
    <button
      type="button"
      onClick={async () => {
        if (!(await requireAuth())) return;
        const result = await toggleFavorite(item);
        notify(
          result.ok
            ? result.removing
              ? copy.removed
              : copy.added
            : copy.failed,
          result.ok ? "success" : "error",
        );
      }}
      aria-pressed={active}
      aria-label={active ? copy.remove(item.title) : copy.add(item.title)}
      className={`border-border/60 hover:border-accent focus-visible:outline-accent flex items-center justify-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-semibold whitespace-nowrap transition focus-visible:outline-2 ${
        active ? copy.activeClass : "text-text-primary"
      } ${className}`}
    >
      <span aria-hidden="true" className="text-base leading-none">
        {active ? copy.on : copy.off}
      </span>
      {active ? copy.onLabel : copy.offLabel}
    </button>
  );
}
