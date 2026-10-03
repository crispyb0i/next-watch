/** Pill toggles shared by Trending and Discover. */

export function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`shrink-0 rounded-full px-3.5 py-2 text-sm font-medium whitespace-nowrap transition ${
        active
          ? "bg-accent text-accent-contrast shadow-sm"
          : "text-text-muted hover:text-text-primary"
      }`}
    >
      {children}
    </button>
  );
}

export function FilterGroup({
  label,
  children,
  className = "flex",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={`border-border/60 bg-surface-muted/50 max-w-full shrink-0 gap-1 rounded-3xl border p-1 backdrop-blur sm:rounded-full ${className}`}
    >
      {children}
    </div>
  );
}
