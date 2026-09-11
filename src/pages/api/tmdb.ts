import type { APIRoute } from "astro";
import { serverTmdb, TmdbError } from "../../lib/server/tmdb";
export const prerender = false;
export const GET: APIRoute = async ({ url, request }) => {
  const params = Object.fromEntries(url.searchParams);
  const path = params.path ?? "";
  delete params.path;
  try {
    const data = await serverTmdb(path, params, request.signal);
    return Response.json(data, {
      headers: {
        "Cache-Control":
          "public, max-age=60, s-maxage=300, stale-while-revalidate=600",
      },
    });
  } catch (error) {
    const status = error instanceof TmdbError ? error.status : 502;
    return Response.json(
      { error: "Could not load movie data. Please try again." },
      {
        status,
        headers: {
          "Cache-Control": "no-store",
          ...(status === 429 ? { "Retry-After": "30" } : {}),
        },
      },
    );
  }
};
