import assert from "node:assert/strict";
import { groupWatchTimeline } from "./watchTimeline.ts";
import type { WatchEntry } from "./watchLog.ts";

const entry = (id: number, watchedOn: string): WatchEntry => ({
  id,
  watchedOn,
  tmdbId: 1,
  mediaType: "movie",
  title: "A watch",
});

// A second page can continue the same date before crossing month/year boundaries.
const pages = [
  [entry(5, "2026-09-11"), entry(4, "2026-09-11")],
  [entry(3, "2026-09-11"), entry(2, "2026-08-27"), entry(1, "2025-12-31")],
];
const input = pages.flat().reverse();
const original = [...input];
const months = groupWatchTimeline(input);
assert.deepEqual(
  months.map(({ month }) => month),
  ["2026-09", "2026-08", "2025-12"],
);
assert.equal(months[0].days.length, 1);
assert.deepEqual(
  months[0].days[0].entries.map(({ id }) => id),
  [5, 4, 3],
);
assert.deepEqual(input, original, "Grouping must not mutate the query cache");
assert.deepEqual(groupWatchTimeline([]), []);

// Editing a watch date moves it to its new day/month; removing the last entry
// in a month removes the empty group, without leaving stale timeline landmarks.
const moved = pages
  .flat()
  .map((row) => (row.id === 2 ? { ...row, watchedOn: "2026-09-08" } : row));
const regrouped = groupWatchTimeline(moved.filter(({ id }) => id !== 1));
assert.equal(regrouped.length, 1);
assert.deepEqual(
  regrouped[0].days.map(({ date }) => date),
  ["2026-09-11", "2026-09-08"],
);
console.log("Watch timeline grouping: passed");
