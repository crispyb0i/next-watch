import { useEffect, useState } from "react";
import AuthGate from "./AuthGate";
import { accountApi } from "../lib/accountApi";
import { getProviderCatalog, type WatchProvider } from "../lib/tmdb";
interface Preferences {
  region: string;
  providerIds: number[];
  watchlistPublic: boolean;
}
interface Alert {
  id: number;
  title: string;
  href: string;
  message: string;
  createdAt: string;
  readAt: string | null;
}
function AlertsInner() {
  const [preferences, setPreferences] = useState<Preferences>({
    region: "US",
    providerIds: [],
    watchlistPublic: false,
  });
  const [alerts, setAlerts] = useState<Alert[]>([]),
    [providers, setProviders] = useState<WatchProvider[]>([]),
    [error, setError] = useState(""),
    [status, setStatus] = useState(""),
    [busy, setBusy] = useState(false),
    [loaded, setLoaded] = useState(false);
  async function reload() {
    const data = await accountApi<{
      preferences: Preferences;
      alerts: Alert[];
    }>("/api/alerts");
    setPreferences(data.preferences);
    setAlerts(data.alerts);
    setLoaded(true);
  }
  useEffect(() => {
    void reload().catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    let active = true;
    if (/^[A-Z]{2}$/.test(preferences.region))
      void getProviderCatalog(preferences.region)
        .then((data) => {
          if (active) setProviders(data.results);
        })
        .catch(() => {
          if (active)
            setError(
              "Could not load streaming services. Check your region and retry.",
            );
        });
    return () => {
      active = false;
    };
  }, [preferences.region]);
  async function save() {
    setBusy(true);
    setError("");
    try {
      await accountApi("/api/alerts", {
        action: "preferences",
        ...preferences,
      });
      localStorage.setItem("next-watch-region", preferences.region);
      setStatus("Preferences saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }
  async function check() {
    setBusy(true);
    setError("");
    let offset: number | null = 0,
      total = 0,
      failed = 0;
    try {
      await accountApi("/api/alerts", {
        action: "preferences",
        ...preferences,
      });
      while (offset !== null) {
        const result: {
          checked: number;
          failed: number;
          nextOffset: number | null;
        } = await accountApi("/api/alerts", { action: "check", offset });
        total += result.checked;
        failed += result.failed;
        offset = result.nextOffset;
        setStatus(`Checked ${total} titles…`);
      }
      await reload();
      setStatus(
        `Checked ${total} titles at ${new Date().toLocaleString()}.${failed ? ` ${failed} could not be checked; try again.` : ""}`,
      );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not check availability.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Streaming alerts</h1>
      <p className="text-text-muted">
        Check your watchlist for titles available on your services. Alerts
        refresh while you use the app, and you can check manually here. No email
        notifications. Availability is provided by TMDB and JustWatch and can
        change.
      </p>
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
      {status && <p role="status">{status}</p>}
      {!loaded && !error && <p>Loading preferences…</p>}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
        className="space-y-4"
      >
        <label className="block">
          Region (two-letter country code)
          <input
            required
            pattern="[A-Z]{2}"
            maxLength={2}
            value={preferences.region}
            onChange={(e) =>
              setPreferences({
                ...preferences,
                region: e.target.value.toUpperCase(),
                providerIds: [],
              })
            }
            className="ml-3 w-20 rounded-xl border p-2"
          />
        </label>
        <fieldset className="max-h-72 overflow-auto rounded-xl border p-4">
          <legend>Your streaming services</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {providers.map((provider) => (
              <label
                key={provider.provider_id}
                className="flex items-center gap-2"
              >
                <input
                  type="checkbox"
                  checked={preferences.providerIds.includes(
                    provider.provider_id,
                  )}
                  onChange={(e) =>
                    setPreferences({
                      ...preferences,
                      providerIds: e.target.checked
                        ? [...preferences.providerIds, provider.provider_id]
                        : preferences.providerIds.filter(
                            (id) => id !== provider.provider_id,
                          ),
                    })
                  }
                />
                {provider.provider_name}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={preferences.watchlistPublic}
            onChange={(e) =>
              setPreferences({
                ...preferences,
                watchlistPublic: e.target.checked,
              })
            }
          />
          Show my watchlist on my public profile
        </label>
        <button
          disabled={busy || !loaded}
          className="rounded-xl border px-4 py-2"
        >
          Save preferences
        </button>
      </form>
      <div className="flex flex-wrap gap-4">
        <button
          disabled={busy || !loaded || !preferences.providerIds.length}
          className="rounded-xl border px-4 py-2"
          onClick={() => void check()}
        >
          {busy ? "Working…" : "Check my watchlist"}
        </button>
        <button
          disabled={busy || !alerts.some((alert) => !alert.readAt)}
          className="underline"
          onClick={() => {
            setBusy(true);
            void accountApi("/api/alerts", { action: "read" })
              .then(reload)
              .catch((e) => setError(e.message))
              .finally(() => setBusy(false));
          }}
        >
          Mark all as read
        </button>
      </div>
      <h2 className="text-xl font-bold">Your alerts</h2>
      {loaded && !alerts.length && (
        <p>No alerts yet. Select services and check your watchlist.</p>
      )}
      <ul className="space-y-4">
        {alerts.map((alert) => (
          <li key={alert.id} className="rounded-xl border p-4">
            <a className="font-bold underline" href={alert.href}>
              {alert.title}
            </a>
            {!alert.readAt && <span className="text-accent ml-2">New</span>}
            <p className="mt-2">{alert.message}</p>
            <time
              className="text-text-muted text-sm"
              dateTime={alert.createdAt}
            >
              {new Date(alert.createdAt).toLocaleString()}
            </time>
          </li>
        ))}
      </ul>
    </div>
  );
}
export default function AvailabilityAlerts() {
  return (
    <AuthGate>
      <AlertsInner />
    </AuthGate>
  );
}
