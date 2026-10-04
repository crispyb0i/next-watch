const paths = [
  /^\/(movie|tv)\/[1-9]\d*(\/(watch\/providers|season\/\d+(\/episode\/[1-9]\d*)?))?$/,
  /^\/person\/[1-9]\d*(\/combined_credits)?$/,
  /^\/search\/(multi|movie|tv|person)$/,
  /^\/trending\/(all|movie|tv)\/(day|week)$/,
  /^\/movie\/(upcoming|now_playing|top_rated|popular)$/,
  /^\/tv\/(airing_today|on_the_air|top_rated|popular)$/,
  /^\/watch\/providers\/(movie|tv)$/,
];
const append = new Set([
  "videos",
  "credits",
  "aggregate_credits",
  "recommendations",
  "similar",
  "watch/providers",
  "release_dates",
  "content_ratings",
  "external_ids",
]);

export function validateTmdb(path: string, params: Record<string, string>) {
  if (
    (path.match(/\d+/g) ?? []).some(
      (value) => !Number.isSafeInteger(Number(value)),
    )
  )
    return false;
  if (path.length > 160 || !paths.some((pattern) => pattern.test(path)))
    return false;
  return Object.entries(params).every(([key, value]) => {
    if (key === "query")
      return (
        path.startsWith("/search/") &&
        value.trim().length > 0 &&
        value.length <= 200
      );
    if (key === "page")
      return /^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= 500;
    if (key === "append_to_response")
      return value.split(",").every((part) => append.has(part));
    if (key === "language") return /^[a-z]{2}(-[A-Z]{2})?$/.test(value);
    if (key === "region" || key === "watch_region")
      return /^[A-Z]{2}$/.test(value);
    return false;
  });
}

export class TmdbError extends Error {
  status: number;
  constructor(status: number) {
    super("Movie data is temporarily unavailable. Please try again.");
    this.status = status;
  }
}

// Bounded warm-instance cache; the API response also uses the CDN cache.
const cacheLimit = 300;
const cache = new Map<string, { data: unknown; expires: number }>();
const pending = new Map<string, Promise<unknown>>();

// A disconnected viewer stops waiting without cancelling other viewers' data.
function forCaller<T>(request: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return request;
  return new Promise((resolve, reject) => {
    const abort = () => {
      signal.removeEventListener("abort", abort);
      reject(new TmdbError(503));
    };
    signal.addEventListener("abort", abort, { once: true });
    request.then(
      (data) => {
        signal.removeEventListener("abort", abort);
        resolve(data);
      },
      (error) => {
        signal.removeEventListener("abort", abort);
        reject(error);
      },
    );
    if (signal.aborted) abort();
  });
}
export async function serverTmdb<T>(
  path: string,
  params: Record<string, string> = {},
  signal?: AbortSignal,
): Promise<T> {
  if (!validateTmdb(path, params)) throw new TmdbError(400);
  if (signal?.aborted) throw new TmdbError(503);
  const key =
    path + "?" + new URLSearchParams(Object.entries(params).sort()).toString();
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) return cached.data as T;
  const existing = pending.get(key);
  if (existing) return forCaller(existing as Promise<T>, signal);
  const request = loadTmdb<T>(path, params).then((data) => {
    if (cache.size >= cacheLimit) cache.delete(cache.keys().next().value!);
    cache.set(key, { data, expires: Date.now() + 5 * 60_000 });
    return data;
  });
  const settled = request.finally(() => {
    if (pending.get(key) === settled) pending.delete(key);
  });
  if (pending.size < cacheLimit) pending.set(key, settled);
  return forCaller(settled, signal);
}

async function loadTmdb<T>(
  path: string,
  params: Record<string, string>,
): Promise<T> {
  const apiKey =
    import.meta.env?.TMDB_API_KEY ??
    process.env.TMDB_API_KEY ??
    import.meta.env?.PUBLIC_TMDB_API_KEY ??
    process.env.PUBLIC_TMDB_API_KEY;
  if (!apiKey) throw new TmdbError(503);
  const url = new URL("https://api.themoviedb.org/3" + path);
  for (const [name, value] of Object.entries(params))
    url.searchParams.set(name, value);
  url.searchParams.set("api_key", apiKey);
  let response: Response;
  try {
    response = await fetch(url, {
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new TmdbError(503);
  }
  if (!response.ok)
    throw new TmdbError(
      response.status === 404 ? 404 : response.status === 429 ? 429 : 502,
    );
  return response.json() as Promise<T>;
}
