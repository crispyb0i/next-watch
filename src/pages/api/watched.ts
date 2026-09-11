import type { APIRoute } from "astro";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../../db";
import { watchLog } from "../../db/schema";
import { sessionUserId, syncUser } from "../../lib/auth/server";
import { parseEntry } from "../../lib/watchLog";

export const prerender = false;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const columns = {
  id: watchLog.id,
  tmdbId: watchLog.tmdbId,
  mediaType: watchLog.mediaType,
  season: watchLog.season,
  episode: watchLog.episode,
  title: watchLog.title,
  poster: watchLog.poster,
  subtitle: watchLog.subtitle,
  rating: watchLog.rating,
  review: watchLog.review,
  watchedOn: watchLog.watchedOn,
  rewatch: watchLog.rewatch,
  venue: watchLog.venue,
};

/** Newest watch first, ties broken by insert order. */
export function listWatched(userId: string) {
  return db
    .select(columns)
    .from(watchLog)
    .where(eq(watchLog.userId, userId))
    .orderBy(desc(watchLog.watchedOn), desc(watchLog.id));
}

export const GET: APIRoute = async ({ request }) => {
  const id = await sessionUserId(request);
  if (!id) return json({ error: "unauthorized" }, 401);
  return json(await listWatched(id));
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

  const parsed = parseEntry(body);
  if (!parsed.ok) return json({ error: parsed.error }, 400);

  if (!(await syncUser(request, id))) {
    return json({ error: "token is missing an email claim" }, 403);
  }
  const [row] = await db
    .insert(watchLog)
    .values({ userId: id, ...parsed.value })
    .returning(columns);

  return json(row, 201);
};

/**
 * Full replace of one entry. The client resends the whole entry, so the same
 * trust-boundary parse as POST applies — no partial-patch merge logic.
 */
export const PATCH: APIRoute = async ({ request, url }) => {
  const id = await sessionUserId(request);
  if (!id) return json({ error: "unauthorized" }, 401);

  const entryId = Number(url.searchParams.get("id"));
  if (!Number.isInteger(entryId)) return json({ error: "bad id" }, 400);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }

  const parsed = parseEntry(body);
  if (!parsed.ok) return json({ error: parsed.error }, 400);

  const [row] = await db
    .update(watchLog)
    .set(parsed.value)
    .where(and(eq(watchLog.userId, id), eq(watchLog.id, entryId)))
    .returning(columns);

  return row ? json(row) : json({ error: "not found" }, 404);
};

export const DELETE: APIRoute = async ({ request, url }) => {
  const id = await sessionUserId(request);
  if (!id) return json({ error: "unauthorized" }, 401);

  const entryId = Number(url.searchParams.get("id"));
  if (!Number.isInteger(entryId)) return json({ error: "bad id" }, 400);

  await db
    .delete(watchLog)
    .where(and(eq(watchLog.userId, id), eq(watchLog.id, entryId)));

  return json({ ok: true });
};
