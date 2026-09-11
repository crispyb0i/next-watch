import { mediaHref } from "./mediaHref.ts";
import { parseEntry, type WatchEntryInput } from "./watchLog.ts";
export interface SavedImport {
  href?: string;
  id: number;
  mediaType: "movie" | "tv";
  kind: "favorite" | "watchlist";
  title: string;
  poster: string | null;
  subtitle: string | null;
  rating: number | null;
}
export interface LibraryImport {
  version: 1;
  watched: WatchEntryInput[];
  favorites: SavedImport[];
}
export function parseLibrary(value: unknown): LibraryImport {
  if (!value || typeof value !== "object")
    throw new Error("Choose a Next Watch JSON export.");
  const body = value as Record<string, unknown>;
  if (
    body.version !== 1 ||
    !Array.isArray(body.watched) ||
    !Array.isArray(body.favorites) ||
    body.watched.length + body.favorites.length > 5000
  )
    throw new Error("Use a version 1 export with at most 5,000 entries.");
  const watched = body.watched.map((row, index) => {
    const parsed = parseEntry(row);
    if (!parsed.ok)
      throw new Error(`Watch entry ${index + 1}: ${parsed.error}`);
    return parsed.value;
  });
  const favorites = body.favorites.map((row, index) => {
    if (
      !row ||
      typeof row !== "object" ||
      !Number.isSafeInteger(row.id) ||
      row.id <= 0 ||
      typeof row.title !== "string" ||
      !row.title.trim() ||
      row.title.length > 300 ||
      !["movie", "tv"].includes(row.mediaType ?? "movie") ||
      !["favorite", "watchlist"].includes(row.kind ?? "favorite")
    )
      throw new Error(`Saved entry ${index + 1} is invalid.`);
    return {
      id: row.id,
      href: mediaHref(row.href, row.mediaType ?? "movie", row.id),
      mediaType: row.mediaType ?? "movie",
      kind: row.kind ?? "favorite",
      title: row.title,
      poster:
        typeof row.poster === "string" && row.poster.length <= 2000
          ? row.poster
          : null,
      subtitle:
        typeof row.subtitle === "string" ? row.subtitle.slice(0, 300) : null,
      rating:
        typeof row.rating === "number" && Number.isFinite(row.rating)
          ? row.rating
          : null,
    } as SavedImport;
  });
  return { version: 1, watched, favorites };
}
// RFC 4180 quoting, including multiline reviews. Header names match the template.
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (quoted) throw new Error("CSV has an unclosed quoted field.");
  row.push(cell);
  if (row.some(Boolean)) rows.push(row);
  const headers =
    rows.shift()?.map((value) => value.replace(/^\uFEFF/, "").trim()) ?? [];
  if (!headers.length) throw new Error("CSV is empty.");
  return rows.map((values, i) => {
    if (values.length !== headers.length)
      throw new Error(`CSV row ${i + 2} has the wrong number of fields.`);
    return Object.fromEntries(headers.map((key, j) => [key, values[j]]));
  });
}
