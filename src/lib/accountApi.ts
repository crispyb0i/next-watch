import { getJWTToken } from "./auth/client";
export async function accountApi<T>(path: string, body?: unknown): Promise<T> {
  const token = await getJWTToken();
  if (!token) throw new Error("Sign in to continue.");
  const response = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = await response.json().catch(() => null);
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
