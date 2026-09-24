import { pagination } from "../../lib/pagination";
import type { APIRoute } from "astro";
import { and, desc, eq, gte, lt } from "drizzle-orm";
import { db } from "../../db";
import { watchLog } from "../../db/schema";
import { sessionUserId, syncUser } from "../../lib/auth/server";
import { parseEntry } from "../../lib/watchLog";

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
  id: watchLog.id,
  tmdbId: watchLog.tmdbId,
  mediaType: watchLog.mediaType,
  season: watchLog.season,
  episode: watchLog.episode,
  title: watchLog.title,
  poster: watchLog.poster,
  subtitle: watchLog.subtitle,
  notes: watchLog.notes,
  watchedOn: watchLog.watchedOn,
};

/** Newest watch first, ties broken by insert order. */
export function listWatched(userId: string, month?: string) {
  const nextMonth = month
    ? `${Number(month.slice(5)) === 12 ? Number(month.slice(0, 4)) + 1 : month.slice(0, 4)}-${String((Number(month.slice(5)) % 12) + 1).padStart(2, "0")}-01`
    : null;
  return db
    .select(columns)
    .from(watchLog)
    .where(
      and(
        eq(watchLog.userId, userId),
        month ? gte(watchLog.watchedOn, `${month}-01`) : undefined,
        nextMonth ? lt(watchLog.watchedOn, nextMonth) : undefined,
      ),
    )
    .orderBy(desc(watchLog.watchedOn), desc(watchLog.id));
}

export const GET: APIRoute = async ({ request, url }) => {
  const id = await sessionUserId(request);
  if (!id) return json({ error: "unauthorized" }, 401);
  const month = url.searchParams.get("month");
  if (month !== null && !/^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(month))
    return json({ error: "Invalid month" }, 400);
  let limit: number, offset: number;
  try {
    ({ limit, offset } = pagination(url.searchParams));
  } catch {
    return json({ error: "Invalid pagination" }, 400);
  }
  return json(
    await listWatched(id, month ?? undefined)
      .limit(limit)
      .offset(offset),
  );
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
