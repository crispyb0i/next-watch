/** Trust boundary: only same-origin paths, never `//evil.com` or a scheme. */
export function safeNext(value: string | null | undefined) {
  if (!value || !value.startsWith("/") || /[\\\u0000-\u0020\u007f]/.test(value))
    return "/";
  try {
    const base = "https://next-watch.invalid";
    const url = new URL(value, base);
    return url.origin === base
      ? `${url.pathname}${url.search}${url.hash}`
      : "/";
  } catch {
    return "/";
  }
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
  try {
    if (await getJWTToken()) return true;
  } catch {
    const { notify } = await import("../notifications");
    notify("Could not check your sign-in. Please try again.", "error");
    return false;
  }
  location.href = signInHref();
  return false;
}
