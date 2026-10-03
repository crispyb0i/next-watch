import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { authClient, getJWTToken } from "../lib/auth/client";
import { nextToWatch } from "../lib/nextToWatch";
import {
  getSeasonDetails,
  getTvShowDetails,
  episodeCode,
  posterUrl,
} from "../lib/tmdb";
import { todayISO, type WatchEntry } from "../lib/watchLog";
import {
  viewingStatuses,
  type ViewingShow,
  type ViewingStatus,
} from "../lib/viewingStatus";
import { useShowProgress } from "./ShowProgress";
import ViewingStatusControl, { useViewingShows } from "./ViewingStatusControl";
import { postEntry } from "./WatchLogButton";
import styles from "./WatchActivity.module.css";

function WatchingCard({ entry }: { entry: ViewingShow }) {
  const { data: session } = authClient.useSession();
  const client = useQueryClient();
  const [lastLog, setLastLog] = useState<WatchEntry | null>(null);
  const watching = entry.status === "watching";
  const showQuery = useQuery({
    queryKey: ["tv", entry.tmdbId],
    queryFn: ({ signal }) => getTvShowDetails(entry.tmdbId, signal),
  });
  const progress = useShowProgress(entry.tmdbId, watching);
  const next = useQuery({
    queryKey: [
      "next-to-watch",
      session?.user.id,
      entry.tmdbId,
      progress.data,
      showQuery.data?.seasons,
      todayISO(),
    ],
    enabled: watching && Boolean(showQuery.data && progress.data),
    queryFn: ({ signal }) =>
      nextToWatch(showQuery.data!.seasons, progress.data!, (season) =>
        client.query({
          queryKey: ["tv-season", entry.tmdbId, season],
          queryFn: ({ signal: seasonSignal }) => {
            signal.throwIfAborted();
            return getSeasonDetails(entry.tmdbId, season, seasonSignal);
          },
        }),
      ),
  });
  const refresh = () =>
    Promise.all([
      client.invalidateQueries({
        queryKey: ["progress", session?.user.id, entry.tmdbId],
      }),
      client.invalidateQueries({
        queryKey: ["viewing-shows", session?.user.id],
      }),
      client.invalidateQueries({ queryKey: ["watched"] }),
    ]);
  const log = useMutation({
    mutationFn: async () => {
      const episode = next.data?.next;
      if (!episode || !showQuery.data)
        throw new Error("Could not find the next episode.");
      return postEntry({
        tmdbId: entry.tmdbId,
        mediaType: "tv",
        title: `${showQuery.data.name} · ${episodeCode(episode.season_number, episode.episode_number)} · ${episode.name}`,
        poster: posterUrl(showQuery.data.poster_path),
        season: episode.season_number,
        episode: episode.episode_number,
        watchedOn: todayISO(),
      }) as Promise<WatchEntry>;
    },
    onSuccess: async (saved) => {
      setLastLog(saved);
      undo.reset();
      await refresh();
    },
  });
  const undo = useMutation({
    mutationFn: async () => {
      const token = await getJWTToken();
      if (!token || !lastLog) throw new Error("Sign in to undo this watch.");
      const response = await fetch(`/api/watched?id=${lastLog.id}`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${token}` },
      });
      if (!response.ok)
        throw new Error("Could not undo this watch. Try again.");
    },
    onSuccess: async () => {
      setLastLog(null);
      log.reset();
      await refresh();
    },
  });
  const show = showQuery.data;
  const episode = next.data?.next;
  const title = show?.name ?? entry.title;
  const art = show ? posterUrl(show.poster_path, "w200") : entry.poster;
  const episodeHref = episode
    ? `/tv/episode?id=${entry.tmdbId}&season=${episode.season_number}&episode=${episode.episode_number}`
    : null;
  const failed =
    showQuery.isError || (watching && (progress.isError || next.isError));
  return (
    <li className={styles.card}>
      <a
        href={`/tv?id=${entry.tmdbId}`}
        aria-label={`View ${title}`}
        className={styles.poster}
      >
        {art ? (
          <img
            src={art}
            alt=""
            width="200"
            height="300"
            loading="lazy"
            decoding="async"
          />
        ) : (
          <span>No poster</span>
        )}
      </a>
      <div className={styles.details}>
        <h3 className={styles.title}>
          <a href={`/tv?id=${entry.tmdbId}`}>{title}</a>
        </h3>
        {watching && !failed && (
          <div aria-live="polite">
            {episode ? (
              <>
                <a href={episodeHref!} className={styles.next}>
                  Up next:{" "}
                  {episodeCode(episode.season_number, episode.episode_number)}
                  {episode.runtime ? ` · ${episode.runtime} min` : ""}
                </a>
                <p className={styles.progressCopy}>
                  Season {next.data!.season} · {next.data!.watched} of{" "}
                  {next.data!.total} aired episodes watched
                </p>
                <div
                  role="progressbar"
                  className={styles.progress}
                  aria-valuenow={next.data!.watched}
                  aria-valuemin={0}
                  aria-valuemax={next.data!.total}
                  aria-valuetext={`${next.data!.watched} of ${next.data!.total} aired episodes watched`}
                  aria-label={`${title} season progress`}
                >
                  <div
                    className={styles.progressFill}
                    style={{
                      width: `${(next.data!.watched / next.data!.total) * 100}%`,
                    }}
                  />
                </div>
              </>
            ) : (
              <p className="text-text-muted text-sm">
                {next.isPending || progress.isPending
                  ? "Finding your next episode…"
                  : next.data?.caughtUp
                    ? "Caught up. You’ve watched every aired episode."
                    : "No aired episode is available to continue yet."}
              </p>
            )}
          </div>
        )}
        {!watching && !failed && (
          <p className="text-text-muted text-sm">
            {entry.status === "want_to_watch"
              ? "Ready when you are."
              : entry.status === "paused"
                ? "Take your time. Your progress is saved."
                : entry.status === "finished"
                  ? "Finished watching. Always here for a rewatch."
                  : "Set aside, with your viewing history saved."}
          </p>
        )}
        {failed && (
          <p role="alert" className="text-danger text-sm">
            Could not load show details.{" "}
            <button
              type="button"
              className="underline"
              onClick={() => {
                void showQuery.refetch();
                if (watching) {
                  void progress.refetch();
                  if (showQuery.data && progress.data) void next.refetch();
                }
              }}
            >
              Retry
            </button>
          </p>
        )}
        <a
          href={
            episode
              ? `/tv/season?id=${entry.tmdbId}&season=${episode.season_number}`
              : `/tv?id=${entry.tmdbId}`
          }
          className={styles.detailLink}
        >
          {episode ? "View season" : "View show"} →
        </a>
      </div>
      <div className={styles.footer}>
        <ViewingStatusControl
          showFinishAction={watching && Boolean(next.data?.caughtUp) && !failed}
          disabled={
            log.isPending ||
            undo.isPending ||
            progress.isFetching ||
            next.isFetching
          }
          show={{
            tmdbId: entry.tmdbId,
            title,
            poster: show ? posterUrl(show.poster_path) : entry.poster,
          }}
        />
        {watching && episode && !failed && (
          <button
            type="button"
            disabled={
              log.isPending ||
              undo.isPending ||
              progress.isFetching ||
              next.isFetching
            }
            onClick={() => log.mutate()}
            className={styles.logButton}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path
                d="m5 12 4 4L19 6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {log.isPending
              ? "Saving…"
              : `Mark ${episodeCode(episode.season_number, episode.episode_number)} watched`}
          </button>
        )}
      </div>
      {lastLog && (
        <p
          role="status"
          className={`${styles.feedback} text-text-muted text-sm`}
        >
          Marked {episodeCode(lastLog.season!, lastLog.episode!)} watched.{" "}
          <button
            type="button"
            disabled={undo.isPending || log.isPending}
            onClick={() => undo.mutate()}
            className="text-accent underline"
          >
            {undo.isPending ? "Undoing…" : "Undo"}
          </button>
        </p>
      )}
      {(log.isError || undo.isError) && (
        <p role="alert" className={`${styles.feedback} text-danger text-sm`}>
          {undo.error?.message ?? log.error?.message}
        </p>
      )}
    </li>
  );
}

const emptyCopy: Record<ViewingStatus, string> = {
  watching:
    "Your next episode belongs here. Choose Watching on a show or log an episode to get started.",
  want_to_watch: "Save a show to your watchlist and it will be waiting here.",
  paused: "Shows you pause will stay here with all your progress saved.",
  finished: "Finished shows will live here. You can return to them any time.",
  dropped:
    "Shows you set aside will stay here, along with your viewing history.",
};

export default function CurrentlyWatching() {
  const { data: session } = authClient.useSession();
  const query = useViewingShows();
  const [filter, setFilter] = useState<ViewingStatus>("watching");
  const [limit, setLimit] = useState(6);
  const userId = session?.user.id;
  const [order, setOrder] = useState<{ userId?: string; ids: number[] }>({
    userId,
    ids: [],
  });
  // Keep this visit's positions when activity updates change the API's order.
  // Remember hidden tabs too; new shows append without displacing visible cards.
  const existingIds = order.userId === userId ? order.ids : [];
  const knownIds = new Set(existingIds);
  const newIds = (query.data ?? [])
    .filter((entry) => !knownIds.has(entry.tmdbId))
    .map((entry) => entry.tmdbId);
  const orderedIds = newIds.length ? [...existingIds, ...newIds] : existingIds;
  if (order.userId !== userId || newIds.length)
    setOrder({ userId, ids: orderedIds });
  if (!session) return null;
  const showsById = new Map(query.data?.map((entry) => [entry.tmdbId, entry]));
  const rows = orderedIds
    .map((id) => showsById.get(id))
    .filter((entry): entry is ViewingShow => entry?.status === filter);
  return (
    <section aria-labelledby="currently-watching" className="mb-12 sm:mb-16">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2
            id="currently-watching"
            className="text-text-primary text-2xl font-extrabold tracking-tight"
          >
            {filter === "watching"
              ? "Currently watching"
              : viewingStatuses[filter]}
          </h2>
          <p className="text-text-muted mt-1 text-sm">
            Your shows, right where you left them.
          </p>
        </div>
        <a href="/watched" className="text-accent text-sm font-semibold">
          Viewing history →
        </a>
      </div>
      <div
        className={styles.filters}
        role="group"
        aria-label="Filter shows by viewing status"
      >
        {(
          [
            "watching",
            "want_to_watch",
            "paused",
            "finished",
            "dropped",
          ] as const
        ).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={filter === value}
            onClick={() => {
              setFilter(value);
              setLimit(6);
            }}
            className={styles.filter}
          >
            {viewingStatuses[value]}
            {query.data && (
              <span className={styles.count}>
                {query.data.filter((entry) => entry.status === value).length}
              </span>
            )}
          </button>
        ))}
      </div>
      {query.isError ? (
        <div
          role="alert"
          className="border-border/60 bg-surface rounded-2xl border p-6"
        >
          <p className="text-danger">Could not load your shows.</p>
          <button
            type="button"
            onClick={() => void query.refetch()}
            className="text-accent mt-2 font-semibold underline"
          >
            Try again
          </button>
        </div>
      ) : query.isPending ? (
        <div
          role="status"
          className="text-text-muted border-border/60 rounded-2xl border p-8"
        >
          Loading your shows…
        </div>
      ) : rows.length ? (
        <>
          <ul className={styles.grid}>
            {rows.slice(0, limit).map((entry) => (
              <WatchingCard
                key={`${session.user.id}-${entry.tmdbId}`}
                entry={entry}
              />
            ))}
          </ul>
          {rows.length > limit && (
            <button
              type="button"
              onClick={() => setLimit((value) => value + 6)}
              className="border-border/60 text-text-primary mt-5 rounded-full border px-5 py-2 text-sm font-semibold"
            >
              Show more
            </button>
          )}
        </>
      ) : (
        <div className="border-border/60 from-accent/10 to-surface rounded-2xl border bg-linear-to-br p-8 sm:p-10">
          <p className="text-text-muted max-w-lg text-sm leading-relaxed">
            {emptyCopy[filter]}
          </p>
          <a
            href="/discover"
            className="text-accent mt-4 inline-block text-sm font-bold"
          >
            Discover shows →
          </a>
        </div>
      )}
    </section>
  );
}
