import { Fragment, useEffect, type ReactNode } from "react";
import { authClient } from "../lib/auth/client";
import { signInHref } from "../lib/auth/gate";
import { PosterGridSkeleton } from "./Skeleton";

/**
 * Account-only pages: render children when signed in, otherwise replace the
 * history entry with the sign-in page so Back doesn't bounce back here.
 */
export default function AuthGate({
  children,
  fallback = <PosterGridSkeleton />,
}: {
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { data: session, isPending } = authClient.useSession();

  useEffect(() => {
    if (!isPending && !session) location.replace(signInHref());
  }, [isPending, session]);

  if (isPending || !session) return <>{fallback}</>;
  return <Fragment key={session.user.id}>{children}</Fragment>;
}
