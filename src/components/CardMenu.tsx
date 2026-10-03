import { useEffect, useId, useRef, useState, type RefObject } from "react";

export default function CardMenu({
  label,
  buttonRef,
  actions,
}: {
  label: string;
  buttonRef: RefObject<HTMLButtonElement | null>;
  actions: { label: string; onSelect: () => void; danger?: boolean }[];
}) {
  const id = useId();
  const menu = useRef<HTMLDivElement>(null);
  const firstItem = useRef(0);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const items =
      menu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]');
    items?.[firstItem.current]?.focus();

    function dismissOutside(event: PointerEvent | FocusEvent) {
      if (
        event.target instanceof Node &&
        !menu.current?.contains(event.target)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", dismissOutside);
    document.addEventListener("focusin", dismissOutside);
    return () => {
      document.removeEventListener("pointerdown", dismissOutside);
      document.removeEventListener("focusin", dismissOutside);
    };
  }, [open]);

  return (
    <div ref={menu} className="relative shrink-0">
      <button
        ref={buttonRef}
        id={`${id}-button`}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? `${id}-menu` : undefined}
        onClick={() => {
          firstItem.current = 0;
          setOpen((value) => !value);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            firstItem.current =
              event.key === "ArrowUp" ? actions.length - 1 : 0;
            setOpen(true);
          }
        }}
        className="text-text-secondary hover:bg-surface-muted hover:text-text-primary focus-visible:outline-accent grid size-10 place-items-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        <svg
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
          className="size-5"
        >
          <circle cx="5" cy="12" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="19" cy="12" r="2" />
        </svg>
      </button>
      {open && (
        <div
          id={`${id}-menu`}
          role="menu"
          aria-labelledby={`${id}-button`}
          className="border-border/60 bg-surface-elevated shadow-card absolute top-full right-0 z-10 mt-1 w-40 rounded-xl border p-1"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              setOpen(false);
              buttonRef.current?.focus();
              return;
            }
            if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key))
              return;
            event.preventDefault();
            const items = [
              ...event.currentTarget.querySelectorAll<HTMLButtonElement>(
                '[role="menuitem"]',
              ),
            ];
            const index = items.indexOf(
              document.activeElement as HTMLButtonElement,
            );
            const next =
              event.key === "Home"
                ? 0
                : event.key === "End"
                  ? items.length - 1
                  : (index +
                      (event.key === "ArrowDown" ? 1 : -1) +
                      items.length) %
                    items.length;
            items[next]?.focus();
          }}
        >
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              role="menuitem"
              tabIndex={-1}
              onClick={() => {
                setOpen(false);
                buttonRef.current?.focus();
                action.onSelect();
              }}
              className={`focus-visible:outline-accent block min-h-10 w-full rounded-lg px-3 py-2 text-left text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-[-2px] ${action.danger ? "text-danger hover:bg-danger/10 focus-visible:bg-danger/10" : "text-text-primary hover:bg-surface-muted focus-visible:bg-surface-muted"}`}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
