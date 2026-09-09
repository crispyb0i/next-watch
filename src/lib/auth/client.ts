import { createAuthClient } from "@neondatabase/auth";
import { BetterAuthReactAdapter } from "@neondatabase/auth/react";

// React adapter so components can read the session with authClient.useSession().
export const authClient = createAuthClient(
  import.meta.env.PUBLIC_NEON_AUTH_URL,
  { adapter: BetterAuthReactAdapter() },
);
