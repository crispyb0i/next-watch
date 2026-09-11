import { useEffect, useState } from "react";
import type { CastMember } from "../lib/tmdb";
import { profileUrl, userRegion } from "../lib/tmdb";

/** `US` on the server, the real region after hydration. Read post-mount so
 *  the SSR markup and first client render agree. */
export function useRegion(): string {
  const [region, setRegion] = useState("US");
  useEffect(() => setRegion(userRegion()), []);
  return region;
}
import ImageGroup, { useGroupImage } from "./ImageGroup";

/** Parsed server-side so detail pages never hydrate a "not specified" flash. */
export function parseId(raw: string | null): number | null {
  const value = Number(raw);
  return raw !== null && raw !== "" && Number.isInteger(value) && value > 0
    ? value
    : null;
}

/** Like `parseId` but `0` is legal — that's the specials season. */
export function parseSeasonNumber(raw: string | null): number | null {
  const value = Number(raw);
  return raw !== null && raw !== "" && Number.isInteger(value) && value >= 0
    ? value
    : null;
}

export function CastGrid({
  cast,
  title = "Cast",
}: {
  cast: CastMember[];
  title?: string;
}) {
  if (cast.length === 0) return null;

  return (
    <div className="mt-14">
      <h2 className="text-text-primary text-xl font-extrabold tracking-tight">
        {title}
      </h2>
      <ImageGroup>
        <ul className="mt-6 grid grid-cols-3 gap-5 sm:grid-cols-4 md:grid-cols-6">
          {cast.slice(0, 12).map((member) => (
            <CastCard key={member.id} member={member} />
          ))}
        </ul>
      </ImageGroup>
    </div>
  );
}

function CastCard({ member }: { member: CastMember }) {
  const photo = profileUrl(member.profile_path);
  const { ready, onSettled } = useGroupImage(Boolean(photo));

  return (
    <li className="text-center">
      <a href={`/person?id=${member.id}`} className="group block">
        <div className="bg-surface-muted border-border/60 group-hover:border-accent group-hover:shadow-accent/25 relative mx-auto aspect-square w-full overflow-hidden rounded-full border transition group-hover:shadow-lg">
          {!ready && photo && (
            <div className="bg-surface-muted/60 absolute inset-0 animate-pulse" />
          )}
          {photo ? (
            <img
              src={photo}
              alt={member.name}
              loading="lazy"
              decoding="async"
              onLoad={onSettled}
              onError={onSettled}
              className={`h-full w-full object-cover transition-opacity duration-500 ${
                ready ? "opacity-100" : "opacity-0"
              }`}
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
}

export default function MediaDetail({
  backdrop,
  backdropLarge,
  poster,
  title,
  tagline,
  meta,
  genres,
  voteAverage,
  certification,
  overview,
  cast,
  actions,
  before,
  after,
}: {
  backdrop: string | null;
  /** `original` source, served to wide viewports so the full-bleed hero isn't upscaled. */
  backdropLarge?: string | null;
  poster: string | null;
  title: string;
  tagline: string;
  meta: string[];
  genres: string[];
  voteAverage: number;
  /** Region content rating, e.g. `PG-13` / `TV-MA`. */
  certification?: string | null;
  overview: string;
  cast: CastMember[];
  actions?: React.ReactNode;
  /** Rendered between the header and the cast grid (seasons, etc.). */
  before?: React.ReactNode;
  /** Rendered after the cast grid (recommendations, etc.). */
  after?: React.ReactNode;
}) {
  return (
    <div className="w-full">
      {backdrop && (
        /* Full-bleed hero: breaks out of the page container, then fades to the
           page background on every edge so the content can sit on top of it. */
        <div
          aria-hidden="true"
          className="relative left-1/2 -mt-8 h-[56vh] max-h-[28rem] min-h-80 w-screen -translate-x-1/2 sm:-mt-14 sm:h-[68vh] sm:max-h-[36rem]"
        >
          <img
            src={backdrop}
            srcSet={
              backdropLarge
                ? `${backdrop} 1280w, ${backdropLarge} 2560w`
                : undefined
            }
            sizes="100vw"
            alt=""
            className="h-full w-full object-cover object-top"
            style={{
              maskImage:
                "linear-gradient(to bottom, black 40%, transparent 100%), linear-gradient(to right, transparent, black 12%, black 88%, transparent)",
              maskComposite: "intersect",
              WebkitMaskImage:
                "linear-gradient(to bottom, black 40%, transparent 100%), linear-gradient(to right, transparent, black 12%, black 88%, transparent)",
              WebkitMaskComposite: "source-in",
            }}
          />
          <div className="from-surface absolute inset-x-0 bottom-0 h-2/3 bg-linear-to-t to-transparent" />
        </div>
      )}

      <div
        className={`flex flex-col gap-8 sm:flex-row sm:items-start ${
          backdrop ? "relative z-10 -mt-24 sm:-mt-32" : ""
        }`}
      >
        <div className="w-40 shrink-0 sm:w-52">
          <div className="bg-surface-muted shadow-card border-border/60 overflow-hidden rounded-2xl border">
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
            {certification && (
              <span className="border-border text-text-muted rounded border px-1.5 py-0.5 text-xs font-bold">
                {certification}
              </span>
            )}
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

          {actions && (
            <div className="mt-5 flex flex-wrap gap-2">{actions}</div>
          )}

          {overview && (
            <p className="text-text-muted mt-5 leading-relaxed">{overview}</p>
          )}
        </div>
      </div>

      {before}
      <CastGrid cast={cast} />
      {after}
    </div>
  );
}
