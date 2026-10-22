# Taxi Trip Diary

A private, single-owner web app for a taxi driver to record daily trips.

Three screens, nothing else:

| Page | Route | Purpose |
| --- | --- | --- |
| **Login** | `/login` | Owner sign-in (email + password) |
| **Add Trip** | `/trips/new` | Record one trip (7 fields, Hinglish labels) |
| **Trip Diary** | `/trips` | All trips for a chosen date, with count and total fare |

There is no public registration, no dashboard, no analytics, no maps and no
third-party data sharing. Customer names and mobile numbers are only ever
returned to the authenticated owner.

---

## Tech stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router, Turbopack) + React 19 + TypeScript (`strict`) |
| Styling | Tailwind CSS v4 + shadcn/ui (Radix preset) |
| Database | PostgreSQL on Neon |
| ORM | Prisma 7 (PostgreSQL driver adapter) |
| Validation | Zod 4 (one schema shared by client and server) |
| Auth | Better Auth 1.7 (email + password, database sessions) |
| Password hashing | Argon2id via `@node-rs/argon2` |
| Rate limiting | PostgreSQL-backed fixed-window limiter (shared across serverless instances) |
| Backups | Google Sheet (Apps Script) + standby PostgreSQL, every 15 min and on every save |
| Tests | Vitest (unit + API) and Playwright (end-to-end) |
| Hosting | Vercel |

> **Note on the auth library.** The original spec named Auth.js. Auth.js has since
> been merged into [Better Auth](https://better-auth.com) (the Auth.js docs now
> say so), so this project uses Better Auth — the actively maintained
> successor. It also satisfies the "Argon2id" requirement natively.

---

## Quick start

```bash
# 1. install
npm install

# 2. configure
cp .env.example .env        # then fill in DATABASE_URL, BETTER_AUTH_SECRET, ...

# 3. create the database schema
npm run db:migrate:deploy

# 4. create the single owner account
npm run db:owner            # reads OWNER_EMAIL / OWNER_PASSWORD from .env

# 5. run
npm run dev
```

Open <http://localhost:3000> — you will be redirected to `/login`.

> `npm install` runs `prisma generate` automatically (the `postinstall` script).
> `DATABASE_URL` must be present in the environment for `next build` and for the
> Prisma CLI; `prisma generate` on its own does not need it.

---

## Environment variables

Copy `.env.example` to `.env`. All of these are **server-only** — none of them
are exposed to the browser.

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | yes | Neon PostgreSQL connection string. Use the **direct** connection for migrations and the **pooled** connection for the app. Always use TLS (`sslmode=require`). |
| `BETTER_AUTH_SECRET` | yes | ≥ 32 characters of high entropy. Encrypts/signs session cookies. Generate with `openssl rand -base64 32`. |
| `BETTER_AUTH_URL` | yes | Public base URL of the app, e.g. `https://your-app.vercel.app`. |
| `TRUSTED_ORIGINS` | prod | Extra allowed origins (comma separated) for CSRF origin checks, e.g. `https://your-app.vercel.app,https://*.vercel.app`. |
| `OWNER_EMAIL` | setup | Email of the owner account created by `npm run db:owner`. |
| `OWNER_PASSWORD` | setup | Password of the owner account (never stored in plain text). |
| `RATE_LIMIT_ENABLED` | no | `true`/`false`. Default `true`. |
| `LOGIN_RATE_LIMIT_MAX` | no | Login attempts allowed per window, per IP **and** per account. Default `10`. |
| `LOGIN_RATE_LIMIT_WINDOW_SECONDS` | no | Default `60`. |
| `TRIP_RATE_LIMIT_MAX` | no | Trip create/read requests per window, per user **and** per IP. Default `120`. |
| `TRIP_RATE_LIMIT_WINDOW_SECONDS` | no | Default `60`. |
| `MAX_FARE_INR` | no | Maximum accepted fare in whole rupees. Default `1000000` (₹10,00,000). |
| `MAX_KHARCH_INR` | no | Maximum accepted kharch in whole rupees. Default `1000000` (₹10,00,000). |
| `SECONDARY_DATABASE_URL` | backup | Standby PostgreSQL (Supabase) that mirrors the primary. Use **port 5432**, never 6543. |
| `GOOGLE_SHEET_ID` | backup | Id of the Google Sheet that receives the copy. |
| `GOOGLE_SHEET_SCRIPT_URL` | backup | The Apps Script `/exec` url that writes the Sheet. |
| `GOOGLE_SHEET_TOKEN` | backup | Shared secret between this app and the Apps Script. |
| `BACKUP_SECRET` | backup | Bearer token for `POST /api/cron/backup`. `CRON_SECRET` is accepted as an alternative. |

`.env*` is git-ignored; only `.env.example` (placeholders only) is committed.

---

## Database

### Schema

Prisma schema: [`prisma/schema.prisma`](prisma/schema.prisma)

```
user ──┬── session
        ├── account        (Better Auth credential provider — holds the Argon2id hash)
        └── trip           (the diary)
rateLimitBucket              (fixed-window rate limit counters)
```

`trip`:

| Column | Type | Notes |
| --- | --- | --- |
| `id` | `cuid` | |
| `userId` | FK → `user.id` | every query is scoped to the authenticated owner |
| `tripDate` | `DATE` | date-only, no time component; indexed with `userId` |
| `fromLocation` | `VARCHAR(200)` | |
| `toLocation` | `VARCHAR(200)` | |
| `fare` | `INTEGER` | whole rupees, non-negative, capped by `MAX_FARE_INR` |
| `kharch` | `INTEGER` | whole rupees, non-negative, defaults to `0`, capped by `MAX_KHARCH_INR` |
| `customerName` | `VARCHAR(120)` | |
| `customerPhone` | `VARCHAR(15)` | stored as a normalised 10-digit number |
| `createdAt` / `updatedAt` | `TIMESTAMP(3)` | |

The `user` / `session` / `account` / `verification` models are Better Auth's
core schema. Note that **the password hash lives on `account`** (row with
`providerId = "credential"`), not on `user` — that is Better Auth's design and
differs from the `User.passwordHash` sketch in the original spec.

### Migrations

```bash
npm run db:migrate:dev      # create + apply a new migration (development)
npm run db:migrate:deploy   # apply existing migrations (production/CI)
npm run db:generate         # regenerate the Prisma client
```

Apply migrations with the **direct** (non-pooled) Neon connection string;
`prisma migrate deploy` does not work reliably through a pooler.

### Restricted database role

For production, run the app as a role that can only do what it needs. Neon
users already get an isolated role, but you can narrow it further:

```sql
-- schema owner (used for migrations)
CREATE ROLE diary_owner LOGIN PASSWORD '...';

-- runtime role used by the app
CREATE ROLE diary_app LOGIN PASSWORD '...';
GRANT CONNECT ON DATABASE diary TO diary_app;
GRANT USAGE ON SCHEMA public TO diary_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO diary_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO diary_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO diary_app;
```

Use the `diary_app` credentials in `DATABASE_URL` and the owner credentials
only for migrations. All connections use TLS (`sslmode=require`).

---

## Creating the owner account

Public sign-up is disabled (`emailAndPassword.disableSignUp = true`), so the
owner is provisioned exactly once, out of band:

```bash
OWNER_EMAIL="you@example.com" OWNER_PASSWORD="a-strong-password" npm run db:owner
```

The script:

1. refuses to run without both variables,
2. refuses to overwrite an existing account,
3. hashes the password with Argon2id and never stores or logs the plain text.

To rotate the owner password later, update the `account.password` hash with a
newly generated one (or re-create the account), then sign in again — existing
sessions can be revoked with `auth.api.revokeSessions()`.

---

## Tests

Two suites, both against a **separate test database** — never against
production data.

```bash
# 1. unit + API tests (Vitest)
npm test

# 2. end-to-end tests (Playwright)
npx playwright install chromium   # once
npm run test:e2e
```

The suites need a PostgreSQL instance and a `.env.test` file:

```bash
cp .env.example .env.test
# point DATABASE_URL at a *test* database, e.g.
# DATABASE_URL="postgresql://user:pass@host:5432/diary_test?sslmode=require"
```

A throwaway local database is enough (port 55555 avoids the range that Windows
reserves for Hyper-V, 55368-55467):

```bash
docker run -d --name diary-pg \
  -e POSTGRES_PASSWORD=postgres -e POSTGRES_USER=postgres -e POSTGRES_DB=diary_test \
  -p 55555:5432 postgres:16
# then set DATABASE_URL="postgresql://postgres:postgres@localhost:55555/diary_test?sslmode=disable"
```

`tests/global-setup.ts` applies the migrations to the test database before the
Vitest run; `tests/e2e/global-setup.ts` does the same and seeds the owner
account for Playwright. `scripts/seed-test-owner.ts` refuses to run unless the
database name looks like a test database.

What is covered:

| Area | Where |
| --- | --- |
| Valid/invalid trip creation, invalid dates, fares, kharch, phones, missing and oversized fields | `tests/unit/validations.test.ts`, `tests/api/trips.test.ts` |
| Unauthenticated API requests and direct page access | `tests/api/trips.test.ts`, `tests/e2e/auth.spec.ts` |
| Date-wise retrieval, trip count and total fare, newest-first ordering | `tests/api/trips.test.ts`, `tests/e2e/trips.spec.ts` |
| Monthly report: per-day grouping, total fare, total kharch and the bachat | `tests/api/trips-month.test.ts`, `tests/e2e/monthly.spec.ts` |
| Ownership enforcement (another user's trips are never returned) | `tests/api/trips.test.ts` |
| Login rate limiting → HTTP 429 | `tests/e2e/zz-rate-limit.spec.ts` |
| Trip API rate limiting → HTTP 429 | `tests/api/trips.test.ts` |
| Database failures that must not leak internals | `tests/api/db-failure.test.ts` |
| Session expiry / logout invalidates the session | `tests/e2e/auth.spec.ts` |
| CSRF: cross-origin mutation rejected | `tests/api/trips.test.ts`, `tests/e2e/security.spec.ts` |
| Security headers and production configuration | `tests/api/security-headers.test.ts`, `tests/e2e/security.spec.ts` |
| Argon2id hashing, salt, verification | `tests/unit/password.test.ts` |
| Duplicate submission prevention | `tests/e2e/trips.spec.ts` |

---

## Deployment (Vercel)

1. Push the repository to GitHub and import it into Vercel.
2. Add the environment variables from the table above in
   **Project → Settings → Environment Variables** (add them for *both* Preview
   and Production).
3. `DATABASE_URL` must be present at build time — Vercel injects env vars into
   the build.
4. Deploy. The framework preset is Next.js; no custom build command is needed
   (`postinstall` runs `prisma generate`).
5. Run the migrations against production **before** the first real request:

   ```bash
   DATABASE_URL="<production direct url>" npx prisma migrate deploy
   ```

6. Create the owner account once:

   ```bash
   DATABASE_URL="<production direct url>" \
   OWNER_EMAIL="you@example.com" OWNER_PASSWORD="..." \
   npm run db:owner
   ```

7. Set up the backups — the Google Sheet, the standby database and the
   fifteen-minute schedule — as described in
   [`docs/backup-setup.md`](docs/backup-setup.md). The backup environment
   variables have to be added to Vercel as well, and the app redeployed.

Set `BETTER_AUTH_URL` to the production domain and add it (plus any preview
domain) to `TRUSTED_ORIGINS`.

---

## Security model

Security is applied in layers; no single control is relied upon.

### Authentication & authorization

* **Deny by default.** Every API handler calls
  `auth.api.getSession()` and returns `401` when there is no valid session.
  The browser is never the authority.
* **Page protection.** `src/proxy.ts` (Next.js 16 renamed *middleware* to
  *proxy*) redirects unauthenticated page requests to `/login`. Pages also
  re-check the session server-side, so the redirect is an optimisation, not the
  control.
* **Database sessions.** Sessions are rows in PostgreSQL; the cookie only
  carries an opaque, signed token. Logging out deletes the session row, so the
  cookie is useless afterwards.
* **Cookies** are `HttpOnly`, `Secure` in production, `SameSite=Strict`, and
  `__Secure-` prefixed.
* **Ownership.** Every trip query is filtered by `userId = session.user.id`.
  Another user's trips can never be read or written.
* **No public registration.** `disableSignUp: true`.

### Input & application security

* **One Zod schema** (`src/lib/validations.ts`) validates the trip on the
  client *and* on the server. The server copy is authoritative.
* Dates must be real calendar dates in `YYYY-MM-DD`; fares and kharch must be
  non-negative integers within `MAX_FARE_INR` and `MAX_KHARCH_INR`; phone
  numbers must be valid Indian mobile numbers (normalised to 10 digits); text
  fields are trimmed and length-capped.
* Request bodies over 10 KB are rejected with `413`.
* Prisma parameterises every query; no string-built SQL.
* All user-supplied text is rendered as React text — no `dangerouslySetInnerHTML`
  anywhere, so stored XSS is not possible.
* Errors are generic. Database errors, stack traces, connection strings and
  customer data are never returned to the client; details are logged
  server-side only. Passwords, session tokens and full phone numbers are never
  logged.
* `POST` requests are rejected when the `Origin` header does not match the
  `Host` header (defence in depth on top of `SameSite=Strict`).

### Response headers

Set in `next.config.ts` for every route:

* `Content-Security-Policy` — issued per request in `src/proxy.ts` with a
  **nonce**: `default-src 'self'; script-src 'self' 'nonce-…'; style-src 'self'
  'unsafe-inline'; object-src 'none'; base-uri 'self'; form-action 'self';
  frame-ancestors 'none'; upgrade-insecure-requests`. There is no
  `'unsafe-inline'` for scripts, so injected inline scripts do not run.
* `X-Content-Type-Options: nosniff`
* `Referrer-Policy: strict-origin-when-cross-origin`
* `X-Frame-Options: DENY`
* `Permissions-Policy: camera=(), microphone=(), geolocation=()`
* `Strict-Transport-Security` (production only)
* `X-Powered-By` removed.

### Rate limiting

The limiter is a PostgreSQL fixed-window counter
(`src/lib/rate-limit.ts`). Because the state lives in the database, it is
**shared by every serverless instance** — there are no in-memory counters.

| Endpoint | Buckets | Default |
| --- | --- | --- |
| Sign-in (`/sign-in/email`, used by the login form) | per **IP** and per **account identifier** | 10 / 60 s |
| `POST /api/trips` | per **user id** and per **IP** | 120 / 60 s |
| `GET /api/trips` | per **user id** and per **IP** | 120 / 60 s |

The sign-in limiter is implemented as a Better Auth `before` hook, so it also
covers requests made directly to `/api/auth/sign-in/email` — the limit cannot
be bypassed by skipping the UI. Exceeding the limit returns **HTTP 429** with a
safe message.

**Failure policy: fail-open.** If the limiter's own database query fails, the
request is allowed through and the failure is logged. A limiter outage must
never permanently lock the legitimate owner out of their own diary. The
trade-off is that a database outage also disables the limit until the database
recovers; this is a deliberate availability-over-enforcement choice for a
single-user app.

### Privacy

* Customer data is never sent to any third party **unless the backup is
  switched on**. The Google Sheet copy does contain customer names and mobile
  numbers, so enabling it means customer data lives in a Google account. See
  the note at the end of
  [`docs/backup-setup.md`](docs/backup-setup.md).
* There is no analytics, no error-reporting service and no external
  font/CDN dependency.
* Phone numbers and names are not written to `localStorage`, `sessionStorage`
  or cookies — only the session token is stored in a cookie.
* Customer identifiers are not placed in URLs; the diary is queried by date.
* Every table and API response is scoped to the authenticated owner.
* The backup never copies live session tokens to the standby database, and
  the standby URL, the sheet token and the backup secret are never logged.
* The standby database is not reachable over the Supabase REST API: every
  table has Row Level Security on, and the `anon` and `authenticated` grants
  have been revoked. The publishable key cannot read the diary.

---

## Rotating exposed secrets

If `DATABASE_URL`, `BETTER_AUTH_SECRET` or the owner password ever leak:

1. **Rotate the database credentials** in the Neon console, update
   `DATABASE_URL` in Vercel, then redeploy. Rotate the *previous* credential
   after the new one is working.
2. **Rotate `BETTER_AUTH_SECRET`** with `openssl rand -base64 32`. Better Auth
   supports non-destructive rotation via `BETTER_AUTH_SECRETS`
   (`version:newValue,version:oldValue`); the newest key is used for new
   sessions while old sessions keep working until they expire.
3. **Rotate the owner password** by re-running `npm run db:owner` after
   deleting the existing owner row, then revoke existing sessions
   (`auth.api.revokeSessions()`), which invalidates every issued cookie.
4. Check the Vercel deployment logs and the database audit log for anything
   unexpected, and confirm the `.env` files were never committed
   (`git log -p -- .env`).

Never commit real secrets, and never paste them into a chat, an issue or a
pull request.

## Backups & recovery

The diary is copied to two independent places every fifteen minutes, and again
within seconds of every new trip being saved:

| Layer | Where | Why |
| --- | --- | --- |
| **Google Sheet** | your Google account | a human-readable copy you can open without any tooling, and a copy that does not depend on either database provider |
| **Standby database** | a second PostgreSQL (Supabase) | a true hot standby — promoting it is a `DATABASE_URL` change and nothing else |
| **Backup file** | `backups/` on your machine | provider-agnostic: a plain JSON file that restores into any PostgreSQL |

The **schema** already lives in git (`prisma/migrations/`), so a backup only
carries the *data*. Restoring is always the same three steps: apply the
migrations, import the data, point `DATABASE_URL` at it.

### How it runs

```
Neon (primary) ──read──▶ runBackupSync() ──▶ Supabase (standby)
                                  └────────▶ Google Sheet
```

`runBackupSync()` is one shared core with three entry points:

| Trigger | When |
| --- | --- |
| `POST /api/cron/backup` | every 15 minutes, fired by a Supabase `pg_cron` job |
| `after()` on trip save | right after a trip is recorded, without blocking the response |
| `npm run backup:sync` | whenever you want it, from the terminal |

A run that finds nothing new does nothing: the watermarks in
`_backup_state` hold the trip count and the newest `updatedAt` each target
has seen, so an unchanged diary costs a single cheap query instead of a full
rewrite of the sheet.

The rules the backup follows:

* the primary database is **only ever read** — a backup cannot damage the
  thing it is backing up;
* the standby is written with `ON CONFLICT DO UPDATE` and **never deletes**;
* `session`, `verification` and `rateLimitBucket` are **not** copied — live
  session tokens have no business in a second database;
* the endpoint is **fail-closed**: with no `BACKUP_SECRET` configured it
  refuses to run rather than serving the diary to anyone who finds the url;
* the standby is **locked down**: Row Level Security on every table, and the
  `anon` / `authenticated` grants revoked, so the copy is not readable over
  the Supabase REST API with the public publishable key.

### Setup

The full click-by-click setup — the Google Sheet, the Apps Script, the
Supabase project, the hardening and the fifteen-minute cron job — is in
**[`docs/backup-setup.md`](docs/backup-setup.md)**.

### Commands

```bash
npm run backup:sync            # every configured target
npm run backup:sync -- --force # copy even when nothing changed
npm run backup:sync -- --sheet # only the Google Sheet
npm run backup:sync -- --db    # only the standby database
npm run backup:file            # write backups\diary-<timestamp>.json and .csv
npm run restore:file -- --file backups\diary-<timestamp>.json
npm run db:migrate:deploy:secondary
```

### Checking that it works

* the **`Meta` tab** of the Google Sheet shows the last successful backup,
  the trip count, the total fare and the state of the database copy;
* `_backup_sync_log` on the standby records every run, successful or not;
* `cron.job_run_details` in Supabase records every scheduled job.

### Restore procedure

1. Create a new database and point `DATABASE_URL` at it.
2. `npm run db:migrate:deploy` — the schema comes back from git.
3. Bring the data back: `npm run backup:db` (from the standby),
   `npm run restore:file -- --file <path>` (from a backup file), or by hand
   from the `Trips` tab of the Google Sheet.
4. `npm run db:owner` — only needed if the restored copy had no credential
   rows. A copy that includes them keeps the existing password working.
5. Point Vercel at the new database and redeploy.

Neon also offers point-in-time recovery and branch/snapshot features on paid
plans. That is a fifth layer, and it is worth enabling on the primary
branch.

---

## Project structure

```
prisma/
  schema.prisma              Prisma models
  migrations/                Committed SQL migrations
scripts/
  create-owner.ts            One-time owner provisioning
  seed-test-owner.ts         Test database seeding (refuses non-test DBs)
  migrate-secondary.ts       Applies the migrations to the standby database
  backup-sync.ts             Runs the backup from the command line
  export-data-file.ts        Writes the portable JSON + CSV backup
  restore-from-data-file.ts  Restores a portable backup file
  apps-script/Code.gs        The Google Apps Script that writes the Sheet
docs/
  backup-setup.md            Backup setup and the recovery runbook
src/
  app/
    login/page.tsx           Page A - login
    login/actions.ts         Server action: validate, sign in, generic errors
    trips/page.tsx           Page C - date-wise trip diary
    trips/new/page.tsx       Page B - add a trip
    api/
      auth/[...all]/route.ts Better Auth handler
      trips/route.ts         POST create, GET list + summary
      cron/backup/route.ts   Scheduled backup trigger (bearer token)
    layout.tsx, globals.css
  components/
    login-form.tsx
    trip-form.tsx
    trip-diary.tsx
    trip-date-filter.tsx
    trip-list.tsx
    app-header.tsx
    logout-button.tsx
    ui/                      shadcn/ui components
  lib/
    auth.ts                  Better Auth instance + sign-in rate-limit hook
    auth-client.ts           Browser client
    prisma.ts                Prisma client (driver adapter, singleton)
    password.ts              Argon2id hashing
    validations.ts           Zod schemas (shared by client and server)
    rate-limit.ts            PostgreSQL-backed limiter
    csrf.ts                  Same-origin check
    client-ip.ts             Client IP extraction
    errors.ts                Consistent JSON responses
    backup/                  The backup subsystem (see below)
      types.ts               Shared result and row types
      source.ts              Reads the diary out of the primary database
      sheet-payload.ts       Builds the Google Sheet payload (pure)
      google-sheet.ts        Pushes the payload to the Apps Script
      secondary.ts           Standby client and the mirror upserts
      state.ts               Lock, watermarks and the run history
      data-file.ts           The portable backup file format
      sync.ts                The orchestrator
  proxy.ts                   Auth redirect + per-request CSP nonce
tests/
  unit/                      Vitest unit tests
  api/                       Vitest API tests
  e2e/                       Playwright end-to-end tests
```

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm start` | Serve the production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest unit + API tests |
| `npm run test:e2e` | Playwright end-to-end tests |
| `npm run db:migrate:dev` | Create and apply a migration (dev) |
| `npm run db:migrate:deploy` | Apply migrations (production) |
| `npm run db:migrate:deploy:secondary` | Apply migrations to the standby database |
| `npm run db:url:fix` | Repair `SECONDARY_DATABASE_URL` in `.env` |
| `npm run db:harden:secondary` | Lock the standby down (RLS + revoke grants) |
| `npm run db:cron:setup` | Install the fifteen-minute schedule on the standby |
| `npm run db:generate` | Regenerate the Prisma client |
| `npm run db:owner` | Create the owner account |
| `npm run backup:sync` | Run the backup (both targets) |
| `npm run backup:sheet` | Copy the diary to the Google Sheet only |
| `npm run backup:db` | Copy the diary to the standby database only |
| `npm run backup:file` | Write a portable JSON + CSV backup |
| `npm run restore:file` | Restore a portable backup file |
| `npm run auth:check` | Verify the Better Auth schema matches the database |

---

## License

Private project. All rights reserved.
