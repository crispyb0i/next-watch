import type { APIRoute } from "astro";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../../db";
import { favorites } from "../../db/schema";
import { sessionUserId, syncUser } from "../../lib/auth/server";

export const prerender = false;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
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
  if (!Number.isInteger(item?.tmdbId) || typeof item?.title !== "string") {
    return json({ error: "tmdbId and title are required" }, 400);
  }

  const mediaType = item.mediaType === "tv" ? "tv" : "movie";
  const kind = kindOf(item.kind);

  if (!(await syncUser(request, id))) {
    return json({ error: "token is missing an email claim" }, 403);
  }
  await db
    .insert(favorites)
    .values({
      userId: id,
      tmdbId: item.tmdbId as number,
      mediaType,
      kind,
      title: item.title.slice(0, 300),
      poster: typeof item.poster === "string" ? item.poster : null,
      subtitle: typeof item.subtitle === "string" ? item.subtitle : null,
      rating: typeof item.rating === "number" ? item.rating : null,
      // Same-origin paths only: this string is rendered as an <a href>.
      href:
        typeof item.href === "string" && item.href.startsWith("/")
          ? item.href.slice(0, 300)
          : null,
    })
    .onConflictDoNothing();

  return json({ ok: true }, 201);
};

export const DELETE: APIRoute = async ({ request, url }) => {
  const id = await userId(request);
  if (!id) return json({ error: "unauthorized" }, 401);

  const tmdbId = Number(url.searchParams.get("tmdbId"));
  if (!Number.isInteger(tmdbId)) return json({ error: "bad tmdbId" }, 400);

  const mediaType = url.searchParams.get("mediaType") === "tv" ? "tv" : "movie";
  const kind = kindOf(url.searchParams.get("kind"));

  await db
    .delete(favorites)
    .where(
      and(
        eq(favorites.userId, id),
        eq(favorites.tmdbId, tmdbId),
        eq(favorites.mediaType, mediaType),
        eq(favorites.kind, kind),
      ),
    );

  return json({ ok: true });
};
