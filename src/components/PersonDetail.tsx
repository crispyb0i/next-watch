import { useQuery } from "@tanstack/react-query";
import {
  getPersonCredits,
  getPersonDetails,
  posterUrl,
  profileUrl,
} from "../lib/tmdb";
import QueryProvider from "./QueryProvider";
import { useIdSearchParam } from "./MediaDetail";
import MediaCard from "./MediaCard";

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
    <div className="mt-10">
      <h2 className="text-text-primary text-lg font-bold">Known for</h2>
      <ul className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
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
              />
            ) : (
              <MediaCard
                key={`tv-${item.id}`}
                href={`/tv?id=${item.id}`}
                title={item.name}
                subtitle={item.first_air_date?.slice(0, 4)}
                poster={posterUrl(item.poster_path)}
              />
            ),
          )}
      </ul>
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
      <p className="rounded-card mx-auto max-w-3xl border border-red-200 bg-red-50 px-4 py-3 text-center text-sm text-red-600 dark:border-red-900 dark:bg-red-950 dark:text-red-400">
        Couldn't load this person.
      </p>
    );
  }

  if (!person) {
    return <p className="text-text-muted text-center text-sm">Loading…</p>;
  }

  const photo = profileUrl(person.profile_path);
  const meta = [
    person.known_for_department,
    person.birthday &&
      `Born ${person.birthday}${person.deathday ? ` — Died ${person.deathday}` : ""}`,
    person.place_of_birth,
  ].filter((item): item is string => Boolean(item));

  return (
    <div className="mx-auto w-full max-w-3xl">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
        <div className="bg-surface-muted rounded-card w-40 shrink-0 overflow-hidden sm:w-48">
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
          <h1 className="text-text-primary text-2xl font-extrabold tracking-tight sm:text-3xl">
            {person.name}
          </h1>

          <div className="text-text-muted mt-2 flex flex-col gap-1 text-sm">
            {meta.map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>

          {person.biography && (
            <p className="text-text-primary mt-4 text-sm leading-relaxed whitespace-pre-line">
              {person.biography}
            </p>
          )}
        </div>
      </div>

      <Filmography personId={personId} />
    </div>
  );
}

export default function PersonDetail() {
  const personId = useIdSearchParam();

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
