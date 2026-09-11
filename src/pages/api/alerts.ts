import { withSchemaAvailability } from "../../lib/server/schemaErrors";
import type { APIRoute } from "astro";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "../../db";
import {
  availabilityAlerts,
  availabilitySnapshots,
  favorites,
  viewingPreferences,
} from "../../db/schema";
import { sessionUserId, syncUser } from "../../lib/auth/server";
import { bodyJson, json } from "../../lib/server/http";
import { serverTmdb } from "../../lib/server/tmdb";
import type { WatchProvidersResponse } from "../../lib/tmdb";
export const prerender = false;
export const GET: APIRoute = withSchemaAvailability(async ({ request }) => {
  const id = await sessionUserId(request);
  if (!id) return json({ error: "Sign in to continue." }, 401);
  const [preferences] = await db
    .select()
    .from(viewingPreferences)
    .where(eq(viewingPreferences.userId, id));
  const alerts = await db
    .select()
    .from(availabilityAlerts)
    .where(eq(availabilityAlerts.userId, id))
    .orderBy(desc(availabilityAlerts.id))
    .limit(100);
  return json({
    preferences: preferences
      ? { ...preferences, providerIds: JSON.parse(preferences.providerIds) }
      : { region: "US", providerIds: [], watchlistPublic: false },
    alerts,
  });
});
export const POST: APIRoute = withSchemaAvailability(async ({ request }) => {
  const id = await sessionUserId(request);
  if (!id) return json({ error: "Sign in to continue." }, 401);
  const body = await bodyJson(request);
  if (!body) return json({ error: "Invalid request." }, 400);
  if (body.action === "preferences") {
    if (
      typeof body.region !== "string" ||
      !/^[A-Z]{2}$/.test(body.region) ||
      !Array.isArray(body.providerIds) ||
      body.providerIds.length > 30 ||
      !body.providerIds.every(
        (value) => Number.isSafeInteger(value) && value > 0,
      ) ||
      typeof body.watchlistPublic !== "boolean"
    )
      return json({ error: "Choose a region and valid services." }, 400);
    if (!(await syncUser(request, id)))
      return json({ error: "Complete your account first." }, 403);
    const values = {
      region: body.region,
      providerIds: JSON.stringify([...new Set(body.providerIds)]),
      watchlistPublic: body.watchlistPublic,
    };
    await db
      .insert(viewingPreferences)
      .values({ userId: id, ...values })
      .onConflictDoUpdate({ target: viewingPreferences.userId, set: values });
    return json({ ok: true });
  }
  if (body.action === "read") {
    await db
      .update(availabilityAlerts)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(availabilityAlerts.userId, id),
          isNull(availabilityAlerts.readAt),
        ),
      );
    return json({ ok: true });
  }
  if (body.action !== "check") return json({ error: "Unknown action." }, 400);
  const offset = Number(body.offset ?? 0);
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 100000)
    return json({ error: "Invalid page." }, 400);
  const [preferences] = await db
    .select()
    .from(viewingPreferences)
    .where(eq(viewingPreferences.userId, id));
  if (!preferences)
    return json({ error: "Save your region and services first." }, 400);
  const selected: number[] = JSON.parse(preferences.providerIds);
  if (!selected.length)
    return json({ error: "Select at least one streaming service." }, 400);
  const items = await db
    .select()
    .from(favorites)
    .where(and(eq(favorites.userId, id), eq(favorites.kind, "watchlist")))
    .orderBy(favorites.mediaType, favorites.tmdbId)
    .limit(11)
    .offset(offset);
  let failed = 0,
    checked = 0;
  for (const item of items.slice(0, 10)) {
    try {
      const response = await serverTmdb<WatchProvidersResponse>(
        `/${item.mediaType === "tv" ? "tv" : "movie"}/${item.tmdbId}/watch/providers`,
      );
      const country = response.results[preferences.region];
      const providers = [
        ...new Map(
          [
            ...(country?.flatrate ?? []),
            ...(country?.free ?? []),
            ...(country?.ads ?? []),
          ].map((provider) => [provider.provider_id, provider]),
        ).values(),
      ];
      const where = and(
        eq(availabilitySnapshots.userId, id),
        eq(availabilitySnapshots.tmdbId, item.tmdbId),
        eq(availabilitySnapshots.mediaType, item.mediaType),
        eq(availabilitySnapshots.region, preferences.region),
      );
      const [previous] = await db
        .select()
        .from(availabilitySnapshots)
        .where(where);
      const before: number[] = previous ? JSON.parse(previous.providerIds) : [];
      const added = providers.filter(
        (provider) =>
          selected.includes(provider.provider_id) &&
          !before.includes(provider.provider_id),
      );
      const snapshot = {
        userId: id,
        tmdbId: item.tmdbId,
        mediaType: item.mediaType,
        region: preferences.region,
        providerIds: JSON.stringify(
          providers
            .filter((provider) => selected.includes(provider.provider_id))
            .map((provider) => provider.provider_id),
        ),
        checkedAt: new Date(),
      };
      const update = db
        .insert(availabilitySnapshots)
        .values(snapshot)
        .onConflictDoUpdate({
          target: [
            availabilitySnapshots.userId,
            availabilitySnapshots.tmdbId,
            availabilitySnapshots.mediaType,
            availabilitySnapshots.region,
          ],
          set: {
            providerIds: snapshot.providerIds,
            checkedAt: snapshot.checkedAt,
          },
        });
      if (added.length)
        await db.batch([
          update,
          db
            .insert(availabilityAlerts)
            .values({
              userId: id,
              eventKey: `${item.mediaType}:${item.tmdbId}:${preferences.region}:${previous?.checkedAt.toISOString() ?? "initial"}:${added
                .map((provider) => provider.provider_id)
                .sort()
                .join(",")}`,
              title: item.title,
              href: `/${item.mediaType === "tv" ? "tv" : "movie"}?id=${item.tmdbId}`,
              message: `${previous ? "Now available" : "Available"} on ${added.map((provider) => provider.provider_name).join(", ")} in ${preferences.region}. Availability can change.`,
            })
            .onConflictDoNothing(),
        ]);
      else await update;
      checked++;
    } catch {
      failed++;
    }
  }
  return json({
    checked,
    failed,
    nextOffset: items.length > 10 ? offset + 10 : null,
    checkedAt: new Date().toISOString(),
  });
});
