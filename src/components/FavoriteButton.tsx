import {
  kindOf,
  toggleFavorite,
  useFavorites,
  type Favorite,
} from "../lib/favorites";
import { notify } from "../lib/notifications";
import { requireAuth } from "../lib/auth/gate";
import ActionIcon from "./ActionIcon";
import IconTooltip from "./IconTooltip";

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
  activeLabel,
  compact = false,
  primary = false,
}: {
  item: Favorite;
  className?: string;
  activeLabel?: string;
  compact?: boolean;
  primary?: boolean;
}) {
  const favorites = useFavorites();
  const mediaType = item.mediaType ?? "movie";
  const kind = kindOf(item);
  const copy = style[kind];
  const active = favorites.some(
    (entry) =>
      entry.id === item.id &&
      (entry.mediaType ?? "movie") === mediaType &&
      (entry.season ?? null) === (item.season ?? null) &&
      kindOf(entry) === kind,
  );

  return (
    <IconTooltip
      enabled={compact}
      label={
        kind === "favorite"
          ? active
            ? "Remove favorite"
            : "Favorite"
          : active
            ? "Remove from watchlist"
            : "Add to watchlist"
      }
    >
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
        className={`focus-visible:outline-accent flex items-center justify-center gap-1.5 rounded-full border text-sm font-semibold whitespace-nowrap transition focus-visible:outline-2 ${compact ? "size-11 shrink-0" : primary ? "h-11 px-5" : "px-3 py-1.5"} ${
          primary
            ? active
              ? "border-accent/50 bg-accent/15 text-accent-hover hover:bg-accent/25"
              : "border-accent bg-accent text-accent-contrast hover:bg-accent-hover"
            : `border-border/60 hover:border-accent ${active ? copy.activeClass : "text-text-primary"}`
        } ${className}`}
      >
        {compact ? (
          <ActionIcon kind={kind} active={active} />
        ) : (
          <>
            <span aria-hidden="true" className="text-base leading-none">
              {active ? copy.on : copy.off}
            </span>
            {active ? (activeLabel ?? copy.onLabel) : copy.offLabel}
          </>
        )}
      </button>
    </IconTooltip>
  );
}
