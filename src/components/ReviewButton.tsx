import { lazy, Suspense, useId, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { authClient, getJWTToken } from "../lib/auth/client";
import { reviewHref, type Review, type ReviewInput } from "../lib/reviews";
import { notify } from "../lib/notifications";
import { requireAuth } from "../lib/auth/gate";
import QueryProvider from "./QueryProvider";
import StarPicker from "./StarPicker";
import {
  plainReviewDocument,
  reviewDocumentText,
  REVIEW_MAX_LENGTH,
} from "../lib/reviewDocument";

const ReviewEditor = lazy(() => import("./ReviewEditor"));

type ReviewItem = Pick<
  ReviewInput,
  | "tmdbId"
  | "mediaType"
  | "season"
  | "episode"
  | "title"
  | "poster"
  | "subtitle"
>;

async function fetchOwnReview(item: ReviewItem): Promise<Review | null> {
  const jwt = await getJWTToken();
  if (!jwt) throw new Error("Sign in to load your review.");
  const query = new URLSearchParams({
    tmdbId: String(item.tmdbId),
    mediaType: item.mediaType ?? "movie",
  });
  if (item.season != null) query.set("season", String(item.season));
  if (item.episode != null) query.set("episode", String(item.episode));
  const response = await fetch(`/api/reviews?${query}`, {
    headers: { authorization: `Bearer ${jwt}` },
  });
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
  const [document, setDocument] = useState(
    existing?.document ?? plainReviewDocument(existing?.review ?? ""),
  );
  const isDraft = !existing || existing.status === "draft";
  const save = useMutation({
    mutationFn: (entry: ReviewInput) =>
      existing ? patchReview(existing.id, entry) : postReview(entry),
    onSuccess: (_data, entry) => {
      void queryClient.invalidateQueries({ queryKey: ["reviews"] });
      onDone();
      notify(
        entry.status === "draft"
          ? "Draft saved. Only you can see it."
          : isDraft
            ? "Review published."
            : "Review updated.",
      );
    },
    onError: (error) => notify(error.message, "error"),
  });
  const remove = useMutation({
    mutationFn: () => deleteReview(existing!.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["reviews"] });
      onDone();
      notify(
        existing?.status === "draft" ? "Draft deleted." : "Review removed.",
      );
    },
    onError: (error) => notify(error.message, "error"),
  });

  const busy = save.isPending || remove.isPending;
  const tooLong = reviewDocumentText(document).length > REVIEW_MAX_LENGTH;
  const submit = (status: "draft" | "published") => {
    if (busy || tooLong) return;
    save.mutate({ ...item, rating: rating || null, document, status });
  };

  return (
    <form
      className="mt-4 space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        submit("published");
      }}
    >
      <fieldset disabled={busy}>
        <StarPicker value={rating} onChange={setRating} />
      </fieldset>
      <Suspense
        fallback={
          <p role="status" className="text-text-muted py-8 text-sm">
            Loading editor…
          </p>
        }
      >
        <ReviewEditor
          initialDocument={existing?.document}
          text={existing?.review ?? ""}
          disabled={busy}
          onChange={setDocument}
        />
      </Suspense>
      {isDraft && (
        <p className="text-text-muted text-xs">
          Drafts are only visible to you. Publish when you’re ready to share.
        </p>
      )}

      {save.isError && (
        <p role="alert" className="text-danger text-sm">
          {save.error.message}
        </p>
      )}
      {remove.isError && (
        <p role="alert" className="text-danger text-sm">
          {remove.error.message}
        </p>
      )}

      <div className="flex flex-wrap justify-end gap-2">
        {existing && (
          <button
            type="button"
            onClick={() => remove.mutate()}
            disabled={remove.isPending || save.isPending}
            className="text-danger hover:text-danger/80 mr-auto rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-60"
          >
            {remove.isPending ? "Deleting…" : "Delete"}
          </button>
        )}
        <button
          type="button"
          onClick={onDone}
          disabled={busy}
          className="text-text-muted hover:text-text-primary rounded-full px-4 py-2 text-sm font-semibold"
        >
          Cancel
        </button>
        {isDraft && (
          <button
            type="button"
            onClick={() => submit("draft")}
            disabled={busy || tooLong}
            className="border-border/60 hover:border-accent focus-visible:outline-accent rounded-full border px-4 py-2 text-sm font-semibold focus-visible:outline-2 disabled:opacity-60"
          >
            {save.isPending && save.variables.status === "draft"
              ? "Saving draft…"
              : "Save draft"}
          </button>
        )}
        <button
          type="submit"
          disabled={busy || tooLong}
          className="bg-accent hover:bg-accent-hover rounded-full px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
        >
          {save.isPending
            ? "Saving…"
            : !isDraft
              ? "Update review"
              : "Publish review"}
        </button>
      </div>
    </form>
  );
}

/** "Write a review" button plus the form, in a native modal dialog. */
function ReviewDialog({
  item,
  className = "",
  label = "Write a review",
}: {
  item: ReviewItem;
  className?: string;
  label?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  const [open, setOpen] = useState(false);
  const { data: session } = authClient.useSession();
  const reviewQuery = useQuery({
    queryKey: [
      "reviews",
      session?.user.id,
      item.tmdbId,
      item.mediaType ?? "movie",
      item.season ?? null,
      item.episode ?? null,
    ],
    queryFn: () => fetchOwnReview(item),
    enabled: open,
    retry: false,
    staleTime: 0,
  });

  return (
    <>
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
        {label}
      </button>

      <dialog
        ref={dialog}
        aria-labelledby={headingId}
        onClose={() => setOpen(false)}
        className="bg-surface text-text-primary border-border/60 m-auto max-h-[90dvh] w-[min(38rem,94vw)] overflow-y-auto rounded-2xl border p-5 backdrop:bg-black/60 sm:p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <h2 id={headingId} className="text-lg font-extrabold tracking-tight">
            Review “{item.title}”
          </h2>
          <button
            type="button"
            aria-label="Close review dialog"
            onClick={() => dialog.current?.close()}
            className="text-text-muted hover:text-text-primary focus-visible:outline-accent rounded-full px-3 py-2 text-sm font-semibold focus-visible:outline-2"
          >
            Close
          </button>
        </div>
        {item.subtitle && (
          <p className="text-text-muted mt-1 text-sm">{item.subtitle}</p>
        )}
        {open && (reviewQuery.isPending || reviewQuery.isFetching) ? (
          <p role="status" className="text-text-muted mt-4 text-sm">
            Loading your review…
          </p>
        ) : open && reviewQuery.isError ? (
          <div className="mt-4 space-y-3">
            <p role="alert" className="text-danger text-sm">
              {reviewQuery.error.message}
            </p>
            <button
              type="button"
              onClick={() => void reviewQuery.refetch()}
              disabled={reviewQuery.isFetching}
              className="border-border/60 hover:border-accent focus-visible:outline-accent rounded-full border px-4 py-2 text-sm font-semibold focus-visible:outline-2"
            >
              {reviewQuery.isFetching ? "Retrying…" : "Retry"}
            </button>
          </div>
        ) : open && reviewQuery.isSuccess ? (
          <ReviewForm
            item={item}
            existing={reviewQuery.data}
            onDone={() => dialog.current?.close()}
          />
        ) : null}
      </dialog>
    </>
  );
}

export default function ReviewButton(props: {
  item: ReviewItem;
  className?: string;
  label?: string;
}) {
  return (
    <QueryProvider>
      <ReviewDialog {...props} />
    </QueryProvider>
  );
}

export { reviewHref };
