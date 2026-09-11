import type { APIRoute } from "astro";
import { and, eq } from "drizzle-orm";
import { db } from "../../db";
import { watchLog } from "../../db/schema";
import { sessionUserId } from "../../lib/auth/server";
import { json } from "../../lib/server/http";
export const prerender = false;
export const GET: APIRoute = async ({ request, url }) => {
  const id = await sessionUserId(request);
  if (!id) return json({ error: "Sign in to track progress." }, 401);
  const tmdbId = Number(url.searchParams.get("id"));
  if (!Number.isSafeInteger(tmdbId) || tmdbId <= 0)
    return json({ error: "Invalid show." }, 400);
  return json(
    await db
      .selectDistinct({ season: watchLog.season, episode: watchLog.episode })
      .from(watchLog)
      .where(
        and(
          eq(watchLog.userId, id),
          eq(watchLog.tmdbId, tmdbId),
          eq(watchLog.mediaType, "tv"),
        ),
      ),
  );
};
