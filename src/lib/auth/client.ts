import { createInternalNeonAuth } from "@neondatabase/auth";
import { BetterAuthReactAdapter } from "@neondatabase/auth/react";

// `createInternalNeonAuth` (rather than `createAuthClient`) because we need
// `getJWTToken()` for API calls: `session.token` is an opaque Better Auth
// session token, not a verifiable JWT.
// The adapter generic isn't inferred from `config.adapter`, so name it to keep
// `authClient` typed as the React client (i.e. with `useSession`).
type ReactAdapter = ReturnType<ReturnType<typeof BetterAuthReactAdapter>>;

const neonAuth = createInternalNeonAuth<ReactAdapter>(
  import.meta.env.PUBLIC_NEON_AUTH_URL,
  { adapter: BetterAuthReactAdapter() },
);

// React adapter so components can read the session with authClient.useSession().
export const authClient = neonAuth.adapter;

/** Signed JWT for `Authorization: Bearer`, or null when signed out. */
export const getJWTToken = neonAuth.getJWTToken;
