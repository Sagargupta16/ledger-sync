# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Ledger Sync is a self-hosted personal finance dashboard that turns Excel bank statements into 24 pages of analytics -- spending breakdowns, investment tracking, tax planning, cash flow visualization, and more. Supports multi-currency display with live exchange rates. Monorepo: Python FastAPI backend + React TypeScript frontend.

## Commands

### Development

```bash
# Install all dependencies (both backend and frontend)
pnpm run setup

# Run both backend and frontend concurrently
pnpm run dev
# Backend: http://localhost:8000 | Frontend: http://localhost:5173
# API docs (Swagger): http://localhost:8000/docs

# Run services separately
pnpm run dev:backend    # uvicorn with --reload on port 8000
pnpm run dev:frontend   # vite dev server
```

### Backend (run from `backend/` directory)

```bash
uv run pytest tests/ -v                          # all tests
uv run pytest tests/unit/test_hash_id.py         # single test file
uv run pytest tests/unit/test_hash_id.py::test_hash_generation  # single test
uv run pytest --cov=ledger_sync tests/           # with coverage

uv run ruff check .                              # lint
uv run ruff format src/ tests/                   # format
uv run mypy src/                                 # type check

uv run alembic revision --autogenerate -m "msg"  # create migration
uv run alembic upgrade head                      # apply migrations
uv run alembic downgrade -1                      # rollback one migration
```

### Frontend (run from `frontend/` directory)

```bash
pnpm test                # run tests (vitest, single run)
pnpm run test:watch      # watch mode
pnpm run lint            # eslint check
pnpm run format          # eslint --fix
pnpm run type-check      # tsc -b --noEmit
pnpm run build           # tsc -b && vite build
pnpm run clean           # clear dist and vite cache
```

### Formatting (both)

```bash
pnpm run format          # format backend (ruff format + ruff --fix) and frontend (eslint --fix)
```

### Full Check (lint + types + test for both stacks)

```bash
pnpm run check           # runs lint, type-check, and test in parallel
```

## Architecture

### Monorepo Structure

Root `package.json` uses `concurrently` to coordinate both services. Backend uses uv for dependency management; frontend uses pnpm.

### Backend (`backend/src/ledger_sync/`)

Layered architecture:

- **`api/`** - FastAPI routers. Each file is a router module (auth, oauth, upload, transactions, analytics, analytics_v2, calculations, preferences, account_classifications, exchange_rates, stock_price, meta, reports). Routers are registered in `main.py`. All endpoints require JWT auth via `get_current_user` dependency from `deps.py`. `oauth.py` handles Google/GitHub authorization code exchange. `preferences.py` includes salary-structure, rsu-grants, and growth-assumptions endpoints.
- **`core/`** - Business logic. `sync_engine.py` orchestrates imports -- `import_rows()` for JSON uploads from the frontend, `import_file()` for CLI file imports. `reconciler.py` handles deduplication via SHA-256 hashing. `calculator.py` and `analytics_engine.py` compute financial metrics. `query_helpers.py` provides shared SQL aggregation helpers (`income_sum_col`, `expense_sum_col`, `build_transaction_query`) used by both `calculations.py` and `analytics.py`. `insights.py` generates smart financial insights. `report_generator.py` builds exportable reports. `time_filter.py` handles date range/fiscal year filtering logic. `core/auth/` handles JWT token creation/verification.
- **`ingest/`** - Data ingestion pipeline used by CLI: `excel_loader.py` -> `normalizer.py` -> `validator.py` -> `hash_id.py`. The web upload path bypasses the file loaders -- frontend parses files client-side and sends structured JSON; `normalizer.normalize_from_dict()` handles dict-based normalization.
- **`db/`** - SQLAlchemy 2.0 models and session factory. `models.py` defines all tables (users, transactions, import_logs, user_preferences, investment_accounts, budget_goals, recurring_transactions, anomalies, account_classifications). All data is user-scoped. `user_preferences` includes JSON columns for `salary_structure`, `rsu_grants`, and `growth_assumptions`.
- **`schemas/`** - Pydantic models for request/response validation. Includes `upload.py` with `TransactionRow` and `TransactionUploadRequest` for JSON upload validation, and `salary.py` with `SalaryComponents`, `RsuGrant`, `GrowthAssumptions` schemas for tax projection inputs.
- **`config/settings.py`** - Pydantic BaseSettings. All env vars prefixed with `LEDGER_SYNC_` (e.g., `LEDGER_SYNC_DATABASE_URL`, `LEDGER_SYNC_JWT_SECRET_KEY`).

### Frontend (`frontend/src/`)

- **`pages/`** - 24 page components, all lazy-loaded via `React.lazy` for code splitting. Pages import directly (no barrel re-export). Includes FIRECalculatorPage, SubscriptionTrackerPage, BillCalendarPage, InsightsPage, and YearInReviewPage. `settings/SalaryStructureSection.tsx` provides salary CTC grid, RSU grant editor, and growth assumption sliders.
- **`components/`** - Organized by domain: `analytics/` (chart components including `CategoryBreakdown` for shared category treemaps), `layout/` (AppLayout, Sidebar with ProfileModal), `shared/` (reusable components like MetricCard, AnalyticsTimeFilter, ProtectedRoute, ProfileModal, ChunkErrorBoundary, EmptyState, QuickInsights), `transactions/`, `upload/`, `ui/` (base primitives including ChartContainer, PageHeader, ConfirmDialog, CollapsibleSection).
- **`hooks/`** - Custom React hooks. `useAnalyticsTimeFilter` encapsulates time-filter state (view mode, date range, FY) shared across all analytics pages. `useChartDimensions` provides responsive chart sizing. `hooks/api/` contains TanStack Query hooks for API calls, configured with `staleTime: Infinity` and `gcTime: 1 hour`.
- **`services/api/`** - Axios-based API client. Axios interceptor auto-attaches JWT `Authorization` header.
- **`store/`** - Zustand stores: `authStore` (JWT tokens with persist middleware), `accountStore`, `budgetStore`, `investmentAccountStore`, `preferencesStore`.
- **`types/`** - Shared TypeScript type definitions. `salary.ts` defines `SalaryComponents`, `RsuGrant`, `GrowthAssumptions`, and `ProjectedFYBreakdown` interfaces.
- **`constants/`** - Colors, animations, chart configuration tokens. `columns.ts` defines flexible column name mappings (`COLUMN_MAPPINGS`), required columns, and valid transaction types for the client-side file parser.
- **`lib/`** - Utility functions: formatters, date utils, tax calculator, export helpers. `fileParser.ts` handles client-side Excel/CSV parsing (lazy-loads SheetJS, computes SHA-256 hash via `crypto.subtle`, maps columns, validates rows). `projectionCalculator.ts` provides pure functions (`projectFiscalYear`, `projectMultipleYears`, `getRsuVestingsByFY`) for multi-year salary/tax projections with full TDD test coverage in `__tests__/projectionCalculator.test.ts`.

### Key Patterns

- **Auth flow**: OAuth-only (Google, GitHub) via authorization code flow. No email/password. Frontend redirects to provider, `OAuthCallbackPage` sends code to `POST /api/auth/oauth/{provider}/callback`, backend exchanges for user info via `httpx` and returns JWTs. `authStore` (Zustand + persist) stores tokens. `ProtectedRoute` enforces auth. `useAuthInit` verifies tokens on app startup. Token blacklist on logout. OAuth buttons only appear when provider client IDs are configured via env vars (`LEDGER_SYNC_GOOGLE_CLIENT_ID`, etc.).
- **Path alias**: `@/*` maps to `./src/*` in frontend TypeScript config.
- **Styling**: Tailwind CSS 4 with extensive CSS custom properties in `index.css` (design tokens for colors, typography, spacing, animations). Dark-theme-only design using an iOS-inspired color palette with financial semantic colors (income=green, expense=red, savings=purple, transfer=teal, investment=blue).
- **API proxy**: Vite proxies `/api` requests to `http://localhost:8000` during development.
- **Upload pipeline**: Files are parsed client-side using SheetJS (lazy-loaded). The frontend computes a SHA-256 file hash via `crypto.subtle`, maps flexible column names to standard fields, validates each row, and sends structured JSON to `POST /api/upload`. The backend receives `TransactionUploadRequest` (file_name, file_hash, rows, force), normalizes via `normalize_from_dict()`, and reconciles. After upload succeeds, the frontend calls `POST /api/analytics/v2/refresh` to recompute all pre-aggregated analytics tables synchronously (replacing the old `BackgroundTasks` approach which was unreliable on Vercel serverless). The CLI still uses the old file-based `import_file()` path with inline analytics.
- **Data deduplication**: Transactions are identified by SHA-256 hash of (date, amount, category, account). Re-uploading files is safe.
- **Database**: SQLite for development (`./ledger_sync.db`), Neon PostgreSQL 17 in production (Singapore region, free tier, 0.5 GB). Schema managed by Alembic migrations. Database auto-initializes on app startup via `init_db()`. SQLite connections apply performance PRAGMAs (WAL mode, 64MB cache, NORMAL sync). PostgreSQL connections use pooling (pool_size=5, max_overflow=3, pool_recycle=300, pool_pre_ping=True) with 30s statement timeout set per-connection (compatible with Neon's PgBouncer pooler).
- **Database-agnostic SQL**: SQLite uses `strftime()`, PostgreSQL uses `to_char()`. Always use `query_helpers.py` helpers (`fmt_year_month`, `fmt_year`, `fmt_month`, `fmt_date`) instead of `func.strftime()` directly -- raw SQLite SQL will break production.
- **DB URL normalization**: `session.py` auto-converts `postgresql://` and `postgresql+psycopg2://` to `postgresql+psycopg://` (psycopg v3 driver).
- **Security**: Rate limiting (slowapi), security headers (CSP, HSTS, X-Frame-Options), token blacklist, query timeouts. SheetJS installed from CDN (`cdn.sheetjs.com/xlsx-0.20.3`) to avoid npm registry vulnerabilities. OAuth secrets stored server-side only; frontend never sees provider tokens.

### Deployment

Three services, all free tier:

| Service | Platform | URL |
|---------|----------|-----|
| Frontend | GitHub Pages | `sagargupta.online/ledger-sync/` |
| Backend | Vercel (serverless) | `ledger-sync-api.vercel.app` |
| Database | Neon PostgreSQL 17 | Singapore region, PgBouncer pooler (Vercel integration) |

- **Frontend auto-deploys** on push to `main` via `.github/workflows/deploy-frontend.yml`. Builds with `GITHUB_PAGES=true` (sets Vite `base: '/ledger-sync/'`), copies `index.html` to `404.html` for SPA routing. `VITE_API_BASE_URL` is a GitHub Actions repository variable pointing to the Vercel backend URL.
- **Backend auto-deploys** on push to `main` via Vercel. Vercel detects `uv.lock` and uses `uv` to install dependencies. `backend/vercel.json` routes all requests to `api/index.py` which wraps FastAPI with `Mangum`. Alembic migrations run via `.github/workflows/migrate.yml` (triggered on push to main when `backend/alembic/**` or `models.py` changes).
- **Vercel config** is defined in `backend/vercel.json`. Root directory is set to `backend` in Vercel project settings. Env vars (secrets) are set in the Vercel dashboard. The Neon database is connected via Vercel's Neon integration (Storage tab).
- **Neon connection string** must use the pooler URL with `?sslmode=require` and must NOT include `channel_binding=require` (PgBouncer doesn't support it).
- **OAuth redirect URIs** must be registered separately per environment (dev vs prod) -- GitHub only allows one callback URL per OAuth app.
- **JWT secret** is auto-generated in development. In production, `LEDGER_SYNC_JWT_SECRET_KEY` must be set (min 32 chars) or the app refuses to start.

### CI Pipeline (`.github/workflows/ci.yml`)

Single job: `uv sync` + `pnpm install` -> lint -> type-check -> test -> build

Runs on push/PR to main. Python 3.12, Node 22, pnpm 10, uv (latest).

## Code Quality Rules

- Keep components/modules under 200 lines. If a file exceeds 250 lines, extract sub-components or hooks.
- One component per file (small styled wrappers co-located are fine).
- No `any` type -- use proper TypeScript types. Use `unknown` and narrow if unsure.
- No `console.log` in committed code. Use error boundaries or structured logging.
- Run `pnpm run check` before considering any feature complete.

## New Feature Patterns

- **New page**: Create in `pages/`, add lazy import in router, add sidebar entry. Never eager-import pages.
- **New API endpoint**: Router in `api/`, business logic in `core/`, schema in `schemas/`. No business logic in routers.
- **New hook**: API hooks in `hooks/api/` using TanStack Query with `staleTime: Infinity`. UI hooks in `hooks/`.
- **New store**: Zustand only for truly global state (auth, preferences). Use local state or URL params for page-level state.
- **New dependency**: Don't add new npm/pip packages without asking first.

## Design System Constraints

- **Colors**: Use CSS custom properties from `index.css` (`var(--color-income)`, `var(--color-expense)`, etc.). Never raw hex/rgb.
- **Charts**: Wrap in `ChartContainer`. Use Recharts. Use colors from `constants/`.
- **Layout**: Use `PageHeader` for page titles, `MetricCard` for KPIs, `EmptyState` for no-data states.
- **Dark-only (for now)**: Light theme planned (#79). Until then, don't add `dark:` prefixes or theme toggles.
- **No inline styles** for layout -- use Tailwind classes.

## Import Conventions

- **Order**: React, third-party libs, `@/components`, `@/hooks`, `@/lib`, `@/types`, `@/constants`, relative imports.
- **Path alias**: Always use `@/` for non-relative imports. Never `../../`.
- **No barrel files**: Don't create `index.ts` that re-exports. Import directly from source files.

## Testing Expectations

- **Backend**: Unit tests for all `core/` logic. Integration tests for API endpoints. Use pytest fixtures.
- **Frontend**: Test hooks and utility functions. Simple render-only tests for components are unnecessary.

## Error Handling

- **Backend**: Raise `HTTPException` with proper status codes. Never return raw 500s.
- **Frontend**: `ChunkErrorBoundary` for lazy-loaded pages. TanStack Query handles API error states. Show user-friendly messages.

## Database Rules

- All queries must be user-scoped -- always filter by `user_id`. Never expose cross-user data.
- New tables require Alembic migrations. Never modify models without generating one.
- Use `query_helpers.py` for shared aggregation logic. Don't duplicate SQL.
- **Never use raw `func.strftime()`** -- it only works on SQLite. Use `fmt_year_month()`, `fmt_year()`, `fmt_month()`, `fmt_date()` from `query_helpers.py` for database-agnostic date formatting.
- Migrations from 2026-02-03 onward have empty `downgrade()` functions -- rollback requires a database backup. Some older data migrations use SQLite-specific raw SQL in `op.execute()`.
- Neon free tier auto-sleeps after 5 min idle. Connection timeouts are set to 10s; statement timeouts to 30s.

## Performance Rules

- Lazy load all pages with `React.lazy` + `Suspense`.
- Memoize expensive computations with `useMemo`. Use `useCallback` for handlers passed as props.
- Use TanStack Query for API calls. Never raw `useEffect` + `fetch`.
