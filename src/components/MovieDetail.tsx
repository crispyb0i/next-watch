import type { MovieDetails } from "../lib/tmdb";
import { useQuery } from "@tanstack/react-query";
import {
  getMovieDetails,
  movieCertification,
  pickRelated,
  posterUrl,
  backdropUrl,
} from "../lib/tmdb";
import QueryProvider from "./QueryProvider";
import MediaDetail, { useRegion } from "./MediaDetail";
import FavoriteButton from "./FavoriteButton";
import WatchLogButton from "./WatchLogButton";
import { DetailSkeleton } from "./Skeleton";
import Trailer from "./Trailer";
import RelatedGrid from "./RelatedGrid";
import WatchProviders from "./WatchProviders";

function MovieDetailInner({
  movieId,
  initialData,
}: {
  movieId: number;
  initialData?: MovieDetails;
}) {
  const region = useRegion();
  const detailsQuery = useQuery({
    initialData,
    queryKey: ["movie", movieId],
    queryFn: ({ signal }) => getMovieDetails(movieId, signal),
  });

  if (detailsQuery.isError) {
    return (
      <p className="rounded-card bg-danger-surface/60 text-danger border-danger/40 mx-auto max-w-3xl border px-4 py-3 text-center text-sm">
        Couldn't load this movie.
      </p>
    );
  }

  if (!detailsQuery.data) return <DetailSkeleton />;

  const movie = detailsQuery.data;
  const meta = [
    movie.release_date?.slice(0, 4),
    movie.runtime && `${movie.runtime} min`,
  ].filter((item): item is string => Boolean(item));

  return (
    <MediaDetail
      backdrop={backdropUrl(movie.backdrop_path)}
      backdropLarge={backdropUrl(movie.backdrop_path, "original")}
      poster={posterUrl(movie.poster_path, "w500")}
      title={movie.title}
      tagline={movie.tagline}
      meta={meta}
      genres={movie.genres.map((genre) => genre.name)}
      voteAverage={movie.vote_average}
      certification={movieCertification(movie, region)}
      overview={movie.overview}
      cast={movie.credits?.cast ?? []}
      before={
        <>
          <Trailer videos={movie.videos?.results} />
          <WatchProviders
            providers={movie["watch/providers"]}
            region={region}
          />
        </>
      }
      after={
        <RelatedGrid
          items={pickRelated(movie.recommendations, movie.similar)}
          mediaType="movie"
        />
      }
      actions={
        <>
          {(["favorite", "watchlist"] as const).map((kind) => (
            <FavoriteButton
              key={kind}
              item={{
                id: movie.id,
                kind,
                title: movie.title,
                poster: posterUrl(movie.poster_path),
                subtitle: movie.release_date?.slice(0, 4),
                rating: movie.vote_average,
              }}
            />
          ))}
          <WatchLogButton
            item={{
              tmdbId: movie.id,
              title: movie.title,
              poster: posterUrl(movie.poster_path),
              subtitle: movie.release_date?.slice(0, 4),
            }}
          />
        </>
      }
    />
  );
}

export default function MovieDetail({
  movieId,
  initialData,
}: {
  movieId: number | null;
  initialData?: MovieDetails;
}) {
  return (
    <QueryProvider>
      {movieId ? (
        <MovieDetailInner movieId={movieId} initialData={initialData} />
      ) : (
        <p className="text-text-muted text-center text-sm">
          No movie specified.
        </p>
      )}
    </QueryProvider>
  );
}
