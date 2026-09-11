import { useEffect, useState } from "react";
import { authClient, getJWTToken } from "../lib/auth/client";
import { notify } from "../lib/notifications";
import { requireAuth } from "../lib/auth/gate";

/**
 * Follow state is fetched after mount, not server-rendered: page requests carry
 * no bearer token, so the server cannot know who is looking.
 */
export default function FollowButton({ userId }: { userId: string }) {
  const { data: session, isPending } = authClient.useSession();
  const [following, setFollowing] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  const signedIn = Boolean(session) && session?.user.id !== userId;

  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    (async () => {
      const jwt = await getJWTToken();
      if (!jwt) return;
      const response = await fetch(
        `/api/follows?userId=${encodeURIComponent(userId)}`,
        { headers: { authorization: `Bearer ${jwt}` } },
      );
      if (!response.ok) return;
      const state = await response.json();
      if (!cancelled) setFollowing(Boolean(state.following));
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, signedIn]);

  // Render nothing until state is known, so the label never flips under the
  // user. Signed out is the exception: show Follow, click routes to sign-in.
  if (isPending || (signedIn && following === null)) return null;
  if (session?.user.id === userId) return null;

  async function toggle() {
    if (!(await requireAuth())) return;
    const next = !following;

    setFollowing(next); // optimistic
    setBusy(true);
    try {
      const jwt = await getJWTToken();
      if (!jwt) throw new Error("Sign in to follow people.");
      const response = await fetch("/api/follows", {
        method: next ? "POST" : "DELETE",
        headers: {
          authorization: `Bearer ${jwt}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ userId }),
      });
      if (!response.ok) throw new Error("Couldn't update who you follow.");
      notify(next ? "Following." : "Unfollowed.");
    } catch (error) {
      setFollowing(!next); // roll back
      notify((error as Error).message, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      aria-pressed={following ?? false}
      className={`focus-visible:outline-accent shrink-0 rounded-full px-4 py-1.5 text-sm font-bold transition focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60 ${
        following
          ? "border-border/60 text-text-muted hover:text-text-primary border"
          : "from-brand-400 to-brand-600 text-accent-contrast bg-linear-to-br hover:scale-105"
      }`}
    >
      {following ? "Following" : "Follow"}
    </button>
  );
}
