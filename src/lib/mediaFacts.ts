import type { AggregateCrewMember, CrewMember, ExternalIds } from "./tmdb";

export interface CreditPerson {
  id: number;
  name: string;
}

/** Keep each person once per role, even with multiple writing credits. */
export function peopleForJobs(
  crew: (CrewMember | AggregateCrewMember)[] | undefined,
  jobs: string[],
): CreditPerson[] {
  const people = new Map<number, CreditPerson>();
  for (const member of crew ?? []) {
    const matches =
      "jobs" in member
        ? member.jobs.some(({ job }) => jobs.includes(job))
        : jobs.includes(member.job);
    if (matches && !people.has(member.id)) {
      people.set(member.id, { id: member.id, name: member.name });
    }
  }
  return [...people.values()];
}

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export function formatMoney(amount: number | null | undefined): string {
  // TMDB uses zero when a budget or revenue has not been reported.
  return typeof amount === "number" && Number.isFinite(amount) && amount > 0
    ? `${usd.format(amount)} USD`
    : "Not reported";
}

export function mediaLinks(
  homepage: string | null | undefined,
  ids: ExternalIds | undefined,
): { label: string; href: string }[] {
  const links: { label: string; href: string }[] = [];
  if (homepage?.trim()) {
    try {
      const url = new URL(homepage.trim());
      if (["http:", "https:"].includes(url.protocol)) {
        links.push({ label: "Official website", href: url.href });
      }
    } catch {
      // Omit malformed URLs from upstream data.
    }
  }
  for (const [label, base, value] of [
    ["Facebook", "https://www.facebook.com/", ids?.facebook_id],
    ["Instagram", "https://www.instagram.com/", ids?.instagram_id],
    ["X (Twitter)", "https://x.com/", ids?.twitter_id],
  ] as const) {
    const handle = value?.trim();
    if (handle) links.push({ label, href: base + encodeURIComponent(handle) });
  }
  if (ids?.imdb_id && /^tt\d+$/.test(ids.imdb_id)) {
    links.push({
      label: "IMDb",
      href: `https://www.imdb.com/title/${ids.imdb_id}/`,
    });
  }
  return links;
}
