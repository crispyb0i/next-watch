// Preserve episode/season favorites while rejecting arbitrary destinations.
export function mediaHref(raw: unknown, mediaType: string, id: number) {
  const fallback = `/${mediaType === "tv" ? "tv" : "movie"}?id=${id}`;
  if (typeof raw !== "string" || /[\\\u0000-\u0020\u007f]/.test(raw))
    return fallback;
  try {
    const origin = "https://next-watch.invalid",
      url = new URL(raw, origin);
    if (
      url.origin !== origin ||
      !["/movie", "/tv", "/tv/season", "/tv/episode"].includes(url.pathname)
    )
      return fallback;
    const result = new URLSearchParams();
    for (const key of [
      "id",
      ...(url.pathname.startsWith("/tv/") ? ["season"] : []),
      ...(url.pathname === "/tv/episode" ? ["episode"] : []),
    ]) {
      const value = url.searchParams.get(key);
      if (
        value === null ||
        !/^\d+$/.test(value) ||
        !Number.isSafeInteger(Number(value)) ||
        Number(value) < (key === "season" ? 0 : 1)
      )
        return fallback;
      result.set(key, String(Number(value)));
    }
    return `${url.pathname}?${result}`;
  } catch {
    return fallback;
  }
}
