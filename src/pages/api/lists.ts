import type { APIRoute } from "astro";
import { and, count, desc, eq } from "drizzle-orm";
import { db } from "../../db";
import { customLists, customListItems } from "../../db/schema";
import { sessionUserId, syncUser } from "../../lib/auth/server";
import { parseListDetails, parseListItem, validListId } from "../../lib/lists";
import { bodyJson, json } from "../../lib/server/http";
import { readList } from "../../lib/server/lists";
import { isMissingSchema } from "../../lib/server/schemaErrors";

export const prerender = false;

function available(handler: APIRoute): APIRoute {
  return async (context) => {
    try {
      return await handler(context);
    } catch (error) {
      if (!isMissingSchema(error)) throw error;
      return json(
        { error: "Lists are temporarily unavailable. Please try again later." },
        503,
      );
    }
  };
}

export const GET: APIRoute = available(async ({ request, url }) => {
  const userId = await sessionUserId(request);
  const id = url.searchParams.get("id");
  if (id !== null) {
    const list = await readList(id, userId);
    return list
      ? json(list)
      : json({ error: "This list is private or no longer available." }, 404);
  }
  if (!userId) return json({ error: "Sign in to see your lists." }, 401);
  return json(
    await db
      .select({
        id: customLists.id,
        title: customLists.title,
        description: customLists.description,
        shared: customLists.shared,
        itemCount: count(customListItems.id),
      })
      .from(customLists)
      .leftJoin(customListItems, eq(customListItems.listId, customLists.id))
      .where(eq(customLists.userId, userId))
      .groupBy(customLists.id)
      .orderBy(desc(customLists.updatedAt), desc(customLists.id)),
  );
});

export const POST: APIRoute = available(async ({ request }) => {
  const userId = await sessionUserId(request);
  if (!userId) return json({ error: "Sign in to manage lists." }, 401);
  const body = await bodyJson(request);
  if (!body) return json({ error: "Invalid request." }, 400);
  if (body.action === "create") {
    const details = parseListDetails(body);
    if (details.error) return json({ error: details.error }, 400);
    const item = body.item === undefined ? undefined : parseListItem(body.item);
    if (item === null) return json({ error: "Invalid title to add." }, 400);
    if (!(await syncUser(request, userId)))
      return json({ error: "Complete your account first." }, 403);
    const id = crypto.randomUUID();
    const create = db
      .insert(customLists)
      .values({ id, userId, ...details.value });
    if (item)
      await db.batch([
        create,
        db.insert(customListItems).values({ listId: id, ...item }),
      ]);
    else await create;
    return json({ id }, 201);
  }
  if (!validListId(body.id)) return json({ error: "Invalid list." }, 400);
  const owns = and(eq(customLists.id, body.id), eq(customLists.userId, userId));
  const [list] = await db
    .select({ id: customLists.id })
    .from(customLists)
    .where(owns);
  if (!list) return json({ error: "List not found." }, 404);
  if (body.action === "update") {
    const details = parseListDetails(body);
    if (details.error) return json({ error: details.error }, 400);
    await db
      .update(customLists)
      .set({ ...details.value, updatedAt: new Date() })
      .where(owns);
  } else if (body.action === "delete") {
    await db.delete(customLists).where(owns);
  } else if (body.action === "add") {
    const item = parseListItem(body.item);
    if (!item) return json({ error: "Invalid title to add." }, 400);
    await db.batch([
      db
        .insert(customListItems)
        .values({ listId: list.id, ...item })
        .onConflictDoNothing(),
      db.update(customLists).set({ updatedAt: new Date() }).where(owns),
    ]);
  } else if (body.action === "remove") {
    if (!Number.isSafeInteger(body.itemId) || Number(body.itemId) <= 0)
      return json({ error: "Invalid list item." }, 400);
    await db.batch([
      db
        .delete(customListItems)
        .where(
          and(
            eq(customListItems.listId, list.id),
            eq(customListItems.id, Number(body.itemId)),
          ),
        ),
      db.update(customLists).set({ updatedAt: new Date() }).where(owns),
    ]);
  } else return json({ error: "Unknown list action." }, 400);
  return json({ ok: true });
});
