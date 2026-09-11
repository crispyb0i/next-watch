import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { getJWTToken } from "../lib/auth/client";
import { todayISO, type WatchEntryInput } from "../lib/watchLog";
import { isFavorite, toggleFavorite } from "../lib/favorites";
import { notify } from "../lib/notifications";
import { requireAuth } from "../lib/auth/gate";
import QueryProvider from "./QueryProvider";

/** Create, or replace `entryId` when editing an existing log. */
export async function postEntry(entry: WatchEntryInput, entryId?: number) {
  const jwt = await getJWTToken();
  if (!jwt) throw new Error("Sign in to log what you watch.");

  const response = await fetch(
    entryId == null ? "/api/watched" : `/api/watched?id=${entryId}`,
    {
      method: entryId == null ? "POST" : "PATCH",
      headers: {
        authorization: `Bearer ${jwt}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(entry),
    },
  );
  if (!response.ok)
    throw new Error(
      (await response.json().catch(() => null))?.error ?? "Couldn't save.",
    );
  return response.json();
}

const field =
  "bg-surface-muted/60 border-border/60 text-text-primary focus-visible:outline-accent w-full rounded-xl border px-3 py-2 text-sm focus-visible:outline-2";

function StarPicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (next: number) => void;
}) {
  return (
    <fieldset>
      <legend className="sr-only">Rating</legend>
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((star) => {
          const fill = Math.max(0, Math.min(1, value - (star - 1))) * 100;
          return (
            <span key={star} className="relative h-7 w-7">
              <svg
                viewBox="0 0 24 24"
                aria-hidden="true"
                className="text-text-muted absolute inset-0 h-full w-full fill-none stroke-current stroke-2"
              >
                <path d="m12 2.5 2.9 5.9 6.5.9-4.7 4.6 1.1 6.5-5.8-3.1-5.8 3.1 1.1-6.5-4.7-4.6 6.5-.9L12 2.5Z" />
              </svg>
              <span
                aria-hidden="true"
                className="text-star absolute inset-y-0 left-0 overflow-hidden"
                style={{ width: `${fill}%` }}
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-7 w-7 fill-current stroke-current stroke-2"
                >
                  <path d="m12 2.5 2.9 5.9 6.5.9-4.7 4.6 1.1 6.5-5.8-3.1-5.8 3.1 1.1-6.5-4.7-4.6 6.5-.9L12 2.5Z" />
                </svg>
              </span>
              {[star - 0.5, star].map((rating, half) => (
                <label
                  key={rating}
                  aria-label={`${rating} of 5 stars`}
                  className={`focus-within:outline-accent absolute inset-y-0 z-10 w-1/2 cursor-pointer rounded focus-within:outline-2 ${half ? "right-0" : "left-0"}`}
                >
                  <input
                    type="radio"
                    name="rating"
                    value={rating}
                    checked={value === rating}
                    onChange={() => onChange(rating)}
                    className="sr-only"
                  />
                </label>
              ))}
            </span>
          );
        })}
        {value > 0 && (
          <button
            type="button"
            onClick={() => onChange(0)}
            aria-label="Clear rating"
            className="text-text-muted hover:text-text-primary ml-2 text-xs"
          >
            Clear
          </button>
        )}
      </div>
    </fieldset>
  );
}

type LogItem = Pick<
  WatchEntryInput,
  | "tmdbId"
  | "title"
  | "poster"
  | "subtitle"
  | "mediaType"
  | "season"
  | "episode"
>;

/** Values to prefill when editing; omit to log a fresh watch. */
export type LogDefaults = Partial<
  Pick<WatchEntryInput, "rating" | "review" | "watchedOn" | "venue" | "rewatch">
> & { id?: number };

export function LogForm({
  item,
  defaults,
  onDone,
}: {
  item: LogItem;
  defaults?: LogDefaults;
  onDone: () => void;
}) {
  const [rating, setRating] = useState(defaults?.rating ?? 0);
  const queryClient = useQueryClient();
  const editing = defaults?.id != null;
  const save = useMutation({
    mutationFn: (entry: WatchEntryInput) => postEntry(entry, defaults?.id),
    onSuccess: (_data, entry) => {
      void queryClient.invalidateQueries({ queryKey: ["watched"] });
      void queryClient.invalidateQueries({ queryKey: ["progress"] });
      // Watched it, so it is no longer something to watch. Rewatches and edits
      // leave the list alone.
      const mediaType = entry.mediaType ?? "movie";
      if (
        !editing &&
        !entry.rewatch &&
        entry.season == null &&
        entry.episode == null &&
        isFavorite(entry.tmdbId, mediaType, "watchlist")
      ) {
        void toggleFavorite({
          id: entry.tmdbId,
          mediaType,
          kind: "watchlist",
          title: entry.title,
          poster: entry.poster ?? null,
        });
      }
      onDone();
      notify(editing ? "Log updated." : "Added to your watch log.");
    },
    onError: (error) => notify(error.message, "error"),
  });

  return (
    <form
      className="mt-4 space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        save.mutate({
          ...item,
          rating: rating || null,
          review: String(data.get("review") ?? ""),
          watchedOn: String(data.get("watchedOn") ?? ""),
          venue: String(data.get("venue") ?? ""),
          rewatch: data.get("rewatch") === "on",
        });
      }}
    >
      <StarPicker value={rating} onChange={setRating} />

      <label className="block">
        <span className="text-text-muted text-xs font-semibold">
          Watched on
        </span>
        <input
          type="date"
          name="watchedOn"
          required
          max={todayISO()}
          defaultValue={defaults?.watchedOn ?? todayISO()}
          className={`mt-1 ${field}`}
        />
      </label>

      <label className="block">
        <span className="text-text-muted text-xs font-semibold">
          Where (cinema, streaming service…)
        </span>
        <input
          type="text"
          name="venue"
          defaultValue={defaults?.venue ?? ""}
          maxLength={100}
          className={`mt-1 ${field}`}
        />
      </label>

      <label className="block">
        <span className="text-text-muted text-xs font-semibold">
          Your review
        </span>
        <textarea
          name="review"
          rows={4}
          defaultValue={defaults?.review ?? ""}
          maxLength={5000}
          className={`mt-1 ${field}`}
        />
      </label>

      <label className="text-text-muted flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="rewatch"
          defaultChecked={defaults?.rewatch ?? false}
          className="accent-accent"
        />
        Rewatch
      </label>

      {save.isError && (
        <p role="alert" className="text-danger text-sm">
          {save.error.message}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onDone}
          className="text-text-muted hover:text-text-primary rounded-full px-4 py-2 text-sm font-semibold"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={save.isPending}
          className="bg-accent hover:bg-accent-hover rounded-full px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
        >
          {save.isPending ? "Saving…" : editing ? "Save changes" : "Save log"}
        </button>
      </div>
    </form>
  );
}

/** "Log watch" button plus the form, in a native modal dialog. */
export default function WatchLogButton({
  item,
  className = "",
}: {
  item: LogItem;
  className?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);

  return (
    <QueryProvider>
      <button
        type="button"
        onClick={async () => {
          if (await requireAuth()) dialog.current?.showModal();
        }}
        className={`border-border/60 text-text-primary hover:border-accent focus-visible:outline-accent rounded-full border px-3 py-1.5 text-sm font-semibold whitespace-nowrap transition focus-visible:outline-2 ${className}`}
      >
        + Log watch
      </button>

      <dialog
        ref={dialog}
        className="bg-surface text-text-primary border-border/60 m-auto w-[min(28rem,90vw)] rounded-2xl border p-6 backdrop:bg-black/60"
      >
        <h2 className="text-lg font-extrabold tracking-tight">
          Log “{item.title}”
        </h2>
        {item.subtitle && (
          <p className="text-text-muted mt-1 text-sm">{item.subtitle}</p>
        )}
        <LogForm item={item} onDone={() => dialog.current?.close()} />
      </dialog>
    </QueryProvider>
  );
}
