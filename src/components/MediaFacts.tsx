import type { MovieDetails, TvShowDetails } from "../lib/tmdb";
import IconTooltip from "./IconTooltip";
import {
  formatMoney,
  mediaLinks,
  peopleForJobs,
  type CreditPerson,
} from "../lib/mediaFacts";

function SocialIcon({ label }: { label: string }) {
  if (label === "IMDb") {
    return (
      <span aria-hidden="true" className="text-lg font-black tracking-tighter">
        IMDb
      </span>
    );
  }

  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      className="size-7"
      fill="currentColor"
    >
      {label === "Facebook" ? (
        <path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047v-2.66c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.236 2.686.236v2.971h-1.513c-1.49 0-1.956.931-1.956 1.887v2.263h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073Z" />
      ) : label === "X (Twitter)" ? (
        <path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.64 7.584H.47l8.6-9.835L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z" />
      ) : label === "Instagram" ? (
        <>
          <rect
            x="2.5"
            y="2.5"
            width="19"
            height="19"
            rx="5.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
          />
          <circle
            cx="12"
            cy="12"
            r="4.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
          />
          <circle cx="18" cy="6" r="1.4" />
        </>
      ) : (
        <g
          fill="none"
          stroke="currentColor"
          strokeWidth="2.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M10 7H7a5 5 0 0 0 0 10h3m4-10h3a5 5 0 0 1 0 10h-3M8 12h8" />
        </g>
      )}
    </svg>
  );
}

function People({ people }: { people: CreditPerson[] }) {
  const list = (members: CreditPerson[]) => (
    <ul className="flex flex-wrap gap-x-4 gap-y-2">
      {members.map((person) => (
        <li key={person.id}>
          <a
            href={`/person?id=${person.id}`}
            className="hover:text-accent focus-visible:outline-accent rounded-sm underline decoration-current/30 underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4"
          >
            {person.name}
          </a>
        </li>
      ))}
    </ul>
  );
  return (
    <>
      {list(people.slice(0, 6))}
      {people.length > 6 && (
        <details className="mt-2">
          <summary className="text-text-muted hover:text-accent focus-visible:outline-accent w-fit cursor-pointer rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4">
            {people.length - 6} more
          </summary>
          <div className="mt-2">{list(people.slice(6))}</div>
        </details>
      )}
    </>
  );
}

export default function MediaFacts(
  props:
    | { mediaType: "movie"; media: MovieDetails }
    | { mediaType: "tv"; media: TvShowDetails },
) {
  const { media } = props;
  const crew =
    props.mediaType === "movie"
      ? props.media.credits?.crew
      : props.media.aggregate_credits?.crew;
  const groups = [
    {
      label: "Creators",
      people: props.mediaType === "tv" ? (props.media.created_by ?? []) : [],
    },
    { label: "Directors", people: peopleForJobs(crew, ["Director"]) },
    {
      label: "Writers",
      people: peopleForJobs(crew, [
        "Writer",
        "Screenplay",
        "Story",
        "Teleplay",
      ]),
    },
  ].filter(({ people }) => people.length > 0);
  const links = mediaLinks(media.homepage, media.external_ids);
  const linkGroups = [
    ["Facebook", "X (Twitter)", "Instagram"],
    ["Official website", "IMDb"],
  ]
    .map((labels) =>
      labels.flatMap((label) => links.filter((link) => link.label === label)),
    )
    .filter((group) => group.length > 0);

  return (
    <section
      aria-label="Details"
      className="border-border/60 bg-surface-elevated/80 mt-5 max-w-[700px] rounded-2xl border"
    >
      <dl className="grid grid-cols-1 gap-x-5 gap-y-4 p-4 text-sm min-[400px]:grid-cols-2 lg:grid-cols-3 lg:p-5">
        <div className="min-w-0">
          <dt className="text-text-muted text-xs font-medium">Status</dt>
          <dd className="text-text-primary mt-1 font-semibold">
            {media.status?.trim() || "Not reported"}
          </dd>
        </div>
        {props.mediaType === "movie" && (
          <>
            <div className="min-w-0">
              <dt className="text-text-muted text-xs font-medium">Budget</dt>
              <dd className="text-text-primary mt-1 font-semibold break-words tabular-nums">
                {formatMoney(props.media.budget)}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-text-muted text-xs font-medium">Revenue</dt>
              <dd className="text-text-primary mt-1 font-semibold break-words tabular-nums">
                {formatMoney(props.media.revenue)}
              </dd>
            </div>
          </>
        )}
      </dl>
      {groups.length > 0 && (
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 px-4 pt-2 pb-4 text-sm lg:px-5 lg:pb-5">
          {groups.map(({ label, people }) => (
            <div
              key={label}
              className={
                label === "Creators" ? "col-span-2 min-w-0" : "min-w-0"
              }
            >
              <dt className="text-text-muted text-xs font-medium">{label}</dt>
              <dd className="text-text-primary mt-1 font-medium">
                <People people={people} />
              </dd>
            </div>
          ))}
        </dl>
      )}
      {links.length > 0 && (
        <nav
          aria-label="Official and social links"
          className="divide-border border-border/60 flex flex-wrap items-center gap-y-2 divide-x border-t px-3 py-2 lg:px-4"
        >
          {linkGroups.map((group) => (
            <div
              key={group[0].label}
              className="flex items-center gap-1 px-3 first:pl-0 last:pr-0 sm:gap-2"
            >
              {group.map(({ label, href }) => (
                <IconTooltip key={label} label={label}>
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-text-primary hover:text-accent focus-visible:outline-accent flex size-11 shrink-0 items-center justify-center rounded-sm transition focus-visible:outline-2 focus-visible:outline-offset-4"
                  >
                    <SocialIcon label={label} />
                    <span className="sr-only">
                      {label} (opens in a new tab)
                    </span>
                  </a>
                </IconTooltip>
              ))}
            </div>
          ))}
        </nav>
      )}
    </section>
  );
}
