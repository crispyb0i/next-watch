import { useEffect, useRef, useState } from "react";
import { authClient } from "../lib/auth/client";

function initials(name?: string | null, email?: string | null) {
  const source = name?.trim() || email?.trim() || "";
  if (!source) return "?";
  const parts = source.split(/[\s@._-]+/).filter(Boolean);
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

export default function AuthMenu() {
  const { data: session, isPending } = authClient.useSession();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  async function signOut() {
    setSigningOut(true);
    try {
      await authClient.signOut();
      window.location.href = "/";
    } catch {
      setSigningOut(false);
    }
  }

  if (isPending) {
    return (
      <div className="bg-surface-muted h-9 w-9 animate-pulse rounded-full" />
    );
  }

  if (!session) {
    return (
      <a
        href="/auth/sign-in"
        className="bg-accent text-accent-contrast hover:bg-accent-hover rounded-full px-4 py-1.5 font-semibold transition"
      >
        Sign in
      </a>
    );
  }

  const { name, email, image } = session.user;

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        className="border-border/60 hover:border-accent focus-visible:outline-accent block h-9 w-9 overflow-hidden rounded-full border transition focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        {image ? (
          <img
            src={image}
            alt=""
            className="h-full w-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <span className="from-brand-400 to-brand-600 text-accent-contrast flex h-full w-full items-center justify-center bg-linear-to-br text-xs font-bold">
            {initials(name, email)}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="border-border/60 bg-surface-elevated shadow-card absolute right-0 z-30 mt-2 w-56 overflow-hidden rounded-2xl border py-1.5"
        >
          <div className="border-border/60 mb-1.5 border-b px-3.5 pb-2.5">
            <p className="text-text-primary truncate text-sm font-semibold">
              {name || "Account"}
            </p>
            <p className="text-text-muted truncate text-xs">{email}</p>
          </div>
          <a
            href="/settings"
            role="menuitem"
            className="text-text-primary hover:bg-surface-muted block px-3.5 py-2 text-sm transition"
          >
            Settings
          </a>
          <button
            type="button"
            role="menuitem"
            onClick={signOut}
            disabled={signingOut}
            className="text-danger hover:bg-surface-muted block w-full px-3.5 py-2 text-left text-sm transition disabled:opacity-60"
          >
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      )}
    </div>
  );
}
