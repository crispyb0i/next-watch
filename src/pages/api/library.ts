import { and, eq, isNull } from "drizzle-orm";
import { mediaHref } from "../../lib/mediaHref";
import type { APIRoute } from "astro";
import { db } from "../../db";
import { favorites, watchLog } from "../../db/schema";
import { sessionUserId, syncUser } from "../../lib/auth/server";
import { json, bodyJson } from "../../lib/server/http";
import { parseLibrary } from "../../lib/libraryTransfer";
export const prerender = false;
export const POST: APIRoute = async ({ request }) => {
  const id = await sessionUserId(request);
  if (!id) return json({ error: "Sign in to import your history." }, 401);
  let library;
  try {
    library = parseLibrary(await bodyJson(request));
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : "Invalid import." },
      400,
    );
  }
  if (library.favorites.length + library.watched.length > 10)
    return json({ error: "Import at most 10 entries per request." }, 400);
  if (!(await syncUser(request, id)))
    return json({ error: "Complete your account first." }, 403);
  let imported = 0;
  for (const item of library.favorites) {
    const rows = await db
      .insert(favorites)
      .values({
        userId: id,
        tmdbId: item.id,
        mediaType: item.mediaType,
        kind: item.kind,
        title: item.title,
        poster: item.poster,
        subtitle: item.subtitle,
        rating: item.rating,
        href: mediaHref(item.href, item.mediaType, item.id),
      })
      .onConflictDoNothing()
      .returning({ id: favorites.tmdbId });
    imported += rows.length;
  }
  for (const entry of library.watched) {
    const existing = await db
      .select({ id: watchLog.id })
      .from(watchLog)
      .where(
        and(
          eq(watchLog.userId, id),
          eq(watchLog.tmdbId, entry.tmdbId),
          eq(watchLog.mediaType, entry.mediaType ?? "movie"),
          eq(watchLog.watchedOn, entry.watchedOn),
          eq(watchLog.title, entry.title),
          eq(watchLog.rewatch, entry.rewatch ?? false),
          entry.season == null
            ? isNull(watchLog.season)
            : eq(watchLog.season, entry.season),
          entry.episode == null
            ? isNull(watchLog.episode)
            : eq(watchLog.episode, entry.episode),
          entry.rating == null
            ? isNull(watchLog.rating)
            : eq(watchLog.rating, entry.rating),
          entry.review == null
            ? isNull(watchLog.review)
            : eq(watchLog.review, entry.review),
          entry.venue == null
            ? isNull(watchLog.venue)
            : eq(watchLog.venue, entry.venue),
        ),
      )
      .limit(1);
    if (existing.length) continue;
    const bytes = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(JSON.stringify(entry)),
    );
    const importKey = Array.from(new Uint8Array(bytes), (value) =>
      value.toString(16).padStart(2, "0"),
    ).join("");
    const rows = await db
      .insert(watchLog)
      .values({ ...entry, userId: id, importKey })
      .onConflictDoNothing()
      .returning({ id: watchLog.id });
    imported += rows.length;
  }
  return json({ imported });
};
