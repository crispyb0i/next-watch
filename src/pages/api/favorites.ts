import type { APIRoute } from "astro";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../../db";
import { favorites, users } from "../../db/schema";
import { verifySession } from "../../lib/auth/server";

export const prerender = false;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

/** Resolve the caller's user id from the bearer token, or null. */
async function userId(request: Request) {
  const payload = await verifySession(request);
  return typeof payload?.sub === "string" ? payload.sub : null;
}

/**
 * Mirror the token's profile claims into `users` so profile pages have a name to
 * show. Called on write only — reads don't need it.
 */
async function syncUser(request: Request, id: string) {
  const payload = await verifySession(request);
  const email = typeof payload?.email === "string" ? payload.email : null;
  if (!email) return;

  const profile = {
    name: typeof payload?.name === "string" ? payload.name : null,
    image: typeof payload?.picture === "string" ? payload.picture : null,
  };

  await db
    .insert(users)
    .values({ id, email, ...profile })
    .onConflictDoUpdate({ target: users.id, set: profile });
}

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
