import { useEffect, useState } from "react";
import { NOTIFICATION_EVENT, type Notification } from "../lib/notifications";

interface Toast extends Notification {
  id: number;
}

export default function ToastHost() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    function show(event: Event) {
      const detail = (event as CustomEvent<Notification>).detail;
      const id = Date.now() + Math.random();
      setToasts((current) => [...current, { ...detail, id }]);
      window.setTimeout(
        () =>
          setToasts((current) => current.filter((toast) => toast.id !== id)),
        3500,
      );
    }

    window.addEventListener(NOTIFICATION_EVENT, show);
    return () => window.removeEventListener(NOTIFICATION_EVENT, show);
  }, []);

  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role={toast.kind === "error" ? "alert" : "status"}
          className={`shadow-card rounded-xl border px-4 py-3 text-sm font-semibold backdrop-blur-xl ${
            toast.kind === "error"
              ? "bg-danger-surface/95 text-danger border-danger/40"
              : "bg-surface-elevated/95 text-text-primary border-border/60"
          }`}
        >
          {toast.message}
        </div>
      ))}
    </div>
  );
}
