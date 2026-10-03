# Next Watch

Discover movies and TV shows, save favorites, log watches, and follow friends.

## Development

Requires Node.js 22.12 or newer.

```sh
npm install
npm run dev
```

Create `.env.local` with:

```dotenv
PUBLIC_TMDB_API_KEY=
DATABASE_URL=
NEON_AUTH_BASE_URL=
NEON_AUTH_COOKIE_SECRET=
PUBLIC_NEON_AUTH_URL=
```

## Commands

| Command               | Action                       |
| --------------------- | ---------------------------- |
| `npm run dev`         | Start development server     |
| `npm run build`       | Build production app         |
| `npm run preview`     | Preview production build     |
| `npm run db:generate` | Generate database migrations |
| `npm run db:migrate`  | Run database migrations      |
| `npm run db:studio`   | Open Drizzle Studio          |

## Verification and database changes

- `npm run typecheck` checks TypeScript.
- `npm run lint` runs Astro diagnostics and Prettier checks; it does not run ESLint.
- `npm test` runs unit and API tests plus an isolated in-memory PostgreSQL database.
  Database tests apply every migration and never use `DATABASE_URL`.
  DOM interaction tests use mocked account responses to cover watchlist controls
  and review loading, retry, cancellation, and save failures. Native dialog focus
  trapping, Escape, and focus return still require browser verification.
- `npm run test:integration` is the optional Neon integration check. It requires a
  disposable `TEST_DATABASE_URL`; the database name must include `test` unless
  it is on localhost. Never point it at an application database.
- CI runs type checking, linting, and tests on pushes and pull requests.

The pending migrations `0011_nosy_retro_girl.sql` and `0012_silly_mongoose.sql`
add shared movie nights, streaming preferences, availability snapshots and alerts,
import deduplication, and watch-history indexes. Apply them to a staging database
and exercise signed-in flows before deploying code that reads these tables.
Production migration/deployment requires explicit approval. No database changes
are performed by the build or the default tests.

## TMDB access and rendering

Configure the server-only `TMDB_API_KEY` for new environments. Server code retains
compatibility with the previous public-key variable while deployments migrate;
client code now calls only `/api/tmdb`. Rotate the old key after migration because
previous versions exposed it in browser requests. Never put key values in source.
The proxy allowlists paths and parameters, uses a ten-second upstream timeout,
returns retryable errors for rate limits, and caches successful public responses
for five minutes. The in-process cache is bounded; production API responses also
advertise a CDN cache policy. Movie, TV, person, season, and episode pages receive
server-rendered initial content and canonical/social metadata.

Production Vite caches are isolated from development caches so a build can run
while the development server remains active. Start development with
`npx astro dev --background`; manage it with `npx astro dev status`,
`npx astro dev logs`, and `npx astro dev stop`.

## Navigation and loading

Internal navigation uses Astro's client router without a page-wide fade. Search
submissions, keyboard suggestions, result filters, and pagination keep the same
document and shared query cache. The navbar search and notifications persist;
search results remain visible while a different result set loads, with loading
announcements and a retry action for failures.

The primary tabs share a persisted `TabView` React island. Route props update in
place, lazy page modules keep the current content visible until ready, and warm
queries render directly from the browser cache. Server-rendered fallbacks remain
available on direct visits. The account menu and alerts indicator also mount from
client session state to avoid server/client hydration mismatches. Detail pages
retain server-rendered initial data.

Reviews uses the same heading, filters, and row-shaped placeholders while auth
and its first request load. Filters keep existing reviews visible while fetching,
scoped to the current account; cached revisits skip placeholders entirely.
Posters and cast photos render independently in reserved image dimensions; no
grid waits for a slow image. Scrollbar space and account-control width are
reserved, late font swaps are avoided, and reduced-motion preferences are honored.

`npm test` includes navigation UI regressions for pending results, cached filters,
cleared searches, failed requests and retry, keyboard suggestions, and query
synchronization, Reviews loading/filter transitions, and account isolation.
Browser verification should also cover direct and cached signed-in tab visits
under CPU throttling, Back/Forward, pagination, session expiry, mobile menus,
light/dark appearance, and reduced motion.

## New account features

- **Watchlist controls** (`/watchlist`): search saved titles, filter movies or TV,
  and sort by saved order, title, or TMDB rating. Remove titles directly from the
  list; log movies with the existing date/notes dialog, or open episode tracking
  for TV. Successfully logging a movie removes it from the watchlist.
- **Review dialogs**: failed loads show a retry action before editing is enabled.
  Close is available while loading, dialogs have accessible names, and closing
  or cancelling discards unsaved edits. Failed saves keep the current draft.
- **Rich reviews and drafts** (`/reviews`, linked in desktop and mobile navigation):
  write with bold, italic, strikethrough, lists, and quotes. Save an unfinished
  review as a private draft, resume it from Reviews, and publish when ready.
  All, Published, and Drafts filters include pagination, editing, and deletion.
  The editor loads on demand. Reviews retain the 5,000-character limit; formatted
  content is validated as structured text and rendered without raw HTML.
  Existing plain-text reviews remain readable and editable. Drafts are excluded
  from public profiles, public review lists, and taste recommendations.
  Apply `drizzle/0015_review_drafts.sql` with `npm run db:migrate` before deploying
  this feature. It adds nullable document content and a constrained status with
  `published` as the default, preserving existing reviews. Production migration
  still requires explicit approval. The default tests apply this migration only
  to an isolated in-memory database.
- **Episode reviews**: choose Write a review on an episode in a season list or
  on its detail page. Ratings, rich text, private drafts, editing, and deletion
  work independently for each episode, including specials (season 0). Reviews
  and public profile links return to the episode. Episode ratings do not replace
  whole-show ratings in taste recommendations. Apply
  `drizzle/0016_episode_reviews.sql` with `npm run db:migrate` before deploying;
  it adds nullable season/episode coordinates, validates them, and extends the
  unique review key while preserving existing movie and show reviews. Default
  tests apply the migration only to an isolated in-memory database.
- **Season actions**: season detail pages offer Favorite, Watchlist, and Write a
  review for the entire season, including Specials. Each season stays separate
  from its series, sibling seasons, and episodes. Season reviews support rich
  text and private drafts; saved cards and review links return to that season.
  JSON library export/import preserves season watchlist and favorite entries.
  Apply `drizzle/0017_season_actions.sql` before deploying. It extends saved-item
  keys and permits season-level reviews while preserving existing records;
  production migration still requires explicit approval.
- **Movie nights** (`/community`): create a group and share its invite. Joining
  explicitly shares a member's watchlist with that group. The shortlist combines
  saved titles and excludes titles any member has logged; each member has one
  vote per title. Lists show at most 100 candidate titles and groups support
  up to 20 members. An invite is join access, so share it deliberately.
- **Taste recommendations** (`/community`): explain suggestions using friends'
  ratings, at least three shared rated titles, and at least 70% rating agreement.
  Uses the latest rating per title; no model or paid inference service.
- **Streaming alerts** (`/alerts`): select a region and services. Availability is
  checked while a signed-in user uses the app (at most every 15 minutes per tab),
  and can be refreshed manually. An unread indicator links to in-app alerts.
  There is no offline scheduler or email delivery. Checks process ten watchlist
  titles per request. Failures retain the last known snapshot; returning titles
  generate new events. Data comes from TMDB/JustWatch; no leaving-soon dates are
  inferred. Initial checks can also report titles already available.
- **Watchlist visibility**: private by default on public profiles; enable public
  display in streaming preferences. Movie-night membership is separate consent
  to share with that group. Favorites and watchlists are displayed separately.
- **TV progress**: episode logs drive season counts and next-unwatched links;
  whole-season/show logs count toward progress. Episode stills are visible by
  default; unseen episode descriptions stay hidden until explicitly revealed.
  This is a presentation feature, not access control on public TMDB content.
- **Import/export** (`/library`, linked from Settings): export the full library as
  JSON. Import version-1 JSON (up to 5,000 entries, 5 MB) or CSV (up to 500 rows).
  The CSV template includes TMDB ID, Title, Media Type, Watched Date, Rating,
  Review, and Rewatch. Letterboxd diary columns are supported via Name/Year/Watched
  Date; ambiguous title matches require an explicit TMDB ID. A preview and final
  confirmation precede writes. Imports use ten-entry batches and can be retried
  after partial failure without duplicating the already-imported entries.

The tonight picker remains deferred.

## Dependency maintenance

PGlite is a development-only dependency for safe PostgreSQL migration and API
regression checks. Scoped dependency overrides patch the Vercel routing library's
`path-to-regexp` and the migration loader's `esbuild`; verify production builds
and `npm run db:generate` when updating either override.
