import { useRef, useState } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { authClient, getJWTToken } from "../lib/auth/client";
import { entryHref, type WatchEntry } from "../lib/watchLog";
import { groupWatchTimeline } from "../lib/watchTimeline";
import { notify } from "../lib/notifications";
import QueryProvider from "./QueryProvider";
import { LogForm } from "./WatchLogButton";
import AuthGate from "./AuthGate";

async function fetchWatched(
  offset: number,
  month: string,
  signal?: AbortSignal,
): Promise<WatchEntry[]> {
  const jwt = await getJWTToken();
  if (!jwt) throw new Error("Sign in to continue.");
  const params = new URLSearchParams({ limit: "30", offset: String(offset) });
  if (month) params.set("month", month);
  const response = await fetch(`/api/watched?${params}`, {
    signal,
    headers: { authorization: `Bearer ${jwt}` },
  });
  if (!response.ok) throw new Error("Couldn't load your watch log.");
  return response.json();
}

async function remove(id: number) {
  const jwt = await getJWTToken();
  const response = await fetch(`/api/watched?id=${id}`, {
    method: "DELETE",
    headers: { authorization: `Bearer ${jwt}` },
  });
  if (!response.ok) throw new Error("Couldn't delete this log entry.");
}

const formatDate = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

function Entry({ entry }: { entry: WatchEntry }) {
  const queryClient = useQueryClient();
  const href = entryHref(entry);
  const confirmDialog = useRef<HTMLDialogElement>(null);
  const editDialog = useRef<HTMLDialogElement>(null);
  const [deleting, setDeleting] = useState(false);
  // Remount the form on each open so its uncontrolled fields reset to the
  // current entry rather than keeping whatever was typed last time.
  const [editKey, setEditKey] = useState(0);

  async function confirmDelete() {
    setDeleting(true);
    try {
      await remove(entry.id);
      void queryClient.invalidateQueries({ queryKey: ["watched"] });
      void queryClient.invalidateQueries({ queryKey: ["progress"] });
      notify("Removed from your watch log.");
      confirmDialog.current?.close();
    } catch (error) {
      notify((error as Error).message, "error");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <li className="relative pb-6 pl-5 last:pb-2 sm:pl-8">
      <span
        aria-hidden="true"
        className="bg-accent border-surface absolute top-3 -left-[6px] h-3 w-3 rounded-full border-2"
      />
      <details className="group">
        <summary className="focus-visible:outline-accent flex cursor-pointer list-none gap-4 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 [&::-webkit-details-marker]:hidden">
          <span className="shrink-0">
            {entry.poster ? (
              <img
                src={entry.poster}
                alt=""
                width={72}
                height={108}
                loading="lazy"
                className="bg-surface-muted aspect-[2/3] w-16 rounded-lg object-cover sm:w-18"
              />
            ) : (
              <span className="bg-surface-muted text-text-muted grid aspect-[2/3] w-16 place-items-center rounded-lg text-xs sm:w-18">
                No image
              </span>
            )}
          </span>
          <span className="min-w-0 flex-1 py-1">
            <span className="text-text-primary block text-base font-bold break-words sm:text-lg">
              {entry.title}
            </span>
            {entry.subtitle && (
              <span className="text-text-muted mt-0.5 block text-sm break-words">
                {entry.subtitle}
              </span>
            )}
            {entry.notes && (
              <span className="border-accent/20 bg-surface-muted/30 text-text-secondary mt-3 flex gap-2 rounded-lg border px-3 py-2 text-sm group-open:hidden">
                <span
                  aria-hidden="true"
                  className="text-accent text-xl leading-5"
                >
                  “
                </span>
                <span className="line-clamp-2 min-w-0 break-words">
                  {entry.notes}
                </span>
              </span>
            )}
          </span>
          <span
            aria-hidden="true"
            className="text-text-muted mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full transition group-open:rotate-180"
          >
            ⌄
          </span>
          <span className="sr-only">Watch details</span>
        </summary>
        <div className="mt-3 pl-20 sm:pl-22">
          <p className="text-text-muted text-xs">
            Watched {formatDate(entry.watchedOn)}
          </p>
          {entry.notes && (
            <blockquote className="border-accent/30 text-text-secondary mt-3 border-l-2 pl-3 text-sm break-words whitespace-pre-wrap">
              {entry.notes}
            </blockquote>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <a
              href={href}
              className="text-accent rounded-lg px-2 py-2 text-sm hover:underline"
            >
              View title
            </a>
            <button
              type="button"
              onClick={() => {
                setEditKey((key) => key + 1);
                editDialog.current?.showModal();
              }}
              className="text-text-primary hover:bg-surface-muted rounded-lg px-2 py-2 text-sm"
            >
              Edit watch
            </button>
            <button
              type="button"
              onClick={() => confirmDialog.current?.showModal()}
              className="text-danger hover:bg-surface-muted rounded-lg px-2 py-2 text-sm"
            >
              Delete
            </button>
          </div>
        </div>
      </details>

      <dialog
        ref={editDialog}
        className="bg-surface text-text-primary border-border/60 m-auto w-[min(28rem,90vw)] rounded-2xl border p-6 backdrop:bg-black/60"
      >
        <h2 className="text-lg font-extrabold tracking-tight">
          Edit “{entry.title}”
        </h2>
        <LogForm
          key={editKey}
          item={entry}
          defaults={{
            id: entry.id,
            notes: entry.notes,
            watchedOn: entry.watchedOn,
          }}
          onDone={() => editDialog.current?.close()}
        />
      </dialog>

      <dialog
        ref={confirmDialog}
        className="bg-surface text-text-primary border-border/60 m-auto w-[min(26rem,90vw)] rounded-2xl border p-6 backdrop:bg-black/60"
      >
        <h2 className="text-lg font-extrabold tracking-tight">
          Delete this log?
        </h2>
        <p className="text-text-muted mt-2 text-sm">
          “{entry.title}” logged on {formatDate(entry.watchedOn)} will be
          removed. This can't be undone.
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => confirmDialog.current?.close()}
            className="text-text-muted hover:text-text-primary rounded-full px-4 py-2 text-sm font-semibold"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={confirmDelete}
            disabled={deleting}
            className="bg-danger text-accent-contrast hover:bg-danger/90 rounded-full px-4 py-2 text-sm font-bold disabled:opacity-60"
          >
            {deleting ? "Deleting…" : "Delete"}
          </button>
        </div>
      </dialog>
    </li>
  );
}

function WatchedInner() {
  const { data: session } = authClient.useSession();
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  });
  const year = Number(selectedMonth.slice(0, 4));
  const month = Number(selectedMonth.slice(5));
  const monthName = new Date(year, month - 1, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
  const {
    data,
    isPending,
    error,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
    refetch,
  } = useInfiniteQuery({
    queryKey: ["watched", session?.user.id, selectedMonth],
    enabled: Boolean(session),
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }) =>
      fetchWatched(pageParam, selectedMonth, signal),
    getNextPageParam: (last, pages) =>
      last.length === 30 ? pages.length * 30 : undefined,
  });
  const entries = data?.pages.flat() ?? [];
  const months = groupWatchTimeline(entries);
  return (
    <div className="mx-auto w-full max-w-[800px]">
      <header>
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <p className="text-text-muted font-mono text-xs font-semibold tracking-[0.2em] uppercase">
              My log
            </p>
            <h1 className="text-text-primary mt-2 text-3xl font-extrabold tracking-tight">
              Watched
            </h1>
            {!isPending && entries.length > 0 && (
              <p className="text-text-muted mt-2 text-sm">
                {entries.length} {entries.length === 1 ? "watch" : "watches"}
                {hasNextPage ? " loaded" : ""} in {monthName}
              </p>
            )}
          </div>
          <nav
            aria-label="Choose month and year"
            className="w-full sm:w-[400px]"
          >
            <div className="flex items-center justify-center gap-8">
              <button
                type="button"
                aria-label="Previous year"
                disabled={year <= 1000}
                onClick={() =>
                  setSelectedMonth(`${year - 1}-${selectedMonth.slice(5)}`)
                }
                className="bg-surface-muted/40 text-text-secondary hover:text-text-primary focus-visible:outline-accent rounded-md px-2 py-1 text-sm disabled:opacity-40"
              >
                ‹
              </button>
              <span className="text-text-primary font-mono text-xs font-semibold tracking-widest">
                {year}
              </span>
              <button
                type="button"
                aria-label="Next year"
                disabled={year >= 9999}
                onClick={() =>
                  setSelectedMonth(`${year + 1}-${selectedMonth.slice(5)}`)
                }
                className="bg-surface-muted/40 text-text-secondary hover:text-text-primary focus-visible:outline-accent rounded-md px-2 py-1 text-sm disabled:opacity-40"
              >
                ›
              </button>
            </div>
            <div className="mt-2 flex flex-nowrap">
              {Array.from({ length: 12 }, (_, index) => {
                const name = new Date(year, index, 1).toLocaleDateString(
                  undefined,
                  { month: "short" },
                );
                const active = month === index + 1;
                return (
                  <button
                    key={index}
                    type="button"
                    aria-label={`${new Date(year, index, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" })}`}
                    aria-pressed={active}
                    onClick={() =>
                      setSelectedMonth(
                        `${year}-${String(index + 1).padStart(2, "0")}`,
                      )
                    }
                    className={`focus-visible:outline-accent flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center gap-2 rounded-md text-[10px] font-semibold uppercase focus-visible:outline-2 ${active ? "text-text-primary" : "text-text-muted hover:text-text-primary"}`}
                  >
                    <span>{name}</span>
                    <span
                      aria-hidden="true"
                      className={`rounded-full ${active ? "bg-accent h-3 w-3 shadow-[0_0_16px_var(--color-accent)]" : "bg-text-muted/40 h-1.5 w-1.5"}`}
                    />
                  </button>
                );
              })}
            </div>
          </nav>
        </div>
      </header>
      {isPending && (
        <div role="status" className="mt-10 space-y-6">
          <span className="sr-only">Loading your timeline…</span>
          {[0, 1, 2].map((item) => (
            <div
              key={item}
              aria-hidden="true"
              className="flex gap-4 motion-safe:animate-pulse"
            >
              <div className="bg-surface-muted h-24 w-16 rounded-lg" />
              <div className="bg-surface-muted mt-2 h-5 w-40 rounded" />
            </div>
          ))}
        </div>
      )}
      {error && (
        <p role="alert" className="text-danger mt-4">
          {error.message}{" "}
          <button className="underline" onClick={() => void refetch()}>
            Retry
          </button>
        </p>
      )}
      {!isPending && !error && !entries.length && (
        <p className="text-text-muted mt-6">
          No watches in {monthName}. Choose another month or year.
        </p>
      )}
      <div className="mt-10 space-y-10">
        {months.map(({ month, days }) => (
          <section
            key={month}
            id={`log-${month}`}
            aria-labelledby={`log-heading-${month}`}
            className="scroll-mt-28"
          >
            <h2
              id={`log-heading-${month}`}
              className="bg-surface/75 text-text-secondary sticky top-20 z-10 mb-5 py-3 font-mono text-sm font-semibold tracking-widest uppercase backdrop-blur"
            >
              {new Date(`${month}-01T00:00:00`).toLocaleDateString(undefined, {
                month: "long",
                year: "numeric",
              })}
            </h2>
            {days.map(({ date, entries: watches }, index) => (
              <div
                key={date}
                className={`grid gap-x-4 sm:grid-cols-[5.5rem_1fr] ${index ? "border-border/40 border-t pt-5" : ""}`}
              >
                <h3 className="text-text-secondary pb-3 text-sm font-semibold sm:pt-1">
                  <time dateTime={date}>
                    <span className="uppercase">
                      {new Date(`${date}T00:00:00`).toLocaleDateString(
                        undefined,
                        { month: "short", day: "numeric" },
                      )}
                    </span>{" "}
                    <span className="text-text-muted ml-2 font-normal sm:mt-1 sm:ml-0 sm:block">
                      {date.slice(0, 4)}
                    </span>
                  </time>
                </h3>
                <ol
                  aria-label={`Watched ${formatDate(date)}`}
                  className="border-accent/25 ml-1.5 border-l pb-5"
                >
                  {watches.map((entry) => (
                    <Entry key={entry.id} entry={entry} />
                  ))}
                </ol>
              </div>
            ))}
          </section>
        ))}
      </div>
      {hasNextPage && (
        <button
          className="mt-6 rounded-xl border px-4 py-2"
          disabled={isFetchingNextPage}
          onClick={() => void fetchNextPage()}
        >
          {isFetchingNextPage ? "Loading…" : "Load older watches"}
        </button>
      )}
      {!isPending && !error && !hasNextPage && entries.length > 0 && (
        <p className="border-border/40 text-text-muted mt-8 border-t pt-5 text-center text-sm">
          You’re all caught up · {entries.length}{" "}
          {entries.length === 1 ? "watch" : "watches"} this month
        </p>
      )}
    </div>
  );
}

export default function Watched() {
  return (
    <QueryProvider>
      <AuthGate>
        <WatchedInner />
      </AuthGate>
    </QueryProvider>
  );
}
