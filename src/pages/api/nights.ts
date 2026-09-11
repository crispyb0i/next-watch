import type { APIRoute } from "astro";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "../../db";
import {
  favorites,
  movieNights,
  nightMembers,
  nightVotes,
  users,
  watchLog,
} from "../../db/schema";
import { sessionUserId, syncUser } from "../../lib/auth/server";
import { bodyJson, json } from "../../lib/server/http";
import { shortlist } from "../../lib/nightCandidates";
export const prerender = false;
const validId = (value: unknown): value is string =>
  typeof value === "string" && /^[a-f0-9-]{36}$/.test(value);
async function members(id: string) {
  return db
    .select({ id: users.id, name: users.name })
    .from(nightMembers)
    .innerJoin(users, eq(users.id, nightMembers.userId))
    .where(eq(nightMembers.nightId, id));
}
async function candidates(ids: string[]) {
  if (!ids.length) return [];
  const [saved, watched] = await Promise.all([
    db
      .select()
      .from(favorites)
      .where(
        and(inArray(favorites.userId, ids), eq(favorites.kind, "watchlist")),
      ),
    db
      .select({ tmdbId: watchLog.tmdbId, mediaType: watchLog.mediaType })
      .from(watchLog)
      .where(inArray(watchLog.userId, ids)),
  ]);
  return shortlist(saved, watched).slice(0, 100);
}
export const GET: APIRoute = async ({ request, url }) => {
  const userId = await sessionUserId(request);
  if (!userId) return json({ error: "Sign in to continue." }, 401);
  const id = url.searchParams.get("id");
  if (!id)
    return json(
      await db
        .select({ id: movieNights.id, title: movieNights.title })
        .from(movieNights)
        .innerJoin(nightMembers, eq(nightMembers.nightId, movieNights.id))
        .where(eq(nightMembers.userId, userId))
        .orderBy(desc(movieNights.createdAt))
        .limit(100),
    );
  if (!validId(id)) return json({ error: "Invalid invite." }, 400);
  const group = await members(id);
  if (!group.some((member) => member.id === userId))
    return json({ error: "Join this movie night to view its shortlist." }, 403);
  const [night] = await db
    .select()
    .from(movieNights)
    .where(eq(movieNights.id, id));
  const [items, votes] = await Promise.all([
    candidates(group.map((member) => member.id)),
    db.select().from(nightVotes).where(eq(nightVotes.nightId, id)),
  ]);
  return json({
    night,
    members: group,
    candidates: items
      .map((item) => ({
        ...item,
        votes: votes.filter(
          (vote) =>
            vote.tmdbId === item.tmdbId && vote.mediaType === item.mediaType,
        ).length,
        voted: votes.some(
          (vote) =>
            vote.userId === userId &&
            vote.tmdbId === item.tmdbId &&
            vote.mediaType === item.mediaType,
        ),
      }))
      .sort((a, b) => b.votes - a.votes || a.title.localeCompare(b.title)),
  });
};
export const POST: APIRoute = async ({ request }) => {
  const userId = await sessionUserId(request);
  if (!userId) return json({ error: "Sign in to continue." }, 401);
  const body = await bodyJson(request);
  if (!body) return json({ error: "Invalid request." }, 400);
  if (body.action === "create") {
    if (
      typeof body.title !== "string" ||
      !body.title.trim() ||
      body.title.length > 100
    )
      return json({ error: "Enter a title of 1–100 characters." }, 400);
    if (!(await syncUser(request, userId)))
      return json({ error: "Complete your account first." }, 403);
    const id = crypto.randomUUID();
    await db.batch([
      db
        .insert(movieNights)
        .values({ id, ownerId: userId, title: body.title.trim() }),
      db.insert(nightMembers).values({ nightId: id, userId }),
    ]);
    return json({ id }, 201);
  }
  if (!validId(body.id)) return json({ error: "Invalid invite." }, 400);
  const id = body.id;
  if (body.action === "join") {
    const [night] = await db
      .select({ id: movieNights.id })
      .from(movieNights)
      .where(eq(movieNights.id, id));
    if (!night) return json({ error: "Movie night not found." }, 404);
    const currentMembers = await members(id);
    if (
      currentMembers.length >= 20 &&
      !currentMembers.some((member) => member.id === userId)
    )
      return json({ error: "This movie night already has 20 members." }, 409);
    if (!(await syncUser(request, userId)))
      return json({ error: "Complete your account first." }, 403);
    await db
      .insert(nightMembers)
      .values({ nightId: id, userId })
      .onConflictDoNothing();
    return json({ id });
  }
  const group = await members(id);
  if (!group.some((member) => member.id === userId))
    return json({ error: "Join this movie night first." }, 403);
  if (body.action === "vote") {
    const items = await candidates(group.map((member) => member.id));
    if (
      !items.some(
        (item) =>
          item.tmdbId === body.tmdbId && item.mediaType === body.mediaType,
      )
    )
      return json({ error: "This title is no longer on the shortlist." }, 400);
    const tmdbId = Number(body.tmdbId),
      mediaType = String(body.mediaType);
    if (body.remove === true)
      await db
        .delete(nightVotes)
        .where(
          and(
            eq(nightVotes.nightId, id),
            eq(nightVotes.userId, userId),
            eq(nightVotes.tmdbId, tmdbId),
            eq(nightVotes.mediaType, mediaType),
          ),
        );
    else
      await db
        .insert(nightVotes)
        .values({ nightId: id, userId, tmdbId, mediaType })
        .onConflictDoNothing();
    return json({ ok: true });
  }
  return json({ error: "Unknown action." }, 400);
};
