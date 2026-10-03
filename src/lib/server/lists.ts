import { and, asc, eq, or } from "drizzle-orm";
import { db } from "../../db";
import { customLists, customListItems, users } from "../../db/schema";
import { validListId, type ListDetail } from "../lists";

export async function readList(
  id: string,
  viewer: string | null,
): Promise<ListDetail | null> {
  if (!validListId(id)) return null;
  // Check visibility and read items in one statement, including after unsharing.
  const rows = await db
    .select({ list: customLists, item: customListItems, ownerName: users.name })
    .from(customLists)
    .innerJoin(users, eq(users.id, customLists.userId))
    .leftJoin(customListItems, eq(customListItems.listId, customLists.id))
    .where(
      and(
        eq(customLists.id, id),
        or(
          eq(customLists.shared, true),
          viewer ? eq(customLists.userId, viewer) : undefined,
        ),
      ),
    )
    .orderBy(asc(customListItems.createdAt), asc(customListItems.id));
  if (!rows.length) return null;
  const { list, ownerName } = rows[0];
  return {
    id: list.id,
    title: list.title,
    description: list.description,
    shared: list.shared,
    isOwner: list.userId === viewer,
    ownerName: ownerName || "A Next Watch member",
    items: rows.flatMap(({ item }) =>
      item
        ? [
            {
              id: item.id,
              tmdbId: item.tmdbId,
              mediaType: item.mediaType,
              season: item.season === -1 ? null : item.season,
              episode: item.episode === -1 ? null : item.episode,
              title: item.title,
              poster: item.poster,
              subtitle: item.subtitle,
            },
          ]
        : [],
    ),
  };
}
