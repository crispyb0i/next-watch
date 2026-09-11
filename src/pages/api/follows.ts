import type { APIRoute } from "astro";
import { follow, isFollowing, unfollow } from "../../lib/follows";
import { sessionUserId, syncUser } from "../../lib/auth/server";

export const prerender = false;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

/** Trust boundary: the body picks who to follow, so it must be a real user id. */
async function target(request: Request) {
  const body = (await request.json().catch(() => null)) as {
    userId?: unknown;
  } | null;
  const userId = body?.userId;
  return typeof userId === "string" && userId.length > 0 && userId.length <= 100
    ? userId
    : null;
}

/**
 * Whether the caller follows `?userId=`. Page requests carry no auth header, so
 * the follow button reads its own state from here after mount.
 */
export const GET: APIRoute = async ({ request, url }) => {
  const id = await sessionUserId(request);
  if (!id) return json({ following: false, isSelf: false });

  const userId = url.searchParams.get("userId") ?? "";
  if (!userId) return json({ error: "userId is required" }, 400);

  return json({
    following: await isFollowing(id, userId),
    isSelf: id === userId,
  });
};

export const POST: APIRoute = async ({ request }) => {
  const id = await sessionUserId(request);
  if (!id) return json({ error: "unauthorized" }, 401);
  // The follower needs a `users` row of their own: `followerId` is an FK.
  if (!(await syncUser(request, id)))
    return json({ error: "token is missing an email claim" }, 403);

  const followeeId = await target(request);
  if (!followeeId) return json({ error: "userId is required" }, 400);
  if (followeeId === id) return json({ error: "cannot follow yourself" }, 400);

  if (!(await follow(id, followeeId)))
    return json({ error: "no such user" }, 404);

  return json({ ok: true, following: true });
};

export const DELETE: APIRoute = async ({ request }) => {
  const id = await sessionUserId(request);
  if (!id) return json({ error: "unauthorized" }, 401);

  const followeeId = await target(request);
  if (!followeeId) return json({ error: "userId is required" }, 400);

  await unfollow(id, followeeId);
  return json({ ok: true, following: false });
};
