import { useInfiniteQuery } from "@tanstack/react-query";
import { useState } from "react";
import { authClient, getJWTToken } from "../lib/auth/client";
import { entryHref } from "../lib/watchLog";
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
  const href = entryHref(entry);
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
    <li className="border-border/60 bg-surface-muted/30 flex items-start gap-3 rounded-xl border p-3.5">
      <a
        href={`/u/${entry.userId}`}
        aria-label={`View ${name}'s profile`}
        className="bg-accent/10 text-accent ring-border/60 focus-visible:outline-accent flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full text-lg font-bold ring-1 focus-visible:outline-2 focus-visible:outline-offset-4"
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
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <h2 className="text-text-primary text-lg leading-snug font-bold wrap-anywhere">
            <a
              href={`/u/${entry.userId}`}
              className="focus-visible:outline-accent rounded-sm hover:underline focus-visible:outline-2 focus-visible:outline-offset-4"
            >
              {name}
            </a>
          </h2>
          <time className="text-text-muted text-xs" dateTime={entry.watchedOn}>
            {formatDate(entry.watchedOn)}
          </time>
        </div>
        <p className="text-text-secondary mt-1 text-sm leading-snug wrap-anywhere">
          <span className="text-text-muted">Watched </span>
          <a
            href={href}
            className="focus-visible:outline-accent rounded-sm font-medium hover:underline focus-visible:outline-2 focus-visible:outline-offset-4"
          >
            {entry.title}
          </a>
        </p>
        {entry.subtitle && (
          <p className="text-text-muted mt-1 text-xs wrap-anywhere">
            {entry.subtitle}
          </p>
        )}
        {entry.notes && (
          <p className="text-text-secondary mt-2 text-sm leading-relaxed wrap-anywhere whitespace-pre-wrap">
            {entry.notes}
          </p>
        )}
      </div>
      {entry.poster && (
        <a
          href={href}
          aria-label={`View ${entry.title}`}
          className="focus-visible:outline-accent shrink-0 rounded-md focus-visible:outline-2 focus-visible:outline-offset-4"
        >
          <img
            src={entry.poster}
            alt=""
            loading="lazy"
            className="bg-surface-muted aspect-[2/3] w-9 rounded-md object-cover"
          />
        </a>
      )}
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
              className="border-border/60 flex items-start gap-3 rounded-xl border p-3.5 motion-safe:animate-pulse"
            >
              <div className="bg-surface-muted size-12 shrink-0 rounded-full" />
              <div className="flex-1 space-y-2">
                <div className="bg-surface-muted h-5 w-1/2 rounded" />
                <div className="bg-surface-muted h-4 w-3/4 rounded" />
                <div className="bg-surface-muted h-3 w-1/3 rounded" />
              </div>
              <div className="bg-surface-muted h-13.5 w-9 shrink-0 rounded-md" />
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
