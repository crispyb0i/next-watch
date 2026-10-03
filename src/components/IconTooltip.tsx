import { useState, type ReactNode } from "react";

/** Visual labels complement the accessible names on icon controls. */
export default function IconTooltip({
  label,
  enabled = true,
  children,
}: {
  label: string;
  enabled?: boolean;
  children: ReactNode;
}) {
  const [dismissed, setDismissed] = useState(false);
  if (!enabled) return children;

  return (
    <span
      className="group/icon relative inline-flex"
      onMouseEnter={() => setDismissed(false)}
      onFocus={() => setDismissed(false)}
      onKeyDown={(event) => {
        if (event.key === "Escape") setDismissed(true);
      }}
    >
      {children}
      <span
        aria-hidden="true"
        className={`absolute bottom-full left-1/2 z-30 -translate-x-1/2 pb-2 ${dismissed ? "hidden" : "invisible group-focus-within/icon:visible group-hover/icon:visible"}`}
      >
        <span className="bg-text-primary text-surface shadow-card block rounded-md px-2.5 py-1.5 text-xs font-medium whitespace-nowrap">
          {label}
        </span>
      </span>
    </span>
  );
}
