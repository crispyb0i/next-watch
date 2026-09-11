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
      className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
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
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="border-border/60 bg-surface-muted/50 flex gap-1 rounded-full border p-1 backdrop-blur"
    >
      {children}
    </div>
  );
}
