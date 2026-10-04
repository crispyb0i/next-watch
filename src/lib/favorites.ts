import { useSyncExternalStore } from "react";
import { getJWTToken } from "./auth/client";
import { validSavedSeason } from "./mediaHref.ts";

export type MediaType = "movie" | "tv";

/** "favorite" = loved it, "watchlist" = want to watch. Same row shape. */
export type SaveKind = "favorite" | "watchlist";

export interface Favorite {
  id: number;
  /** Defaults to "movie". Season entries use the parent show's ID. */
  mediaType?: MediaType;
  season?: number | null;
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
let loading: { generation: number; promise: Promise<void> } | undefined;
let owner: string | null | undefined;
let generation = 0;
const mutations = new Map<string, Promise<unknown>>();

function emit() {
  for (const listener of listeners) listener();
}

async function token() {
  return getJWTToken();
}

// The subject only partitions client state; the server still verifies the JWT.
function tokenOwner(jwt: string | null): string | null {
  if (!jwt) return null;
  try {
    const payload = JSON.parse(
      atob(jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
    );
    if (typeof payload.sub === "string" && payload.sub)
      return `user:${payload.sub}`;
  } catch {
    // An unrecognised token must never share the signed-out store.
  }
  return `token:${jwt}`;
}

function changeOwner(next: string | null) {
  if (owner === next) return false;
  const initial = owner === undefined;
  owner = next;
  generation++;
  if (!initial) {
    cache = EMPTY;
    hydrated = false;
    loadError = null;
    loading = undefined;
    mutations.clear();
    emit();
  }
  return true;
}

/** The shared auth observer clears private state as soon as a session changes. */
export function setFavoritesUserId(userId: string | null) {
  if (changeOwner(userId === null ? null : `user:${userId}`))
    void reloadFavorites();
}

async function currentScope(cancelOnChange = false) {
  // Ignore a token read started before the session observer changed accounts.
  for (;;) {
    const started = generation;
    const knownOwner = owner;
    const jwt = await token();
    if (started !== generation) {
      if (
        cancelOnChange &&
        (knownOwner !== undefined || tokenOwner(jwt) !== owner)
      )
        throw new Error("The account changed before saving.");
      continue;
    }
    const next = tokenOwner(jwt);
    changeOwner(next);
    return { jwt, owner: next, generation };
  }
}

type Scope = Awaited<ReturnType<typeof currentScope>>;
const active = (scope: Scope) => scope.generation === generation;

async function stillCurrent(scope: Scope) {
  if (!active(scope)) return false;
  let jwt: string | null;
  try {
    jwt = await token();
  } catch {
    // A token refresh failure is not evidence of signing out.
    return active(scope);
  }
  if (!active(scope)) return false;
  const next = tokenOwner(jwt);
  if (next === scope.owner) return true;
  changeOwner(next);
  void reloadFavorites();
  return false;
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
            validSavedSeason(item.season, item.mediaType) &&
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

export async function reloadFavorites() {
  const started = generation;
  let scope: Scope;
  try {
    scope = await currentScope();
  } catch {
    if (started === generation) {
      loadError = "Could not load saved items. Retry when connected.";
      emit();
    }
    return;
  }
  if (loading?.generation === scope.generation) return loading.promise;
  const promise = loadFavorites(scope).finally(() => {
    if (loading?.promise === promise) loading = undefined;
  });
  loading = { generation: scope.generation, promise };
  return promise;
}

async function loadFavorites(scope: Scope) {
  const pending = readLocal();
  loadError = null;
  try {
    const { jwt } = scope;
    if (!jwt) {
      cache = readLocal();
      hydrated = true;
      emit();
      return;
    }

    // First sign-in: push anything saved while signed out, then clear it.
    const remaining: Favorite[] = [];
    for (const item of pending) {
      if (!active(scope)) return;
      try {
        if (!(await post(item, jwt)).ok) remaining.push(item);
      } catch {
        remaining.push(item);
      }
    }
    if (!(await stillCurrent(scope))) return;
    if (pending.length > 0) writeLocal(remaining);

    const response = await fetch("/api/favorites", {
      headers: { authorization: `Bearer ${jwt}` },
    });
    if (!response.ok) {
      throw new Error("Could not load saved items");
    }
    const remote: Favorite[] = await response.json();
    if (!(await stillCurrent(scope))) return;
    cache = [
      ...remote,
      ...remaining.filter((item) => !remote.some((row) => same(row, item))),
    ];
    if (remaining.length)
      loadError = "Some saved items could not sync. Your local copy is safe.";
  } catch {
    if (!(await stillCurrent(scope))) return;
    if (!cache.length) cache = pending;
    loadError = "Could not load saved items. Retry when connected.";
  } finally {
    if (active(scope)) {
      hydrated = true;
      emit();
    }
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
  a.id === b.id &&
  typeOf(a) === typeOf(b) &&
  kindOf(a) === kindOf(b) &&
  (a.season ?? null) === (b.season ?? null);

export function isFavorite(
  id: number,
  mediaType: MediaType = "movie",
  kind: SaveKind = "favorite",
  season: number | null = null,
) {
  return cache.some(
    (item) =>
      item.id === id &&
      typeOf(item) === mediaType &&
      kindOf(item) === kind &&
      (item.season ?? null) === season,
  );
}

/** Only the rows for one list — the store holds both. */
export function saved(kind: SaveKind): Favorite[] {
  return cache.filter((item) => kindOf(item) === kind);
}

export async function toggleFavorite(
  item: Favorite,
): Promise<{ ok: boolean; removing: boolean }> {
  let scope: Scope;
  try {
    scope = await currentScope(true);
  } catch {
    return { ok: false, removing: false };
  }
  const key = `${typeOf(item)}:${item.id}:${kindOf(item)}:${item.season ?? "all"}`;
  const run = async () => {
    if (loading?.generation === scope.generation) await loading.promise;
    if (!hydrated) await reloadFavorites();
    if (!(await stillCurrent(scope))) return { ok: false, removing: false };
    const previous = cache.find((entry) => same(entry, item));
    const removing = Boolean(previous);
    cache = removing
      ? cache.filter((entry) => !same(entry, item))
      : [item, ...cache];
    emit();
    try {
      const { jwt } = scope;
      if (!jwt) {
        writeLocal(cache);
      } else {
        const response = removing
          ? await fetch(
              `/api/favorites?tmdbId=${item.id}&mediaType=${typeOf(item)}&kind=${kindOf(item)}${item.season == null ? "" : `&season=${item.season}`}`,
              {
                method: "DELETE",
                headers: { authorization: `Bearer ${jwt}` },
              },
            )
          : await post(item, jwt);
        if (!response.ok) throw new Error("Save failed");
      }
      if (!(await stillCurrent(scope))) return { ok: false, removing };
      return { ok: true, removing };
    } catch {
      if (!(await stillCurrent(scope))) return { ok: false, removing };
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
  owner = undefined;
  generation++;
  loading = undefined;
  loadError = null;
  mutations.clear();
}
