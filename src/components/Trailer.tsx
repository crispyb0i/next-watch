import { useState } from "react";
import { pickTrailer, type Video } from "../lib/tmdb";

/** Facade first: a poster-ish button, then the iframe on click. Keeps YouTube's
 *  ~1MB player (and its cookies) off the page for people who never press play. */
export default function Trailer({ videos }: { videos: Video[] | undefined }) {
  const [playing, setPlaying] = useState(false);
  const trailer = pickTrailer(videos);

  if (!trailer) return null;

  return (
    <div className="mt-14">
      <h2 className="text-text-primary text-xl font-extrabold tracking-tight">
        Trailer
      </h2>

      <div className="border-border/60 bg-surface-muted shadow-card relative mt-6 aspect-video w-full overflow-hidden rounded-2xl border">
        {playing ? (
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${trailer.key}?autoplay=1`}
            title={trailer.name}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="h-full w-full"
          />
        ) : (
          <button
            type="button"
            onClick={() => setPlaying(true)}
            aria-label={`Play trailer: ${trailer.name}`}
            className="group relative block h-full w-full cursor-pointer"
          >
            <img
              src={`https://i.ytimg.com/vi/${trailer.key}/hqdefault.jpg`}
              alt=""
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
            />
            <span className="absolute inset-0 bg-black/35 transition group-hover:bg-black/20" />
            <span className="bg-accent text-accent-contrast shadow-glow absolute top-1/2 left-1/2 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-2xl transition group-hover:scale-110">
              ▶
            </span>
          </button>
        )}
      </div>

      <p className="text-text-muted mt-2 line-clamp-1 text-xs">
        {trailer.name}
      </p>
    </div>
  );
}
