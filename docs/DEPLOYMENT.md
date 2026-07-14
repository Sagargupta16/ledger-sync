# Deployment Guide

Current for Ledger Sync 2.22.0.

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

The frontend and backend deploy from `main`. Database schema changes run
through a separate GitHub Actions migration workflow.

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

The production database URL must also exist as the
`LEDGER_SYNC_DATABASE_URL` GitHub Actions secret so the migration workflow can
connect.

### Migration workflow

The workflow runs on pushes to `main` that change:

- `backend/alembic/**`
- `backend/src/ledger_sync/db/migrations/**`
- `backend/src/ledger_sync/db/models.py`
- `backend/src/ledger_sync/db/_models/**`

It can also be run manually.

The current migration head is `tags_rules_views_2026`. Migrations from
2026-02-03 onward intentionally have no automatic downgrade. Take a database
backup before a destructive or high-risk migration and prefer a forward repair
revision.

Because Vercel deployment and the migration workflow can run concurrently,
schema changes must use an expand-and-contract sequence:

1. Add backward-compatible schema.
2. Deploy code that can use both old and new states.
3. Backfill where needed.
4. Remove old schema in a later release.

See [DATABASE.md](DATABASE.md) and the
[migration notes](../backend/src/ledger_sync/db/migrations/MIGRATION_NOTES.md).

## Vercel Backend

The Vercel project root must be `backend`.

`backend/vercel.json`:

- pins the function region to `sin1`
- routes every request to `api/index.py`
- allows a 50 MB function bundle

`api/index.py` wraps the FastAPI application with Mangum. Vercel installs the
locked Python environment through uv.

After changing Vercel environment values, redeploy the backend so the function
receives the new configuration.

### Health checks

```powershell
curl.exe --fail https://ledger-sync-api.vercel.app/health
curl.exe --fail https://ledger-sync-api.vercel.app/health/db
curl.exe --fail https://ledger-sync-api.vercel.app/api/auth/oauth/providers
```

Expected behavior:

- `/health` returns version `2.22.0`.
- `/health/db` returns a connected database result.
- `/api/auth/oauth/providers` returns HTTP 200 and a JSON array.
- An empty provider array means no OAuth provider is configured.

The scheduled keepalive workflow calls `/health` every 30 minutes. It is a
best-effort wake-up request and does not fail the workflow for a transient
backend response.

## GitHub Pages Frontend

Repository settings:

| Setting | Required value |
| --- | --- |
| Pages source | GitHub Actions |
| Actions variable `VITE_API_BASE_URL` | Vercel backend origin |

The deployment workflow:

1. Installs pnpm 11.10.0 from the root `packageManager` field.
2. Uses Node.js 22.
3. Installs the frozen frontend lockfile.
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
3. Wait for frontend, backend, and security checks to pass.
4. Review any schema or environment changes.
5. Merge only when required checks are green.

After merge:

- GitHub Actions builds and deploys the frontend.
- Vercel deploys the backend through its GitHub integration.
- The migration workflow runs only when a watched schema path changed.

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

Redeploy a previously known-good commit through the GitHub Pages workflow.

### Backend

Promote a known-good Vercel deployment or revert the application change through
a new pull request.

### Database

Do not assume `alembic downgrade` is available. Restore the pre-migration
backup or ship a tested forward repair migration. Coordinate code rollback with
the schema state so the previous backend remains compatible.

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
