import { mediaHref, validSavedSeason } from "../../lib/mediaHref";
import type { APIRoute } from "astro";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../../db";
import { favorites } from "../../db/schema";
import { sessionUserId, syncUser } from "../../lib/auth/server";

export const prerender = false;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });

const userId = sessionUserId;

/** Trust boundary: anything not "watchlist" is a favorite. */
const kindOf = (value: unknown) =>
  value === "watchlist" ? "watchlist" : "favorite";

export const GET: APIRoute = async ({ request }) => {
  const id = await userId(request);
  if (!id) return json({ error: "unauthorized" }, 401);

  const rows = await db
    .select({
      id: favorites.tmdbId,
      mediaType: favorites.mediaType,
      season: sql<number | null>`nullif(${favorites.season}, -1)`,
      title: favorites.title,
      poster: favorites.poster,
      subtitle: favorites.subtitle,
      rating: favorites.rating,
      href: favorites.href,
      kind: favorites.kind,
    })
    .from(favorites)
    .where(eq(favorites.userId, id))
    .orderBy(desc(favorites.createdAt));

  return json(rows);
};

export const POST: APIRoute = async ({ request }) => {
  const id = await userId(request);
  if (!id) return json({ error: "unauthorized" }, 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }

  // Trust boundary: the client picks these values, so validate before insert.
  const item = body as Record<string, unknown>;
  if (
    !Number.isSafeInteger(item?.tmdbId) ||
    Number(item?.tmdbId) <= 0 ||
    typeof item?.title !== "string"
  ) {
    return json({ error: "tmdbId and title are required" }, 400);
  }

  const mediaType = item.mediaType === "tv" ? "tv" : "movie";
  const kind = kindOf(item.kind);
  if (!validSavedSeason(item.season, mediaType))
    return json(
      { error: "Season must be a non-negative integer for a TV show." },
      400,
    );
  const season = item.season as number | null | undefined;

  if (!(await syncUser(request, id))) {
    return json({ error: "token is missing an email claim" }, 403);
  }
  await db
    .insert(favorites)
    .values({
      userId: id,
      tmdbId: item.tmdbId as number,
      mediaType,
      season: season ?? -1,
      kind,
      title: item.title.slice(0, 300),
      poster: typeof item.poster === "string" ? item.poster : null,
      subtitle: typeof item.subtitle === "string" ? item.subtitle : null,
      rating: typeof item.rating === "number" ? item.rating : null,
      href: mediaHref(item.href, mediaType, Number(item.tmdbId), season),
    })
    .onConflictDoNothing();

  return json({ ok: true }, 201);
};

export const DELETE: APIRoute = async ({ request, url }) => {
  const id = await userId(request);
  if (!id) return json({ error: "unauthorized" }, 401);

  const tmdbId = Number(url.searchParams.get("tmdbId"));
  if (!Number.isSafeInteger(tmdbId) || tmdbId <= 0)
    return json({ error: "bad tmdbId" }, 400);

  const mediaType = url.searchParams.get("mediaType") === "tv" ? "tv" : "movie";
  const kind = kindOf(url.searchParams.get("kind"));
  const season = url.searchParams.has("season")
    ? Number(url.searchParams.get("season")?.trim() || NaN)
    : null;
  if (!validSavedSeason(season, mediaType))
    return json({ error: "Invalid season" }, 400);

  await db
    .delete(favorites)
    .where(
      and(
        eq(favorites.userId, id),
        eq(favorites.tmdbId, tmdbId),
        eq(favorites.mediaType, mediaType),
        eq(favorites.kind, kind),
        eq(favorites.season, season ?? -1),
      ),
    );

  return json({ ok: true });
};
