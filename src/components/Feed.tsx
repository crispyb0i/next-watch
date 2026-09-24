import { useInfiniteQuery } from "@tanstack/react-query";
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
  notes: string | null;
  watchedOn: string;
  userId: string;
  userName: string | null;
  userImage: string | null;
}

async function fetchFeed(
  offset: number,
  signal?: AbortSignal,
): Promise<FeedEntry[]> {
  const jwt = await getJWTToken();
  if (!jwt) throw new Error("Sign in to continue.");
  const response = await fetch(`/api/feed?limit=30&offset=${offset}`, {
    signal,
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
        <p className="text-text-muted mt-1 text-xs">{entry.subtitle}</p>
        {entry.notes && (
          <p className="text-text-secondary mt-2 text-sm">{entry.notes}</p>
        )}
      </div>
    </li>
  );
}

function FeedList() {
  const { data: session } = authClient.useSession();
  const {
    data,
    isPending,
    error,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
    refetch,
  } = useInfiniteQuery({
    queryKey: ["feed", session?.user.id],
    enabled: Boolean(session),
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }) => fetchFeed(pageParam, signal),
    getNextPageParam: (last, pages) =>
      last.length === 30 ? pages.length * 30 : undefined,
  });
  const entries = data?.pages.flat() ?? [];
  return (
    <div className="w-full">
      <h1 className="text-text-primary text-xl font-extrabold">
        Friends’ activity
      </h1>
      {isPending && <PosterGridSkeleton />}
      {error && (
        <p role="alert" className="text-danger mt-4">
          {error.message}{" "}
          <button className="underline" onClick={() => void refetch()}>
            Retry
          </button>
        </p>
      )}
      {!isPending && !error && !entries.length && (
        <p className="text-text-muted mt-6">
          Nothing here yet. Follow someone to see their watches.
        </p>
      )}
      <ul className="mt-6 space-y-4">
        {entries.map((entry) => (
          <Entry key={entry.id} entry={entry} />
        ))}
      </ul>
      {hasNextPage && (
        <button
          className="mt-6 rounded-xl border px-4 py-2"
          disabled={isFetchingNextPage}
          onClick={() => void fetchNextPage()}
        >
          {isFetchingNextPage ? "Loading…" : "Load more"}
        </button>
      )}
    </div>
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
