import type { APIRoute } from "astro";

/** Drizzle wraps PostgreSQL errors in `cause`; don't swallow unrelated failures. */
export function isMissingSchema(error: unknown): boolean {
  const seen = new Set<unknown>();
  while (error && typeof error === "object" && !seen.has(error)) {
    seen.add(error);
    const current = error as { code?: unknown; cause?: unknown };
    if (current.code === "42P01" || current.code === "42703") return true;
    error = current.cause;
  }
  return false;
}

export function withSchemaAvailability(handler: APIRoute): APIRoute {
  return async (context) => {
    try {
      return await handler(context);
    } catch (error) {
      if (!isMissingSchema(error)) throw error;
      return Response.json(
        {
          error:
            "Streaming settings are temporarily unavailable. Please try again later.",
        },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }
  };
}
