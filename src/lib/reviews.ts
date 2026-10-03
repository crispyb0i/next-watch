import {
  parseReviewDocument,
  reviewDocumentText,
  REVIEW_MAX_LENGTH,
  type ReviewNode,
} from "./reviewDocument";

/** Shape the client posts and the server stores for reviews. */
export type MediaType = "movie" | "tv";

export interface ReviewInput {
  tmdbId: number;
  mediaType?: MediaType;
  /** TV show ID plus season identifies a season; add episode for one episode. */
  season?: number | null;
  episode?: number | null;
  title: string;
  poster?: string | null;
  subtitle?: string | null;
  /** 0.5-5 stars in half-star increments, null when not rated. */
  rating?: number | null;
  /** The written review. */
  review?: string | null;
  document?: ReviewNode | null;
  status?: "draft" | "published";
}

export interface Review extends ReviewInput {
  id: number;
  userId: string;
  mediaType: MediaType;
  createdAt: string;
  updatedAt: string;
}

/** Link a review back to its media page. */
export function reviewHref(
  review: Pick<ReviewInput, "tmdbId" | "mediaType" | "season" | "episode">,
) {
  if (review.mediaType !== "tv") return `/movie?id=${review.tmdbId}`;
  if (review.season != null && review.episode != null)
    return `/tv/episode?id=${review.tmdbId}&season=${review.season}&episode=${review.episode}`;
  if (review.season != null)
    return `/tv/season?id=${review.tmdbId}&season=${review.season}`;
  return `/tv?id=${review.tmdbId}`;
}

export function parseReviewTarget(raw: Record<string, unknown>):
  | {
      ok: true;
      value: Required<
        Pick<ReviewInput, "tmdbId" | "mediaType" | "season" | "episode">
      >;
    }
  | { ok: false; error: string } {
  const integer = (value: unknown, min: number) =>
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= min &&
    value <= 2_147_483_647;
  if (!integer(raw.tmdbId, 1))
    return { ok: false, error: "tmdbId must be a positive integer" };
  const mediaType = raw.mediaType ?? "movie";
  if (mediaType !== "movie" && mediaType !== "tv")
    return { ok: false, error: "Invalid media type" };
  const season = raw.season ?? null;
  const episode = raw.episode ?? null;
  if (
    (season !== null || episode !== null) &&
    (mediaType !== "tv" ||
      !integer(season, 0) ||
      (episode !== null && !integer(episode, 1)))
  )
    return {
      ok: false,
      error:
        "Season and episode reviews require TV, a non-negative season and, when supplied, a positive episode number.",
    };
  return {
    ok: true,
    value: {
      tmdbId: raw.tmdbId as number,
      mediaType,
      season: season as number | null,
      episode: episode as number | null,
    },
  };
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

  const target = parseReviewTarget(raw);
  if (!target.ok) return target;
  const title = str(raw.title, 300);
  if (!title) return { ok: false, error: "title is required" };

  if (
    raw.status !== undefined &&
    raw.status !== "draft" &&
    raw.status !== "published"
  )
    return { ok: false, error: "Invalid review status" };
  let document: ReviewNode | null = null;
  let review = typeof raw.review === "string" ? raw.review.trim() : null;
  try {
    if (raw.document != null) {
      document = parseReviewDocument(raw.document);
      review = reviewDocumentText(document).trim();
    }
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? error.message : "Invalid review formatting",
    };
  }
  if (review && review.length > REVIEW_MAX_LENGTH)
    return { ok: false, error: "Reviews must be 5,000 characters or fewer." };

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
      ...target.value,
      title,
      poster: str(raw.poster, 300),
      subtitle: str(raw.subtitle, 100),
      rating: rating == null ? null : (rating as number),
      review: review || null,
      document,
      status: raw.status === "draft" ? "draft" : "published",
    },
  };
}
