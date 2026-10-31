---
paths:
  - ".github/**"
  - "backend/vercel.json"
  - "backend/api/**"
  - "backend/pyproject.toml"
  - "backend/uv.lock"
  - "backend/alembic.ini"
  - "backend/src/ledger_sync/config/**"
  - "backend/src/ledger_sync/db/migrations/**"
  - "backend/src/ledger_sync/db/_models/**"
  - "backend/src/ledger_sync/db/session.py"
  - "backend/src/ledger_sync/api/cas_upload.py"
  - "backend/src/ledger_sync/api/oauth*.py"
  - "backend/src/ledger_sync/api/push.py"
  - "frontend/vite.config.ts"
  - "docs/DEPLOYMENT.md"
  - "**/.env.example"
---

# Deployment and CI

Moved verbatim from the repo `CLAUDE.md` on 2026-10-31; repo-wide rules stay there. Paths and links below are relative to the repo root.
The hosted service table (Pages, Vercel, Neon) stays in `CLAUDE.md`.

## Architecture

### Deployment

- **Frontend deployment** is called from CI on `main` after frontend, backend, native PostgreSQL, and security checks, then the production migration job. `.github/workflows/deploy-frontend.yml` builds with `GITHUB_PAGES=true` (Vite `base: '/ledger-sync/'`) and copies `index.html` to `404.html` for SPA routing. `VITE_API_BASE_URL` is a repository variable pointing to the backend.
- **Backend deployment** uses Vercel's Git integration, outside the GitHub Actions migration/Pages dependency chain. Coordinate schema-compatible releases using [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md). Vercel installs from `uv.lock`; `backend/vercel.json` routes to `api/index.py`, which exposes the FastAPI ASGI `app` (no Mangum; Vercel serves ASGI directly). It also carries the daily push cron (`GET /api/push/run-due`, `0 3 * * *`, gated by `CRON_SECRET`) and `maxLambdaSize: 50mb` on a legacy `builds` entry. Vercel's standard Python bundle stops at 250 MB: the first 2.31.0 build measured 283.6 MB and its "optimized" bundle failed every request (2026-10-27), so casparser and pypdfium2 are the optional `cas` extra in `backend/pyproject.toml`, which the Vercel install leaves out (about 229 MB, roughly 20 MB of headroom; read the `Bundle size` line of the build log after adding a dependency). CI and local installs keep it through `--all-extras`. Hosted CAS import stays off until `api/cas_upload.py` gets its own function ([`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) "Function size"). The reusable migration workflow uses Python 3.14 and runs `alembic upgrade head` after checks. CI verifies empty SQLite bootstrap and native PostgreSQL migrations separately.
- **Vercel config** is defined in `backend/vercel.json`. Root directory is set to `backend` in Vercel project settings. Env vars (secrets) are set in the Vercel dashboard. The Neon database is connected via Vercel's Neon integration (Storage tab).
- **Neon connection string** must use the pooler URL with `?sslmode=require` and must NOT include `channel_binding=require` (PgBouncer doesn't support it).
- **OAuth redirect URIs** must be registered separately per environment (dev vs prod) -- GitHub only allows one callback URL per OAuth app.
- **JWT secret** is auto-generated in development. In production, `LEDGER_SYNC_JWT_SECRET_KEY` must be set (min 32 chars) or the app refuses to start.
- **Migration `feature_domains_2026`** adds 14 expand-only tables and, on PostgreSQL, `CREATE EXTENSION IF NOT EXISTS vector` (Neon ships pgvector). Vercel can serve the code before CI migrates: routes on the new tables answer 500 until then, and import and reset paths guard with `has_table`.

### CI Pipeline (`.github/workflows/ci.yml`)

Check jobs run on push/PR and manual dispatch: `frontend` (shared `node-ci.yml`,
Node 24), `frontend-pages-build` (the GitHub Pages build exactly as
`deploy-frontend.yml` runs it: `--ignore-scripts` install, `GITHUB_PAGES=true`,
404 copy), `backend` (locked wheel-only `uv sync`, Ruff, format check, mypy,
pytest, then empty SQLite `alembic upgrade head` and `alembic check` on the same
file, Python 3.14), `postgres-migrations` (installs pgvector, then an isolated native PostgreSQL:
integration suites, then a CLI `alembic upgrade head` and `alembic check`), and
`security` (shared scan). `alembic check` passes because `migrations/env.py`
filters only the documented dialect noise by exact name. On non-PR `main` runs,
the reusable `migrate` job needs all five check jobs (`frontend`,
`frontend-pages-build`, `backend`, `postgres-migrations`, `security`) and gates
Pages deployment. No hosted deployment result is implied by a local check.
