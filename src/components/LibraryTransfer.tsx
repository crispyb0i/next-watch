import { useState } from "react";
import AuthGate from "./AuthGate";
import { accountApi } from "../lib/accountApi";
import {
  parseCsv,
  parseLibrary,
  type LibraryImport,
} from "../lib/libraryTransfer";
import { searchPage } from "../lib/tmdb";
import type { WatchEntry } from "../lib/watchLog";
import { reloadFavorites } from "../lib/favorites";
function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function TransferInner() {
  const [preview, setPreview] = useState<LibraryImport | null>(null),
    [error, setError] = useState(""),
    [status, setStatus] = useState(""),
    [busy, setBusy] = useState(false);
  async function read(file: File) {
    setBusy(true);
    setError("");
    setPreview(null);
    try {
      if (file.size > 5_000_000)
        throw new Error("Choose a file smaller than 5 MB.");
      const text = await file.text();
      if (file.name.endsWith(".csv")) {
        const rows = parseCsv(text);
        if (rows.length > 500)
          throw new Error("Import up to 500 CSV rows at once.");
        const watched = [];
        for (const [i, row] of rows.entries()) {
          let id = Number(row["TMDB ID"]);
          const title = row.Title ?? row.Name;
          const mediaType = row["Media Type"] === "tv" ? "tv" : "movie";
          if (!id && title) {
            setStatus(`Matching title ${i + 1} of ${rows.length}…`);
            const matches = (
              await searchPage(title, mediaType, 1)
            ).results.filter(
              (item) =>
                ("title" in item
                  ? item.title
                  : "name" in item
                    ? item.name
                    : ""
                ).toLowerCase() === title.toLowerCase() &&
                (!row.Year ||
                  ("release_date" in item
                    ? item.release_date
                    : "first_air_date" in item
                      ? item.first_air_date
                      : ""
                  )?.slice(0, 4) === row.Year),
            );
            if (matches.length !== 1)
              throw new Error(
                `Row ${i + 2}: “${title}” needs an explicit TMDB ID; no unique title/year match.`,
              );
            id = matches[0].id;
          }
          watched.push({
            tmdbId: id,
            title,
            mediaType,
            watchedOn: row["Watched Date"] || row.Date,
            rating: row.Rating ? Number(row.Rating) : null,
            review: row.Review || null,
            rewatch: ["true", "yes", "1"].includes(
              row.Rewatch?.trim().toLowerCase() ?? "",
            ),
          });
        }
        setPreview(parseLibrary({ version: 1, favorites: [], watched }));
      } else setPreview(parseLibrary(JSON.parse(text)));
      setStatus("Review the preview before importing.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read this file.");
    } finally {
      setBusy(false);
    }
  }
  async function exportLibrary() {
    setBusy(true);
    setError("");
    try {
      const favorites =
        await accountApi<LibraryImport["favorites"]>("/api/favorites");
      const watched: WatchEntry[] = [];
      for (let offset = 0; ; offset += 100) {
        const page = await accountApi<WatchEntry[]>(
          `/api/watched?limit=100&offset=${offset}`,
        );
        watched.push(...page);
        if (page.length < 100) break;
      }
      download(
        "next-watch-library.json",
        JSON.stringify(
          {
            version: 1,
            exportedAt: new Date().toISOString(),
            favorites,
            watched,
          },
          null,
          2,
        ),
        "application/json",
      );
      setStatus("Export downloaded.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed.");
    } finally {
      setBusy(false);
    }
  }
  async function commit() {
    if (!preview) return;
    setBusy(true);
    setError("");
    let imported = 0;
    try {
      for (const kind of ["favorites", "watched"] as const) {
        for (let offset = 0; offset < preview[kind].length; offset += 10) {
          const batch = {
            version: 1,
            favorites: [],
            watched: [],
            [kind]: preview[kind].slice(offset, offset + 10),
          };
          const result = await accountApi<{ imported: number }>(
            "/api/library",
            batch,
          );
          imported += result.imported;
          setStatus(`Imported ${imported} entries…`);
        }
      }
      await reloadFavorites();
      setPreview(null);
      setStatus(
        `Imported ${imported} new entries. Previously imported entries were skipped.`,
      );
    } catch (e) {
      setError(
        `${e instanceof Error ? e.message : "Import failed."} ${imported} entries were imported; retrying safely skips these entries.`,
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Your library, your data</h1>
      <p className="text-text-muted">
        Export favorites, watchlists, ratings, and watch history as JSON. Import
        a Next Watch export or CSV history, including Letterboxd diary columns.
        CSV title matches are shown for review before saving.
      </p>
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
      {status && <p role="status">{status}</p>}
      <button
        disabled={busy}
        className="rounded-xl border px-4 py-2"
        onClick={() => void exportLibrary()}
      >
        Export my library
      </button>
      <button
        className="ml-4 underline"
        onClick={() =>
          download(
            "watch-history-template.csv",
            "TMDB ID,Title,Media Type,Watched Date,Rating,Review,Rewatch\n603,The Matrix,movie,2024-01-01,4.5,,false\n",
            "text/csv",
          )
        }
      >
        Download CSV template
      </button>
      <label className="block">
        Import JSON or CSV
        <input
          type="file"
          accept=".json,.csv"
          disabled={busy}
          className="mt-2 block"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void read(file);
            e.target.value = "";
          }}
        />
      </label>
      {preview && (
        <section className="space-y-3 rounded-xl border p-4">
          <h2 className="text-xl font-bold">Import preview</h2>
          <p>
            {preview.watched.length} watch entries and{" "}
            {preview.favorites.length} saved titles. Existing lists are
            preserved.
          </p>
          <ul className="max-h-80 overflow-auto">
            {preview.watched.map((entry, i) => (
              <li key={i}>
                <a
                  className="underline"
                  target="_blank"
                  rel="noreferrer"
                  href={`/${entry.mediaType ?? "movie"}?id=${entry.tmdbId}`}
                >
                  {entry.title}
                </a>{" "}
                · {entry.watchedOn} · TMDB {entry.tmdbId}
              </li>
            ))}
            {preview.favorites.map((entry, i) => (
              <li key={`saved:${i}`}>
                {entry.title} · {entry.kind}
              </li>
            ))}
          </ul>
          <button
            disabled={busy}
            className="rounded-xl border px-4 py-2"
            onClick={() => void commit()}
          >
            Import these entries
          </button>
          <button
            disabled={busy}
            className="ml-3 underline"
            onClick={() => setPreview(null)}
          >
            Cancel
          </button>
        </section>
      )}
    </div>
  );
}
export default function LibraryTransfer() {
  return (
    <AuthGate>
      <TransferInner />
    </AuthGate>
  );
}
