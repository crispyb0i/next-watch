import Trending from "./Trending";
import { lazy, Suspense, useEffect, useState } from "react";
import { authClient } from "../lib/auth/client";
import QueryProvider from "./QueryProvider";
import styles from "./WatchActivity.module.css";

const CurrentlyWatching = lazy(() =>
  import("./CurrentlyWatching").catch(() => ({ default: WatchingLoadError })),
);

function WatchingLoadError() {
  return (
    <div
      role="alert"
      className="border-border/60 mb-12 rounded-2xl border p-8 sm:mb-16"
    >
      <p className="text-danger">Could not load your shows.</p>
      <a
        href="/"
        data-astro-reload
        className="text-accent mt-2 inline-block font-semibold underline"
      >
        Reload page
      </a>
    </div>
  );
}

export default function Home() {
  const { data: session } = authClient.useSession();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const user = mounted ? session?.user : null;
  return (
    <QueryProvider>
      {user ? (
        <>
          <header className={styles.hero}>
            <div>
              <p className="text-accent mb-3 text-sm font-semibold">
                {user.name
                  ? `Welcome back, ${user.name.split(" ")[0]}.`
                  : "Welcome back."}
              </p>
              <h1 className={styles.heroTitle}>What’s next?</h1>
              <p className="text-text-muted mt-3 text-sm sm:text-base">
                Pick up a series or find something new.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <a
                href="/watchlist"
                className="border-border/60 text-text-primary hover:border-accent rounded-full border px-5 py-3 text-sm font-semibold"
              >
                Your watchlist
              </a>
              <a
                href="/discover"
                className="bg-accent text-accent-contrast hover:bg-accent-hover rounded-full px-5 py-3 text-sm font-bold"
              >
                Find something new
              </a>
            </div>
          </header>
          <Suspense
            key={user.id}
            fallback={
              <div
                role="status"
                className="text-text-muted border-border/60 mb-12 rounded-2xl border p-8 sm:mb-16"
              >
                Loading your shows…
              </div>
            }
          >
            <CurrentlyWatching />
          </Suspense>
        </>
      ) : (
        <header className="flex flex-col items-center gap-3 pt-2 pb-8 text-center sm:gap-4 sm:pt-10 sm:pb-12">
          <h1 className="text-text-primary max-w-2xl text-3xl font-black tracking-tighter text-balance sm:text-6xl">
            Find your next{" "}
            <span className="from-brand-400 via-accent to-brand-600 bg-linear-to-r bg-clip-text text-transparent">
              favorite watch
            </span>
          </h1>
          <p className="text-text-muted max-w-xl text-sm text-balance sm:text-lg">
            Search thousands of movies and shows — posters, release dates,
            seasons, and cast in an instant.
          </p>
        </header>
      )}
      <Trending />
    </QueryProvider>
  );
}
