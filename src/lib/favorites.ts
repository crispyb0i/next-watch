import { useSyncExternalStore } from "react";
import { getJWTToken } from "./auth/client";

export interface Favorite {
  id: number;
  title: string;
  poster: string | null;
  subtitle?: string | null;
  rating?: number | null;
}

const KEY = "favorites";
const EMPTY: Favorite[] = [];
const listeners = new Set<() => void>();

let cache: Favorite[] = EMPTY;
let loaded = false;

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
            typeof item?.id === "number" && typeof item?.title === "string",
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
  if (!response.ok) return;
  cache = await response.json();
  emit();
}

function post(item: Favorite, jwt: string) {
  return fetch("/api/favorites", {
    method: "POST",
    headers: {
      authorization: `Bearer ${jwt}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ ...item, tmdbId: item.id }),
  });
}

export function getFavorites(): Favorite[] {
  return cache;
}

export function isFavorite(id: number): boolean {
  return cache.some((item) => item.id === id);
}

export async function toggleFavorite(item: Favorite) {
  const removing = isFavorite(item.id);
  const previous = cache;

  // Optimistic: update now, roll back if the request fails.
  cache = removing
    ? cache.filter((entry) => entry.id !== item.id)
    : [item, ...cache];
  emit();

  const jwt = await token();
  if (!jwt) {
    writeLocal(cache);
    return;
  }

  const response = removing
    ? await fetch(`/api/favorites?tmdbId=${item.id}`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${jwt}` },
      })
    : await post(item, jwt);

  if (!response.ok) {
    cache = previous;
    emit();
  }
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

/** Test seam. */
export function _resetForTest(next: Favorite[] = EMPTY) {
  cache = next;
  loaded = true;
}
