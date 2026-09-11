import type { WatchProvidersResponse, WatchProvider } from "../lib/tmdb";
import { providerLogoUrl } from "../lib/tmdb";

/** TMDB's provider data is licensed from JustWatch and must be attributed. */
const ATTRIBUTION = "Streaming data by JustWatch";

const GROUPS = [
  { key: "flatrate", label: "Stream" },
  { key: "free", label: "Free" },
  { key: "ads", label: "Free with ads" },
  { key: "rent", label: "Rent" },
  { key: "buy", label: "Buy" },
] as const;

export default function WatchProviders({
  providers,
  region,
}: {
  providers: WatchProvidersResponse | undefined;
  region: string;
}) {
  const country = providers?.results[region];
  if (!country) return null;

  const rows = GROUPS.map((group) => ({
    ...group,
    items: country[group.key] ?? [],
  })).filter((row) => row.items.length > 0);

  if (rows.length === 0) return null;

  return (
    <div className="mt-14">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <h2 className="text-text-primary text-xl font-extrabold tracking-tight">
          Where to watch
        </h2>
        <span className="text-text-muted text-xs">{region}</span>
      </div>

      <div className="mt-6 space-y-4">
        {rows.map((row) => (
          <div key={row.key} className="flex flex-wrap items-center gap-3">
            <span className="text-text-muted w-24 shrink-0 text-sm font-semibold">
              {row.label}
            </span>
            {row.items.map((provider) => (
              <ProviderLogo key={provider.provider_id} provider={provider} />
            ))}
          </div>
        ))}
      </div>

      <p className="text-text-muted/60 mt-4 text-[11px]">{ATTRIBUTION}</p>
    </div>
  );
}

function ProviderLogo({ provider }: { provider: WatchProvider }) {
  const logo = providerLogoUrl(provider.logo_path);

  return (
    <div
      title={provider.provider_name}
      className="border-border/60 bg-surface-muted size-11 shrink-0 overflow-hidden rounded-xl border"
    >
      {logo ? (
        <img
          src={logo}
          alt={provider.provider_name}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-contain"
        />
      ) : (
        <span className="text-text-muted grid h-full w-full place-items-center px-1 text-center text-[10px]">
          {provider.provider_name}
        </span>
      )}
    </div>
  );
}
