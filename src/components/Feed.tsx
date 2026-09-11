import { useQuery } from "@tanstack/react-query";
import { authClient, getJWTToken } from "../lib/auth/client";
import { entryHref } from "../lib/watchLog";
import QueryProvider from "./QueryProvider";
import { PosterGridSkeleton } from "./Skeleton";
import AuthGate from "./AuthGate";

interface FeedEntry {
  id: number;
  tmdbId: number;
  mediaType: "movie" | "tv";
  season: number | null;
  episode: number | null;
  title: string;
  poster: string | null;
  subtitle: string | null;
  rating: number | null;
  review: string | null;
  watchedOn: string;
  rewatch: boolean;
  userId: string;
  userName: string | null;
  userImage: string | null;
}

async function fetchFeed(): Promise<FeedEntry[] | null> {
  const jwt = await getJWTToken();
  if (!jwt) return null; // signed out
  const response = await fetch("/api/feed", {
    headers: { authorization: `Bearer ${jwt}` },
  });
  if (!response.ok) throw new Error("Couldn't load your feed.");
  return response.json();
}

const formatDate = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

const nameOf = (entry: FeedEntry) => entry.userName || "Movie fan";

function Entry({ entry }: { entry: FeedEntry }) {
  const href = entryHref(entry);
  const name = nameOf(entry);

  return (
    <li className="border-border/60 bg-surface-muted/30 flex gap-4 rounded-2xl border p-4">
      <a href={href} className="shrink-0">
        {entry.poster ? (
          <img
            src={entry.poster}
            alt={entry.title}
            loading="lazy"
            className="bg-surface-muted aspect-[2/3] w-16 rounded-lg object-cover"
          />
        ) : (
          <div className="bg-surface-muted aspect-[2/3] w-16 rounded-lg" />
        )}
      </a>
      <div className="min-w-0">
        <p className="text-text-muted flex items-center gap-2 text-xs">
          <a
            href={`/u/${entry.userId}`}
            className="text-text-secondary inline-flex items-center gap-1.5 font-bold hover:underline"
          >
            {entry.userImage && (
              <img
                src={entry.userImage}
                alt=""
                referrerPolicy="no-referrer"
                className="h-5 w-5 rounded-full object-cover"
              />
            )}
            {name}
          </a>
          <span>watched · {formatDate(entry.watchedOn)}</span>
        </p>
        <a
          href={href}
          className="text-text-primary mt-1 block font-bold hover:underline"
        >
          {entry.title}
        </a>
        <p className="text-text-muted mt-1 text-xs">
          {entry.subtitle}
          {entry.rating != null && (
            <span> · {"★".repeat(Math.round(entry.rating))}</span>
          )}
          {entry.rewatch && <span> · rewatch</span>}
        </p>
        {entry.review && (
          <p className="text-text-secondary mt-2 text-sm">{entry.review}</p>
        )}
      </div>
    </li>
  );
}

function FeedList() {
  const { data: session, isPending } = authClient.useSession();
  const { data, isLoading, error } = useQuery({
    queryKey: ["feed"],
    queryFn: fetchFeed,
    enabled: Boolean(session),
  });

  if (isPending || isLoading) return <PosterGridSkeleton />;
  if (error)
    return <p className="text-danger text-sm">{(error as Error).message}</p>;

  if (!data?.length)
    return (
      <p className="text-text-muted text-sm">
        Nothing here yet. Follow someone from their profile and their watches
        show up here.
      </p>
    );

  return (
    <ul className="space-y-3">
      {data.map((entry) => (
        <Entry key={entry.id} entry={entry} />
      ))}
    </ul>
  );
}

export default function Feed() {
  return (
    <QueryProvider>
      <div className="w-full">
        <h1 className="text-text-primary text-2xl font-black tracking-tight">
          Friends' activity
        </h1>
        <div className="mt-8">
          <AuthGate>
            <FeedList />
          </AuthGate>
        </div>
      </div>
    </QueryProvider>
  );
}
