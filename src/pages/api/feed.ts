import type { APIRoute } from "astro";
import { feed } from "../../lib/follows";
import { sessionUserId } from "../../lib/auth/server";

export const prerender = false;

export const GET: APIRoute = async ({ request, url }) => {
  const id = await sessionUserId(request);
  if (!id)
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });

  // Trust boundary: paging params come from the client, so clamp them.
  const limit = Math.min(
    Math.max(Number(url.searchParams.get("limit")) || 50, 1),
    100,
  );
  const offset = Math.max(Number(url.searchParams.get("offset")) || 0, 0);

  return new Response(JSON.stringify(await feed(id, limit, offset)), {
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });
};
