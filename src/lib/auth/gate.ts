/** Trust boundary: only same-origin paths, never `//evil.com` or a scheme. */
export function safeNext(value: string | null | undefined) {
  return value && value.startsWith("/") && !value.startsWith("//")
    ? value
    : "/";
}

export function signInHref(next?: string) {
  const target =
    next ?? `${location.pathname}${location.search}${location.hash}`;
  return `/auth/sign-in?redirect=${encodeURIComponent(safeNext(target))}`;
}

/**
 * Guard for account-only actions. Returns false and sends the user to sign-in
 * (coming back here afterwards) when signed out.
 * Imported lazily so this module stays runnable outside the browser (tests).
 */
export async function requireAuth() {
  const { getJWTToken } = await import("./client");
  if (await getJWTToken()) return true;
  location.href = signInHref();
  return false;
}
