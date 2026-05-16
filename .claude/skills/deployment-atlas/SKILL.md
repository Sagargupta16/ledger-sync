---
description: Deployment topology, env-var contract, CI/CD wiring, and the operational gotchas of ledger-sync's free-tier stack (GitHub Pages + Vercel serverless + Neon Postgres). Loads when Claude works on workflows, vercel.json, settings, deploy scripts, or anything operations-adjacent. Use when adding an env var, debugging a CI failure, planning a migration, or wondering why a thing is structured serverless-first.
user-invocable: false
paths:
  - ".github/workflows/**"
  - ".github/renovate.json"
  - "backend/vercel.json"
  - "backend/api/**"
  - "backend/src/ledger_sync/config/settings.py"
  - "backend/alembic.ini"
  - "frontend/vite.config.ts"
  - ".pre-commit-config.yaml"
---

# Deployment atlas

Three free-tier services, single-developer scale. Architecture optimized for "no ops".

## Topology

```
Frontend                              Backend                          Database
┌──────────────────────────┐          ┌──────────────────────────┐    ┌──────────────────────────┐
│ GitHub Pages (static)    │          │ Vercel Serverless         │    │ Neon PostgreSQL 17       │
│ sagargupta.online/       │  /api    │ ledger-sync-api.         │    │ Singapore region         │
│   ledger-sync/           │ ───────► │   vercel.app             │───►│ Free tier (0.5 GB)       │
│ Vite build → static SPA  │  JWT     │ Mangum (ASGI → Lambda)   │    │ Idles after 5min         │
│ PWA installable          │          │ Region: sin1             │    │ PgBouncer pooler         │
│ Auto-deploy on main      │          │ Auto-deploy on main      │    │                          │
└──────────────────────────┘          └──────────────────────────┘    └──────────────────────────┘
```

**Why this stack:** zero infrastructure cost, no orchestration, scales to 0 when idle. Tradeoff: serverless cold starts (~1–2s first request), 10s Hobby timeout, no persistent in-memory state across invocations.

## Frontend deploy ([.github/workflows/deploy-frontend.yml](.github/workflows/deploy-frontend.yml))

- Trigger: push to `main`
- `pnpm install` → `pnpm run build` with env:
  - `GITHUB_PAGES=true` (sets Vite `base: '/ledger-sync/'`)
  - `VITE_API_BASE_URL` from GitHub Actions repo variable → points at Vercel backend
- `cp dist/index.html dist/404.html` — GitHub Pages serves 404.html for unknown paths, which lets the SPA route handle them
- Deploy via `actions/deploy-pages`

**Subpath gotcha:** PWA manifest scope is `.` (relative) and Vite `base: '/ledger-sync/'` so all assets resolve under the subpath. If you change the deployed path, both have to update.

## Backend deploy

- Vercel detects `uv.lock` and uses `uv` to install
- [`backend/vercel.json`](backend/vercel.json) routes `/*` → `api/index.py`
- `backend/api/index.py` wraps FastAPI via **Mangum** (ASGI-to-Lambda adapter)
- Region: `sin1` (Singapore)
- `maxLambdaSize: 50MB` — accounts for pandas + openpyxl + boto3 weight
- Env vars set in Vercel dashboard (see "Required env vars" below)

**Cold-start cost:** ~1–2s on first request after idle. Acceptable for a personal dashboard, painful for streaming. This is the reason Bedrock chat is non-streaming (Mangum buffers, see `api/ai_chat.py` docstring).

## Database deploy

- Neon free tier in Singapore region, ~0.5 GB
- Connection limited (~5 concurrent recommended; pool settings respect this)
- Auto-idles after 5 minutes (next query wakes it, ~1s warmup)
- Connection string mandatory params:
  - `?sslmode=require` (required by Neon)
  - **NOT** `channel_binding=require` (PgBouncer doesn't support it)
- Connect via `LEDGER_SYNC_DATABASE_URL` — `postgresql+psycopg2://` and `postgresql://` both auto-mapped to `postgresql+psycopg://` (psycopg v3) in [`db/session.py`](backend/src/ledger_sync/db/session.py)

**No automated backups configured.** Audit debt — production rollback requires Neon dashboard restore.

## Migrations ([.github/workflows/migrate.yml](.github/workflows/migrate.yml))

- Trigger: push to `main` AND changes match `backend/alembic/**` OR `backend/src/ledger_sync/db/_models/**`
- `uv sync --no-group dev` (skip dev tooling in prod)
- `alembic upgrade head` against `LEDGER_SYNC_DATABASE_URL` (GitHub Actions secret)
- **All migrations have empty `downgrade()` since 2026-02-03.** Recovery is via Neon backup, not down-migration. Use the **new-migration** skill when adding migrations.

**26 migrations** in `backend/src/ledger_sync/db/migrations/versions/` as of writing.

## CI ([.github/workflows/ci.yml](.github/workflows/ci.yml))

Runs on push + PR. Sequential gates:
1. `uv sync` + `pnpm install`
2. Lint: `ruff check` + `eslint`
3. Type-check: `mypy src/` strict + `tsc -b --noEmit`
4. Test: `pytest tests/` + `vitest run`
5. Build: Vite production build with placeholder `VITE_API_BASE_URL`
6. **Backend dependency audit:** `uv run pip-audit --ignore-vuln CVE-2026-3219` (pip itself; not runtime)

**Action versions are pinned to commit SHAs** for supply-chain hardening. Don't loosen to tags.

**Pre-commit** ([`.pre-commit-config.yaml`](.pre-commit-config.yaml)): runs the same lint/format/type-check locally on every commit. CI is the safety net, not the only check.

## Required production env vars

Settings type-checked via Pydantic BaseSettings in [`config/settings.py`](backend/src/ledger_sync/config/settings.py). All prefixed `LEDGER_SYNC_*`.

**Must-set in production:**
| Var | Purpose | Constraint |
|---|---|---|
| `LEDGER_SYNC_JWT_SECRET_KEY` | HS256 signing key | ≥32 chars; auto-gen 48-char in dev |
| `LEDGER_SYNC_DATABASE_URL` | Neon connection string | Postgres only — SQLite blocked in non-dev |
| `LEDGER_SYNC_FRONTEND_URL` | OAuth callback origin | dev: localhost:5173 ; prod: app domain |
| `LEDGER_SYNC_GOOGLE_CLIENT_ID` + `_SECRET` | Google OAuth | Per environment (dev + prod registered separately) |
| `LEDGER_SYNC_GITHUB_CLIENT_ID` + `_SECRET` | GitHub OAuth | Same |
| `LEDGER_SYNC_BEDROCK_API_KEY` | AWS Bedrock | Auto-bridged to `AWS_BEARER_TOKEN_BEDROCK` |
| `LEDGER_SYNC_ENVIRONMENT` | `production` triggers validators | Default `development` |

**Optional with sensible defaults:**
- `LEDGER_SYNC_AI_DAILY_MESSAGE_LIMIT` (default 10) — app_bedrock cap
- `LEDGER_SYNC_AI_MAX_TOOL_ROUNDS` (default 6)
- `LEDGER_SYNC_AI_DEFAULT_BEDROCK_MODEL` (default Haiku 4.5)
- `LEDGER_SYNC_AI_DEFAULT_BEDROCK_REGION` (default us-east-1)
- `LEDGER_SYNC_DB_POOL_SIZE` (5) / `_MAX_OVERFLOW` (3) / `_POOL_RECYCLE_SECONDS` (300) / `_CONNECT_TIMEOUT_SECONDS` (10) / `_STATEMENT_TIMEOUT_SECONDS` (30) / `_IDLE_TRANSACTION_TIMEOUT_SECONDS` (60)
- `LEDGER_SYNC_CORS_ORIGINS` (JSON array; defaults include localhost)
- `LEDGER_SYNC_MAX_UPLOAD_SIZE_BYTES` (50 MB)

**Production validator** in `config/settings.py:110-139` blocks startup if JWT secret <32 chars or SQLite in non-dev environment.

## Renovate ([.github/renovate.json](.github/renovate.json))

- Monthly grouped updates (Asia/Kolkata timezone)
- Auto-merge minor + patch
- Major bumps require manual approval
- Single PR per category to avoid noise

## OAuth caveat

OAuth redirect URIs must be registered separately per environment:
- **Google**: each redirect URI must be in the OAuth client's allowed list
- **GitHub**: each OAuth App allows exactly one callback URL — usually you create separate apps for dev and prod

CORS origins must match the registered redirect's host.

## Observability gaps

- **No Sentry** wired (debt #7 from audit)
- **No metrics collection** (no Prometheus, no StatsD)
- **File-based logging only** — `utils/logging.py` writes to `logs/main.log` and `logs/analytics.log` with rotation. Vercel doesn't persist files across cold starts, so file logs are useless on Vercel; only console output reaches Vercel's log dashboard.
- **`error_id` correlation** — catch-all handler in `api/main.py` returns `error_id = secrets.token_hex(8)` so a user can quote it; backend logs the same id. Useful but only if you have access to backend logs.
- Health endpoints: `GET /health`, `GET /health/db`

## What ships, what doesn't

**Ships in repo (committed):**
- `.github/workflows/` — CI, deploys, migrations, codeql, renovate config
- `backend/vercel.json`
- `frontend/vite.config.ts`
- `.pre-commit-config.yaml`
- `.claude/settings.json` + `.claude/skills/` (committed since 2.10.0; per-user `.claude/settings.local.json` ignored)

**Does not ship:**
- `.env`, `.env.local` (gitignored)
- `backend/ledger_sync.db` (dev SQLite; gitignored)
- Vercel dashboard secrets
- GitHub Actions secrets

## When something breaks

- **Frontend not loading?** Check `gh run list -w deploy-frontend.yml`. Subpath usually the culprit (`base` mismatch).
- **Backend 503?** Check Vercel logs — usually Neon cold-wake or pool exhaustion.
- **Migration failed in CI?** Migrations PR did NOT merge. Production schema is unchanged. Fix migration, push amended PR.
- **Renovate spam?** Bump groupings in `.github/renovate.json`.
- **OAuth redirect mismatch?** Provider OAuth app config doesn't match `LEDGER_SYNC_FRONTEND_URL`.
