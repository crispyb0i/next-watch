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
  // Build every write before executing one transaction, so a failed entry
  // cannot leave part of this request imported but absent from its count.
  const inserts = [];
  for (const item of library.favorites) {
    const insert = db
      .insert(favorites)
      .values({
        userId: id,
        tmdbId: item.id,
        mediaType: item.mediaType,
        season: item.season ?? -1,
        kind: item.kind,
        title: item.title,
        poster: item.poster,
        subtitle: item.subtitle,
        rating: item.rating,
        href: mediaHref(item.href, item.mediaType, item.id, item.season),
      })
      .onConflictDoNothing()
      .returning({ id: favorites.tmdbId });
    inserts.push(insert);
  }
  const pendingWatched = new Set<string>();
  for (const entry of library.watched) {
    // Match the existing-row identity below; display metadata is not part of
    // watch history identity, including within this still-uncommitted batch.
    const identity = JSON.stringify([
      entry.tmdbId,
      entry.mediaType,
      entry.watchedOn,
      entry.title,
      entry.season,
      entry.episode,
      entry.notes,
    ]);
    if (pendingWatched.has(identity)) continue;
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
          entry.season == null
            ? isNull(watchLog.season)
            : eq(watchLog.season, entry.season),
          entry.episode == null
            ? isNull(watchLog.episode)
            : eq(watchLog.episode, entry.episode),
          entry.notes == null
            ? isNull(watchLog.notes)
            : eq(watchLog.notes, entry.notes),
        ),
      )
      .limit(1);
    if (existing.length) continue;
    pendingWatched.add(identity);
    const bytes = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(JSON.stringify(entry)),
    );
    const importKey = Array.from(new Uint8Array(bytes), (value) =>
      value.toString(16).padStart(2, "0"),
    ).join("");
    const insert = db
      .insert(watchLog)
      .values({ ...entry, userId: id, importKey })
      .onConflictDoNothing()
      .returning({ id: watchLog.id });
    inserts.push(insert);
  }
  const [first, ...rest] = inserts;
  if (!first) return json({ imported: 0 });
  const results = await db.batch([first, ...rest]);
  const imported = results.reduce((total, rows) => total + rows.length, 0);
  return json({ imported });
};
