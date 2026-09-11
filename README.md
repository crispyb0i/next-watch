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

## New account features

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
  whole-season/show logs count toward progress. Unseen episode descriptions and
  stills are hidden until explicitly revealed. This is a presentation feature,
  not access control on public TMDB content.
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
