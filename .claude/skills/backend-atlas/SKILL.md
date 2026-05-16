---
description: Background knowledge of the ledger-sync backend layout, layering, and conventions. Loads automatically when Claude reads or edits any backend Python file. Use when navigating backend/src/ledger_sync/, deciding where new code should live, or understanding why a file is structured the way it is.
user-invocable: false
paths:
  - "backend/**/*.py"
  - "backend/pyproject.toml"
  - "backend/alembic.ini"
---

# Backend atlas

The backend is a FastAPI + SQLAlchemy 2 + Pydantic v2 monolith deployed serverless via Mangum on Vercel. All code lives under `backend/src/ledger_sync/`.

## Layer map (strict, never reverse the arrows)

```
api/         FastAPI routers — no business logic, just HTTP shape
  └── deps.py            CurrentUser, DatabaseSession dependency injection
services/   Thin svc layer — token minting, credential checks
  └── auth_service.py    Most logic isn't here; lives in core/ instead
core/        Business logic
  ├── sync_engine.py             Orchestrates upload pipeline
  ├── reconciler.py              852 LOC — three-phase upsert with SHA-256 dedup
  ├── analytics_engine.py        9-mixin composition
  ├── analytics/                 The mixins (anomalies, recurring, merchants, …)
  ├── _analytics_helpers.py      Pure helpers shared across mixins
  ├── query_helpers.py           DB-agnostic SQL (fmt_year_month, fmt_year, …)
  ├── encryption.py              AES-256-GCM for BYOK keys
  └── auth/                      JWT, password hashing
ingest/      Excel/CSV → normalized rows
  ├── excel_loader.py
  ├── csv_loader.py
  ├── normalizer.py              Unicode NFKC, bank-name canonicalization, type detection
  ├── validator.py
  └── hash_id.py                 Deterministic SHA-256 transaction IDs
db/          SQLAlchemy 2.0 ORM
  ├── models.py                  21-line FACADE re-exporting from _models/
  ├── _models/                   Domain-split (NEVER import directly)
  │   ├── user.py                User, UserPreferences, AuditLog
  │   ├── transactions.py        Transaction, ImportLog, AccountClassification
  │   ├── analytics.py           Pre-aggregated tables
  │   ├── investments.py         InvestmentHolding, NetWorthSnapshot, TaxRecord
  │   ├── planning.py            Anomaly, Budget, FinancialGoal, Recurring*
  │   ├── ai_usage.py            AIUsageLog
  │   ├── enums.py               TransactionType, AnomalyType, …
  │   └── _constants.py
  ├── session.py                 Engine, pool, PRAGMAs, URL normalization
  ├── base.py                    SQLAlchemy DeclarativeBase
  └── migrations/                Alembic
      ├── env.py
      └── versions/              26 migrations, all post-2026-02-03 with empty downgrade()
schemas/     Pydantic request/response contracts
  ├── upload.py                  TransactionRow, TransactionUploadRequest
  ├── auth.py                    Token, UserResponse, …
  ├── transactions.py            UploadResponse, HealthResponse
  └── salary.py                  SalaryComponents, RsuGrant, GrowthAssumptions
config/
  ├── settings.py                Pydantic BaseSettings, all env vars LEDGER_SYNC_*
  └── instrument_rates.json      EPF/PPF/NPS rates (source of truth)
cli/         Typer CLI (one command: `ledger-sync import-file <path>`)
utils/       Logging
```

## Hard rules — these are how the code is held together

1. **Layering is one-way.** `api/` calls `services/`/`core/`, `core/` calls `db/`. Never call db.session from a router. Never put business logic in a router.
2. **Multi-tenancy is enforced query-by-query.** Every read/write of a user-data table must filter `WHERE user_id == current_user.id`. There is no Row-Level Security backstop. Integration test `tests/integration/test_analytics_user_scoping.py` exists to prove this.
3. **DB-agnostic SQL.** Never `func.strftime()` directly — works on SQLite, silently breaks on Postgres. Use `query_helpers.fmt_year_month()`, `fmt_year()`, `fmt_month()`, `fmt_date()`. This is the most common production-only bug class in this codebase.
4. **Models go through the facade.** Import `from ledger_sync.db.models import X`, never `from ledger_sync.db._models.user import User`. The facade ensures all tables register before `Base.metadata.create_all()`.
5. **Empty migration `downgrade()`.** Convention since 2026-02-03. Recovery is via Neon backup, not down-migration. Reviewers will reject functional downgrades.
6. **Routes prefixed `/api/...`** in the router's `APIRouter(prefix=...)`. Register every router in `api/main.py` (both import + `app.include_router()`).

## Where things live (cheat sheet)

| Need to... | File |
|---|---|
| Add HTTP endpoint | `api/<resource>.py` (use new-endpoint skill) |
| Add DB model / column | `db/_models/<domain>.py` + facade re-export + migration (use new-migration skill) |
| Add business logic | `core/<area>.py` — never in api/ |
| Add date-range query helper | `core/query_helpers.py` |
| Add new analytics aggregation | New mixin in `core/analytics/`, register on `AnalyticsEngine` |
| Add upload validation rule | `ingest/validator.py` or `ingest/normalizer.py` |
| Add request/response schema | `schemas/<resource>.py` |
| Add config value | `config/settings.py` Settings class with `LEDGER_SYNC_` prefix |
| Add a new env var | Same as above; document in CLAUDE.md if production-required |
| Add an AI chatbot tool | `api/ai_tools.py` (use new-ai-tool skill). 16 tools currently. |
| Add rate limit | slowapi `@limiter.limit("N/minute")` on the route. See `api/auth.py`, `api/upload.py`, `api/ai_chat.py` for the pattern (note the `request: Request` param naming gotcha). |

## Routers (19 of them, all `/api/`)

`auth`, `oauth`, `upload`, `transactions`, `analytics` (V1 on-the-fly), `analytics_v2` (pre-aggregated), `calculations`, `preferences`, `account_classifications`, `exchange_rates`, `rates`, `stock_price`, `meta`, `reports`, `ai_chat`, `ai_tools`, `ai_usage`. (Two more were inferred earlier; `ls backend/src/ledger_sync/api/*.py` is the truth.)

## Key non-obvious decisions

- **Upload runs analytics inline, not via BackgroundTasks.** Vercel serverless workers don't reliably finish background tasks after returning. See `api/upload.py:80-94` and the docstring at top of `api/ai_chat.py` for the related Mangum streaming caveat.
- **Bedrock is server-proxied; OpenAI/Anthropic are browser-direct.** Bedrock needs SigV4 signing (browser can't), and Mangum buffers SSE so streaming wouldn't work end-to-end. See top of `api/ai_chat.py`.
- **Two analytics tiers.** V1 (`/api/analytics/*`) computes on-the-fly. V2 (`/api/analytics/v2/*`) reads pre-aggregated tables. V2 is fast and the default; V1 exists for arbitrary date filters V2 can't pre-compute.
- **`ai_tools.py` is the biggest file** (~1100 LOC). 16 read-only tools the LLM can call. User-scoping enforced via `CurrentUser` dependency injection; the LLM cannot bypass.
- **JWT secret seeds AES-256-GCM** for BYOK API keys. Rotating `LEDGER_SYNC_JWT_SECRET_KEY` invalidates all stored AI keys (users prompted to re-enter). See `core/encryption.py`.

## Detailed reference

- For HTTP layer details (routers, deps, rate limits), see [`backend/src/ledger_sync/api/`](backend/src/ledger_sync/api/) and the **new-endpoint** skill.
- For DB model details, see [`backend/src/ledger_sync/db/_models/`](backend/src/ledger_sync/db/_models/) and the **new-migration** skill.
- For end-to-end data flows (upload, OAuth, AI tools), use the **data-flow-atlas** skill.
- For deployment topology (Vercel, Neon, env vars), use the **deployment-atlas** skill.
- For domain rules (Indian FY, currency, taxes), use the **domain-atlas** skill.

## What this skill is NOT

This is a static map. It does not change every PR. When the layout *does* change (new top-level subpackage, new router family, removed module), update this skill — that's how it stays useful.
