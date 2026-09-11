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

export const GET: APIRoute = async ({ request }) => {
  const id = await userId(request);
  if (!id) return json({ error: "unauthorized" }, 401);

  const rows = await db
    .select({
      id: favorites.tmdbId,
      title: favorites.title,
      poster: favorites.poster,
      subtitle: favorites.subtitle,
      rating: favorites.rating,
      href: favorites.href,
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

  await syncUser(request, id);
  await db
    .insert(favorites)
    .values({
      userId: id,
      tmdbId: item.tmdbId as number,
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

  await db
    .delete(favorites)
    .where(and(eq(favorites.userId, id), eq(favorites.tmdbId, tmdbId)));

  return json({ ok: true });
};
