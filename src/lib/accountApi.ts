import { getJWTToken } from "./auth/client";
export async function accountApi<T>(
  path: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  signal?.throwIfAborted();
  const token = await getJWTToken();
  signal?.throwIfAborted();
  if (!token) throw new Error("Sign in to continue.");
  const response = await fetch(path, {
    signal,
    method: body === undefined ? "GET" : "POST",
    headers: {
      authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = await response.json().catch(() => null);
  signal?.throwIfAborted();
  if (!response.ok)
    throw new Error(
      typeof result?.error === "string"
        ? result.error
        : "Could not complete the request. Try again.",
    );
  if (result === null)
    throw new Error(
      "The server returned an invalid response. Please try again.",
    );
  return result as T;
}
