# Deployment Guide

Current for Ledger Sync 2.24.1.

## Production Topology

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
GitHub Pages workflow, for the same commit. Vercel's external GitHub integration
must be configured or promoted separately to respect that gate.

## Deployment Sources

| Concern | Source of truth |
| --- | --- |
| Frontend build | `.github/workflows/deploy-frontend.yml` |
| Backend routing | `backend/vercel.json` |
| Backend entry point | `backend/api/index.py` |
| Database migration | `.github/workflows/migrate.yml` |
| Scheduled health ping | `.github/workflows/keepalive.yml` |
| Runtime settings | `backend/src/ledger_sync/config/settings.py` |
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
| `PYTHON_VERSION` | `3.13` in Vercel project settings |

At least one OAuth client pair is required for sign-in:

- `LEDGER_SYNC_GOOGLE_CLIENT_ID`
- `LEDGER_SYNC_GOOGLE_CLIENT_SECRET`
- `LEDGER_SYNC_GITHUB_CLIENT_ID`
- `LEDGER_SYNC_GITHUB_CLIENT_SECRET`

Optional AI settings:

| Variable | Default | Purpose |
| --- | --- | --- |
| `LEDGER_SYNC_BEDROCK_API_KEY` | unset | Server credential for app Bedrock mode |
| `LEDGER_SYNC_AI_DEFAULT_BEDROCK_MODEL` | Haiku 4.5 model ID | App-mode model |
| `LEDGER_SYNC_AI_DEFAULT_BEDROCK_REGION` | `us-east-1` | Bedrock region |
| `LEDGER_SYNC_AI_DAILY_MESSAGE_LIMIT` | `10` | Per-user daily app-mode cap |
| `LEDGER_SYNC_AI_MAX_TOOL_ROUNDS` | `6` | Tool rounds per message |

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

The application normalizes `postgresql://` and
`postgresql+psycopg2://` URLs to the psycopg 3 driver.

The `LEDGER_SYNC_DATABASE_URL` GitHub Actions secret must use Neon's direct
connection endpoint for migrations. The Vercel value with the same name uses
the pooler for application traffic. Do not expose either value in logs.

### Migration workflow

`ci.yml` runs the frontend, backend, security, and PostgreSQL migration checks.
On `main`, only a successful set of checks calls `migrate.yml`, which uses the
`production` environment and Python 3.13. Only a successful migration calls
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
It does not use containers or alter a pre-existing database service.
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

Vercel's GitHub integration is outside this job graph. For a schema release,
configure production promotion to wait for this commit's CI and migrations, or
promote the validated backend deployment manually. Until that external gate is
configured, use backward-compatible expand-and-contract changes:

1. Add backward-compatible schema.
2. Deploy code that can use both old and new states.
3. Backfill where needed.
4. Remove old schema in a later release.

See [DATABASE.md](DATABASE.md) and the
[migration notes](../backend/src/ledger_sync/db/migrations/MIGRATION_NOTES.md).

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
- allows a 50 MB function bundle

`api/index.py` imports the FastAPI ASGI `app` and also exposes a Mangum
`handler`. Vercel's Python runtime serves the ASGI app directly, so the
application lifespan runs in production and the Mangum shim only matters for an
AWS Lambda target. Vercel installs the locked Python environment through uv.

After changing Vercel environment values, redeploy the backend so the function
receives the new configuration.

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

The scheduled keepalive calls `/health/db` every 30 minutes, which executes a
database query. It retries failures twice, then fails with an Actions error
annotation. Neon may still suspend between checks; this does not guarantee a
warm database or replace application monitoring.

## GitHub Pages Frontend

Repository settings:

| Setting | Required value |
| --- | --- |
| Pages source | GitHub Actions |
| Actions variable `VITE_API_BASE_URL` | Vercel backend origin |

After CI and database migrations pass for the same commit, the deployment workflow:

1. Installs pnpm 11.17.0 from the root `packageManager` field.
2. Uses Node.js 24.
3. Installs the frozen frontend lockfile with dependency lifecycle scripts
   disabled (`--frozen-lockfile --ignore-scripts`).
4. Builds with `GITHUB_PAGES=true`.
5. Copies `index.html` to `404.html`.
6. Publishes `frontend/dist`.

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
3. Wait for frontend, backend, security, and PostgreSQL migration checks to pass.
4. Review any schema or environment changes.
5. Merge only when required checks are green.

After merge:

- Main CI validates the merged commit, then applies any pending migrations.
- GitHub Pages publishes that same commit only after migration success.
- Promote the Vercel backend after those gates. Automatic Vercel deployment
  needs the separately configured protection described above.

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
a new pull request.

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
- Rotate a credential immediately if it appears in logs, Git history, or a
  public artifact.
