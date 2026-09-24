import type { APIRoute } from "astro";
import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { db } from "../../db";
import { follows, reviews, users } from "../../db/schema";
import { sessionUserId } from "../../lib/auth/server";
import { tasteMatches } from "../../lib/taste";
import { json } from "../../lib/server/http";
export const prerender = false;
export const GET: APIRoute = async ({ request }) => {
  const id = await sessionUserId(request);
  if (!id) return json({ error: "Sign in to see recommendations." }, 401);
  const friends = await db
    .select({ id: users.id, name: users.name })
    .from(follows)
    .innerJoin(users, eq(users.id, follows.followeeId))
    .where(eq(follows.followerId, id))
    .limit(100);
  const rows = await db
    .select({
      userId: reviews.userId,
      tmdbId: reviews.tmdbId,
      mediaType: reviews.mediaType,
      rating: reviews.rating,
      title: reviews.title,
      poster: reviews.poster,
    })
    .from(reviews)
    .where(
      and(
        inArray(reviews.userId, [id, ...friends.map((friend) => friend.id)]),
        isNotNull(reviews.rating),
      ),
    )
    .orderBy(desc(reviews.updatedAt), desc(reviews.id))
    .limit(10000);
  return json(
    tasteMatches(
      id,
      rows,
      Object.fromEntries(
        friends.map((friend) => [friend.id, friend.name ?? "A friend"]),
      ),
    ),
  );
};
