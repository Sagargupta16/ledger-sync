# Deployment Guide

Current for Ledger Sync 2.31.0.

## Production Topology

The [release delivery diagram](diagrams/README.md#release-delivery) shows the CI
and migration dependencies, Pages' backend-readiness gate, and the separate
Vercel deployment path.

| Layer | Platform | Production address |
| --- | --- | --- |
| Frontend | GitHub Pages | `https://sagargupta.online/ledger-sync/` |
| Backend | Vercel serverless | `https://ledger-sync-api.vercel.app` |
| Database | Neon PostgreSQL 17 | Singapore pooler endpoint |

```text
Browser
  -> GitHub Pages React SPA
  -> Vercel FastAPI function
  -> Neon PostgreSQL 17
```

Production releases use `main`. CI gates the migration workflow, then the
GitHub Pages workflow, for the same commit. Pages waits for a healthy backend
reporting the frontend release version and a connected database before publishing.
Vercel's external GitHub integration must be gated on the `migrate / migrate`
check (see [Migration workflow](#migration-workflow)) or promoted separately
after migrations.

## Deployment Sources

| Concern | Source of truth |
| --- | --- |
| Frontend build | `.github/workflows/deploy-frontend.yml` |
| Backend routing | `backend/vercel.json` |
| Backend entry point | `backend/api/index.py` |
| Database migration | `.github/workflows/migrate.yml` |
| Scheduled health ping (disabled) | `.github/workflows/keepalive.yml` |
| Runtime settings | `backend/src/ledger_sync/config/settings.py`, plus `push_settings.py` and `embedding_settings.py` beside it |
| Scheduled push run | `crons` in `backend/vercel.json` |
| Frontend base and proxy | `frontend/vite.config.ts` |

## Production Configuration

Store secret values in Vercel or GitHub Actions. Never commit them.

### Required backend values

| Variable | Purpose |
| --- | --- |
| `LEDGER_SYNC_DATABASE_URL` | Neon PostgreSQL pooler URL |
| `LEDGER_SYNC_JWT_SECRET_KEY` | JWT signing secret, at least 32 characters |
| `LEDGER_SYNC_ENCRYPTION_KEY` | Dedicated BYOK encryption key, at least 32 characters |
| `LEDGER_SYNC_ENVIRONMENT` | `production` |
| `LEDGER_SYNC_FRONTEND_URL` | `https://sagargupta.online/ledger-sync` |
| `LEDGER_SYNC_CORS_ORIGINS` | JSON array of allowed browser origins |

The Python version is not a Vercel setting: the build takes it from
`requires-python` in `backend/pyproject.toml` (see [Vercel Backend](#vercel-backend)).

At least one OAuth client pair is required for sign-in:

- `LEDGER_SYNC_GOOGLE_CLIENT_ID`
- `LEDGER_SYNC_GOOGLE_CLIENT_SECRET`
- `LEDGER_SYNC_GITHUB_CLIENT_ID`
- `LEDGER_SYNC_GITHUB_CLIENT_SECRET`

Optional AI settings:

| Variable | Default | Purpose |
| --- | --- | --- |
| `LEDGER_SYNC_BEDROCK_API_KEY` | unset | Server credential for app Bedrock mode |
| `LEDGER_SYNC_AI_DEFAULT_BEDROCK_MODEL` | `us.anthropic.claude-haiku-5-5` | App-mode model (Claude Haiku 5.5) |
| `LEDGER_SYNC_AI_DEFAULT_BEDROCK_REGION` | `us-east-1` | Bedrock region |
| `LEDGER_SYNC_AI_DAILY_MESSAGE_LIMIT` | `10` | Per-user daily app-mode cap |
| `LEDGER_SYNC_AI_MAX_TOOL_ROUNDS` | `6` | Tool rounds per message |

The key behind `LEDGER_SYNC_BEDROCK_API_KEY` must be allowed to invoke the default
model. If app mode answers 502 after a deploy, set
`LEDGER_SYNC_AI_DEFAULT_BEDROCK_MODEL` to
`us.anthropic.claude-haiku-4-5-20251001-v1:0` and redeploy to go back to Haiku
4.5. Check by name whether the Vercel project already sets that variable: if it
does, the new default never applies, so change that value instead. For app and
personal-key calls alike, the chat proxy turns Claude 5.x thinking off (low
effort where a model cannot turn it off) through `api/ai_chat_thinking.py`.

Optional PostgreSQL tuning:

| Variable | Default |
| --- | --- |
| `LEDGER_SYNC_DB_POOL_SIZE` | `5` |
| `LEDGER_SYNC_DB_MAX_OVERFLOW` | `3` |
| `LEDGER_SYNC_DB_POOL_RECYCLE_SECONDS` | `300` |
| `LEDGER_SYNC_DB_CONNECT_TIMEOUT_SECONDS` | `10` |
| `LEDGER_SYNC_DB_STATEMENT_TIMEOUT_SECONDS` | `30` |
| `LEDGER_SYNC_DB_IDLE_TRANSACTION_TIMEOUT_SECONDS` | `60` |

The current defaults are sized for the Neon free tier. Do not increase them
without checking the database connection limit.

Release 2.31.0 adds no required setting. Its two optional features below read
their own settings classes (`config/embedding_settings.py` and
`config/push_settings.py`). Set their values as real environment variables: the
Vercel project for production, the shell for a local run. Never put them in
`backend/.env`: `Settings` forbids any key it does not declare, so an
undeclared `LEDGER_SYNC_*` key, or `CRON_SECRET`, in that file stops the backend
at start-up, and the validation error echoes the value.

### Optional semantic search

Smart search on the Transactions page finds rows by meaning with Amazon Titan
Text Embeddings V2 (`amazon.titan-embed-text-v2:0`). It is opt-in per user and
uses the chat's Bedrock credentials: `LEDGER_SYNC_BEDROCK_API_KEY`, the AWS
credential chain, or a user's own Bedrock key. Without them it stays off and the
page says why. The credential must be allowed to invoke the Titan model in the
embedding region. Each indexed transaction sends its note, category,
subcategory and account to Bedrock, never an amount or a date.

| Variable | Default | Purpose |
| --- | --- | --- |
| `LEDGER_SYNC_EMBEDDING_REGION` | unset (follows `LEDGER_SYNC_AI_DEFAULT_BEDROCK_REGION`) | Region for app-funded embedding calls |
| `LEDGER_SYNC_EMBEDDING_BATCH_SIZE` | `64` (1 to 256) | Transactions embedded per index request |
| `LEDGER_SYNC_EMBEDDING_CONCURRENCY` | `8` (1 to 10) | Parallel Titan calls within a batch |
| `LEDGER_SYNC_EMBEDDING_DAILY_TOKEN_LIMIT` | `1000000` | App-funded tokens per user per UTC day; `0` turns the cap off |

A value outside its range stops the backend at start-up. Every call is reserved
and settled in `ai_usage_log` under the provider `bedrock-embed`, so it counts
toward the user's daily and monthly token budgets and the AI usage totals, but
not toward the app-mode message cap.

### Optional phone alerts (Web Push)

Settings > Notifications can send the saved budget, anomaly and upcoming-bill
choices to a phone or browser. Alerts carry counts and timing, never amounts.
They stay off, and the panel names what is missing, until the three VAPID values
are set. The daily run also needs `CRON_SECRET`; without it, test sends work and
the daily run stays off:

| Variable | Purpose |
| --- | --- |
| `LEDGER_SYNC_VAPID_PUBLIC_KEY` | VAPID public key the browser subscribes with |
| `LEDGER_SYNC_VAPID_PRIVATE_KEY` | Matching private key; signs every push, never returned or logged |
| `LEDGER_SYNC_VAPID_SUBJECT` | `mailto:` address or `https://` URL push services can contact |
| `CRON_SECRET` | Vercel sends it as `Authorization: Bearer` on the daily cron; the run refuses without it (`LEDGER_SYNC_CRON_SECRET` also works) |

The public key must come from the private key; `GET /api/push/config` names a
mismatch.

Generate the key pair and the cron secret from the repository root in
PowerShell. The command writes them to `ledger-sync-push-keys.txt` in your home
folder and prints only that path:

```powershell
uv run --directory backend python -c "import base64, secrets; from pathlib import Path; from cryptography.hazmat.primitives.asymmetric import ec; from cryptography.hazmat.primitives import serialization as s; b=lambda raw: base64.urlsafe_b64encode(raw).rstrip(b'=').decode(); k=ec.generate_private_key(ec.SECP256R1()); pub=k.public_key().public_bytes(s.Encoding.X962, s.PublicFormat.UncompressedPoint); priv=k.private_numbers().private_value.to_bytes(32, 'big'); f=Path.home() / 'ledger-sync-push-keys.txt'; f.write_text('LEDGER_SYNC_VAPID_PUBLIC_KEY=' + b(pub) + chr(10) + 'LEDGER_SYNC_VAPID_PRIVATE_KEY=' + b(priv) + chr(10) + 'CRON_SECRET=' + secrets.token_urlsafe(32) + chr(10)); print('Wrote', f)"
```

Paste each value into Vercel (project `ledger-sync-api` > **Settings** >
**Environment Variables**, Production), add `LEDGER_SYNC_VAPID_SUBJECT` with a
contact you read, redeploy, then delete the file:

```powershell
Remove-Item $env:USERPROFILE\ledger-sync-push-keys.txt
```

`backend/vercel.json` registers one cron, `GET /api/push/run-due` at
`0 3 * * *` (UTC). Vercel calls it on the production deployment only, with the
`CRON_SECRET` bearer header. On the Hobby plan Vercel may start it anywhere in
03:00 to 03:59 UTC (08:30 to 09:29 IST), at most once a day. Delivery is best
effort and can repeat, and Vercel does not retry a failed run. A repeated run
sends nothing new, because each device records what it was already told.
`POST /api/push/run-due` with the same header runs it by hand. The route answers
503 naming the missing setting until `CRON_SECRET` and the VAPID values are set,
and 401 for a wrong secret. A run stops sending after 8 seconds and leaves the
rest for the next run. The function's Max Duration is a Vercel project setting
(Settings > Functions), because `vercel.json` cannot carry `functions` next to
its legacy `builds` key.

The cron entry has not been seen running on Vercel for this project yet. After
the first deploy, confirm `/api/push/run-due` is listed under the project's
Settings > Cron Jobs, trigger it once (the deployment summary can run a cron
job) and read the function log: 503 naming the missing setting until push is
configured, then 200 with counts.

Rotating the VAPID pair or `CRON_SECRET` takes a redeploy. A new pair
invalidates every stored subscription: each device taps Turn on again, which
replaces its subscription. A device that is never reopened keeps failing, because
only a 404 or 410 from the push service deletes its row; remove it from the
device list in Settings > Notifications.

### Required frontend value

Create this GitHub Actions repository variable:

| Variable | Value |
| --- | --- |
| `VITE_API_BASE_URL` | `https://ledger-sync-api.vercel.app` |

The value is compiled into the static frontend. Changing it requires a new
frontend build and deployment.

`GITHUB_PAGES=true` is set by the workflow and changes the Vite base path to
`/ledger-sync/`.

## Neon Database

Use the pooled connection string from the Vercel Neon integration.

Requirements:

- PostgreSQL 17
- Singapore region
- PgBouncer pooler endpoint
- `sslmode=require`
- No `channel_binding=require`
- The `vector` extension (pgvector), which the 2.31.0 migration creates; Neon
  ships it on every plan and installs extensions per database

The application normalizes `postgresql://` and
`postgresql+psycopg2://` URLs to the psycopg 3 driver.

The `LEDGER_SYNC_DATABASE_URL` GitHub Actions secret must use Neon's direct
connection endpoint for migrations. The Vercel value with the same name uses
the pooler for application traffic. Do not expose either value in logs.

### Migration workflow

`ci.yml` runs the frontend, GitHub Pages build, backend, security, and
PostgreSQL migration checks; both migration paths end with `alembic check`.
On `main`, only a successful set of checks calls `migrate.yml`, which uses the
`production` environment and Python 3.14. Only a successful migration calls
`deploy-frontend.yml`. Run the **CI** workflow manually on `main` to repeat the
same gated release path; the two reusable workflows have no independent push
or manual triggers.

Main CI runs and migration jobs serialize without canceling an active release.
Protect the `production` environment in GitHub if a reviewer approval is
required; declaring an environment in YAML does not configure its protection.
No production settings are provisioned by these workflows.

CI tests `alembic upgrade head` from an empty SQLite database and an isolated
native PostgreSQL cluster using the runner's installed binaries. It logs the
server version, binds only loopback, and stops only the cluster it created.
The PostgreSQL job runs the complete integration directory, plus the AI-settings
and compensation migration/record unit files, so migration, analytics
publication, concurrency, and lifecycle tests share the same gate.
It does not use containers or alter a pre-existing database service. Before it
starts the cluster, the job installs `postgresql-<major>-pgvector` for the
runner's PostgreSQL major from apt.postgresql.org and checks that
`vector.control` exists, because the 2.31.0 revision runs
`CREATE EXTENSION vector`.
The migration tests compare table and column coverage, primary keys,
unique constraints, foreign keys and cascade rules, and check constraints
against the ORM. They exercise duplicate OAuth identities, invalid amounts,
data preservation, idempotency, and rejection of unsupported rollback plans.
Six simultaneous PostgreSQL connections also verify that only one worker can
reserve the remaining daily message, daily token, or monthly token allowance.
Use `uv run alembic heads` to identify the current revision rather than a
hardcoded revision in a runbook.

`identity_constraints_2026` follows `ai_usage_reservations_2026`. It adds SQLite's
missing OAuth uniqueness index, removes obsolete global uniqueness rules that
block different users' data, and installs the budget/goal positive-amount
checks. Duplicate identities or nonpositive existing amounts stop the revision
before it changes schema or data. Resolve ownership and invalid values
explicitly from a verified backup, then retry. It never merges accounts or
rewrites financial amounts automatically.

`create_all()` creates missing tables but cannot retrofit columns or
constraints onto existing ones. Alembic remains the schema authority.

Vercel's GitHub integration is outside this job graph, so by default Vercel
promotes the new backend as soon as its own build is ready, possibly before
`migrate.yml` has touched the database. Owner console step, once per project
(Vercel's [Deployment Checks](https://vercel.com/docs/deployment-checks)):

1. Vercel project `ledger-sync-api` > **Settings** > **Environments** >
   **Production**: confirm automatic aliasing for production is on.
2. **Settings** > **Build and Deployment** > **Deployment Checks** >
   **Add Checks**, choose **GitHub**, then search for and select
   `migrate / migrate` (the check run name GitHub reports for the `migrate`
   job on `main`).

With that check required, Vercel still builds each production deployment but
holds it off the production domain until this commit's `migrate / migrate`
check passes. **Force Promote** on the deployment details page bypasses the
hold. Renaming the `migrate` job in `ci.yml` or `migrate.yml` changes the check
name and requires updating the Deployment Check.

Until that Deployment Check is set, every release must stay backward-compatible
expand-and-contract:

1. Add backward-compatible schema.
2. Deploy code that can use both old and new states.
3. Backfill where needed.
4. Remove old schema in a later release.

See [DATABASE.md](DATABASE.md) and the
[migration notes](../backend/src/ledger_sync/db/migrations/MIGRATION_NOTES.md).

### September 2026 ledger schema rollout

The seven revisions after `identity_constraints_2026` end at
`live_index_predicates_2026`. They introduce business-key constraints, stable
import fingerprints, analytics versions, account/category dimensions,
transaction invariants, scheduled-reference preservation, and corrected live
index predicates. See the [implementation and validation report](research/2026-09-17-backend-optimization.md).

This chain requires a coordinated migration and backend promotion:

1. Rehearse the complete upgrade on a Neon branch copied from current
   production data. Record preflight results, row/reference preservation, and
   total lock time. Keep a verified restore point.
2. Before merging, verify Vercel will hold the new production deployment until
   this commit's database migrations succeed (the `migrate / migrate`
   Deployment Check above). The GitHub Actions dependency graph alone does not
   control Vercel promotion.
3. Drain transaction traffic and old workers. Run the migration through the
   gated main-branch CI path and verify the database revision.
4. Promote the matching backend commit, check `/health`, `/health/db`, and
   `/api/auth/oauth/providers`, then let the dependent Pages deployment finish.
5. Verify the exact deployed commit on both platforms and smoke-test sign-in,
   transaction pagination, and import behavior before restoring traffic.

The final revision takes an exclusive lock on `transactions` and atomically
rebuilds six indexes. Reads and writes wait until commit. Its local synthetic
timing is not a production downtime estimate; budget the complete migration
transaction using the rehearsal.

After version-2 import fingerprints have been written, use a forward corrective
release or restore the application and database together. Rolling back only the
backend can reintroduce incompatible transaction identities.

### ORM schema alignment rollout

`orm_schema_alignment_2026` follows `domain_storage_cutover_2026`. It sets
NOT NULL on the 118 columns migrations left nullable (plus
`import_logs.user_id` where an older revision left it nullable), adds 10
missing indexes, and drops duplicate indexes, changing only what differs from
the ORM. A NULL count runs first and fails closed: any NULL stops the revision
before a change, and nothing is backfilled or deleted. Current backends
already write every tightened value, so the normal backend-first promotion is
safe. PostgreSQL holds ACCESS EXCLUSIVE locks on the affected tables with a
10s lock timeout, so a busy table fails the migration instead of queueing
traffic; rehearse on a Neon branch copied from production. The revision is
irreversible: recover with a verified restore point or a forward repair.

### 2.31.0 feature tables rollout

`feature_domains_2026`
([20261027_1000_feature_domains.py](../backend/src/ledger_sync/db/migrations/versions/20261027_1000_feature_domains.py))
follows `money_manager_source_2026` and creates 14 tables: `balance_checks`, `bank_alerts`, `category_overrides`, `external_refs`,
`foreign_asset_events`, `rsu_vest_fx`, `mf_holdings`, `mf_transactions`,
`mf_nav_prices`, `push_subscriptions`, `saved_view_pins`, `tax_ais_summaries`,
`tax_deductions` and `transaction_embeddings`. No older backend names any of
them, so the revision is expand-only: the running backend works before and
after it.

- On PostgreSQL it sets a 10 s lock timeout and, while `transaction_embeddings`
  is still to be created, runs `CREATE EXTENSION IF NOT EXISTS vector`. The
  pending revisions run in one transaction, so a failed run changes nothing. If
  the migrate job stops at that statement, run
  `CREATE EXTENSION IF NOT EXISTS vector;` once in the Neon SQL editor and rerun
  the workflow; the revision is safe to rerun.
- A table that already exists with the expected columns (a `create_all`
  bootstrap) is skipped. Any other shape stops the revision before a change.
- The revision is irreversible. Recover with a verified restore point or a
  forward repair, as in [DATABASE.md](DATABASE.md).
- Vercel can serve the new backend minutes before the CI `migrate` job (see the
  Deployment Check above). Until then the routes that store or read the new
  tables fail with HTTP 500: balance checks, bank alerts, the Review Queue, tax
  deductions and AIS totals, RSU conversions, mutual fund holdings, pinned
  watch tiles, push devices and semantic search. Everything else works.
  Account reset and deletion skip a table that does not exist yet
  (`_delete_if_migrated` in `services/auth_account_data.py`), and the Review
  Queue replay on import and the Money Manager repeat-rule and budget import
  check for their tables first. With the Deployment Check set, Vercel holds the
  deployment until the revision is applied, so no such window opens.
- Recurring amount edits also need `recurring_transactions.user_expected_amount`,
  added by `recurring_user_amount_2026` in 2.28.0; the backend now reads and
  writes it.

### AI configuration and encryption rollout

Apply `ai_usage_reservations_2026` and subsequent revisions before promoting
the new backend. Reservations enforce message and token budgets across workers
through database row locks. Shared per-minute account and IP rates additionally
require distributed SlowAPI storage; process-local storage cannot enforce a
global limit across Vercel instances. Configure and verify that storage before
claiming global per-minute enforcement.

Drain old workers before allowing new workers to write v3 encrypted API keys.
Old code cannot read the new envelope. Retain previous encryption key material
until every stored value has been successfully rewrapped and verified. Normal
key reveal and Bedrock use can rewrap authenticated legacy values; controlled
rotation uses `rewrap_api_key(previous_keys=...)`. A code rollback after v3
writes must retain a reader that understands v3, or restore a coordinated
application and database backup.

Clients may omit `api_key`, or send null, for a model/region-only settings save.
This preserves a key only when the provider is unchanged and the stored key is
usable. A provider change requires a new key; a concurrent replacement returns
409 and requires reloading settings. Explicit key removal uses DELETE.

## Vercel Backend

The Vercel project root must be `backend`.

`backend/vercel.json`:

- pins the function region to `sin1`
- routes every request to `api/index.py`
- sets `maxLambdaSize` to `50mb` on the legacy `builds` entry (see
  [Function size](#function-size))
- schedules the daily push alert run in `crons` (see
  [Optional phone alerts](#optional-phone-alerts-web-push))

`api/index.py` imports the FastAPI ASGI `app`. Vercel's Python runtime serves
the ASGI app directly, so the application lifespan runs in production (the old
Mangum Lambda shim was removed in 2.27.0).

What the build log shows ("Installing required dependencies from uv.lock",
"Using Python 3.14 from backend/pyproject.toml"):

- Dependencies come from `backend/uv.lock`. There is no `requirements.txt`.
- The Python version comes from `requires-python` in `backend/pyproject.toml`,
  pinned to one minor version so it matches CI. Change both together.
- Because `vercel.json` uses the `builds` key, Vercel ignores the project's
  Build and Development Settings ("the Build and Development Settings defined
  in your Project Settings will not apply"). Environment variables still apply.

After changing Vercel environment values, redeploy the backend so the function
receives the new configuration.

### Function size

Vercel builds Python functions up to 250 MB as a standard bundle. Past that it
"optimizes dependencies", and on 2026-10-27 that optimized bundle failed every
request with `FUNCTION_INVOCATION_FAILED`: the first 2.31.0 build measured
283.6 MB. The CAS import's `casparser` brings `casparser-isin` (an ISIN database
of about 49 MB), `pypdfium2` (about 8 MB) and `rapidfuzz` (about 6 MB), so it
is now the optional `cas` extra in `backend/pyproject.toml`, which the Vercel
install leaves out. The production dependencies without it come to about
229 MB for Linux, so there is roughly 20 MB of headroom; check the
`Bundle size` line of the Vercel build log whenever a dependency is added.

Without the extra, `POST /api/upload/cas` answers 503 with a plain message and
the rest of Investment Analytics, saved holdings included, works as before.
CI, local development and the CLI install it with `--all-extras` (or
`uv sync --extra cas`). To offer CAS import on the hosted backend, move the CAS
routes (`api/cas_upload.py`) into their own function with that extra, so the
main API stays under the standard size.

### Token-authenticated routes

Automations use `lsu_` access tokens created in Settings > Advanced > Access
Tokens. A token holds one scope and reaches only that scope's route; none can
sign in or call any other API route. A user can hold five active tokens per
scope, and a token expires after a year.

| Scope | Only route | Used by |
| --- | --- | --- |
| `mmbak:upload` | `POST /api/upload/money-manager` | iOS Shortcut that uploads a Money Manager backup |
| `ledger:read` | `POST /mcp` (no `/api` prefix) | Claude Code, through the read-only MCP server |
| `alerts:ingest` | `POST /api/ingest/text` | Automation that forwards bank alert SMS or email text |

`POST /mcp` serves MCP over streamable HTTP with one JSON response per POST: no
session, no stream and no OAuth, so claude.ai web connectors cannot use it and
clients that send an `Authorization` header, such as Claude Code, can. It
answers protocol 2026-07-28 and the legacy 2025-11-25, 2025-06-18 and
2025-03-26 handshake. Its tools are the in-app assistant's 15 read-only tools
plus `get_today`, run in a transaction that cannot write. Settings shows this
command with the new token filled in:

```bash
claude mcp add --transport http ledger-sync https://ledger-sync-api.vercel.app/mcp --header "Authorization: Bearer <token>"
```

The route refuses a browser `Origin` outside the CORS allowlist with 403 (Claude
Code sends none), caps a body at 64 KiB (413), and limits each token to 60
calls a minute and 1,000 an hour, plus 120 a minute per IP, counted before the
token lookup. What Claude reads goes to the user's own Claude account. The
alert inbox limits each token to 30 requests a minute and 500 a day, plus 60 a
minute per IP, and stores at most 500 new alerts per user in any 24 hours,
enforced in the database. Like every SlowAPI limit here, the per-minute and
per-day counters live in each serverless instance's memory (see
[AI configuration and encryption rollout](#ai-configuration-and-encryption-rollout)),
so treat them as best effort.

### Health checks

```powershell
curl.exe --fail https://ledger-sync-api.vercel.app/health
curl.exe --fail https://ledger-sync-api.vercel.app/health/db
curl.exe --fail https://ledger-sync-api.vercel.app/api/auth/oauth/providers
```

Expected behavior:

- `/health` returns the release version from `ledger_sync.__version__`.
- `/health/db` returns a connected database result.
- `/api/auth/oauth/providers` returns HTTP 200 and a JSON array.
- An empty provider array means no OAuth provider is configured.

The keepalive workflow is disabled in GitHub (`disabled_manually`; last run
2026-05-20), so nothing pings production on a schedule and Neon suspends when
idle. The workflow file remains: when enabled, it calls `/health/db` every 30
minutes, retries failures twice, then fails with an Actions error annotation.
Even then Neon may suspend between checks; it does not guarantee a warm
database or replace application monitoring. Re-enabling it is the owner's call
(Actions > keepalive > Enable workflow).

## GitHub Pages Frontend

Repository settings:

| Setting | Required value |
| --- | --- |
| Pages source | GitHub Actions |
| Actions variable `VITE_API_BASE_URL` | Vercel backend origin |

After CI and database migrations pass for the same commit, the deployment workflow:

1. Installs the pnpm version pinned in the root `packageManager` field.
2. Uses Node.js 24.
3. Installs the frozen frontend lockfile with dependency lifecycle scripts
   disabled (`--frozen-lockfile --ignore-scripts`).
4. Builds with `GITHUB_PAGES=true`.
5. Copies `index.html` to `404.html`.
6. Waits up to ten minutes for `/health` to report the frontend package version
   and for `/health/db` to report a connected database.
7. Publishes `frontend/dist`.

If the backend is not ready, the workflow fails before publishing and the
previous Pages deployment remains active. This is a release-version and health
check, not a commit identity check; verify the intended Vercel commit separately.

The `404.html` copy allows direct navigation to React Router paths on GitHub
Pages. `BrowserRouter` uses `import.meta.env.BASE_URL`, so every route remains
under `/ledger-sync/`.

## OAuth Production Setup

Register these exact callback URLs:

| Provider | Callback |
| --- | --- |
| Google | `https://sagargupta.online/ledger-sync/auth/callback/google` |
| GitHub | `https://sagargupta.online/ledger-sync/auth/callback/github` |

GitHub permits one callback URL per OAuth app, so use separate local and
production apps.

The backend creates a 10-minute HMAC-signed OAuth state value. The frontend
includes it in the provider redirect, and the backend validates it before
exchanging the authorization code.

## Release Flow

1. Push a feature branch.
2. Open a pull request to `main`.
3. Wait for frontend, GitHub Pages build, backend, security, and PostgreSQL
   migration checks to pass.
4. Review any schema or environment changes.
5. Merge only when required checks are green.

After merge:

- Main CI validates the merged commit, then applies any pending migrations.
- Promote the Vercel backend after CI and migrations pass. Automatic Vercel
  promotion needs the `migrate / migrate` Deployment Check described above.
- GitHub Pages publishes that same commit only after the backend readiness
  check succeeds.

Do not push release changes directly to `main`.

## Post-Deployment Verification

Verify the backend first:

```powershell
curl.exe --fail https://ledger-sync-api.vercel.app/health
curl.exe --fail https://ledger-sync-api.vercel.app/health/db
curl.exe --fail https://ledger-sync-api.vercel.app/api/auth/oauth/providers
```

Then verify the frontend:

1. Open `https://sagargupta.online/ledger-sync/`.
2. Open the sign-in dialog and confirm configured provider buttons appear.
3. Complete one OAuth sign-in.
4. Refresh a protected nested route directly.
5. Open Demo and confirm the dashboard renders without backend writes.
6. Check phone and desktop layouts.
7. Confirm the browser console has no uncaught errors.

For a schema release, also confirm the migration workflow completed and
`/health/db` remains healthy.

For 2.31.0, also:

- Read the function size in the Vercel build log
  ([Function size](#function-size)).
- Confirm the migrate job log shows `feature_domains_2026`.
- Confirm `/api/push/run-due` is listed under Settings > Cron Jobs and trigger
  it once, as described under
  [Optional phone alerts](#optional-phone-alerts-web-push).
- Open Transactions and Settings > Notifications signed in. The Smart search
  card and the alerts panel report their status, or what is missing, instead of
  an error.
- Optionally create a `ledger:read` token, run the command from its dialog, and
  ask Claude Code for one number from the ledger.

## Sign-In Incident Runbook

The message "Couldn't reach the sign-in service" means the frontend did not
receive a valid provider response. It does not by itself prove a migration
problem.

Check in this order:

1. `GET /health`
2. `GET /health/db`
3. `GET /api/auth/oauth/providers`
4. Vercel function logs
5. The deployed frontend request URL in browser Network tools
6. `VITE_API_BASE_URL` in GitHub Actions variables
7. `LEDGER_SYNC_FRONTEND_URL` and OAuth callback registration
8. CORS origin configuration

Interpretation:

- `/health` fails: backend deployment, startup configuration, or platform
  availability is the first problem.
- `/health` works but `/health/db` fails: investigate Neon connectivity.
- Provider endpoint returns `[]`: configure an OAuth provider.
- Provider endpoint works directly but the browser request fails: investigate
  the compiled API base URL or CORS.
- Provider endpoint returns 500: inspect Vercel logs and startup settings.

If a variable was corrected, redeploy the affected service. A GitHub Actions
variable change requires a frontend rebuild; a Vercel variable change requires
a backend redeploy.

## Rollback

### Frontend

Revert the frontend change through a reviewed pull request, then let CI run the
normal migration and Pages sequence. A code revert does not revert the database.

### Backend

Promote a known-good Vercel deployment or revert the application change through
a new pull request. After `feature_domains_2026` the previous backend keeps
working, because it names none of the new tables.

### Database

Unsupported historical downgrades raise an error. Alembic preflights the entire
rollback plan before applying its first step, including when an earlier step
would otherwise be reversible. The version marker is not moved to imply a
recovery that did not happen.

Restore a verified pre-migration backup into an isolated database first, validate
its data and schema, then coordinate the application and database cutover.
Alternatively, ship a tested forward repair. Do not use `alembic stamp` to hide
a failed migration, and do not delete conflicting users or change financial
amounts merely to make a constraint pass.

## Security Checks

Before every production release:

- Confirm no `.env` file is staged.
- Confirm no secret value appears in the diff.
- Keep production source maps disabled.
- Keep CORS restricted to explicit origins.
- Keep `LEDGER_SYNC_JWT_SECRET_KEY` and
  `LEDGER_SYNC_ENCRYPTION_KEY` separate.
- Keep `LEDGER_SYNC_VAPID_PRIVATE_KEY`, `CRON_SECRET` and every `lsu_` token out
  of Git, logs and chat, and delete `ledger-sync-push-keys.txt` once the values
  are in Vercel.
- Rotate a credential immediately if it appears in logs, Git history, or a
  public artifact.
