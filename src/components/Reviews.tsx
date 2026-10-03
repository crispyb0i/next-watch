import { useState, type ReactNode } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { authClient } from "../lib/auth/client";
import { accountApi } from "../lib/accountApi";
import { reviewHref, type Review } from "../lib/reviews";
import AuthGate from "./AuthGate";
import QueryProvider from "./QueryProvider";
import ReviewButton from "./ReviewButton";
import ReviewContent from "./ReviewContent";

const pageSize = 30;
type ReviewFilter = "all" | "published" | "draft";
function ReviewLayout({
  children,
  filter = "all",
  onFilter,
}: {
  children: ReactNode;
  filter?: ReviewFilter;
  onFilter?: (filter: ReviewFilter) => void;
}) {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      <p className="text-accent-hover text-xs font-bold tracking-widest uppercase">
        Your collection
      </p>
      <h1 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">
        Reviews
      </h1>
      <p className="text-text-muted mt-3">
        Your published thoughts and works in progress, all in one place.
      </p>
      <div
        role="group"
        aria-label="Filter reviews"
        className="border-border/60 mt-7 flex w-fit flex-wrap gap-1 rounded-2xl border p-1"
      >
        {(
          [
            ["all", "All reviews"],
            ["published", "Published"],
            ["draft", "Drafts"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={filter === value}
            disabled={!onFilter}
            onClick={() => onFilter?.(value)}
            className={`focus-visible:outline-accent rounded-xl px-4 py-2 text-sm font-semibold focus-visible:outline-2 ${filter === value ? "bg-accent/20 text-accent-hover" : "text-text-muted hover:text-text-primary"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {children}
    </main>
  );
}

function ReviewRowsSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading your reviews"
      className="mt-6 space-y-4"
    >
      {Array.from({ length: 4 }, (_, index) => (
        <div
          key={index}
          aria-hidden="true"
          className="border-border/60 bg-surface-muted/20 flex min-h-56 gap-4 rounded-2xl border p-4 sm:gap-5 sm:p-6"
        >
          <div className="bg-surface-muted aspect-[2/3] h-fit w-16 shrink-0 rounded-lg sm:w-20" />
          <div className="min-w-0 flex-1 space-y-4">
            <div className="bg-surface-muted h-6 w-24 rounded-full" />
            <div className="bg-surface-muted h-6 w-2/3 rounded" />
            <div className="bg-surface-muted h-3 w-1/3 rounded" />
            <div className="bg-surface-muted h-4 w-full rounded" />
            <div className="bg-surface-muted h-8 w-28 rounded-lg" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ReviewsLoading() {
  return (
    <ReviewLayout>
      <ReviewRowsSkeleton />
    </ReviewLayout>
  );
}

function ReviewLibrary() {
  const { data: session } = authClient.useSession();
  const [filter, setFilter] = useState<ReviewFilter>("all");
  const query = useInfiniteQuery({
    queryKey: ["reviews", "mine", session?.user.id, filter],
    queryFn: ({ pageParam }) =>
      accountApi<Review[]>(
        `/api/reviews?status=${filter}&limit=${pageSize}&offset=${pageParam}`,
      ),
    initialPageParam: 0,
    getNextPageParam: (last, pages) =>
      last.length === pageSize ? pages.length * pageSize : undefined,
    enabled: Boolean(session),
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[2] === session?.user.id ? previous : undefined,
  });
  const rows = query.data?.pages.flat() ?? [];
  return (
    <ReviewLayout filter={filter} onFilter={setFilter}>
      {query.isPending && <ReviewRowsSkeleton />}
      {query.isPlaceholderData && (
        <p role="status" className="sr-only">
          Updating reviews…
        </p>
      )}
      {query.isError && (
        <div
          role="alert"
          className="border-border/60 mt-6 rounded-xl border p-5"
        >
          <p className="text-danger">{query.error.message}</p>
          <button
            type="button"
            onClick={() =>
              void (query.isFetchNextPageError
                ? query.fetchNextPage()
                : query.refetch())
            }
            className="focus-visible:outline-accent mt-3 rounded-lg px-3 py-2 font-semibold underline focus-visible:outline-2"
          >
            Retry
          </button>
        </div>
      )}
      {query.isSuccess && !query.isPlaceholderData && rows.length === 0 && (
        <div className="border-border/60 bg-surface-muted/30 mt-6 rounded-2xl border px-6 py-14 text-center">
          <h2 className="text-xl font-bold">
            {filter === "draft"
              ? "No unfinished reviews"
              : filter === "published"
                ? "No published reviews yet"
                : "Your next review starts here"}
          </h2>
          <p className="text-text-muted mx-auto mt-3 max-w-md text-sm">
            {filter === "draft"
              ? "Choose Save draft while writing a review. You can pick it up here whenever you’re ready."
              : "Open a movie, TV show, season, or episode and choose Write a review to share your thoughts or save them for later."}
          </p>
          <a
            href="/discover"
            className="bg-accent hover:bg-accent-hover focus-visible:outline-accent mt-6 inline-block rounded-full px-5 py-2.5 text-sm font-bold text-white focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            Find something to review
          </a>
        </div>
      )}
      {rows.length > 0 && (
        <ul className="mt-6 space-y-4" aria-busy={query.isFetching}>
          {rows.map((review) => (
            <li
              key={review.id}
              className="border-border/60 bg-surface-muted/20 rounded-2xl border p-4 sm:p-6"
            >
              <article className="flex items-start gap-4 sm:gap-5">
                <a
                  href={reviewHref(review)}
                  aria-label={`View ${review.title}`}
                  className="shrink-0"
                >
                  {review.poster ? (
                    <img
                      src={review.poster}
                      alt=""
                      loading="lazy"
                      className="bg-surface-muted aspect-[2/3] w-16 rounded-lg object-cover sm:w-20"
                    />
                  ) : (
                    <div
                      aria-hidden="true"
                      className="bg-surface-muted flex aspect-[2/3] w-16 items-center justify-center rounded-lg text-2xl sm:w-20"
                    >
                      🎬
                    </div>
                  )}
                </a>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${review.status === "draft" ? "bg-accent/15 text-accent-hover" : "bg-surface-muted text-text-muted"}`}
                    >
                      {review.status === "draft"
                        ? "Private draft"
                        : "Published"}
                    </span>
                    {review.rating != null && (
                      <span
                        className="text-star text-sm"
                        aria-label={`${review.rating} out of 5 stars`}
                      >
                        ★ {review.rating}/5
                      </span>
                    )}
                  </div>
                  <h2 className="mt-2 text-lg font-bold">
                    <a href={reviewHref(review)} className="hover:underline">
                      {review.title}
                    </a>
                  </h2>
                  <p className="text-text-muted mt-1 text-xs">
                    {review.episode != null
                      ? "TV episode"
                      : review.season != null
                        ? "TV season"
                        : review.mediaType === "tv"
                          ? "TV show"
                          : "Movie"}
                    {review.subtitle ? ` · ${review.subtitle}` : ""} · Updated{" "}
                    {new Date(review.updatedAt).toLocaleDateString()}
                  </p>
                  <div className="mt-4 text-sm">
                    {review.review ? (
                      <ReviewContent review={review} />
                    ) : (
                      <p className="text-text-muted italic">
                        {review.status === "draft"
                          ? "A few thoughts still to come…"
                          : "A rating says it all."}
                      </p>
                    )}
                  </div>
                  <div className="mt-4">
                    <ReviewButton
                      item={review}
                      label={
                        review.status === "draft"
                          ? "Continue writing"
                          : "Edit review"
                      }
                    />
                  </div>
                </div>
              </article>
            </li>
          ))}
        </ul>
      )}
      {query.hasNextPage && !query.isPlaceholderData && (
        <button
          type="button"
          onClick={() => void query.fetchNextPage()}
          disabled={query.isFetchingNextPage}
          className="border-border/60 focus-visible:outline-accent mx-auto mt-6 block rounded-full border px-5 py-2.5 text-sm font-semibold focus-visible:outline-2 disabled:opacity-60"
        >
          {query.isFetchingNextPage ? "Loading…" : "Load more reviews"}
        </button>
      )}
    </ReviewLayout>
  );
}

export default function Reviews() {
  return (
    <QueryProvider>
      <AuthGate fallback={<ReviewsLoading />}>
        <ReviewLibrary />
      </AuthGate>
    </QueryProvider>
  );
}
