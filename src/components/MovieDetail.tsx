import { useQuery } from "@tanstack/react-query";
import {
  getMovieCredits,
  getMovieDetails,
  posterUrl,
  backdropUrl,
} from "../lib/tmdb";
import QueryProvider from "./QueryProvider";
import MediaDetail, { useIdSearchParam } from "./MediaDetail";

function MovieDetailInner({ movieId }: { movieId: number }) {
  const detailsQuery = useQuery({
    queryKey: ["movie", movieId],
    queryFn: ({ signal }) => getMovieDetails(movieId, signal),
  });
  const creditsQuery = useQuery({
    queryKey: ["movie-credits", movieId],
    queryFn: ({ signal }) => getMovieCredits(movieId, signal),
  });

  if (detailsQuery.isError) {
    return (
      <p className="rounded-card bg-danger-surface/60 text-danger border-danger/40 mx-auto max-w-3xl border px-4 py-3 text-center text-sm">
        Couldn't load this movie.
      </p>
    );
  }

  if (!detailsQuery.data) {
    return <p className="text-text-muted text-center text-sm">Loading…</p>;
  }

  const movie = detailsQuery.data;
  const meta = [
    movie.release_date?.slice(0, 4),
    movie.runtime && `${movie.runtime} min`,
  ].filter((item): item is string => Boolean(item));

  return (
    <MediaDetail
      backdrop={backdropUrl(movie.backdrop_path)}
      poster={posterUrl(movie.poster_path, "w500")}
      title={movie.title}
      tagline={movie.tagline}
      meta={meta}
      genres={movie.genres.map((genre) => genre.name)}
      voteAverage={movie.vote_average}
      overview={movie.overview}
      cast={creditsQuery.data?.cast ?? []}
    />
  );
}

export default function MovieDetail() {
  const movieId = useIdSearchParam();

  return (
    <QueryProvider>
      {movieId ? (
        <MovieDetailInner movieId={movieId} />
      ) : (
        <p className="text-text-muted text-center text-sm">
          No movie specified.
        </p>
      )}
    </QueryProvider>
  );
}
