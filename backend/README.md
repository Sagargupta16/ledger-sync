# Ledger Sync Backend

FastAPI backend for OAuth authentication, JSON transaction ingestion, reconciliation, financial analytics, preferences, planning data, external rate proxies, and the AI assistant.

## Stack

| Area | Technology |
| --- | --- |
| Runtime | Python 3.13+ |
| API | FastAPI |
| ORM | SQLAlchemy 2 |
| Validation | Pydantic 2 |
| Migrations | Alembic |
| Local database | SQLite |
| Production database | Neon PostgreSQL 17 |
| Serverless adapter | Mangum on Vercel |
| Tests | pytest |
| Quality | Ruff and mypy |
| Packaging | uv |

## Quick Start

```bash
uv sync --group dev
uv run alembic upgrade head
uv run uvicorn ledger_sync.api.main:app --reload --port 8000
```

Local endpoints:

- API: `http://localhost:8000`
- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`
- Health: `http://localhost:8000/health`
- Database health: `http://localhost:8000/health/db`

## Responsibilities

- Google and GitHub OAuth with 10-minute HMAC-signed state tokens.
- JWT access and refresh tokens with server-side `token_version` invalidation.
- Authenticated JSON ingestion at `/api/upload`.
- User-scoped transaction reconciliation, tags, saved views, and categorization rules.
- On-demand calculations plus precomputed analytics rollups.
- Preferences, account classifications, budgets, goals, recurring items, and anomaly review.
- Exchange-rate, instrument-rate, and stock-price proxies.
- Fifteen read-only AI tools and AI usage accounting.
- Bedrock Converse proxy for server-side Bedrock authentication.

## Web Import Contract

The browser parses Excel and CSV files. The backend receives:

```json
{
  "file_name": "statement.xlsx",
  "file_hash": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  "force": false,
  "rows": [
    {
      "date": "2026-07-01",
      "amount": 85000,
      "currency": "INR",
      "type": "Income",
      "account": "HDFC Bank",
      "category": "Salary",
      "subcategory": "Monthly",
      "note": "July salary"
    }
  ]
}
```

Requirements:

- JWT bearer authentication.
- Exactly 64 hexadecimal characters in `file_hash`.
- Between 1 and 100,000 rows.
- Non-negative amounts and non-empty account and category values.
- `force=true` only when intentionally reprocessing an already imported file.

The CLI still supports direct Excel and CSV loading through `SyncEngine.import_file()`.

## Source Layout

```text
src/ledger_sync/
  api/                 FastAPI routers and dependencies
    analytics_v2_impl/ Split analytics v2 routers
    ai_tools_impl/     AI tool registry and implementations
  core/                Business rules and calculations
    analytics/         Analytics engine mixins and rollup builders
    auth/              JWT helpers
  db/
    _models/           SQLAlchemy models by domain
    migrations/        Alembic environment and revisions
    models.py          Public model facade
    session.py         Engine and session configuration
  ingest/              CLI loaders, normalization, validation, hashing
  schemas/             Pydantic request and response models
  services/            Cross-cutting services
  config/              Runtime settings
  utils/               Logging and helpers
```

`core/analytics_engine.py` is a compatibility facade. The active analytics implementation lives under `core/analytics/`.

## Security

- All financial queries and mutations are scoped by `user_id`.
- OAuth callbacks require a valid, unexpired signed state.
- Logout increments `token_version`, invalidating outstanding access and refresh tokens.
- API responses include security headers and authenticated data uses `Cache-Control: no-store`.
- CORS uses an explicit allowlist.
- Upload is limited to 10 requests per user per minute and 50 per IP per minute.
- Bedrock chat is limited to 30 requests per user per minute and 60 per IP per minute.
- Current BYOK ciphertexts use AES-256-GCM with HKDF-SHA256 and `LEDGER_SYNC_ENCRYPTION_KEY`.
- Legacy PBKDF2 ciphertexts are read-only compatibility data and are upgraded when revealed.

## Configuration

Environment variables use their full `LEDGER_SYNC_` names.

| Variable | Default | Purpose |
| --- | --- | --- |
| `LEDGER_SYNC_ENVIRONMENT` | `development` | Runtime mode |
| `LEDGER_SYNC_DATABASE_URL` | `sqlite:///./ledger_sync.db` | SQLAlchemy database URL |
| `LEDGER_SYNC_DATABASE_ECHO` | `false` | SQL logging |
| `LEDGER_SYNC_LOG_LEVEL` | `INFO` | Application log level |
| `LEDGER_SYNC_FRONTEND_URL` | `http://localhost:5173` | OAuth callback base |
| `LEDGER_SYNC_CORS_ORIGINS` | Local origins | JSON allowlist |
| `LEDGER_SYNC_JWT_SECRET_KEY` | Generated in development | JWT and OAuth state signing |
| `LEDGER_SYNC_ENCRYPTION_KEY` | JWT key fallback | Dedicated BYOK encryption key |
| `LEDGER_SYNC_GOOGLE_CLIENT_ID` | Empty | Enable Google OAuth |
| `LEDGER_SYNC_GOOGLE_CLIENT_SECRET` | Empty | Google OAuth secret |
| `LEDGER_SYNC_GITHUB_CLIENT_ID` | Empty | Enable GitHub OAuth |
| `LEDGER_SYNC_GITHUB_CLIENT_SECRET` | Empty | GitHub OAuth secret |
| `LEDGER_SYNC_BEDROCK_API_KEY` | Empty | App-mode Bedrock credential |
| `LEDGER_SYNC_DB_POOL_SIZE` | `5` | PostgreSQL pool size |
| `LEDGER_SYNC_DB_MAX_OVERFLOW` | `3` | PostgreSQL overflow connections |

See [.env.example](../.env.example) for the complete template.

## Quality Checks

```bash
uv run ruff check src/ tests/
uv run ruff format --check src/ tests/
uv run mypy src/
uv run pytest tests/ -v
```

The current backend suite contains 328 tests.

## Migrations

```bash
uv run alembic revision --autogenerate -m "describe change"
uv run alembic upgrade head
```

Read [MIGRATION_NOTES.md](src/ledger_sync/db/migrations/MIGRATION_NOTES.md) before attempting a downgrade. Several recent revisions intentionally have no schema-reversing downgrade.

## Deployment

Production runs on Vercel through `api/index.py` and `vercel.json`, with Neon PostgreSQL behind the PgBouncer pooler. Database migrations are applied by `.github/workflows/migrate.yml`.

See [docs/DEPLOYMENT.md](../docs/DEPLOYMENT.md) and [docs/API.md](../docs/API.md).
