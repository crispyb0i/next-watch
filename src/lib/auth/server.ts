import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

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
