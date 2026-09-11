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
let loadError: string | null = null;
let loading: Promise<void> | undefined;
const mutations = new Map<string, Promise<unknown>>();

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
              (typeof item.href === "string" &&
                /^\/(?![\/\\])[^\\\u0000-\u0020]*$/.test(item.href))),
        )
      : EMPTY;
  } catch {
    return EMPTY;
  }
}

function writeLocal(next: Favorite[]) {
  localStorage.setItem(KEY, JSON.stringify(next));
}

export function reloadFavorites() {
  if (!loading)
    loading = loadFavorites().finally(() => {
      loading = undefined;
    });
  return loading;
}

async function loadFavorites() {
  const pending = readLocal();
  loadError = null;
  try {
    const jwt = await token();
    if (!jwt) {
      cache = readLocal();
      hydrated = true;
      emit();
      return;
    }

    // First sign-in: push anything saved while signed out, then clear it.
    const remaining: Favorite[] = [];
    for (const item of pending) {
      try {
        if (!(await post(item, jwt)).ok) remaining.push(item);
      } catch {
        remaining.push(item);
      }
    }
    if (pending.length > 0) writeLocal(remaining);

    const response = await fetch("/api/favorites", {
      headers: { authorization: `Bearer ${jwt}` },
    });
    if (!response.ok) {
      throw new Error("Could not load saved items");
    }
    const remote: Favorite[] = await response.json();
    cache = [
      ...remote,
      ...remaining.filter((item) => !remote.some((row) => same(row, item))),
    ];
    if (remaining.length)
      loadError = "Some saved items could not sync. Your local copy is safe.";
  } catch {
    if (!cache.length) cache = pending;
    loadError = "Could not load saved items. Retry when connected.";
  } finally {
    hydrated = true;
    emit();
  }
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

export function toggleFavorite(
  item: Favorite,
): Promise<{ ok: boolean; removing: boolean }> {
  const key = `${typeOf(item)}:${item.id}:${kindOf(item)}`;
  const run = async () => {
    if (loading) await loading;
    if (!hydrated) await reloadFavorites();
    const previous = cache.find((entry) => same(entry, item));
    const removing = Boolean(previous);
    cache = removing
      ? cache.filter((entry) => !same(entry, item))
      : [item, ...cache];
    emit();
    try {
      const jwt = await token();
      if (!jwt) {
        writeLocal(cache);
      } else {
        const response = removing
          ? await fetch(
              `/api/favorites?tmdbId=${item.id}&mediaType=${typeOf(item)}&kind=${kindOf(item)}`,
              {
                method: "DELETE",
                headers: { authorization: `Bearer ${jwt}` },
              },
            )
          : await post(item, jwt);
        if (!response.ok) throw new Error("Save failed");
      }
      return { ok: true, removing };
    } catch {
      cache = cache.filter((entry) => !same(entry, item));
      if (previous) cache = [previous, ...cache];
      emit();
      return { ok: false, removing };
    }
  };
  const previous = mutations.get(key);
  const result = previous ? previous.then(run, run) : run();
  mutations.set(key, result);
  void result.finally(() => {
    if (mutations.get(key) === result) mutations.delete(key);
  });
  return result;
}

export function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!loaded) {
    loaded = true;
    void reloadFavorites();
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

export function useFavoritesError() {
  return useSyncExternalStore(
    subscribe,
    () => loadError,
    () => null,
  );
}

/** Test seam. */
export function _resetForTest(next: Favorite[] = EMPTY) {
  cache = next;
  loaded = true;
  hydrated = true;
}
