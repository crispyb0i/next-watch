import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getJWTToken } from "../lib/auth/client";
import { entryHref, type WatchEntry } from "../lib/watchLog";
import { notify } from "../lib/notifications";
import QueryProvider from "./QueryProvider";
import { LogForm } from "./WatchLogButton";
import { PosterGridSkeleton } from "./Skeleton";

async function fetchWatched(): Promise<WatchEntry[] | null> {
  const jwt = await getJWTToken();
  if (!jwt) return null; // signed out
  const response = await fetch("/api/watched", {
    headers: { authorization: `Bearer ${jwt}` },
  });
  if (!response.ok) throw new Error("Couldn't load your watch log.");
  return response.json();
}

async function remove(id: number) {
  const jwt = await getJWTToken();
  const response = await fetch(`/api/watched?id=${id}`, {
    method: "DELETE",
    headers: { authorization: `Bearer ${jwt}` },
  });
  if (!response.ok) throw new Error("Couldn't delete this log entry.");
}

const formatDate = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

function Entry({ entry }: { entry: WatchEntry }) {
  const queryClient = useQueryClient();
  const href = entryHref(entry);
  const confirmDialog = useRef<HTMLDialogElement>(null);
  const editDialog = useRef<HTMLDialogElement>(null);
  const [deleting, setDeleting] = useState(false);
  // Remount the form on each open so its uncontrolled fields reset to the
  // current entry rather than keeping whatever was typed last time.
  const [editKey, setEditKey] = useState(0);

  async function confirmDelete() {
    setDeleting(true);
    try {
      await remove(entry.id);
      void queryClient.invalidateQueries({ queryKey: ["watched"] });
      notify("Removed from your watch log.");
      confirmDialog.current?.close();
    } catch (error) {
      notify((error as Error).message, "error");
    } finally {
      setDeleting(false);
    }
  }

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
          <div className="bg-surface-muted text-text-muted grid aspect-[2/3] w-16 place-items-center rounded-lg text-xs">
            No image
          </div>
        )}
      </a>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-text-primary font-bold">
            <a href={href} className="hover:text-accent">
              {entry.title}
            </a>
            {entry.subtitle && (
              <span className="text-text-muted font-normal">
                {" "}
                ({entry.subtitle})
              </span>
            )}
          </h3>
          <span className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              aria-label={`Edit log of ${entry.title}`}
              onClick={() => {
                setEditKey((key) => key + 1);
                editDialog.current?.showModal();
              }}
              className="text-text-muted hover:text-accent text-sm"
            >
              Edit
            </button>
            <button
              type="button"
              aria-label={`Delete log of ${entry.title}`}
              onClick={() => confirmDialog.current?.showModal()}
              className="text-text-muted hover:text-danger text-sm"
            >
              ✕
            </button>
          </span>

          <dialog
            ref={editDialog}
            className="bg-surface text-text-primary border-border/60 m-auto w-[min(28rem,90vw)] rounded-2xl border p-6 backdrop:bg-black/60"
          >
            <h2 className="text-lg font-extrabold tracking-tight">
              Edit “{entry.title}”
            </h2>
            <LogForm
              key={editKey}
              item={entry}
              defaults={{
                id: entry.id,
                rating: entry.rating,
                review: entry.review,
                watchedOn: entry.watchedOn,
                venue: entry.venue,
                rewatch: entry.rewatch,
              }}
              onDone={() => editDialog.current?.close()}
            />
          </dialog>

          <dialog
            ref={confirmDialog}
            className="bg-surface text-text-primary border-border/60 m-auto w-[min(26rem,90vw)] rounded-2xl border p-6 backdrop:bg-black/60"
          >
            <h2 className="text-lg font-extrabold tracking-tight">
              Delete this log?
            </h2>
            <p className="text-text-muted mt-2 text-sm">
              “{entry.title}” logged on {formatDate(entry.watchedOn)} will be
              removed. This can't be undone.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => confirmDialog.current?.close()}
                className="text-text-muted hover:text-text-primary rounded-full px-4 py-2 text-sm font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={deleting}
                className="bg-danger text-accent-contrast hover:bg-danger/90 rounded-full px-4 py-2 text-sm font-bold disabled:opacity-60"
              >
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </dialog>
        </div>

        <p className="text-text-muted mt-1 flex flex-wrap items-center gap-x-3 text-sm">
          <time dateTime={entry.watchedOn}>{formatDate(entry.watchedOn)}</time>
          {entry.rating != null && (
            <span
              className="text-star"
              aria-label={`${entry.rating} of 5 stars`}
            >
              ★ {entry.rating.toFixed(1)}
            </span>
          )}
          {entry.rewatch && <span>Rewatch</span>}
          {entry.venue && <span>{entry.venue}</span>}
        </p>

        {entry.review && (
          <p className="text-text-muted mt-2 text-sm leading-relaxed whitespace-pre-line">
            {entry.review}
          </p>
        )}
      </div>
    </li>
  );
}

function WatchedInner() {
  const { data, isPending, error } = useQuery({
    queryKey: ["watched"],
    queryFn: fetchWatched,
  });

  return (
    <div className="w-full">
      <h1 className="text-text-primary text-xl font-extrabold tracking-tight">
        Media log
      </h1>

      {isPending ? (
        <PosterGridSkeleton count={4} />
      ) : error ? (
        <p role="alert" className="text-danger mt-6 text-sm">
          {error.message}
        </p>
      ) : data === null ? (
        <p className="text-text-muted mt-6 text-sm">
          Sign in to keep a watch log.
        </p>
      ) : data.length === 0 ? (
        <p className="text-text-muted mt-6 text-sm">
          Nothing logged yet. Open a movie and hit “Log watch”.
        </p>
      ) : (
        <>
          <p className="text-text-muted mt-1 text-sm">
            {data.length} {data.length === 1 ? "entry" : "entries"}
          </p>
          <ul className="mt-6 space-y-4">
            {data.map((entry) => (
              <Entry key={entry.id} entry={entry} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

export default function Watched() {
  return (
    <QueryProvider>
      <WatchedInner />
    </QueryProvider>
  );
}
