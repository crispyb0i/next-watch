/** Shape the client posts and the server stores for reviews. */
export type MediaType = "movie" | "tv";

export interface ReviewInput {
  tmdbId: number;
  mediaType?: MediaType;
  title: string;
  poster?: string | null;
  subtitle?: string | null;
  /** 0.5-5 stars in half-star increments, null when not rated. */
  rating?: number | null;
  /** The written review. */
  review?: string | null;
}

export interface Review extends ReviewInput {
  id: number;
  userId: string;
  mediaType: MediaType;
  createdAt: string;
  updatedAt: string;
}

/** Link a review back to its media page. */
export function reviewHref(review: { tmdbId: number; mediaType: MediaType }) {
  if (review.mediaType !== "tv") return `/movie?id=${review.tmdbId}`;
  return `/tv?id=${review.tmdbId}`;
}

const str = (value: unknown, max: number) =>
  typeof value === "string" && value.trim() !== ""
    ? value.trim().slice(0, max)
    : null;

/**
 * Trust boundary: the client picks every value here, so parse before insert.
 * Returns the normalised row or an error message.
 */
export function parseReview(
  body: unknown,
): { ok: true; value: Required<ReviewInput> } | { ok: false; error: string } {
  const raw = (body ?? {}) as Record<string, unknown>;

  if (!Number.isInteger(raw.tmdbId) || (raw.tmdbId as number) <= 0)
    return { ok: false, error: "tmdbId must be a positive integer" };
  const title = str(raw.title, 300);
  if (!title) return { ok: false, error: "title is required" };

  const mediaType = raw.mediaType === "tv" ? "tv" : "movie";

  const rating = raw.rating;
  if (
    rating != null &&
    !(
      typeof rating === "number" &&
      Number.isInteger(rating * 2) &&
      rating >= 0.5 &&
      rating <= 5
    )
  )
    return { ok: false, error: "rating must be 0.5-5 in half-star increments" };

  return {
    ok: true,
    value: {
      tmdbId: raw.tmdbId as number,
      mediaType,
      title,
      poster: str(raw.poster, 300),
      subtitle: str(raw.subtitle, 100),
      rating: rating == null ? null : (rating as number),
      review: str(raw.review, 5000),
    },
  };
}
