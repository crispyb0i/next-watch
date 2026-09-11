import type { APIRoute } from "astro";
import { db } from "../../db";
import { users } from "../../db/schema";
import { verifySession } from "../../lib/auth/server";

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const payload = await verifySession(request);
  const id = typeof payload?.sub === "string" ? payload.sub : null;
  const email = typeof payload?.email === "string" ? payload.email : null;
  if (!id || !email) return json({ error: "Unauthorized" }, 401);

  const body = await request.json().catch(() => null);
  const name =
    typeof body?.name === "string" ? body.name.trim().slice(0, 100) : null;
  const image =
    typeof body?.image === "string" && body.image.length <= 2_000_000
      ? body.image
      : null;

  await db
    .insert(users)
    .values({ id, email, name, image })
    .onConflictDoUpdate({ target: users.id, set: { name, image } });

  return json({ ok: true });
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
