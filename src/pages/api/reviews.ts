import { pagination } from "../../lib/pagination";
import type { APIRoute } from "astro";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "../../db";
import { reviews } from "../../db/schema";
import { sessionUserId, syncUser } from "../../lib/auth/server";
import {
  parseReview,
  parseReviewTarget,
  type ReviewInput,
} from "../../lib/reviews";

export const prerender = false;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });

const columns = {
  id: reviews.id,
  userId: reviews.userId,
  tmdbId: reviews.tmdbId,
  mediaType: reviews.mediaType,
  season: reviews.season,
  episode: reviews.episode,
  title: reviews.title,
  poster: reviews.poster,
  subtitle: reviews.subtitle,
  rating: reviews.rating,
  review: reviews.review,
  document: reviews.document,
  status: reviews.status,
  createdAt: reviews.createdAt,
  updatedAt: reviews.updatedAt,
};

const targetFilter = (
  target: Required<
    Pick<ReviewInput, "tmdbId" | "mediaType" | "season" | "episode">
  >,
) =>
  and(
    eq(reviews.tmdbId, target.tmdbId),
    eq(reviews.mediaType, target.mediaType),
    target.season === null
      ? isNull(reviews.season)
      : eq(reviews.season, target.season),
    target.episode === null
      ? isNull(reviews.episode)
      : eq(reviews.episode, target.episode),
  );

/** Newest review first, ties broken by insert order. */
export function listReviews(
  userId: string,
  status: "draft" | "published" | "all" = "published",
) {
  return db
    .select(columns)
    .from(reviews)
    .where(
      and(
        eq(reviews.userId, userId),
        status === "all" ? undefined : eq(reviews.status, status),
      ),
    )
    .orderBy(desc(reviews.updatedAt), desc(reviews.id));
}

export const GET: APIRoute = async ({ request, url }) => {
  const tmdbId = Number(url.searchParams.get("tmdbId"));
  const mediaType = url.searchParams.get("mediaType") ?? "movie";
  const userId = url.searchParams.get("userId");

  // Public list of one user's reviews.
  if (userId) {
    let limit: number, offset: number;
    try {
      ({ limit, offset } = pagination(url.searchParams));
    } catch {
      return json({ error: "Invalid pagination" }, 400);
    }
    return json(await listReviews(userId).limit(limit).offset(offset));
  }

  // Authenticated lookup of the viewer's own review for a title.
  const id = await sessionUserId(request);
  if (!id) return json({ error: "unauthorized" }, 401);
  if (!url.searchParams.has("tmdbId")) {
    const status = url.searchParams.get("status") ?? "all";
    if (status !== "all" && status !== "draft" && status !== "published")
      return json({ error: "Invalid review status" }, 400);
    let limit: number, offset: number;
    try {
      ({ limit, offset } = pagination(url.searchParams));
    } catch {
      return json({ error: "Invalid pagination" }, 400);
    }
    return json(await listReviews(id, status).limit(limit).offset(offset));
  }
  const coordinate = (name: string) =>
    url.searchParams.has(name)
      ? Number(url.searchParams.get(name)?.trim() || NaN)
      : null;
  const target = parseReviewTarget({
    tmdbId,
    mediaType,
    season: coordinate("season"),
    episode: coordinate("episode"),
  });
  if (!target.ok) return json({ error: target.error }, 400);

  const [row] = await db
    .select(columns)
    .from(reviews)
    .where(and(eq(reviews.userId, id), targetFilter(target.value)))
    .limit(1);
  return json(row ?? null);
};

export const POST: APIRoute = async ({ request }) => {
  const id = await sessionUserId(request);
  if (!id) return json({ error: "unauthorized" }, 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }

  const parsed = parseReview(body);
  if (!parsed.ok) return json({ error: parsed.error }, 400);

  if (!(await syncUser(request, id))) {
    return json({ error: "token is missing an email claim" }, 403);
  }

  try {
    const [row] = await db
      .insert(reviews)
      .values({ userId: id, ...parsed.value, updatedAt: new Date() })
      .returning(columns);
    return json(row, 201);
  } catch (error) {
    // Only one review or draft per user and movie/show/season/episode.
    const cause = error instanceof Error ? error.cause : undefined;
    if (
      [error, cause].some(
        (value) =>
          value &&
          typeof value === "object" &&
          Reflect.get(value, "code") === "23505",
      )
    ) {
      return json(
        {
          error:
            "You already have a review or draft for this title. Reopen it to continue editing.",
        },
        409,
      );
    }
    throw error;
  }
};

export const PATCH: APIRoute = async ({ request, url }) => {
  const id = await sessionUserId(request);
  if (!id) return json({ error: "unauthorized" }, 401);

  const reviewId = Number(url.searchParams.get("id"));
  if (!Number.isSafeInteger(reviewId) || reviewId <= 0)
    return json({ error: "bad id" }, 400);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }

  const parsed = parseReview(body);
  if (!parsed.ok) return json({ error: parsed.error }, 400);

  const [row] = await db
    .update(reviews)
    .set({
      ...parsed.value,
      status:
        (body as Record<string, unknown>).status === undefined
          ? undefined
          : parsed.value.status,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(reviews.userId, id),
        eq(reviews.id, reviewId),
        targetFilter(parsed.value),
      ),
    )
    .returning(columns);

  return row ? json(row) : json({ error: "not found" }, 404);
};

export const DELETE: APIRoute = async ({ request, url }) => {
  const id = await sessionUserId(request);
  if (!id) return json({ error: "unauthorized" }, 401);

  const reviewId = Number(url.searchParams.get("id"));
  if (!Number.isSafeInteger(reviewId) || reviewId <= 0)
    return json({ error: "bad id" }, 400);

  await db
    .delete(reviews)
    .where(and(eq(reviews.userId, id), eq(reviews.id, reviewId)));

  return json({ ok: true });
};
