import { pagination } from "../../lib/pagination";
import type { APIRoute } from "astro";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../../db";
import { reviews } from "../../db/schema";
import { sessionUserId, syncUser } from "../../lib/auth/server";
import { parseReview } from "../../lib/reviews";

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
  title: reviews.title,
  poster: reviews.poster,
  subtitle: reviews.subtitle,
  rating: reviews.rating,
  review: reviews.review,
  createdAt: reviews.createdAt,
  updatedAt: reviews.updatedAt,
};

/** Newest review first, ties broken by insert order. */
export function listReviews(userId: string) {
  return db
    .select(columns)
    .from(reviews)
    .where(eq(reviews.userId, userId))
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
  if (!Number.isInteger(tmdbId) || tmdbId <= 0)
    return json({ error: "Invalid tmdbId" }, 400);

  const [row] = await db
    .select(columns)
    .from(reviews)
    .where(
      and(
        eq(reviews.userId, id),
        eq(reviews.tmdbId, tmdbId),
        eq(reviews.mediaType, mediaType === "tv" ? "tv" : "movie"),
      ),
    )
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
    // Unique violation on (userId, tmdbId, mediaType).
    if (error instanceof Error && error.message.includes("23505")) {
      return json({ error: "You already reviewed this title." }, 409);
    }
    throw error;
  }
};

export const PATCH: APIRoute = async ({ request, url }) => {
  const id = await sessionUserId(request);
  if (!id) return json({ error: "unauthorized" }, 401);

  const reviewId = Number(url.searchParams.get("id"));
  if (!Number.isInteger(reviewId)) return json({ error: "bad id" }, 400);

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
    .set({ ...parsed.value, updatedAt: new Date() })
    .where(and(eq(reviews.userId, id), eq(reviews.id, reviewId)))
    .returning(columns);

  return row ? json(row) : json({ error: "not found" }, 404);
};

export const DELETE: APIRoute = async ({ request, url }) => {
  const id = await sessionUserId(request);
  if (!id) return json({ error: "unauthorized" }, 401);

  const reviewId = Number(url.searchParams.get("id"));
  if (!Number.isInteger(reviewId)) return json({ error: "bad id" }, 400);

  await db
    .delete(reviews)
    .where(and(eq(reviews.userId, id), eq(reviews.id, reviewId)));

  return json({ ok: true });
};
