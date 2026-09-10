import FavoriteButton from "./FavoriteButton";

export default function MediaCard({
  href,
  title,
  subtitle,
  poster,
  rating,
  favoriteId,
}: {
  href: string;
  title: string;
  subtitle?: string | null;
  poster: string | null;
  rating?: number | null;
  /** TMDB movie id — pass to show the favorite toggle. */
  favoriteId?: number;
}) {
  return (
    <li className="group relative">
      <a href={href} className="block">
        <div className="border-border/60 bg-surface-muted shadow-card group-hover:border-accent/60 group-hover:shadow-glow relative aspect-[2/3] overflow-hidden rounded-2xl border transition duration-300 group-hover:-translate-y-1.5">
          {poster ? (
            <img
              src={poster}
              alt={title}
              width={200}
              height={300}
              loading="lazy"
              className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
            />
          ) : (
            <div className="text-text-muted flex h-full w-full items-center justify-center px-3 text-center text-sm">
              No image
            </div>
          )}

          {rating != null && rating > 0 && (
            <span className="text-star absolute top-2 right-2 rounded-full bg-black/60 px-2 py-0.5 text-xs font-bold backdrop-blur">
              ★ {rating.toFixed(1)}
            </span>
          )}

          <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/90 via-black/50 to-transparent p-3 pt-10">
            <p className="line-clamp-2 text-sm font-semibold text-white">
              {title}
            </p>
            {subtitle && (
              <p className="mt-0.5 text-xs text-white/60">{subtitle}</p>
            )}
          </div>
        </div>
      </a>

      {favoriteId !== undefined && (
        <FavoriteButton
          item={{ id: favoriteId, title, poster, subtitle, rating }}
          className="absolute top-2 left-2 z-10 duration-300 group-hover:-translate-y-1.5"
        />
      )}
    </li>
  );
}
