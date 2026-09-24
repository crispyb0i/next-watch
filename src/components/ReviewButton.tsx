import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getJWTToken } from "../lib/auth/client";
import { reviewHref, type Review, type ReviewInput } from "../lib/reviews";
import { notify } from "../lib/notifications";
import { requireAuth } from "../lib/auth/gate";
import QueryProvider from "./QueryProvider";
import StarPicker from "./StarPicker";

const field =
  "bg-surface-muted/60 border-border/60 text-text-primary focus-visible:outline-accent w-full rounded-xl border px-3 py-2 text-sm focus-visible:outline-2";

type ReviewItem = Pick<
  ReviewInput,
  "tmdbId" | "mediaType" | "title" | "poster" | "subtitle"
>;

async function fetchOwnReview(
  tmdbId: number,
  mediaType: "movie" | "tv",
): Promise<Review | null> {
  const jwt = await getJWTToken();
  if (!jwt) return null;
  const response = await fetch(
    `/api/reviews?tmdbId=${tmdbId}&mediaType=${mediaType}`,
    { headers: { authorization: `Bearer ${jwt}` } },
  );
  if (!response.ok) throw new Error("Couldn't load your review.");
  return response.json();
}

async function postReview(entry: ReviewInput) {
  const jwt = await getJWTToken();
  if (!jwt) throw new Error("Sign in to review this title.");
  const response = await fetch("/api/reviews", {
    method: "POST",
    headers: {
      authorization: `Bearer ${jwt}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(entry),
  });
  if (!response.ok) {
    throw new Error(
      (await response.json().catch(() => null))?.error ?? "Couldn't save.",
    );
  }
  return response.json();
}

async function patchReview(reviewId: number, entry: ReviewInput) {
  const jwt = await getJWTToken();
  if (!jwt) throw new Error("Sign in to update your review.");
  const response = await fetch(`/api/reviews?id=${reviewId}`, {
    method: "PATCH",
    headers: {
      authorization: `Bearer ${jwt}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(entry),
  });
  if (!response.ok) {
    throw new Error(
      (await response.json().catch(() => null))?.error ?? "Couldn't save.",
    );
  }
  return response.json();
}

async function deleteReview(reviewId: number) {
  const jwt = await getJWTToken();
  if (!jwt) throw new Error("Sign in to remove your review.");
  const response = await fetch(`/api/reviews?id=${reviewId}`, {
    method: "DELETE",
    headers: { authorization: `Bearer ${jwt}` },
  });
  if (!response.ok) throw new Error("Couldn't delete this review.");
}

function ReviewForm({
  item,
  existing,
  onDone,
}: {
  item: ReviewItem;
  existing: Review | null;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const [rating, setRating] = useState(existing?.rating ?? 0);
  const save = useMutation({
    mutationFn: (entry: ReviewInput) =>
      existing ? patchReview(existing.id, entry) : postReview(entry),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["reviews"] });
      onDone();
      notify(existing ? "Review updated." : "Review published.");
    },
    onError: (error) => notify(error.message, "error"),
  });
  const remove = useMutation({
    mutationFn: () => deleteReview(existing!.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["reviews"] });
      onDone();
      notify("Review removed.");
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
        });
      }}
    >
      <StarPicker value={rating} onChange={setRating} />

      <label className="block">
        <span className="text-text-muted text-xs font-semibold">
          Your review
        </span>
        <textarea
          name="review"
          rows={5}
          defaultValue={existing?.review ?? ""}
          maxLength={5000}
          className={`mt-1 ${field}`}
        />
      </label>

      {save.isError && (
        <p role="alert" className="text-danger text-sm">
          {save.error.message}
        </p>
      )}

      <div className="flex justify-end gap-2">
        {existing && (
          <button
            type="button"
            onClick={() => remove.mutate()}
            disabled={remove.isPending}
            className="text-danger hover:text-danger/80 mr-auto rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-60"
          >
            {remove.isPending ? "Deleting…" : "Delete"}
          </button>
        )}
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
          {save.isPending
            ? "Saving…"
            : existing
              ? "Update review"
              : "Publish review"}
        </button>
      </div>
    </form>
  );
}

/** "Write a review" button plus the form, in a native modal dialog. */
export default function ReviewButton({
  item,
  className = "",
}: {
  item: ReviewItem;
  className?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const reviewQuery = useQuery({
    queryKey: ["reviews", item.tmdbId, item.mediaType],
    queryFn: () => fetchOwnReview(item.tmdbId, item.mediaType ?? "movie"),
    enabled: open,
  });

  return (
    <QueryProvider>
      <button
        type="button"
        onClick={async () => {
          if (await requireAuth()) {
            setOpen(true);
            dialog.current?.showModal();
          }
        }}
        className={`border-border/60 text-text-primary hover:border-accent focus-visible:outline-accent rounded-full border px-3 py-1.5 text-sm font-semibold whitespace-nowrap transition focus-visible:outline-2 ${className}`}
      >
        Write a review
      </button>

      <dialog
        ref={dialog}
        onClose={() => setOpen(false)}
        className="bg-surface text-text-primary border-border/60 m-auto w-[min(28rem,90vw)] rounded-2xl border p-6 backdrop:bg-black/60"
      >
        <h2 className="text-lg font-extrabold tracking-tight">
          Review “{item.title}”
        </h2>
        {item.subtitle && (
          <p className="text-text-muted mt-1 text-sm">{item.subtitle}</p>
        )}
        {open && reviewQuery.isPending ? (
          <p className="text-text-muted mt-4 text-sm">Loading…</p>
        ) : (
          <ReviewForm
            item={item}
            existing={reviewQuery.data ?? null}
            onDone={() => dialog.current?.close()}
          />
        )}
      </dialog>
    </QueryProvider>
  );
}

export { reviewHref };
