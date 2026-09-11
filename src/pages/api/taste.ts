import type { APIRoute } from "astro";
import { desc, eq, inArray } from "drizzle-orm";
import { db } from "../../db";
import { follows, users, watchLog } from "../../db/schema";
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
    .select()
    .from(watchLog)
    .where(
      inArray(watchLog.userId, [id, ...friends.map((friend) => friend.id)]),
    )
    .orderBy(desc(watchLog.watchedOn), desc(watchLog.id))
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
