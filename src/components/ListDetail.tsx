import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { authClient } from "../lib/auth/client";
import { accountApi } from "../lib/accountApi";
import { useList } from "../lib/listClient";
import {
  listHref,
  listItemHref,
  type ListDetail as Detail,
} from "../lib/lists";
import { signInHref } from "../lib/auth/gate";
import { notify } from "../lib/notifications";
import QueryProvider from "./QueryProvider";
import MediaCard from "./MediaCard";
import ListForm, { listButton, listPrimary } from "./ListForm";

function ListContents({ list }: { list: Detail }) {
  const client = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const change = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      accountApi("/api/lists", { ...body, id: list.id }),
    onSuccess: async (_, body) => {
      if (body.action === "delete") {
        setDeleted(true);
        await client.invalidateQueries({ queryKey: ["lists", "mine"] });
        client.removeQueries({
          queryKey: ["lists", "detail", list.id],
          type: "inactive",
        });
        return;
      }
      await client.invalidateQueries({ queryKey: ["lists"] });
      setEditing(false);
      setDeleting(false);
      setShareUrl("");
    },
  });
  if (deleted)
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">List deleted</h1>
        <a href="/lists" className={listButton}>
          Back to your lists
        </a>
      </div>
    );
  async function copyLink() {
    const url = new URL(listHref(list.id), window.location.origin).href;
    try {
      await navigator.clipboard.writeText(url);
      notify("List link copied.");
    } catch {
      setShareUrl(url);
    }
  }
  return (
    <div className="space-y-6">
      {list.isOwner && (
        <a
          href="/lists"
          className="text-text-muted hover:text-accent text-sm font-semibold"
        >
          ← Your lists
        </a>
      )}
      <header>
        <p className="text-text-muted text-xs font-semibold tracking-wider uppercase">
          {list.shared ? "Shared list" : "Private list"} · {list.items.length}{" "}
          {list.items.length === 1 ? "title" : "titles"}
        </p>
        <h1 className="mt-3 text-3xl font-extrabold tracking-tight break-words">
          {list.title}
        </h1>
        <p className="text-text-muted mt-2 text-sm">By {list.ownerName}</p>
        {list.description && (
          <p className="text-text-secondary mt-4 max-w-3xl break-words whitespace-pre-wrap">
            {list.description}
          </p>
        )}
      </header>
      <div className="flex flex-wrap gap-2">
        {list.shared && (
          <button className={listButton} onClick={() => void copyLink()}>
            Copy share link
          </button>
        )}
        {list.isOwner && (
          <>
            <button
              disabled={change.isPending}
              className={listButton}
              onClick={() => {
                change.reset();
                setEditing(!editing);
                setDeleting(false);
              }}
            >
              Edit list
            </button>
            <a href="/search" className={listPrimary}>
              Find titles to add
            </a>
            <button
              disabled={change.isPending}
              className={`${listButton} text-danger`}
              onClick={() => {
                change.reset();
                setDeleting(true);
                setEditing(false);
              }}
            >
              Delete list
            </button>
          </>
        )}
      </div>
      {shareUrl && (
        <label className="block text-sm">
          Copy this link
          <input
            readOnly
            value={shareUrl}
            onFocus={(e) => e.currentTarget.select()}
            className="border-border mt-2 w-full rounded-xl border p-3"
          />
        </label>
      )}
      {list.isOwner && editing && (
        <section
          aria-label="Edit list"
          className="border-border/60 bg-surface-elevated rounded-2xl border p-5"
        >
          <ListForm
            initial={list}
            pending={change.isPending}
            error={change.error?.message}
            onSave={(fields) => change.mutate({ action: "update", ...fields })}
            onCancel={() => setEditing(false)}
          />
        </section>
      )}
      {list.isOwner && deleting && (
        <section
          aria-label="Confirm list deletion"
          className="border-danger/40 rounded-2xl border p-5"
        >
          <p>
            Delete “{list.title}” and its list entries? This cannot be undone.
          </p>
          <div className="mt-4 flex gap-2">
            <button
              disabled={change.isPending}
              className={`${listButton} text-danger`}
              onClick={() => change.mutate({ action: "delete" })}
            >
              Delete permanently
            </button>
            <button
              disabled={change.isPending}
              className={listButton}
              onClick={() => setDeleting(false)}
            >
              Cancel
            </button>
          </div>
        </section>
      )}
      {!editing && change.error && (
        <p role="alert" className="text-danger">
          {change.error.message}
        </p>
      )}
      {!list.items.length ? (
        <p className="text-text-muted rounded-2xl border border-dashed p-8 text-center">
          {list.isOwner
            ? "Your list is ready. Open a title and choose “Add to list” to get started."
            : "No titles in this list yet."}
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {list.items.map((item) => (
            <MediaCard
              key={item.id}
              href={listItemHref(item)}
              title={item.title}
              subtitle={item.subtitle}
              poster={item.poster ?? null}
              actions={
                list.isOwner ? (
                  <button
                    className={listButton}
                    disabled={change.isPending}
                    aria-label={`Remove ${item.title} from list`}
                    onClick={() =>
                      change.mutate({ action: "remove", itemId: item.id })
                    }
                  >
                    Remove
                  </button>
                ) : undefined
              }
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function ListPage({ id, initialData }: { id: string; initialData?: Detail }) {
  const { data: session, isPending } = authClient.useSession();
  const query = useList(id, initialData);
  if (query.isError)
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">List unavailable</h1>
        <p role="alert" className="text-text-muted">
          {query.error.message}
        </p>
        <button className={listButton} onClick={() => void query.refetch()}>
          Retry
        </button>
        {!session && !isPending && (
          <a href={signInHref()} className={`${listButton} ml-2`}>
            Sign in to view your private lists
          </a>
        )}
      </div>
    );
  if (!query.data)
    return (
      <p role="status" className="text-text-muted">
        Loading list…
      </p>
    );
  return (
    <ListContents
      key={`${id}:${session?.user.id ?? "public"}`}
      list={query.data}
    />
  );
}

export default function ListDetail(props: {
  id: string;
  initialData?: Detail;
}) {
  return (
    <QueryProvider>
      <ListPage {...props} />
    </QueryProvider>
  );
}
