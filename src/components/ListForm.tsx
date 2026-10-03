import type { SubmitEvent } from "react";

export const listControl =
  "border-border bg-surface text-text-primary focus-visible:outline-accent mt-1 w-full rounded-xl border px-3 py-2 focus-visible:outline-2";
export const listButton =
  "border-border/60 text-text-primary hover:border-accent focus-visible:outline-accent rounded-full border px-4 py-2 text-sm font-semibold transition focus-visible:outline-2 disabled:opacity-50";
export const listPrimary =
  "bg-accent text-accent-contrast hover:bg-accent-hover focus-visible:outline-accent rounded-full px-4 py-2 text-sm font-bold transition focus-visible:outline-2 disabled:opacity-50";

export type ListFields = {
  title: string;
  description: string;
  shared: boolean;
};

export default function ListForm({
  initial,
  onSave,
  onCancel,
  pending,
  error,
  submitLabel = "Save changes",
}: {
  initial?: ListFields;
  onSave: (fields: ListFields) => void;
  onCancel: () => void;
  pending: boolean;
  error?: string;
  submitLabel?: string;
}) {
  function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    onSave({
      title: String(form.get("title")).trim(),
      description: String(form.get("description")).trim(),
      shared: form.has("shared"),
    });
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <fieldset disabled={pending} className="space-y-4">
        <label className="block text-sm font-semibold">
          List name
          <input
            name="title"
            required
            maxLength={100}
            defaultValue={initial?.title}
            placeholder="October horror nights"
            className={listControl}
          />
        </label>
        <label className="block text-sm font-semibold">
          Description{" "}
          <span className="text-text-muted font-normal">(optional)</span>
          <textarea
            name="description"
            maxLength={2000}
            rows={3}
            defaultValue={initial?.description}
            placeholder="What brings these titles together?"
            className={listControl}
          />
        </label>
        <label className="flex items-start gap-3 text-sm">
          <input
            name="shared"
            type="checkbox"
            defaultChecked={initial?.shared ?? false}
            className="accent-accent mt-1 h-4 w-4"
          />
          <span>
            <span className="block font-semibold">
              Share with anyone who has the link
            </span>
            <span className="text-text-muted">
              They can view without signing in. Only you can edit. Leave off to
              keep this list private.
            </span>
          </span>
        </label>
      </fieldset>
      {error && (
        <p role="alert" className="text-danger text-sm">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={pending} className={listPrimary}>
          {pending ? "Saving…" : submitLabel}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={onCancel}
          className={listButton}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
