import { useEffect, useId, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { accountApi } from "../lib/accountApi";
import { authClient } from "../lib/auth/client";
import { requireAuth } from "../lib/auth/gate";
import { useLists } from "../lib/listClient";
import type { ListItemInput } from "../lib/lists";
import { notify } from "../lib/notifications";
import QueryProvider from "./QueryProvider";
import ListForm, { listButton, type ListFields } from "./ListForm";
import ActionIcon from "./ActionIcon";
import IconTooltip from "./IconTooltip";

function Picker({ item, onDone }: { item: ListItemInput; onDone: () => void }) {
  const lists = useLists();
  const client = useQueryClient();
  const [creating, setCreating] = useState(false);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      accountApi("/api/lists", { ...body, item }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["lists"] });
      if (!active.current) return;
      notify("Added to your list.");
      onDone();
    },
  });
  if (creating)
    return (
      <ListForm
        submitLabel="Create list & add"
        pending={save.isPending}
        error={save.error?.message}
        onSave={(fields: ListFields) =>
          save.mutate({ action: "create", ...fields })
        }
        onCancel={() => {
          save.reset();
          setCreating(false);
        }}
      />
    );
  return (
    <div className="space-y-4">
      {lists.isPending ? (
        <p role="status" className="text-text-muted">
          Loading your lists…
        </p>
      ) : lists.isError ? (
        <div>
          <p role="alert" className="text-danger">
            {lists.error.message}
          </p>
          <button
            className={`${listButton} mt-3`}
            onClick={() => void lists.refetch()}
          >
            Retry
          </button>
        </div>
      ) : lists.data.length ? (
        <ul className="space-y-2">
          {lists.data.map((list) => (
            <li key={list.id}>
              <button
                disabled={save.isPending}
                onClick={() => save.mutate({ action: "add", id: list.id })}
                className="border-border/60 hover:border-accent focus-visible:outline-accent flex w-full items-center justify-between gap-3 rounded-xl border p-3 text-left focus-visible:outline-2 disabled:opacity-50"
              >
                <span className="font-semibold break-words">{list.title}</span>
                <span className="text-text-muted shrink-0 text-xs">
                  {list.shared ? "Shared" : "Private"} · {list.itemCount}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-text-muted text-sm">
          Create your first list to save this title.
        </p>
      )}
      {save.isPending && (
        <p role="status" className="text-text-muted text-sm">
          Adding title…
        </p>
      )}
      {save.error && (
        <p role="alert" className="text-danger text-sm">
          {save.error.message}
        </p>
      )}
      <button
        className={listButton}
        disabled={save.isPending}
        onClick={() => {
          save.reset();
          setCreating(true);
        }}
      >
        Create a new list
      </button>
    </div>
  );
}

function ListDialog({
  item,
  compact = false,
}: {
  item: ListItemInput;
  compact?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useId();
  const [open, setOpen] = useState(false);
  return (
    <>
      <IconTooltip enabled={compact} label="Add to list">
        <button
          type="button"
          aria-label={compact ? "Add to list" : undefined}
          className={`border-border/60 text-text-primary hover:border-accent focus-visible:outline-accent rounded-full border text-sm font-semibold whitespace-nowrap transition focus-visible:outline-2 ${compact ? "flex size-11 shrink-0 items-center justify-center" : "px-3 py-1.5"}`}
          onClick={async () => {
            if (await requireAuth()) {
              setOpen(true);
              dialog.current?.showModal();
            }
          }}
        >
          {compact ? <ActionIcon kind="list" /> : "Add to list"}
        </button>
      </IconTooltip>
      <dialog
        ref={dialog}
        aria-labelledby={heading}
        onClose={() => setOpen(false)}
        className="bg-surface text-text-primary border-border/60 m-auto max-h-[90dvh] w-[min(32rem,94vw)] overflow-y-auto rounded-2xl border p-5 backdrop:bg-black/60 sm:p-6"
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <h2 id={heading} className="text-lg font-bold break-words">
            Add “{item.title}” to a list
          </h2>
          <button
            type="button"
            aria-label="Close list dialog"
            className={listButton}
            onClick={() => dialog.current?.close()}
          >
            Close
          </button>
        </div>
        {open && <Picker item={item} onDone={() => dialog.current?.close()} />}
      </dialog>
    </>
  );
}

export default function AddToListButton({
  item,
  compact = false,
}: {
  item: ListItemInput;
  compact?: boolean;
}) {
  const { data: session } = authClient.useSession();
  return (
    <QueryProvider>
      <ListDialog
        key={session?.user.id ?? "signed-out"}
        item={item}
        compact={compact}
      />
    </QueryProvider>
  );
}
