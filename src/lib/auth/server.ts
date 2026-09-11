import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { db } from "../../db";
import { users } from "../../db/schema";

const baseUrl = import.meta.env.NEON_AUTH_BASE_URL;
const jwks = createRemoteJWKSet(new URL(`${baseUrl}/.well-known/jwks.json`));
const issuer = new URL(baseUrl).origin;

export async function verifySession(
  request: Request,
): Promise<JWTPayload | null> {
  const auth = request.headers.get("authorization");
  if (!auth?.toLowerCase().startsWith("bearer ")) return null;

  try {
    const { payload } = await jwtVerify(auth.slice(7), jwks, { issuer });
    return payload;
  } catch {
    return null;
  }
}

/** Caller's user id from the bearer token, or null. */
export async function sessionUserId(request: Request) {
  const payload = await verifySession(request);
  return typeof payload?.sub === "string" ? payload.sub : null;
}

/**
 * Mirror the token's profile claims into `users` so profile pages have a name to
 * show. Called on write only — reads don't need it.
 */
export async function syncUser(request: Request, id: string) {
  const payload = await verifySession(request);
  const email = typeof payload?.email === "string" ? payload.email : null;
  if (!email) return;

  const profile = {
    name: typeof payload?.name === "string" ? payload.name : null,
    image: typeof payload?.picture === "string" ? payload.picture : null,
  };

  await db
    .insert(users)
    .values({ id, email, ...profile })
    .onConflictDoUpdate({ target: users.id, set: profile });
}
