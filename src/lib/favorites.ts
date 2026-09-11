import { useSyncExternalStore } from "react";
import { getJWTToken } from "./auth/client";

export type MediaType = "movie" | "tv";

/** "favorite" = loved it, "watchlist" = want to watch. Same row shape. */
export type SaveKind = "favorite" | "watchlist";

export interface Favorite {
  id: number;
  /** Defaults to "movie" — TMDB ids only collide across media types. */
  mediaType?: MediaType;
  /** Defaults to "favorite". */
  kind?: SaveKind;
  title: string;
  poster: string | null;
  subtitle?: string | null;
  rating?: number | null;
  /** Where the card links. Defaults to the movie page when absent. */
  href?: string | null;
}

const KEY = "favorites";
const EMPTY: Favorite[] = [];
const listeners = new Set<() => void>();

let cache: Favorite[] = EMPTY;
let loaded = false;
let hydrated = false;

function emit() {
  for (const listener of listeners) listener();
}

async function token() {
  return getJWTToken();
}

/** localStorage is the signed-out store and the offline fallback. */
function readLocal(): Favorite[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    // Trust boundary: localStorage is user-writable, so keep only valid rows.
    return Array.isArray(parsed)
      ? parsed.filter(
          (item): item is Favorite =>
            typeof item?.id === "number" &&
            typeof item?.title === "string" &&
            (item.mediaType == null ||
              item.mediaType === "movie" ||
              item.mediaType === "tv") &&
            (item.kind == null ||
              item.kind === "favorite" ||
              item.kind === "watchlist") &&
            // Only same-origin paths — localStorage is user-writable, so a
            // stored `javascript:` or cross-origin href must never reach an <a>.
            (item.href == null ||
              (typeof item.href === "string" && item.href.startsWith("/"))),
        )
      : EMPTY;
  } catch {
    return EMPTY;
  }
}

function writeLocal(next: Favorite[]) {
  localStorage.setItem(KEY, JSON.stringify(next));
}

async function load() {
  const jwt = await token();
  if (!jwt) {
    cache = readLocal();
    hydrated = true;
    emit();
    return;
  }

  // First sign-in: push anything saved while signed out, then clear it.
  const pending = readLocal();
  for (const item of pending) await post(item, jwt);
  if (pending.length > 0) localStorage.removeItem(KEY);

  const response = await fetch("/api/favorites", {
    headers: { authorization: `Bearer ${jwt}` },
  });
  if (!response.ok) {
    hydrated = true;
    emit();
    return;
  }
  cache = await response.json();
  hydrated = true;
  emit();
}

function post(item: Favorite, jwt: string) {
  return fetch("/api/favorites", {
    method: "POST",
    headers: {
      authorization: `Bearer ${jwt}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      ...item,
      tmdbId: item.id,
      mediaType: typeOf(item),
      kind: kindOf(item),
    }),
  });
}

export function getFavorites(): Favorite[] {
  return cache;
}

const typeOf = (item: { mediaType?: MediaType }): MediaType =>
  item.mediaType ?? "movie";

export const kindOf = (item: { kind?: SaveKind }): SaveKind =>
  item.kind ?? "favorite";

const same = (a: Favorite, b: Favorite) =>
  a.id === b.id && typeOf(a) === typeOf(b) && kindOf(a) === kindOf(b);

export function isFavorite(
  id: number,
  mediaType: MediaType = "movie",
  kind: SaveKind = "favorite",
) {
  return cache.some(
    (item) =>
      item.id === id && typeOf(item) === mediaType && kindOf(item) === kind,
  );
}

/** Only the rows for one list — the store holds both. */
export function saved(kind: SaveKind): Favorite[] {
  return cache.filter((item) => kindOf(item) === kind);
}

export async function toggleFavorite(item: Favorite) {
  const removing = isFavorite(item.id, typeOf(item), kindOf(item));
  const previous = cache;

  // Optimistic: update now, roll back if the request fails.
  cache = removing
    ? cache.filter((entry) => !same(entry, item))
    : [item, ...cache];
  emit();

  const jwt = await token();
  if (!jwt) {
    writeLocal(cache);
    return { ok: true, removing };
  }

  const response = removing
    ? await fetch(
        `/api/favorites?tmdbId=${item.id}&mediaType=${typeOf(item)}` +
          `&kind=${kindOf(item)}`,
        {
          method: "DELETE",
          headers: { authorization: `Bearer ${jwt}` },
        },
      )
    : await post(item, jwt);

  if (!response.ok) {
    cache = previous;
    emit();
    return { ok: false, removing };
  }

  return { ok: true, removing };
}

export function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!loaded) {
    loaded = true;
    void load();
  }
  return () => listeners.delete(listener);
}

export function useFavorites(): Favorite[] {
  return useSyncExternalStore(subscribe, getFavorites, () => EMPTY);
}

/** Memoised per kind so the snapshot is referentially stable across renders. */
const byKind = new Map<SaveKind, { from: Favorite[]; rows: Favorite[] }>();

export function useSaved(kind: SaveKind): Favorite[] {
  return useSyncExternalStore(
    subscribe,
    () => {
      const memo = byKind.get(kind);
      if (memo?.from === cache) return memo.rows;
      const rows = saved(kind);
      byKind.set(kind, { from: cache, rows });
      return rows;
    },
    () => EMPTY,
  );
}

/** False until the first read (local or server) resolves — lets the UI show
 *  skeletons instead of a false "no favorites" state. */
export function useFavoritesLoaded(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => hydrated,
    () => false,
  );
}

/** Test seam. */
export function _resetForTest(next: Favorite[] = EMPTY) {
  cache = next;
  loaded = true;
  hydrated = true;
}
