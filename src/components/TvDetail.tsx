import { useQuery } from "@tanstack/react-query";
import {
  getTvShowCredits,
  getTvShowDetails,
  posterUrl,
  backdropUrl,
} from "../lib/tmdb";
import QueryProvider from "./QueryProvider";
import MediaDetail, { useIdSearchParam } from "./MediaDetail";

function TvDetailInner({ tvId }: { tvId: number }) {
  const detailsQuery = useQuery({
    queryKey: ["tv", tvId],
    queryFn: ({ signal }) => getTvShowDetails(tvId, signal),
  });
  const creditsQuery = useQuery({
    queryKey: ["tv-credits", tvId],
    queryFn: ({ signal }) => getTvShowCredits(tvId, signal),
  });

  if (detailsQuery.isError) {
    return (
      <p className="rounded-card bg-danger-surface/60 text-danger border-danger/40 mx-auto max-w-3xl border px-4 py-3 text-center text-sm">
        Couldn't load this show.
      </p>
    );
  }

  if (!detailsQuery.data) {
    return <p className="text-text-muted text-center text-sm">Loading…</p>;
  }

  const show = detailsQuery.data;
  const meta = [
    show.first_air_date?.slice(0, 4),
    show.number_of_seasons &&
      `${show.number_of_seasons} season${show.number_of_seasons === 1 ? "" : "s"}`,
  ].filter((item): item is string => Boolean(item));

  return (
    <MediaDetail
      backdrop={backdropUrl(show.backdrop_path)}
      poster={posterUrl(show.poster_path, "w500")}
      title={show.name}
      tagline={show.tagline}
      meta={meta}
      genres={show.genres.map((genre) => genre.name)}
      voteAverage={show.vote_average}
      overview={show.overview}
      cast={creditsQuery.data?.cast ?? []}
    />
  );
}

export default function TvDetail() {
  const tvId = useIdSearchParam();

  return (
    <QueryProvider>
      {tvId ? (
        <TvDetailInner tvId={tvId} />
      ) : (
        <p className="text-text-muted text-center text-sm">
          No show specified.
        </p>
      )}
    </QueryProvider>
  );
}
