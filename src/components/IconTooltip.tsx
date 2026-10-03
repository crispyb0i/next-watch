import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

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
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [offset, setOffset] = useState(0);
  const trigger = useRef<HTMLSpanElement>(null);
  const tooltip = useRef<HTMLSpanElement>(null);
  const visible = enabled && !dismissed && (hovered || focused);

  useLayoutEffect(() => {
    if (!visible) return;
    function position() {
      if (!trigger.current || !tooltip.current) return;
      const rect = trigger.current.getBoundingClientRect();
      const width = tooltip.current.offsetWidth;
      const left = rect.left + (rect.width - width) / 2;
      const clamped = Math.max(
        8,
        Math.min(left, document.documentElement.clientWidth - width - 8),
      );
      setOffset(clamped - left);
    }
    position();
    window.addEventListener("resize", position);
    return () => window.removeEventListener("resize", position);
  }, [visible, label]);

  if (!enabled) return children;

  return (
    <span
      ref={trigger}
      className="relative inline-flex"
      onMouseEnter={() => {
        setHovered(true);
        setDismissed(false);
      }}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => {
        setFocused(true);
        setDismissed(false);
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          setFocused(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") setDismissed(true);
      }}
    >
      {children}
      {/* Hidden labels must not contribute overflow; visible labels stay inside
          the viewport, including when a wrapped action lands at either edge. */}
      {visible && (
        <span
          ref={tooltip}
          aria-hidden="true"
          className="absolute bottom-full left-1/2 z-30 w-max max-w-[calc(100vw-1rem)] -translate-x-1/2 pb-2"
          style={{ marginLeft: offset }}
        >
          <span className="bg-text-primary text-surface shadow-card block rounded-md px-2.5 py-1.5 text-xs font-medium wrap-anywhere">
            {label}
          </span>
        </span>
      )}
    </span>
  );
}
