import { useEffect, useId, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { authClient } from "../lib/auth/client";
import { requireAuth } from "../lib/auth/gate";
import { accountApi } from "../lib/accountApi";
import { reloadFavorites, useFavorites } from "../lib/favorites";
import { notify } from "../lib/notifications";
import styles from "./WatchActivity.module.css";
import {
  viewingStatuses,
  type ViewingShow,
  type ViewingStatus,
} from "../lib/viewingStatus";

export function useViewingShows() {
  const { data: session } = authClient.useSession();
  const saved = useFavorites();
  const client = useQueryClient();
  const userId = session?.user.id;
  const previousSaved = useRef(saved);
  useEffect(() => {
    if (previousSaved.current === saved) return;
    previousSaved.current = saved;
    if (userId)
      void client.invalidateQueries({ queryKey: ["viewing-shows", userId] });
  }, [saved, userId, client]);
  return useQuery({
    queryKey: ["viewing-shows", userId],
    queryFn: () => accountApi<ViewingShow[]>("/api/viewing-status"),
    enabled: Boolean(userId),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
}

type Props = {
  show: { tmdbId: number; title: string; poster: string | null };
  showFinishAction?: boolean;
  disabled?: boolean;
};

export default function ViewingStatusControl(props: Props) {
  const [mounted, setMounted] = useState(false);
  const { data: session } = authClient.useSession();
  useEffect(() => setMounted(true), []);
  if (!mounted)
    return (
      <button
        type="button"
        disabled
        className="border-border/60 text-text-muted h-11 rounded-full border px-5 text-sm font-semibold"
      >
        Track this show
      </button>
    );
  return (
    <ViewingStatusInner
      key={`${session?.user.id ?? "guest"}-${props.show.tmdbId}`}
      {...props}
    />
  );
}

function ViewingStatusInner({
  show,
  showFinishAction = false,
  disabled = false,
}: Props) {
  const { data: session, isPending } = authClient.useSession();
  const query = useViewingShows();
  const client = useQueryClient();
  const id = useId();
  const userId = session?.user.id;
  const status =
    query.data?.find((entry) => entry.tmdbId === show.tmdbId)?.status ?? "";
  const save = useMutation({
    mutationFn: (status: ViewingStatus) =>
      accountApi("/api/viewing-status", { ...show, status }),
    onSuccess: async (_result, status) => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ["viewing-shows", userId] }),
        reloadFavorites(),
      ]);
      if (showFinishAction && status === "finished")
        notify(
          `${show.title} moved to Finished. Your viewing history is saved.`,
        );
    },
  });
  if (!session && !isPending)
    return (
      <button
        type="button"
        onClick={() => void requireAuth()}
        className="bg-accent text-accent-contrast hover:bg-accent-hover focus-visible:outline-accent h-11 rounded-full px-5 text-sm font-bold focus-visible:outline-2"
      >
        Track this show
      </button>
    );
  return (
    <div className={showFinishAction ? styles.finishControl : "min-w-0"}>
      <label htmlFor={id} className="sr-only">
        Viewing status for {show.title}
      </label>
      <div className={styles.selectWrap}>
        <select
          id={id}
          value={status}
          disabled={
            disabled ||
            isPending ||
            query.isPending ||
            query.isError ||
            save.isPending
          }
          onChange={(event) => save.mutate(event.target.value as ViewingStatus)}
          className={styles.select}
          aria-describedby={
            save.isError || query.isError ? `${id}-error` : undefined
          }
        >
          <option value="" disabled>
            {query.isPending ? "Loading status…" : "Track this show"}
          </option>
          {Object.entries(viewingStatuses).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={styles.selectArrow}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </div>
      {showFinishAction && status === "watching" && (
        <button
          type="button"
          className={styles.logButton}
          disabled={
            disabled ||
            isPending ||
            query.isPending ||
            query.isError ||
            save.isPending
          }
          onClick={() => save.mutate("finished")}
          aria-describedby={
            save.isError || query.isError ? `${id}-error` : undefined
          }
        >
          {save.isPending && save.variables === "finished"
            ? "Saving…"
            : "Mark finished"}
        </button>
      )}
      <span role="status" className="sr-only">
        {save.isPending
          ? "Saving viewing status…"
          : save.isSuccess
            ? "Viewing status saved."
            : ""}
      </span>
      {(save.isError || query.isError) && (
        <p
          id={`${id}-error`}
          role="alert"
          className="text-danger mt-2 max-w-xs text-sm"
        >
          {save.error?.message ?? "Could not load viewing status."}{" "}
          {query.isError && (
            <button
              type="button"
              className="underline"
              onClick={() => void query.refetch()}
            >
              Retry
            </button>
          )}
        </p>
      )}
    </div>
  );
}
