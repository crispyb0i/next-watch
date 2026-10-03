import { useInfiniteQuery } from "@tanstack/react-query";
import { useState } from "react";
import { authClient, getJWTToken } from "../lib/auth/client";
import { activityHref, activityLabel } from "../lib/profileActivity";
import QueryProvider from "./QueryProvider";
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
  const href = activityHref(entry);
  const name = nameOf(entry);
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join("")
    .toUpperCase();

  return (
    <li className="border-border/60 bg-surface-muted/30 min-w-0 rounded-2xl border p-4">
      <div className="border-border/40 flex items-center gap-3 border-b pb-3">
        <a
          href={`/u/${entry.userId}`}
          aria-label={`View ${name}'s profile`}
          className="bg-accent/10 text-accent ring-border/60 focus-visible:outline-accent flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full text-base font-bold ring-1 focus-visible:outline-2 focus-visible:outline-offset-4"
        >
          {entry.userImage && entry.userImage !== failedImage ? (
            <img
              src={entry.userImage}
              alt=""
              loading="lazy"
              referrerPolicy="no-referrer"
              onError={() => setFailedImage(entry.userImage)}
              className="size-full object-cover"
            />
          ) : (
            <span aria-hidden="true">{initials}</span>
          )}
        </a>
        <div className="min-w-0 flex-1">
          <h2 className="text-text-primary text-lg leading-snug font-bold">
            <a
              href={`/u/${entry.userId}`}
              title={name}
              className="focus-visible:outline-accent block truncate rounded-sm hover:underline focus-visible:outline-2 focus-visible:outline-offset-4"
            >
              {name}
            </a>
          </h2>
          <p className="text-text-muted mt-0.5 truncate text-xs">
            Watched ·{" "}
            <time dateTime={entry.watchedOn}>
              {formatDate(entry.watchedOn)}
            </time>
          </p>
        </div>
      </div>
      <a
        href={href}
        className="group focus-visible:outline-accent mt-4 flex items-start gap-4 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-4"
      >
        <div className="bg-surface-muted aspect-[2/3] w-20 shrink-0 overflow-hidden rounded-lg shadow-sm">
          {entry.poster ? (
            <img
              src={entry.poster}
              alt=""
              width={80}
              height={120}
              loading="lazy"
              decoding="async"
              className="size-full object-cover"
            />
          ) : (
            <span className="text-text-muted flex size-full items-center justify-center p-2 text-center text-xs">
              No poster
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h3
            className="text-text-primary group-hover:text-accent truncate text-base leading-snug font-bold transition-colors sm:text-lg"
            title={entry.title}
          >
            {entry.title}
          </h3>
          <span className="border-accent/20 bg-accent/10 text-accent mt-2 inline-flex rounded-md border px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase">
            {activityLabel(entry)}
          </span>
          {entry.subtitle && (
            <p
              className="text-text-muted mt-2 truncate text-sm"
              title={entry.subtitle}
            >
              {entry.subtitle}
            </p>
          )}
          {entry.notes && (
            <p className="text-text-secondary mt-3 text-sm leading-relaxed wrap-anywhere whitespace-pre-wrap">
              {entry.notes}
            </p>
          )}
        </div>
      </a>
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
      {isPending && (
        <div role="status" className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <span className="sr-only">Loading friends' activity…</span>
          {[0, 1, 2].map((index) => (
            <div
              key={index}
              aria-hidden="true"
              className="border-border/60 rounded-2xl border p-4 motion-safe:animate-pulse"
            >
              <div className="border-border/40 flex items-center gap-3 border-b pb-3">
                <div className="bg-surface-muted size-10 shrink-0 rounded-full" />
                <div className="flex-1 space-y-2">
                  <div className="bg-surface-muted h-5 w-1/3 rounded" />
                  <div className="bg-surface-muted h-3 w-1/2 rounded" />
                </div>
              </div>
              <div className="mt-4 flex gap-4">
                <div className="bg-surface-muted h-30 w-20 shrink-0 rounded-lg" />
                <div className="flex-1 space-y-3">
                  <div className="bg-surface-muted h-5 w-3/4 rounded" />
                  <div className="bg-surface-muted h-5 w-14 rounded-md" />
                  <div className="bg-surface-muted h-4 w-1/3 rounded" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
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
      <ul className="grid grid-cols-1 items-start gap-3 md:grid-cols-2">
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
        <div className="mt-5">
          <AuthGate>
            <FeedList />
          </AuthGate>
        </div>
      </div>
    </QueryProvider>
  );
}
