import { useEffect, useState } from "react";
import type { CastMember } from "../lib/tmdb";
import { profileUrl, userRegion } from "../lib/tmdb";
import ImageViewer from "./ImageViewer";

/** `US` on the server, the real region after hydration. Read post-mount so
 *  the SSR markup and first client render agree. */
export function useRegion(): string {
  const [region, setRegion] = useState("US");
  useEffect(() => {
    try {
      const saved = localStorage.getItem("next-watch-region");
      setRegion(saved && /^[A-Z]{2}$/.test(saved) ? saved : userRegion());
    } catch {
      setRegion(userRegion());
    }
  }, []);
  return region;
}

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
      <ul className="mt-6 grid grid-cols-3 gap-5 sm:grid-cols-4 md:grid-cols-6">
        {cast.slice(0, 12).map((member) => (
          <CastCard key={member.id} member={member} />
        ))}
      </ul>
    </div>
  );
}

function CastCard({ member }: { member: CastMember }) {
  const photo = profileUrl(member.profile_path);

  return (
    <li className="text-center">
      <a href={`/person?id=${member.id}`} className="group block">
        <div className="bg-surface-muted border-border/60 group-hover:border-accent group-hover:shadow-accent/25 relative mx-auto aspect-[2/3] w-full overflow-hidden rounded-xl border transition group-hover:shadow-lg">
          {photo ? (
            <img
              src={photo}
              alt={member.name}
              width={185}
              height={278}
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover object-top"
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
  posterLarge,
  title,
  tagline,
  meta,
  genres,
  voteAverage,
  certification,
  overview,
  details,
  cast,
  actions,
  before,
  after,
}: {
  backdrop: string | null;
  /** `original` source, served to wide viewports so the full-bleed hero isn't upscaled. */
  backdropLarge?: string | null;
  poster: string | null;
  posterLarge?: string | null;
  title: string;
  tagline: string;
  meta: string[];
  genres: string[];
  voteAverage: number;
  /** Region content rating, e.g. `PG-13` / `TV-MA`. */
  certification?: string | null;
  overview: string;
  /** Production facts and credits below the overview. */
  details?: React.ReactNode;
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
        /* Let the image set the banner height so the entire backdrop remains
           visible, then fade its lower edge behind the overlapping content. */
        <div
          aria-hidden="true"
          className="relative left-1/2 -mt-6 w-screen -translate-x-1/2 sm:-mt-14"
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
            width={1280}
            height={720}
            className="block h-auto w-full"
          />
          <div className="from-surface/40 to-surface/40 absolute inset-0 bg-linear-to-r from-0% via-transparent via-50% to-100%" />
          <div className="from-surface/0 via-surface/90 to-surface absolute inset-0 bg-linear-to-b from-25% via-60% to-95% lg:from-10% lg:via-45%" />
        </div>
      )}

      <div
        className={`flex flex-col gap-7 md:flex-row md:items-start md:gap-8 ${
          backdrop
            ? "relative z-10 -mt-20 sm:-mt-32 md:-mt-64 lg:-mt-[calc(27vw+9rem)]"
            : ""
        }`}
      >
        <div className="w-52 max-w-full shrink-0 sm:w-60 md:w-[280px]">
          <div className="bg-surface-muted shadow-card border-border/60 overflow-hidden rounded-2xl border">
            {poster ? (
              <ImageViewer
                src={poster}
                fullSrc={posterLarge}
                alt={`${title} poster`}
              />
            ) : (
              <div className="text-text-muted flex aspect-[2/3] w-full items-center justify-center text-sm">
                No image
              </div>
            )}
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <h1 className="text-text-primary text-[38px] leading-[1.08] font-black tracking-tight text-balance md:text-[42px] lg:text-[44px]">
              {title}
            </h1>
            {voteAverage > 0 && (
              <span
                className="text-star inline-flex shrink-0 items-center gap-1.5 text-lg leading-none font-semibold"
                title="TMDB rating"
              >
                <span aria-hidden="true">★</span>
                <span className="sr-only">TMDB rating: </span>
                <span>
                  {(voteAverage / 2).toFixed(1)}
                  <span className="text-text-muted ml-0.5 text-xs font-normal">
                    /5
                  </span>
                </span>
              </span>
            )}
          </div>
          {tagline && (
            <p className="text-text-muted mt-2 text-base italic">{tagline}</p>
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
            <div className="mt-5 flex flex-wrap items-center gap-2">
              {actions}
            </div>
          )}

          {overview && (
            <div className="mt-6 max-w-[700px]">
              <h2 className="text-text-primary text-lg font-extrabold tracking-tight">
                Overview
              </h2>
              <p className="text-text-muted mt-2.5 text-[15px] leading-8">
                {overview}
              </p>
            </div>
          )}
          {details}
        </div>
      </div>

      {before}
      <CastGrid cast={cast} />
      {after}
    </div>
  );
}
