import { pagination } from "../../lib/pagination";
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

  let limit: number, offset: number;
  try {
    ({ limit, offset } = pagination(url.searchParams));
  } catch {
    return Response.json({ error: "Invalid pagination" }, { status: 400 });
  }

  return new Response(JSON.stringify(await feed(id, limit, offset)), {
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });
};
