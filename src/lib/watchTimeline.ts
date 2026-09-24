import type { WatchEntry } from "./watchLog";

/** Group all loaded pages together so page boundaries never split a date. */
export function groupWatchTimeline(entries: WatchEntry[]) {
  const months = new Map<string, Map<string, WatchEntry[]>>();
  const sorted = [...entries].sort(
    (a, b) => b.watchedOn.localeCompare(a.watchedOn) || b.id - a.id,
  );
  for (const entry of sorted) {
    const month = entry.watchedOn.slice(0, 7);
    if (!months.has(month)) months.set(month, new Map());
    const days = months.get(month)!;
    if (!days.has(entry.watchedOn)) days.set(entry.watchedOn, []);
    days.get(entry.watchedOn)!.push(entry);
  }
  return Array.from(months, ([month, days]) => ({
    month,
    days: Array.from(days, ([date, entries]) => ({ date, entries })),
  }));
}
