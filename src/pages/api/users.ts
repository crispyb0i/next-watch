import type { APIRoute } from "astro";
import { ilike, isNotNull, and } from "drizzle-orm";
import { db } from "../../db";
import { users } from "../../db/schema";
import { containsPattern } from "../../lib/likePattern";

export const prerender = false;

/**
 * Public user search. Trust boundary: `q` is user input, so it is length-capped
 * and the `%` wildcards are added around an escaped literal — never select
 * `email`, that column would let anyone enumerate addresses.
 */
export const GET: APIRoute = async ({ url }) => {
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 100);
  if (q.length < 2) return json([]);

  const pattern = containsPattern(q);

  const rows = await db
    .select({ id: users.id, name: users.name, image: users.image })
    .from(users)
    .where(and(isNotNull(users.name), ilike(users.name, pattern)))
    .limit(20);

  return json(rows);
};

const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
  });
