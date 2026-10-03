import type { APIRoute } from "astro";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../../db";
import { favorites, showStatuses, watchLog } from "../../db/schema";
import { sessionUserId, syncUser } from "../../lib/auth/server";
import { bodyJson, json } from "../../lib/server/http";
import { withSchemaAvailability } from "../../lib/server/schemaErrors";
import { isViewingStatus, type ViewingShow } from "../../lib/viewingStatus";

export const prerender = false;

export const GET: APIRoute = withSchemaAvailability(async ({ request }) => {
  const userId = await sessionUserId(request);
  if (!userId) return json({ error: "Sign in to see your shows." }, 401);

  const [saved, logged, explicit] = await Promise.all([
    db
      .select()
      .from(favorites)
      .where(
        and(
          eq(favorites.userId, userId),
          eq(favorites.mediaType, "tv"),
          eq(favorites.kind, "watchlist"),
          eq(favorites.season, -1),
        ),
      ),
    db
      .select({
        tmdbId: watchLog.tmdbId,
        updatedAt: sql<string>`max(${watchLog.createdAt})`,
        wholeShow: sql<boolean>`bool_or(${watchLog.season} is null)`,
      })
      .from(watchLog)
      .where(and(eq(watchLog.userId, userId), eq(watchLog.mediaType, "tv")))
      .groupBy(watchLog.tmdbId),
    db
      .select()
      .from(showStatuses)
      .where(eq(showStatuses.userId, userId))
      .orderBy(desc(showStatuses.updatedAt)),
  ]);
  const shows = new Map<number, ViewingShow>();
  for (const row of saved)
    shows.set(row.tmdbId, {
      tmdbId: row.tmdbId,
      status: "want_to_watch",
      title: row.title,
      poster: row.poster,
      updatedAt: row.createdAt.toISOString(),
    });
  // Existing viewing history works immediately, without rewriting old logs.
  for (const row of logged)
    shows.set(row.tmdbId, {
      tmdbId: row.tmdbId,
      status: row.wholeShow ? "finished" : "watching",
      title: shows.get(row.tmdbId)?.title ?? `Show #${row.tmdbId}`,
      poster: shows.get(row.tmdbId)?.poster ?? null,
      updatedAt: new Date(row.updatedAt).toISOString(),
    });
  for (const row of explicit)
    shows.set(row.tmdbId, { ...row, updatedAt: row.updatedAt.toISOString() });
  return json(
    [...shows.values()].sort(
      (a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.tmdbId - b.tmdbId,
    ),
  );
}, "Viewing statuses are temporarily unavailable. Please try again later.");

export const POST: APIRoute = withSchemaAvailability(async ({ request }) => {
  const userId = await sessionUserId(request);
  if (!userId) return json({ error: "Sign in to track a show." }, 401);
  const body = await bodyJson(request);
  if (
    !body ||
    !Number.isSafeInteger(body.tmdbId) ||
    Number(body.tmdbId) <= 0 ||
    Number(body.tmdbId) > 2147483647 ||
    !isViewingStatus(body.status) ||
    typeof body.title !== "string" ||
    !body.title.trim() ||
    body.title.trim().length > 300 ||
    (body.poster != null &&
      (typeof body.poster !== "string" ||
        !/^https:\/\/image\.tmdb\.org\/t\/p\/[\w/.-]+$/.test(body.poster)))
  ) {
    return json({ error: "Choose a valid show and viewing status." }, 400);
  }
  if (!(await syncUser(request, userId)))
    return json({ error: "Could not verify your account." }, 403);
  const tmdbId = Number(body.tmdbId);
  const value = {
    userId,
    tmdbId,
    status: body.status,
    title: body.title.trim(),
    poster: typeof body.poster === "string" ? body.poster : null,
    updatedAt: new Date(),
  };
  const savedShow = and(
    eq(favorites.userId, userId),
    eq(favorites.tmdbId, tmdbId),
    eq(favorites.mediaType, "tv"),
    eq(favorites.kind, "watchlist"),
    eq(favorites.season, -1),
  );
  await db.batch([
    db
      .insert(showStatuses)
      .values(value)
      .onConflictDoUpdate({
        target: [showStatuses.userId, showStatuses.tmdbId],
        set: value,
      }),
    body.status === "want_to_watch"
      ? db
          .insert(favorites)
          .values({
            userId,
            tmdbId,
            mediaType: "tv",
            kind: "watchlist",
            title: value.title,
            poster: value.poster,
            href: `/tv?id=${tmdbId}`,
          })
          .onConflictDoNothing()
      : db.delete(favorites).where(savedShow),
  ]);
  return json({ ok: true });
}, "Viewing statuses are temporarily unavailable. Please try again later.");
