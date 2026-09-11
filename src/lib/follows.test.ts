/**
 * Self-check for the follow graph. Hits the real database, creates two throwaway
 * users, and cleans up after itself.
 *
 *   DOTENV_CONFIG_PATH=.env.local node --experimental-strip-types --import ./src/lib/testEnv.ts src/lib/follows.test.ts
 */
import assert from "node:assert/strict";
import { eq, inArray } from "drizzle-orm";
import { follows, users, watchLog } from "../db/schema.ts";
import { feed, follow, followState, isFollowing, unfollow } from "./follows.ts";
import { db } from "../db/index.ts";

const A = "test-follow-a";
const B = "test-follow-b";

async function cleanup() {
  await db.delete(follows).where(inArray(follows.followerId, [A, B]));
  await db.delete(follows).where(inArray(follows.followeeId, [A, B]));
  await db.delete(watchLog).where(inArray(watchLog.userId, [A, B]));
  await db.delete(users).where(inArray(users.id, [A, B]));
}

await cleanup();

await db.insert(users).values([
  { id: A, email: `${A}@example.test`, name: "A" },
  { id: B, email: `${B}@example.test`, name: "B" },
]);

await db.insert(watchLog).values({
  userId: B,
  tmdbId: 603,
  title: "The Matrix",
  watchedOn: "2024-01-01",
  rating: 5,
});

// Self-follow is rejected before it reaches the check constraint.
assert.equal(await follow(A, A), false, "self-follow must be refused");

// Unknown target trips the FK and reports as failure, not a crash.
assert.equal(await follow(A, "no-such-user"), false, "unknown followee");

// Happy path, and following twice is a no-op rather than an error.
assert.equal(await follow(A, B), true);
assert.equal(await follow(A, B), true, "re-follow must be idempotent");
assert.equal(
  (await db.select().from(follows).where(eq(follows.followerId, A))).length,
  1,
  "duplicate follow row",
);
assert.equal(await isFollowing(A, B), true);
assert.equal(await isFollowing(B, A), false, "follows are directional");

// Counts read from both directions.
const stateB = await followState(B, A);
assert.equal(stateB.followers, 1);
assert.equal(stateB.following, 0);
assert.equal(stateB.isFollowing, true, "viewer A follows B");
assert.equal(stateB.isSelf, false);
assert.equal((await followState(B, B)).isSelf, true);

// A's feed carries B's watch; B's feed is empty (B follows nobody).
const feedA = await feed(A);
assert.ok(
  feedA.some((row) => row.tmdbId === 603 && row.userId === B),
  "A's feed must include B's watch",
);
assert.equal(
  (await feed(B)).some((row) => row.userId === A),
  false,
  "feed must not leak from non-followed users",
);

// Your own watches are not in your own feed.
assert.equal(
  feedA.some((row) => row.userId === A),
  false,
  "own entries must stay out of the feed",
);

await unfollow(A, B);
assert.equal(await isFollowing(A, B), false);
assert.equal((await feed(A)).length, 0, "unfollow must empty the feed");

// Deleting a user cascades their follow rows away.
await follow(A, B);
await db.delete(users).where(eq(users.id, B));
assert.equal(
  (await db.select().from(follows).where(eq(follows.followerId, A))).length,
  0,
  "follow rows must cascade on user delete",
);

await cleanup();
console.log("PASS follows");
