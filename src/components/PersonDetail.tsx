import { useQuery } from "@tanstack/react-query";
import {
  getPersonCredits,
  getPersonDetails,
  posterUrl,
  profileUrl,
} from "../lib/tmdb";
import QueryProvider from "./QueryProvider";
import MediaCard from "./MediaCard";
import ImageGroup from "./ImageGroup";
import { DetailSkeleton } from "./Skeleton";

function Filmography({ personId }: { personId: number }) {
  const { data: credits } = useQuery({
    queryKey: ["person-credits", personId],
    queryFn: ({ signal }) => getPersonCredits(personId, signal),
  });

  if (!credits || credits.length === 0) return null;

  const sorted = [...credits]
    .filter((item) => item.poster_path)
    .sort((a, b) => {
      const dateA =
        a.media_type === "movie" ? a.release_date : a.first_air_date;
      const dateB =
        b.media_type === "movie" ? b.release_date : b.first_air_date;
      return (dateB ?? "").localeCompare(dateA ?? "");
    });

  return (
    <div className="mt-14">
      <h2 className="text-text-primary text-xl font-extrabold tracking-tight">
        Known for
      </h2>
      <ImageGroup>
        <ul className="mt-6 grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {sorted
            .slice(0, 12)
            .map((item) =>
              item.media_type === "movie" ? (
                <MediaCard
                  key={`movie-${item.id}`}
                  href={`/movie?id=${item.id}`}
                  title={item.title}
                  subtitle={item.release_date?.slice(0, 4)}
                  poster={posterUrl(item.poster_path)}
                  rating={item.vote_average}
                />
              ) : (
                <MediaCard
                  key={`tv-${item.id}`}
                  href={`/tv?id=${item.id}`}
                  title={item.name}
                  subtitle={item.first_air_date?.slice(0, 4)}
                  poster={posterUrl(item.poster_path)}
                  rating={item.vote_average}
                />
              ),
            )}
        </ul>
      </ImageGroup>
    </div>
  );
}

function PersonDetailInner({ personId }: { personId: number }) {
  const { data: person, isError } = useQuery({
    queryKey: ["person", personId],
    queryFn: ({ signal }) => getPersonDetails(personId, signal),
  });

  if (isError) {
    return (
      <p className="rounded-card bg-danger-surface/60 text-danger border-danger/40 mx-auto max-w-3xl border px-4 py-3 text-center text-sm">
        Couldn't load this person.
      </p>
    );
  }

  if (!person) return <DetailSkeleton backdrop={false} />;

  const photo = profileUrl(person.profile_path);
  const meta = [
    person.known_for_department,
    person.birthday &&
      `Born ${person.birthday}${person.deathday ? ` — Died ${person.deathday}` : ""}`,
    person.place_of_birth,
  ].filter((item): item is string => Boolean(item));

  return (
    <div className="w-full">
      <div className="flex flex-col gap-8 sm:flex-row sm:items-start">
        <div className="bg-surface-muted shadow-card border-border/60 w-40 shrink-0 overflow-hidden rounded-2xl border sm:w-52">
          {photo ? (
            <img
              src={photo}
              alt={person.name}
              className="aspect-[2/3] w-full object-cover"
            />
          ) : (
            <div className="text-text-muted flex aspect-[2/3] w-full items-center justify-center text-sm">
              No photo
            </div>
          )}
        </div>

        <div className="min-w-0">
          <h1 className="text-text-primary text-3xl font-black tracking-tighter sm:text-4xl">
            {person.name}
          </h1>

          <div className="text-text-muted mt-2 flex flex-col gap-1 text-sm">
            {meta.map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>

          {person.biography && (
            <p className="text-text-muted mt-5 leading-relaxed whitespace-pre-line">
              {person.biography}
            </p>
          )}
        </div>
      </div>

      <Filmography personId={personId} />
    </div>
  );
}

export default function PersonDetail({
  personId,
}: {
  personId: number | null;
}) {
  return (
    <QueryProvider>
      {personId ? (
        <PersonDetailInner personId={personId} />
      ) : (
        <p className="text-text-muted text-center text-sm">
          No person specified.
        </p>
      )}
    </QueryProvider>
  );
}
