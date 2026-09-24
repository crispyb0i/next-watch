import { and, count, desc, eq, inArray } from "drizzle-orm";
import { db } from "../db/index.ts";
import { follows, users, watchLog } from "../db/schema.ts";

/** Whether `followerId` follows `followeeId`. */
export async function isFollowing(followerId: string, followeeId: string) {
  const rows = await db
    .select({ followeeId: follows.followeeId })
    .from(follows)
    .where(
      and(
        eq(follows.followerId, followerId),
        eq(follows.followeeId, followeeId),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/** Follower/following counts plus whether `viewerId` follows `userId`. */
export async function followState(userId: string, viewerId: string | null) {
  const [[followers], [following], viewerFollows] = await Promise.all([
    db
      .select({ n: count() })
      .from(follows)
      .where(eq(follows.followeeId, userId)),
    db
      .select({ n: count() })
      .from(follows)
      .where(eq(follows.followerId, userId)),
    viewerId && viewerId !== userId
      ? db
          .select({ followeeId: follows.followeeId })
          .from(follows)
          .where(
            and(
              eq(follows.followerId, viewerId),
              eq(follows.followeeId, userId),
            ),
          )
          .limit(1)
      : Promise.resolve([]),
  ]);

  return {
    followers: followers?.n ?? 0,
    following: following?.n ?? 0,
    isFollowing: viewerFollows.length > 0,
    isSelf: viewerId === userId,
  };
}

/**
 * Watch-log entries from everyone `userId` follows, newest first.
 *
 * ponytail: offset paging, no cursor. Fine while a feed page is 50 rows; switch
 * to a `(watchedOn, id)` keyset cursor if users scroll deep enough to notice
 * rows shifting under them.
 */
export async function feed(userId: string, limit = 50, offset = 0) {
  const followees = db
    .select({ id: follows.followeeId })
    .from(follows)
    .where(eq(follows.followerId, userId));

  return db
    .select({
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
      userId: watchLog.userId,
      userName: users.name,
      userImage: users.image,
    })
    .from(watchLog)
    .innerJoin(users, eq(users.id, watchLog.userId))
    .where(inArray(watchLog.userId, followees))
    .orderBy(desc(watchLog.watchedOn), desc(watchLog.id))
    .limit(limit)
    .offset(offset);
}

/** Idempotent. Returns false when the target user does not exist. */
export async function follow(followerId: string, followeeId: string) {
  if (followerId === followeeId) return false;

  const inserted = await db
    .insert(follows)
    .values({ followerId, followeeId })
    // Re-following is a no-op, not an error.
    .onConflictDoNothing()
    .returning({ followeeId: follows.followeeId })
    // A bad followeeId trips the FK; report it as "no such user".
    .catch(() => null);

  return inserted !== null;
}

export async function unfollow(followerId: string, followeeId: string) {
  await db
    .delete(follows)
    .where(
      and(
        eq(follows.followerId, followerId),
        eq(follows.followeeId, followeeId),
      ),
    );
}

/** Display name for a user row, never the raw email. */
export const displayName = (user: { name: string | null; email: string }) =>
  user.name || user.email.split("@")[0];
