# CLAUDE.md

> This file stacks on top of the workspace root at `C:\Code\GitHub\`:
> - Root [`CLAUDE.md`](../../CLAUDE.md) -- voice, rules, routing map, references, skills, slash commands, conventions.
> - Root [`MEMORY.md`](../../MEMORY.md) -- live facts across repos.
> - Root [`STATUS.md`](../../STATUS.md) -- live PR/CI/security dashboard.
> - [`.claude/resources/`](../../.claude/resources/README.md) -- deep reference for collaboration, workflow, git, OSS, debugging, voice.
>
> Read those first. The guidance below only adds **repo-specific context** -- it does not override anything in the root.

## Project Overview

Ledger Sync is a self-hosted personal finance workspace that turns Excel and CSV bank statements into 24 protected pages covering the ledger, analytics, investments, tax planning, commitments, goals, and AI-assisted exploration. It supports multi-currency display with live exchange rates. Monorepo: Python FastAPI backend + React TypeScript frontend.

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

- **`api/`** - FastAPI routers. Each file is a router module (auth, oauth, upload, transactions, analytics, analytics_v2, calculations, preferences, account_classifications, categorization_rules, saved_views, exchange_rates, rates, stock_price, meta, reports, ai_chat, ai_tools, ai_usage). `rates.py` serves `/api/rates/instruments` from `config/instrument_rates.json` (EPF/PPF/NPS rates with `effective_from` + `source_url` metadata). Routers are registered in `main.py`. Financial endpoints require JWT auth via `CurrentUser`; health, OAuth bootstrap/callback, and token refresh are public exceptions. `oauth.py` handles signed-state Google/GitHub authorization code exchange. AI configuration lives in `preferences_ai.py`. `ai_chat.py` proxies non-streaming Bedrock calls and always signs them with the server credential, including `byok` configurations that select Bedrock. `ai_tools.py` exposes `/api/ai/tools` and `/api/ai/tools/execute` for 15 read-only user-scoped tools. `ai_usage.py` records every LLM round-trip in `ai_usage_log` and returns today/MTD/all-time rollups.
- **`core/`** - Business logic. `sync_engine.py` orchestrates `import_rows()` for JSON web uploads and `import_file()` for CLI file imports. `reconciler.py` handles user-scoped reconciliation and occurrence-aware SHA-256 IDs. `calculator.py` computes on-demand financial metrics. `analytics_engine.py` is a compatibility facade; the active analytics engine and rollup builders live under `core/analytics/`. `query_helpers.py` provides shared database-agnostic SQL aggregation helpers. `insights.py`, `report_generator.py`, and `time_filter.py` handle insights, reports, and date ranges. `encryption.py` writes AES-256-GCM v2 ciphertexts derived with HKDF-SHA256 from `LEDGER_SYNC_ENCRYPTION_KEY`; legacy PBKDF2 v1 ciphertexts remain readable and are upgraded on reveal. `core/auth/` handles JWT token creation/verification.
- **`ingest/`** - Data ingestion pipeline used by CLI: `excel_loader.py` -> `normalizer.py` -> `validator.py` -> `hash_id.py`. The web upload path bypasses the file loaders -- frontend parses files client-side and sends structured JSON; `normalizer.normalize_from_dict()` handles dict-based normalization.
- **`db/`** - SQLAlchemy 2.0 models and session factory. `models.py` is the public facade over `_models/`, split by domain across `user.py`, `transactions.py`, `organization.py`, `investments.py`, `analytics.py`, `planning.py`, and `ai_usage.py`. Consumer code imports from `ledger_sync.db.models`, never directly from `_models`. Financial data is user-scoped. Structured preference values such as salary structure, RSU grants, and growth assumptions are JSON-serialized into `TEXT` columns.
- **`schemas/`** - Pydantic models for request/response validation. Includes `upload.py` with `TransactionRow` and `TransactionUploadRequest` for JSON upload validation, and `salary.py` with `SalaryComponents`, `RsuGrant`, `GrowthAssumptions` schemas for tax projection inputs.
- **`config/settings.py`** - Pydantic BaseSettings. All env vars prefixed with `LEDGER_SYNC_` (e.g., `LEDGER_SYNC_DATABASE_URL`, `LEDGER_SYNC_JWT_SECRET_KEY`).

### Frontend (`frontend/src/`)

- **`pages/`** - 27 routed page components: Home, Dashboard, OAuth Callback, and Demo Entry are eager; 23 heavier workspace pages are lazy-loaded and prefetched during browser idle time. The router exposes 3 public routes and 24 protected page routes. Pages import directly without page-level barrels. Multi-file pages use kebab-case directories with a thin page component, hook, types, helpers, and local components. Settings uses `sections/` because "section" is the domain term. See [`docs/HANDBOOK.md`](docs/HANDBOOK.md) for user workflows and [`docs/PAGES.md`](docs/PAGES.md) for the route/data catalog.
- **`components/`** - Organized by domain: `analytics/`, `chat/`, `layout/` (`AppLayout`, `WorkspaceHeader`, sidebar, mobile tab bar), `shared/`, `transactions/`, `upload/`, and `ui/`. Shared UI includes ChartContainer, PageContainer, PageHeader, PageErrorState, Spinner, DataTable, ConfirmDialog, CollapsibleSection, Money, and chart defaults.
- **`hooks/`** - Custom React hooks. `useAnalyticsTimeFilter` encapsulates time-filter state (view mode, date range, FY) shared across all analytics pages. `useChartDimensions` provides responsive chart sizing. `hooks/api/` contains TanStack Query hooks for API calls, configured with `staleTime: Infinity` and `gcTime: 1 hour`.
- **`services/api/`** - Axios-based API client. Axios interceptor auto-attaches JWT `Authorization` header. `aiConfig.ts` handles AI provider configuration CRUD.
- **`store/`** - Zustand stores: `authStore`, `demoStore`, `themeStore`, `accountStore`, `budgetStore`, `investmentAccountStore`, and `preferencesStore`.
- **`types/`** - Shared TypeScript type definitions. `salary.ts` defines `SalaryComponents`, `RsuGrant`, `GrowthAssumptions`, and `ProjectedFYBreakdown` interfaces.
- **`constants/`** - Colors, animations, chart configuration tokens. `columns.ts` defines flexible column name mappings (`COLUMN_MAPPINGS`), required columns, and valid transaction types for the client-side file parser.
- **`lib/`** - Utility functions: formatters, date helpers, tax/FIRE/projection calculators, export helpers, and parsing. `fileParser.ts` handles client-side Excel/CSV parsing, SHA-256 file hashing, column mapping, and validation. `chatAdapters.ts` implements non-streaming JSON adapters and provider-neutral tool blocks. `chatContext.ts` fetches preferences only and builds a minimal currency/date/FY/tool-guidance prompt. `tax-config/` holds versioned fiscal-year tax rules with newest-first fallback.

### Key Patterns

- **Auth flow**: OAuth-only (Google, GitHub) via authorization code flow. No email/password. `/api/auth/oauth/providers` returns enabled providers plus a 10-minute HMAC-signed state token. The callback rejects missing, invalid, or expired state before exchanging the code. `authStore` persists JWTs, `ProtectedRoute` enforces auth, and `useAuthInit` verifies startup state. Logout calls the backend, increments `token_version`, invalidates outstanding access and refresh tokens, then clears frontend state.
- **Path alias**: `@/*` maps to `./src/*` in frontend TypeScript config.
- **Styling**: Tailwind CSS 4 with extensive CSS custom properties in `index.css` (design tokens for colors, typography, spacing, animations). Light mode is the default, with dark and system themes supported. The compact financial workspace uses restrained neutral surfaces and semantic colors (income=green, expense=red, savings=purple, transfer=teal, investment=blue).
- **API proxy**: Vite proxies `/api` requests to `http://localhost:8000` during development.
- **Upload pipeline**: Files are parsed client-side using lazy-loaded SheetJS. The frontend computes a SHA-256 file hash, maps flexible columns, validates rows, and posts `TransactionUploadRequest` JSON (`file_name`, 64-character `file_hash`, 1-100,000 `rows`, `force`) to `/api/upload`. The backend normalizes and reconciles, then attempts a synchronous full analytics refresh. The frontend also calls `/api/analytics/v2/refresh` as an explicit reliability pass. A failed post-persistence analytics refresh does not roll back imported transactions. The CLI retains the file-based `import_file()` path.
- **Server-side aggregation (v2.17+)**: Analytics pages historically called `useTransactions()` and pulled the entire ledger (~6,768 rows) into the browser to compute in JS. They now read server-side aggregations instead -- existing rollups (`/api/analytics/v2/*`, `/api/calculations/{totals,monthly-aggregation,category-breakdown}`) plus computed read endpoints added for the gap: `transactions/facets`, `calculations/{quick-insights,data-date-range,income-analysis,category-monthly-history,category-daily-series}`, and `analytics/v2/cohort-spending`. The shared `useAnalyticsTimeFilter` accepts either a transactions array (legacy) or a `{minDate,maxDate}` bounds object (from `data-date-range`) so date-filtered pages can drop the full-ledger fetch. Pages that bundle user-preference or projection math (tax, GST config, net-worth/XIRR, CFP health score) intentionally stay client-side -- moving them would duplicate preference logic and risk calc correctness.
- **Data deduplication**: Transaction IDs hash user ID, date, amount, account, note, category, subcategory, type, and an occurrence suffix for otherwise-identical rows. Re-uploading the same data is idempotent without collapsing legitimate duplicates.
- **Database**: SQLite for development (`./ledger_sync.db`), Neon PostgreSQL 17 in production (Singapore region, free tier, 0.5 GB). Schema managed by Alembic migrations. Database auto-initializes on app startup via `init_db()`. SQLite connections apply performance PRAGMAs (WAL mode, 64MB cache, NORMAL sync). PostgreSQL pool is env-configurable via `LEDGER_SYNC_DB_*` settings (pool_size, max_overflow, pool_recycle_seconds, connect_timeout_seconds, statement_timeout_seconds, idle_transaction_timeout_seconds; defaults sized for Neon free tier: 5/3/300/10/30/60). Compatible with Neon's PgBouncer pooler.
- **Database-agnostic SQL**: SQLite uses `strftime()`, PostgreSQL uses `to_char()`. Always use `query_helpers.py` helpers (`fmt_year_month`, `fmt_year`, `fmt_month`, `fmt_date`) instead of `func.strftime()` directly -- raw SQLite SQL will break production.
- **DB URL normalization**: `session.py` auto-converts `postgresql://` and `postgresql+psycopg2://` to `postgresql+psycopg://` (psycopg v3 driver).
- **Security**: Slowapi rate limiting protects token refresh and OAuth callbacks by IP, plus upload and Bedrock chat by both authenticated user and IP. Security headers, query timeouts, signed OAuth state, server-side token revocation, and user-scoped data access are required. SheetJS is pinned from the vendor CDN package. Current AI API-key writes use AES-256-GCM with HKDF-SHA256 and a dedicated encryption key; PBKDF2 is legacy v1 read compatibility only.
- **AI Chatbot (app_bedrock + BYOK, tool-calling)**: Two modes stored in `user_preferences.ai_mode`:
  - **`app_bedrock` (default)** -- new users get a working chatbot with zero setup. Server uses its own Bedrock bearer token (`LEDGER_SYNC_BEDROCK_API_KEY`) and a fixed cheap model (Haiku 4.5). Rate-limited to `LEDGER_SYNC_AI_DAILY_MESSAGE_LIMIT` messages/day (default 10) per user to keep the shared-key cost predictable. Hitting the cap returns a 429 with a "switch to BYOK" pointer.
  - **`byok`** -- user configures provider, model, API key, and per-user daily/monthly token limits. OpenAI and Anthropic use the configured user key. A Bedrock selection still uses the server credential because there is no per-user AWS signing path.
  - **Transport**: OpenAI and Anthropic go browser-direct. Bedrock goes through `/api/ai/bedrock/chat` because it requires server-side authentication and does not support browser CORS. All providers use non-streaming JSON responses so tool calling remains one bounded request per round.
  - **Tool calling (v2.5+)**: The bot has 15 read-only tools registered in `backend/src/ledger_sync/api/ai_tools_impl/` (registry pattern; `ai_tools.py` is the thin router) -- `list_accounts`, `search_transactions`, `get_monthly_summary`, `list_categories`, `get_category_spending`, `get_net_worth`, `list_recurring`, `list_goals`, `list_recent_months`, `get_fy_summary`, `list_budgets`, `get_cash_flow`, `get_tax_summary`, `get_preferences_summary`, `list_anomalies`. Same schema works across all three providers. Frontend tool loop in `useChat`: send -> receive `tool_use` -> execute tools in parallel -> append `tool_result` -> resend -> repeat until `end_turn` or 6-round limit. Every tool is user-scoped via `CurrentUser`; the LLM cannot see another user's data.
  - **System prompt shrunk to ~10 lines** (preferences, today's date, anti-hallucination nudge). No more "context stuffing" -- the bot reaches for tools instead of making up plausible numbers.
  - **Usage logging**: every LLM round-trip is logged to `ai_usage_log` (provider, model, input/output tokens, estimated USD, tool rounds). `GET /api/ai/usage` returns today / MTD / all-time rollups.
- **PWA**: App is installable on mobile/desktop. Config lives in `frontend/vite.config.ts` (`VitePWA` plugin). Manifest uses relative `start_url`/`scope` so it works under the `/ledger-sync/` GH Pages base path. Service worker precaches the app shell only -- **never** caches `/api/*` (enforced via `navigateFallbackDenylist`) so financial data is always fresh. Icons are generated from `frontend/public/pwa-icon-source.svg` via `pnpm run generate:icons`; `pwa-assets.config.ts` overrides `minimal-2023`'s apple transform to `padding: 0` + transparent background so the gradient paints corner-to-corner and iOS applies its own squircle mask. Do NOT pass `--preset` on the generator CLI -- it overrides the config file. `registerType: 'autoUpdate'` + `clientsClaim` means updates propagate within one app restart.
- **Mobile navigation**: Phone viewports below `lg` get a bottom tab bar with Dashboard, Transactions, Cash Flow, and More. `/more` mirrors all desktop navigation groups. The global `WorkspaceHeader` handles top safe-area placement; page-level `PageHeader` remains static in content flow. `AppLayout` reserves bottom-tab and home-indicator space. Use `h-dvh`, not `h-screen`, in layout primitives.

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
- **Bedrock chat** requires a Bedrock API key: set `LEDGER_SYNC_BEDROCK_API_KEY` (or `AWS_BEARER_TOKEN_BEDROCK`) on Vercel. boto3 1.39+ auto-detects the AWS var; the `LEDGER_SYNC_` variant is bridged to it at startup in `config/settings.py`. Without either, the `/api/ai/bedrock/chat` endpoint returns HTTP 503 with a "not configured" message instead of boto3's misleading "model identifier is invalid" error.

### CI Pipeline (`.github/workflows/ci.yml`)

Three jobs on push/PR to main: `frontend` (shared-workflows `node-ci.yml`, working-directory frontend), `backend` (inline: uv sync --all-extras --group dev, ruff check + format --check, mypy, pytest on Python 3.13 -- inline because the shared python-ci swallows failures with `|| true`), and `security` (shared-workflows `security-scan.yml`).

## Code Quality Rules

- Keep components/modules under 200 lines. If a file exceeds 250 lines, extract sub-components or hooks.
- One component per file (small styled wrappers co-located are fine).
- No `any` type -- use proper TypeScript types. Use `unknown` and narrow if unsure.
- No `console.log` in committed code. Use error boundaries or structured logging.
- Run `pnpm run check` before considering any feature complete.

## Project Skills

The repo-specific skill set (atlas/craft/task skills under `.claude/skills/`) was untracked and removed from the working tree on 2026-07-03 (commit 594f102, "untrack AI assistant local files"). It no longer exists locally -- recover from git history at `594f102^` if ever needed. Until restored, workspace-level and user-level skills cover this repo.

## New Feature Patterns

- **New page (single-file)**: Create `<PageName>Page.tsx` directly in `pages/`. Use PascalCase. Add lazy import in `App.tsx`, add sidebar entry. Keep under 300 lines.
- **New page (multi-file, >300 lines)**: Create kebab-case directory: `pages/<page-name>/`. Structure: `<PageName>Page.tsx` (thin orchestrator) + `use<Page>.ts` (hook for state/data) + `types.ts` + `<page>Utils.ts` + `components/` subfolder for sub-components. Lazy-load new feature pages by default; eager imports are reserved for core first-navigation pages with a documented reason.
- **New API endpoint**: Router in `api/`, business logic in `core/`, schema in `schemas/`. No business logic in routers. Always prefix routes with `/api/...` in the router prefix for consistency.
- **New DB model**: Add to appropriate `db/_models/` file (e.g., `user.py`, `transactions.py`). Re-export from `db/_models/__init__.py`. The `db/models.py` facade picks it up automatically. Always create an Alembic migration.
- **New hook**: API hooks in `hooks/api/` using TanStack Query with `staleTime: Infinity`. UI hooks in `hooks/`.
- **New store**: Zustand only for truly global state (auth, preferences). Use local state or URL params for page-level state.
- **New dependency**: Don't add new npm/pip packages without asking first. For transitive-dep security fixes, use `constraint-dependencies` in `pyproject.toml` (see `python-dotenv>=1.2.2` pattern), not a direct dep.

## Design System Constraints

- **Colors**: Use CSS custom properties from `index.css` (`var(--color-income)`, `var(--color-expense)`, etc.). Never raw hex/rgb. In Recharts (which needs a resolved color string) use the `rawColors.*` JS values, not the CSS-var class.
- **Page scaffold**: Wrap page bodies in `PageContainer` (`@/components/ui`) -- one centered `max-w-7xl` root with consistent padding + section spacing. Don't hand-roll `min-h-dvh p-4 ... max-w-7xl mx-auto` per page.
- **Charts**: Wrap in `ChartContainer` (pass `ariaLabel` -- every chart needs an accessible name). Prefer the `Standard{Bar,Area,Pie}Chart` wrappers. Use `referenceLine()` (peak/avg/target/goal/zero) and `currencyTooltipFormatter()` from `chartDefaults` instead of hand-rolling reference lines / tooltip formatters. Colors from `constants/`. Respect the data-viz-fit rules: pie/donut only <=7 slices, radar only for fixed 0-100 multivariate profiles, bars for rankings, time-series default to per-period not cumulative.
- **Layout**: `PageHeader` for titles, `MetricCard` for KPIs (use its `change`/`subtitle`/`trend`/`hero` props to make a number informative -- don't hand-roll delta badges or sparkline slots), `EmptyState` for no-data, `Spinner` (`@/components/ui`) for transient loads and the `LoadingSkeleton` family for page/chart/table skeletons, `ProgressBar` (`@/components/shared`) for any actual-vs-target metric (fill + optional target tick + bullet `bands`) -- don't hand-roll `h-2 rounded-full` bars.
- **Tables**: Use `DataTable` from `@/components/ui` for flat + sortable tables. Column-driven API (`DataTableColumn<T>`), internal sort state, keyboard-accessible sort headers, optional row animation, `stickyHeader`, and `mobileCards` (below `sm`, rows render as stacked label/value cards via `mobilePrimary`/`mobileLabel` -- use for wide tables so they don't horizontal-scroll on phones). Don't hand-roll `<table>` unless the shape is genuinely different (expandable groups, pivoted rows-as-columns); for those, drop low-priority columns on mobile (`hidden sm:table-cell`) or pin the label column. **At narrow widths (3-column grids, expandable rows), DataTable's `<td>` truncates money -- render amount cells with `<Money>` instead, or hand-roll a flex row following the CategoryBreakdown pattern.**
- **Money**: Any amount rendered in a flex row or narrow table cell uses `<Money>` from `@/components/ui`. Signature: `<Money value={n} width="sm|md|lg|xl" bold muted />`. Codifies `shrink-0 text-right tabular-nums whitespace-nowrap font-medium` so the digits never truncate (was the `₹12,91` bug in the 3-col /budget layout). Omit `width` for free-flow contexts (hero KPIs, tooltips).
- **Historical charts**: Time-series data must not extend past today. Rely on `getAnalyticsDateRange()` -- it now caps `end_date` at today for FY/yearly/monthly modes (via `capEndDateAtToday()` in `lib/dateUtils.ts`), so every analytics endpoint call inherits the fix. For pre-computed in-memory series, wrap with `capSeriesToToday<T>(rows, key)`. Projection pages (FIRE, tax multi-year, retirement) build their own future ranges and are exempt.
- **Themes**: Light is the default, with dark and system modes supported. Keep every shared token and new component readable in both themes.
- **No inline styles** for layout -- use Tailwind classes.
- **Mobile-first**: most users are on phones. KPI/stat grids should be `grid-cols-2` on phone (not single-column), gate changes behind `sm:`/`lg:`/`useIsMobile` so desktop never regresses, keep interactive controls >=44px, and verify at real mobile width (Playwright) -- never claim mobile-friendly on static reasoning.

## Import Conventions

- **Order**: React, third-party libs, `@/components`, `@/hooks`, `@/lib`, `@/types`, `@/constants`, relative imports.
- **Path alias**: Always use `@/` for non-relative imports. Never `../../`.
- **No barrel files at page level**: Don't create `index.ts` that re-exports in `pages/`. Some shared `components/`, `hooks/`, `lib/`, `services/api/` barrels still exist for convenience -- don't add new ones, but don't mass-remove existing ones either.
- **Page imports in router**: `App.tsx` lazy-imports each page's main file directly, e.g. `import('@/pages/bill-calendar/BillCalendarPage')` -- never `import('@/pages/bill-calendar')` (no barrel).

## Testing Expectations

- **Backend**: Unit tests for all `core/` logic. Integration tests for API endpoints. Use pytest fixtures.
- **Frontend**: Test hooks and utility functions. Simple render-only tests for components are unnecessary.

## Error Handling

- **Backend**: Raise `HTTPException` with proper status codes. Never return raw 500s.
- **Frontend**: `ChunkErrorBoundary` for lazy-loaded pages. TanStack Query handles API error states. Data-driven protected routes render `PageErrorState` before empty or zero-value states and wire retry to the failed queries.

## Database Rules

- All queries must be user-scoped -- always filter by `user_id`. Never expose cross-user data.
- New tables require Alembic migrations. Never modify models without generating one.
- Use `query_helpers.py` for shared aggregation logic. Don't duplicate SQL.
- **Never use raw `func.strftime()`** -- it only works on SQLite. Use `fmt_year_month()`, `fmt_year()`, `fmt_month()`, `fmt_date()` from `query_helpers.py` for database-agnostic date formatting.
- Migrations from 2026-02-03 onward have empty `downgrade()` functions -- rollback requires a database backup. Some older data migrations use SQLite-specific raw SQL in `op.execute()`.
- Neon free tier auto-sleeps after 5 min idle. Connection timeouts are set to 10s; statement timeouts to 30s.

## Performance Rules

- Lazy-load feature pages with `React.lazy` + `Suspense`. Keep only the four core first-navigation pages eager unless measured startup behavior justifies another exception.
- Memoize expensive computations with `useMemo`. Use `useCallback` for handlers passed as props.
- Use TanStack Query for API calls. Never raw `useEffect` + `fetch`.

## Knowledge Graph (graphify)

- `graphify-out/` holds a prebuilt code graph (gitignored). For architecture/relationship questions ("what calls X", "trace Y to the DB", impact of a change), query it before grepping: `graphify query "<question>"`, `graphify path "A" "B"`, `graphify explain "X"`, `graphify affected "X"`.
- After large refactors run `graphify update .` (local AST, no LLM) to refresh it. If `graphify-out/` is missing, fall back to normal search -- don't rebuild unasked.
