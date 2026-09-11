import { useEffect, useState } from "react";
import { authClient } from "../lib/auth/client";
import { accountApi } from "../lib/accountApi";
export default function AlertIndicator() {
  const { data: session } = authClient.useSession();
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    setUnread(0);
    let active = true,
      running = false;
    async function refresh() {
      if (!session || running || document.visibilityState === "hidden") return;
      running = true;
      try {
        const data = await accountApi<{
          preferences: { providerIds: number[] };
          alerts: { readAt: string | null }[];
        }>("/api/alerts");
        if (!active) return;
        setUnread(data.alerts.filter((alert) => !alert.readAt).length);
        const key = `availability-checked:${session.user.id}`;
        let last = 0;
        try {
          last = Number(sessionStorage.getItem(key) ?? 0);
        } catch {
          /* Storage is optional. */
        }
        if (
          data.preferences.providerIds.length &&
          Date.now() - last > 15 * 60_000
        ) {
          let offset: number | null = 0,
            failed = false;
          while (active && offset !== null) {
            const result: { nextOffset: number | null; failed: number } =
              await accountApi("/api/alerts", { action: "check", offset });
            offset = result.nextOffset;
            failed ||= result.failed > 0;
          }
          if (!active) return;
          if (!failed)
            try {
              sessionStorage.setItem(key, String(Date.now()));
            } catch {
              /* Storage is optional. */
            }
          const next = await accountApi<{
            alerts: { readAt: string | null }[];
          }>("/api/alerts");
          if (active)
            setUnread(next.alerts.filter((alert) => !alert.readAt).length);
        }
      } catch {
        /* The alerts page provides retry and detailed errors. */
      } finally {
        running = false;
      }
    }
    void refresh();
    const timer = setInterval(() => void refresh(), 15 * 60_000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [session?.user.id]);
  if (!session) return null;
  return (
    <a
      href="/alerts"
      aria-label={`Streaming alerts, ${unread} unread`}
      className="border-border/60 text-text-secondary hover:border-accent hover:text-accent focus-visible:outline-accent relative grid h-10 w-10 shrink-0 place-items-center rounded-full border transition focus-visible:outline-2 focus-visible:outline-offset-2"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        className="h-5 w-5"
      >
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
        <path d="M10 21h4" />
      </svg>
      {unread > 0 && (
        <span
          aria-hidden="true"
          className="bg-accent text-accent-contrast absolute -top-1 -right-1 min-w-4 rounded-full px-1 text-center text-[10px] leading-4 font-bold"
        >
          {unread > 99 ? "99+" : unread}
        </span>
      )}
      <span className="sr-only" aria-live="polite">
        {unread > 0 ? `${unread} unread streaming alerts` : ""}
      </span>
    </a>
  );
}
