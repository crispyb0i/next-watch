# Disposable local E2E

This harness runs the actual Astro application, its JWT verifier, Drizzle queries,
and all SQL migrations against a fresh PostgreSQL 18 database. It never uses a
configured application database. Synthetic identities and catalogue responses
come from local HTTP fixtures.

## Requirements

- An isolated checkout with dependencies already installed, Node 22.12 or newer,
  and no `.env` files other than `.env.example`.
- Docker running with the `postgres:18` image already cached. The harness uses
  `--pull=never`; it does not download images or alter existing services.
- For browser tests, an existing Playwright/Playwright Core installation and its
  matching Chromium executable. The harness does not install either.

The runner refuses a checkout that already has a live Astro background server.
Use a separate checkout to preserve an existing preview and dirty work.

## Run

From the checkout root:

```sh
# Existing follows integration on a real, disposable PostgreSQL database
npm run test:integration:local

# Integration plus adversarial application API/database checks
npm run test:e2e -- --api-only

# Full API and browser suite (when Playwright is installed in this checkout)
npm run test:e2e

# Or reuse a separately installed Playwright module without installing anything
NEXT_WATCH_PLAYWRIGHT_MODULE=/absolute/path/to/playwright-core/index.mjs npm run test:e2e
```

Each run creates one uniquely named and labelled container with memory-backed
database storage and a random loopback-only port, applies the migrations, and
starts its own Astro server on another random loopback port. No host database
directories are mounted. The database password and signing keys are generated
in memory; accounts use synthetic, test-only credentials.

The application keeps its production Neon HTTP query implementation. A local
transport bridge forwards these requests to the disposable PostgreSQL instance,
including transactional batch requests. The database override requires explicit
test opt-in, loopback URLs, a generated test database name, and a nonproduction
runtime. The server fetch fixture blocks nonlocal outbound requests except TMDB,
which it redirects to the local catalogue. Browser requests are restricted to
the local application and identity fixture.

## Evidence and coverage

Each run prints its local app URL and an artifact directory under
`.e2e-artifacts/`. `results.json` records individual outcomes, timestamps, the
database/migration count, and cleanup status. Logs, screenshots, downloaded
exports, and resource ownership metadata remain there for inspection. These
artifacts contain synthetic data and are ignored by Git.

Coverage includes UI sign-up/sign-in/sign-out, expired sessions, account changes
across tabs, favorite persistence and rollback, JSON/CSV import previews,
malformed input, repeated/concurrent imports, interrupted requests, export past
the 100-entry page boundary, SQL ownership/constraints, and navigation/layout at
320, 390, 768, and 1440 pixels. Authenticated home checks verify watch progress
and navigation to the next episode after its private module loads. API tests check JWT signature/claim rejection,
cross-account isolation, integer bounds, and rollback when a later import insert
fails. Application API successes are never mocked in the browser.

The hosted identity provider, OAuth, email delivery, real TMDB availability,
managed Neon transport, and production deployment are outside this suite. Local
sign-up exercises the installed client SDK against a compatible synthetic auth
service; it does not establish that hosted account creation works.

An individual import request is atomic. The UI intentionally splits a large
import into requests: completed chunks remain saved if a later chunk is
interrupted, and retrying skips previously imported entries.

## Teardown and recovery

Normal completion, test failures, SIGINT, and SIGTERM use the same cleanup path.
Successful cleanup stops the owned Astro server, local fixtures and bridges,
and removes the labelled test container. The final exit code is nonzero for
failed/interrupted tests or failed cleanup. The preview URL stops working after
teardown; run the command again to reproduce it.

A forced kill or machine crash cannot run JavaScript cleanup. For recovery,
inspect the failed run's `state.json` and `app-owner.json`. In that exact checkout,
check `npm run astro -- dev status` and compare the PID with `app-owner.json`
before running `npm run astro -- dev stop`. Do not stop a different PID.

To remove only the recorded disposable database, substitute that run's actual
artifact directory in this command:

```sh
node --input-type=module -e 'import {readFile} from "node:fs/promises"; import {stopDisposableDatabase} from "./scripts/e2e/database.mjs"; const state=JSON.parse(await readFile(process.argv[1], "utf8")); await stopDisposableDatabase(state.containerName);' .e2e-artifacts/RUN_ID/state.json
```

The removal helper checks both the generated name and matching ownership label.
It refuses unrelated containers. Never use broad Docker cleanup commands.
