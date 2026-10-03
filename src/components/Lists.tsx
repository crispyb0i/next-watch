import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { authClient } from "../lib/auth/client";
import { accountApi } from "../lib/accountApi";
import { useLists } from "../lib/listClient";
import { listHref } from "../lib/lists";
import AuthGate from "./AuthGate";
import QueryProvider from "./QueryProvider";
import ListForm, { listButton, listPrimary, type ListFields } from "./ListForm";

function ListsInner() {
  const query = useLists();
  const client = useQueryClient();
  const [creating, setCreating] = useState(false);
  const create = useMutation({
    mutationFn: (fields: ListFields) =>
      accountApi<{ id: string }>("/api/lists", { action: "create", ...fields }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["lists"] });
      setCreating(false);
    },
  });
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-text-primary text-2xl font-extrabold tracking-tight">
            Your lists
          </h1>
          <p className="text-text-muted mt-2 text-sm">
            Collect movies and shows for any mood, occasion, or obsession.
          </p>
        </div>
        {!creating && (
          <button
            className={listPrimary}
            onClick={() => {
              create.reset();
              setCreating(true);
            }}
          >
            Create list
          </button>
        )}
      </div>
      {creating && (
        <section
          aria-label="Create a list"
          className="border-border/60 bg-surface-elevated rounded-2xl border p-5"
        >
          <ListForm
            submitLabel="Create list"
            pending={create.isPending}
            error={create.error?.message}
            onSave={(fields) => create.mutate(fields)}
            onCancel={() => setCreating(false)}
          />
        </section>
      )}
      {query.isPending ? (
        <p role="status" className="text-text-muted">
          Loading your lists…
        </p>
      ) : query.isError ? (
        <div>
          <p role="alert" className="text-danger">
            {query.error.message}
          </p>
          <button
            className={`${listButton} mt-3`}
            onClick={() => void query.refetch()}
          >
            Retry
          </button>
        </div>
      ) : query.data.length === 0 ? (
        <div className="border-border/60 rounded-2xl border border-dashed p-8 text-center">
          <h2 className="font-bold">Make room for your next obsession</h2>
          <p className="text-text-muted mt-2 text-sm">
            Start a list, then use “Add to list” on any movie, show, season, or
            episode.
          </p>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {query.data.map((list) => (
            <li key={list.id}>
              <a
                href={listHref(list.id)}
                className="border-border/60 bg-surface-elevated hover:border-accent focus-visible:outline-accent block h-full rounded-2xl border p-5 transition focus-visible:outline-2"
              >
                <p className="text-text-muted text-xs font-semibold tracking-wider uppercase">
                  {list.shared ? "Shared by link" : "Private"}
                </p>
                <h2 className="mt-3 text-lg font-bold break-words">
                  {list.title}
                </h2>
                {list.description && (
                  <p className="text-text-muted mt-2 line-clamp-3 text-sm">
                    {list.description}
                  </p>
                )}
                <p className="text-accent mt-4 text-sm font-semibold">
                  {list.itemCount} {list.itemCount === 1 ? "title" : "titles"} →
                </p>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function Lists() {
  const { data: session } = authClient.useSession();
  return (
    <QueryProvider>
      <AuthGate>
        <ListsInner key={session?.user.id} />
      </AuthGate>
    </QueryProvider>
  );
}
