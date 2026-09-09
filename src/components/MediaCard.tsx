export default function MediaCard({
  href,
  title,
  subtitle,
  poster,
}: {
  href: string;
  title: string;
  subtitle?: string;
  poster: string | null;
}) {
  return (
    <li className="group border-border bg-surface hover:border-accent/50 rounded-card overflow-hidden border shadow-sm transition hover:-translate-y-1 hover:shadow-lg">
      <a href={href}>
        <div className="bg-surface-muted aspect-[2/3] overflow-hidden">
          {poster ? (
            <img
              src={poster}
              alt={title}
              width={200}
              height={300}
              loading="lazy"
              className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
            />
          ) : (
            <div className="text-text-muted flex h-full w-full items-center justify-center px-3 text-center text-sm">
              No image
            </div>
          )}
        </div>
        <div className="p-3">
          <p className="text-text-primary line-clamp-2 text-sm font-semibold">
            {title}
          </p>
          {subtitle && (
            <p className="text-text-muted mt-1 text-xs">{subtitle}</p>
          )}
        </div>
      </a>
    </li>
  );
}
