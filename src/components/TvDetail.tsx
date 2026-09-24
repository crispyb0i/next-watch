import ShowProgress from "./ShowProgress";
import type { TvShowDetails } from "../lib/tmdb";
import { useQuery } from "@tanstack/react-query";
import {
  flattenAggregateCast,
  getTvShowDetails,
  pickRelated,
  posterUrl,
  backdropUrl,
  tvCertification,
  type Season,
} from "../lib/tmdb";
import QueryProvider from "./QueryProvider";
import MediaDetail, { useRegion } from "./MediaDetail";
import FavoriteButton from "./FavoriteButton";
import ReviewButton from "./ReviewButton";
import Trailer from "./Trailer";
import RelatedGrid from "./RelatedGrid";
import WatchProviders from "./WatchProviders";
import { DetailSkeleton } from "./Skeleton";

function SeasonStrip({ tvId, seasons }: { tvId: number; seasons: Season[] }) {
  if (seasons.length === 0) return null;

  return (
    <div className="mt-14">
      <h2 className="text-text-primary text-xl font-extrabold tracking-tight">
        Seasons
      </h2>
      <ul className="mt-6 grid grid-cols-3 gap-5 sm:grid-cols-4 md:grid-cols-6">
        {seasons.map((season) => {
          const poster = posterUrl(season.poster_path);
          return (
            <li key={season.id}>
              <a
                href={`/tv/season?id=${tvId}&season=${season.season_number}`}
                className="group block"
              >
                <div className="bg-surface-muted border-border/60 group-hover:border-accent overflow-hidden rounded-xl border transition">
                  {poster ? (
                    <img
                      src={poster}
                      alt={season.name}
                      loading="lazy"
                      decoding="async"
                      className="aspect-[2/3] w-full object-cover"
                    />
                  ) : (
                    <div className="text-text-muted grid aspect-[2/3] w-full place-items-center text-xs">
                      No image
                    </div>
                  )}
                </div>
                <p className="text-text-primary group-hover:text-accent mt-2 line-clamp-1 text-sm font-semibold transition">
                  {season.name}
                </p>
                <p className="text-text-muted text-xs">
                  {season.episode_count} ep
                  {season.episode_count === 1 ? "" : "s"}
                </p>
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function TvDetailInner({
  tvId,
  initialData,
}: {
  tvId: number;
  initialData?: TvShowDetails;
}) {
  const region = useRegion();
  const detailsQuery = useQuery({
    initialData,
    queryKey: ["tv", tvId],
    queryFn: ({ signal }) => getTvShowDetails(tvId, signal),
  });

  if (detailsQuery.isError) {
    return (
      <p className="rounded-card bg-danger-surface/60 text-danger border-danger/40 mx-auto max-w-3xl border px-4 py-3 text-center text-sm">
        Couldn't load this show.
      </p>
    );
  }

  if (!detailsQuery.data) return <DetailSkeleton />;

  const show = detailsQuery.data;
  const meta = [
    show.first_air_date?.slice(0, 4),
    show.number_of_seasons &&
      `${show.number_of_seasons} season${show.number_of_seasons === 1 ? "" : "s"}`,
  ].filter((item): item is string => Boolean(item));

  return (
    <MediaDetail
      backdrop={backdropUrl(show.backdrop_path)}
      backdropLarge={backdropUrl(show.backdrop_path, "original")}
      poster={posterUrl(show.poster_path, "w500")}
      title={show.name}
      tagline={show.tagline}
      meta={meta}
      genres={show.genres.map((genre) => genre.name)}
      voteAverage={show.vote_average}
      certification={tvCertification(show, region)}
      overview={show.overview}
      cast={flattenAggregateCast(show.aggregate_credits)}
      after={
        <RelatedGrid
          items={pickRelated(show.recommendations, show.similar)}
          mediaType="tv"
        />
      }
      before={
        <>
          <Trailer videos={show.videos?.results} />
          <WatchProviders providers={show["watch/providers"]} region={region} />
          <ShowProgress tvId={tvId} seasons={show.seasons ?? []} />
          <SeasonStrip tvId={tvId} seasons={show.seasons ?? []} />
        </>
      }
      actions={
        <>
          {(["favorite", "watchlist"] as const).map((kind) => (
            <FavoriteButton
              key={kind}
              item={{
                id: show.id,
                mediaType: "tv",
                kind,
                title: show.name,
                poster: posterUrl(show.poster_path),
                subtitle: show.first_air_date?.slice(0, 4),
                rating: show.vote_average,
                href: `/tv?id=${show.id}`,
              }}
            />
          ))}
          <ReviewButton
            item={{
              tmdbId: show.id,
              mediaType: "tv",
              title: show.name,
              poster: posterUrl(show.poster_path),
              subtitle: show.first_air_date?.slice(0, 4),
            }}
          />
        </>
      }
    />
  );
}

export default function TvDetail({
  tvId,
  initialData,
}: {
  tvId: number | null;
  initialData?: TvShowDetails;
}) {
  return (
    <QueryProvider>
      {tvId ? (
        <TvDetailInner tvId={tvId} initialData={initialData} />
      ) : (
        <p className="text-text-muted text-center text-sm">
          No show specified.
        </p>
      )}
    </QueryProvider>
  );
}
