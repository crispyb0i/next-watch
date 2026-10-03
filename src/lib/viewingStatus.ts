export const viewingStatuses = {
  want_to_watch: "Want to watch",
  watching: "Watching",
  paused: "Paused",
  finished: "Finished",
  dropped: "Dropped",
} as const;

export type ViewingStatus = keyof typeof viewingStatuses;
export interface ViewingShow {
  tmdbId: number;
  status: ViewingStatus;
  title: string;
  poster: string | null;
  updatedAt: string;
}

export function isViewingStatus(value: unknown): value is ViewingStatus {
  return typeof value === "string" && Object.hasOwn(viewingStatuses, value);
}
