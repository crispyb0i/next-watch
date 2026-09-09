import { useState, useEffect } from "react";
import type { CastMember } from "../lib/tmdb";
import { profileUrl } from "../lib/tmdb";

export function useIdSearchParam() {
  const [id, setId] = useState<number | null>(null);

  useEffect(() => {
    const value = Number(new URLSearchParams(window.location.search).get("id"));
    setId(Number.isInteger(value) && value > 0 ? value : null);
  }, []);

  return id;
}

export function CastGrid({ cast }: { cast: CastMember[] }) {
  if (cast.length === 0) return null;

  return (
    <div className="mt-14">
      <h2 className="text-text-primary text-xl font-extrabold tracking-tight">
        Cast
      </h2>
      <ul className="mt-6 grid grid-cols-3 gap-5 sm:grid-cols-4 md:grid-cols-6">
        {cast.slice(0, 12).map((member) => {
          const photo = profileUrl(member.profile_path);
          return (
            <li key={member.id} className="text-center">
              <a href={`/person?id=${member.id}`} className="group block">
                <div className="bg-surface-muted border-border/60 group-hover:border-accent group-hover:shadow-accent/25 mx-auto aspect-square w-full overflow-hidden rounded-full border transition group-hover:shadow-lg">
                  {photo ? (
                    <img
                      src={photo}
                      alt={member.name}
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="text-text-muted flex h-full w-full items-center justify-center text-xs">
                      No photo
                    </div>
                  )}
                </div>
                <p className="text-text-primary group-hover:text-accent mt-2 line-clamp-1 text-sm font-semibold transition">
                  {member.name}
                </p>
                <p className="text-text-muted line-clamp-1 text-xs">
                  {member.character}
                </p>
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default function MediaDetail({
  backdrop,
  poster,
  title,
  tagline,
  meta,
  genres,
  voteAverage,
  overview,
  cast,
}: {
  backdrop: string | null;
  poster: string | null;
  title: string;
  tagline: string;
  meta: string[];
  genres: string[];
  voteAverage: number;
  overview: string;
  cast: CastMember[];
}) {
  return (
    <div className="w-full">
      {backdrop && (
        <div className="border-border/50 relative mb-8 aspect-video overflow-hidden rounded-3xl border">
          <img src={backdrop} alt="" className="h-full w-full object-cover" />
          <div className="from-surface via-surface/40 absolute inset-0 bg-linear-to-t to-transparent" />
        </div>
      )}

      <div className="flex flex-col gap-8 sm:flex-row sm:items-start">
        <div className="bg-surface-muted shadow-card border-border/60 w-40 shrink-0 overflow-hidden rounded-2xl border sm:w-52">
          {poster ? (
            <img
              src={poster}
              alt={title}
              className="aspect-[2/3] w-full object-cover"
            />
          ) : (
            <div className="text-text-muted flex aspect-[2/3] w-full items-center justify-center text-sm">
              No image
            </div>
          )}
        </div>

        <div className="min-w-0">
          <h1 className="text-text-primary text-3xl font-black tracking-tighter text-balance sm:text-4xl">
            {title}
          </h1>
          {tagline && (
            <p className="text-text-muted mt-2 text-sm italic">{tagline}</p>
          )}

          <div className="text-text-muted mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
            {meta.map((item) => (
              <span key={item}>{item}</span>
            ))}
            {voteAverage > 0 && (
              <span className="text-star border-star/30 bg-star/10 rounded-full border px-2.5 py-0.5 font-bold">
                ★ {voteAverage.toFixed(1)}
              </span>
            )}
          </div>

          {genres.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {genres.map((genre) => (
                <span
                  key={genre}
                  className="bg-accent/15 text-accent-hover ring-accent/25 rounded-full px-3 py-1 text-xs font-semibold ring-1"
                >
                  {genre}
                </span>
              ))}
            </div>
          )}

          {overview && (
            <p className="text-text-muted mt-5 leading-relaxed">{overview}</p>
          )}
        </div>
      </div>

      <CastGrid cast={cast} />
    </div>
  );
}
