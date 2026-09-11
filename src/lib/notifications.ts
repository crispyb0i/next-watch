export type NotificationKind = "success" | "error" | "info";

export const NOTIFICATION_EVENT = "movie-search:notify";

export interface Notification {
  message: string;
  kind: NotificationKind;
}

export function notify(message: string, kind: NotificationKind = "success") {
  window.dispatchEvent(
    new CustomEvent<Notification>(NOTIFICATION_EVENT, {
      detail: { message, kind },
    }),
  );
}
