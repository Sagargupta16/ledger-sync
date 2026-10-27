# Ledger Sync Backend

FastAPI backend for OAuth authentication, JSON transaction ingestion, reconciliation, financial analytics, preferences, planning data, external rate proxies, and the AI assistant.

## Stack

| Area | Technology |
| --- | --- |
| Runtime | Python 3.14 |
| API | FastAPI |
| ORM | SQLAlchemy 2 |
| Validation | Pydantic 2 |
| Migrations | Alembic |
| Local database | SQLite |
| Production database | Neon PostgreSQL 17 |
| Search vectors | pgvector on PostgreSQL; float32 bytes ranked with numpy on SQLite |
| Hosting | Vercel Python runtime, ASGI |
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
- Swagger UI: `http://localhost:8000/docs` (development only)
- ReDoc: `http://localhost:8000/redoc` (development only)
- Health: `http://localhost:8000/health`
- Database health: `http://localhost:8000/health/db`

## Responsibilities

- Google and GitHub OAuth with 10-minute HMAC-signed state tokens.
- JWT access and refresh tokens with server-side `token_version` invalidation.
- Authenticated JSON ingestion at `/api/upload`, Money Manager backups at `/api/upload/money-manager` (with their repeat rules and budgets), and CAS statements at `/api/upload/cas`, read in memory.
- User-scoped transaction reconciliation, tags, saved views, and categorization rules.
- On-demand calculations plus precomputed analytics rollups, and per-request Dashboard reads (`/api/dashboard-metrics`, `/api/weekly-recap`, `/api/safe-to-spend`, `/api/card-cycles`).
- Preferences, account classifications, budgets, goals, recurring items, anomaly review, balance checks, and the Review Queue.
- Ledger data-health diagnostics at `/api/analytics/v2/data-health` and income-classification facets at `/api/calculations/income-facets`.
- Tax records: saved deductions, AIS totals, RSU conversions, and foreign assets. Mutual fund holdings from a CAS, valued at AMFI's latest NAV.
- Exchange-rate, instrument-rate, and stock-price proxies.
- Fifteen read-only AI tools and AI usage accounting, also served over MCP at `POST /mcp` (plus `get_today`) to clients holding a `ledger:read` access token.
- Bedrock Converse proxy for server-side Bedrock authentication, with per-model thinking fields (`api/ai_chat_thinking.py`).
- Opt-in semantic transaction search with Titan Text Embeddings V2.
- Bank alert inbox at `POST /api/ingest/text` (an `alerts:ingest` access token), and Web Push alerts with a daily Vercel cron.

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
- Exactly 64 characters in `file_hash`. The value is the SHA-256 hex digest of the raw file, but only its length is validated.
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
  cli/                 Typer CLI for file-based imports
  ingest/              CLI loaders, normalization, validation, hashing
  schemas/             Pydantic request and response models
  services/            Upload, calculation, dimension, and authentication services
  config/              Runtime settings (settings.py, push_settings.py, embedding_settings.py)
  utils/               Logging and helpers
```

`core/analytics_engine.py` is a compatibility facade. The active analytics implementation lives under `core/analytics/`.

Keep HTTP validation and response mapping in `api/`, workflow coordination in
`services/`, and financial logic in `core/`. `core/import_identity.py` owns
versioned source matching; `core/import_labels.py` owns label canonicalization;
`services/ledger_dimensions.py` resolves dimension IDs in batches. Import
consumers use `ledger_sync.db.models`, the public model facade.

Synchronous database work belongs in synchronous routes or a complete worker
phase. Upload serialization, reconciliation, refresh, and rollback run together
in `services/upload_service.py`. OAuth has separate provider-I/O and database
phases. Provider-only price/rate requests release their authentication session
before awaiting upstream HTTP. Do not share one SQLAlchemy session across
concurrent tasks or carry an idle transaction through slow provider calls.

The transaction API supports signed date cursors alongside offset pagination.
Analytics refreshes track durable input versions and changed dates; unchanged
generations can skip recomputation. See [the database reference](../docs/DATABASE.md)
for identity, ownership, publication, and migration contracts.

`core/ledger_clock.py` is the only source of "now" and "today". It returns naive IST wall-clock values that match the naive `Transaction.date` column, so month and financial-year windows do not slip a period between 18:30 and 24:00 UTC. Never anchor a user-facing window on `datetime.now(UTC)`.

## Security

- All financial queries and mutations are scoped by `user_id`.
- OAuth callbacks require a valid, unexpired signed state.
- Logout increments `token_version`, invalidating outstanding access and refresh tokens.
- API responses include security headers and authenticated data uses `Cache-Control: no-store`.
- CORS uses an explicit allowlist.
- Upload is limited to 10 requests per user per minute and 50 per IP per minute.
- Bedrock chat is limited to 30 requests per user per minute and 60 per IP per minute.
- Automation tokens (`lsu_`) are stored as hashes and hold one scope each: `mmbak:upload`, `ledger:read`, or `alerts:ingest`. A token reaches only its own route, and none can sign in.
- `POST /mcp` runs every tool call in a transaction that cannot write, refuses a browser origin outside the CORS allowlist, caps a body at 64 KiB, and limits each token to 60 calls per minute and 1,000 per hour (120 per minute per IP), counted before the token lookup.
- CAS PDFs are read in memory under a 4.5 MB cap; neither the file nor its password is stored or logged. Push subscriptions accept only https endpoints at the FCM, Mozilla, Apple, and Windows push services.
- Current BYOK ciphertexts use AES-256-GCM with HKDF-SHA256 and `LEDGER_SYNC_ENCRYPTION_KEY`.
- Legacy PBKDF2 ciphertexts are read-only compatibility data and are upgraded when revealed.

## Configuration

Environment variables use their full `LEDGER_SYNC_` names, except `CRON_SECRET`, which keeps the name Vercel reads.

| Variable | Default | Purpose |
| --- | --- | --- |
| `LEDGER_SYNC_ENVIRONMENT` | `development` | Runtime mode |
| `LEDGER_SYNC_DATABASE_URL` | `sqlite:///./ledger_sync.db` | SQLAlchemy database URL |
| `LEDGER_SYNC_DATABASE_ECHO` | `false` | SQL logging |
| `LEDGER_SYNC_DB_BOOTSTRAP_ON_STARTUP` | `false` | Development-only table creation; use Alembic for migrations |
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
| `LEDGER_SYNC_AI_DEFAULT_BEDROCK_MODEL` | `us.anthropic.claude-haiku-5-5` | App-mode model (Claude Haiku 5.5) |
| `LEDGER_SYNC_DB_POOL_SIZE` | `5` | PostgreSQL pool size |
| `LEDGER_SYNC_DB_MAX_OVERFLOW` | `3` | PostgreSQL overflow connections |

See [.env.example](../.env.example) for the complete template.

Two optional features read their own settings classes (`config/push_settings.py` and `config/embedding_settings.py`). Set these as real environment variables, never in `.env`: `Settings` rejects a key it does not declare, so one in that file stops the backend at start-up, and the error echoes the value.

| Variable | Default | Purpose |
| --- | --- | --- |
| `LEDGER_SYNC_VAPID_PUBLIC_KEY`, `LEDGER_SYNC_VAPID_PRIVATE_KEY`, `LEDGER_SYNC_VAPID_SUBJECT` | Empty | VAPID key pair and contact for Web Push; alerts stay off until all three are set |
| `CRON_SECRET` | Empty | Bearer secret Vercel sends on the daily `GET /api/push/run-due` cron (`LEDGER_SYNC_CRON_SECRET` also works) |
| `LEDGER_SYNC_EMBEDDING_REGION` | AI region | Region for app-funded embedding calls |
| `LEDGER_SYNC_EMBEDDING_BATCH_SIZE`, `LEDGER_SYNC_EMBEDDING_CONCURRENCY` | `64`, `8` | Transactions per index request, parallel Titan calls |
| `LEDGER_SYNC_EMBEDDING_DAILY_TOKEN_LIMIT` | `1000000` | App-funded embedding tokens per user per UTC day; `0` turns the cap off |

[docs/DEPLOYMENT.md](../docs/DEPLOYMENT.md#optional-phone-alerts-web-push) has the PowerShell command that generates the VAPID pair and the cron secret.

## Quality Checks

```bash
uv run ruff check src/ tests/
uv run ruff format --check src/ tests/
uv run mypy src/
uv run pytest tests/ -v
```

The suite covers HTTP contracts, financial calculations, tenant isolation,
upload idempotency, publication races, and populated migration paths. Set
`LEDGER_SYNC_TEST_POSTGRES_URL` to a disposable local `ledger_sync_test*`
database to include native PostgreSQL cases.

## Migrations

```bash
uv run alembic revision --autogenerate -m "describe change"
uv run alembic upgrade head
```

`uv run alembic upgrade head` builds a working schema from an empty database, not only from an existing one. [tests/integration/test_migrations_from_scratch.py](tests/integration/test_migrations_from_scratch.py) guards that path: it upgrades a fresh SQLite file, compares the migrated tables and columns against the ORM metadata, and re-runs the upgrade to confirm the guards stay idempotent.

Read [MIGRATION_NOTES.md](src/ledger_sync/db/migrations/MIGRATION_NOTES.md) before attempting a downgrade. Several recent revisions intentionally have no schema-reversing downgrade.

On PostgreSQL, `feature_domains_2026` runs `CREATE EXTENSION IF NOT EXISTS vector` for the `transaction_embeddings` table, so a PostgreSQL used for the PostgreSQL test cases needs pgvector installed (see [docs/TESTING.md](../docs/TESTING.md#postgresql-runs)).

## Deployment

Production runs on Vercel through `api/index.py` and `vercel.json`, with Neon PostgreSQL behind the PgBouncer pooler. Vercel's Python runtime serves the FastAPI ASGI app directly, so the application lifespan runs in production. Database migrations are applied by `.github/workflows/migrate.yml`. `vercel.json` also schedules the daily push alert run (`GET /api/push/run-due` at `0 3 * * *`), and the CAS import's dependencies are the optional `cas` extra, which the Vercel install leaves out to keep the function under Vercel's 250 MB standard size (the hosted `POST /api/upload/cas` answers 503; see `docs/DEPLOYMENT.md`, "Function size"). Install it locally with `uv sync --extra cas` or `--all-extras`.

See [docs/DEPLOYMENT.md](../docs/DEPLOYMENT.md) and [docs/API.md](../docs/API.md).
