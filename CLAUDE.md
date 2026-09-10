# CLAUDE.md

> This file stacks on top of the workspace root at `C:\Code\GitHub\`:
> - Root [`CLAUDE.md`](../../CLAUDE.md) -- voice, rules, routing map, references, skills, slash commands, conventions.
> - Root [`MEMORY.md`](../../MEMORY.md) -- live facts across repos.
> - Root [`STATUS.md`](../../STATUS.md) -- live PR/CI/security dashboard.
> - [`.claude/resources/`](../../.claude/resources/README.md) -- deep reference for collaboration, workflow, git, OSS, debugging, voice.
>
> Read those first. The guidance below only adds **repo-specific context** -- it does not override anything in the root.

## Project Overview

Ledger Sync is a self-hosted personal finance workspace that turns Excel and CSV bank statements into 26 protected pages covering the ledger, analytics, investments, tax planning, commitments, goals, data health, and AI-assisted exploration. It supports multi-currency display with live exchange rates. Monorepo: Python FastAPI backend + React TypeScript frontend.

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
uv run alembic downgrade -1                      # only supported reversible revisions; see docs/DATABASE.md
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

- **`api/`** - FastAPI routers (auth, oauth, upload, transactions, analytics, analytics_v2, calculations, preferences, account_classifications, categorization_rules, saved_views, exchange_rates, rates, stock_price, meta, reports, ai_chat, ai_tools, ai_usage), with larger routers split into implementation modules. `rates.py` serves `/api/rates/instruments` from `config/instrument_rates.json` (EPF/PPF/NPS rates with `effective_from` + `source_url` metadata). Routers are registered in `main.py`. Financial endpoints require JWT auth via `CurrentUser`; health, OAuth initiation/callback, and token refresh are public exceptions. `oauth.py` handles browser-bound, one-use Google/GitHub authorization code exchange with S256 PKCE. AI configuration lives in `preferences_ai.py`. `ai_chat.py` proxies non-streaming Bedrock calls with app or personal bearer funding. `ai_tools.py` exposes `/api/ai/tools` and `/api/ai/tools/execute` for 15 read-only user-scoped tools with runtime argument validation. `ai_usage.py` reserves and settles Bedrock usage and records browser-direct usage reports.
- **`core/`** - Business logic. `sync_engine.py` orchestrates `import_rows()` for JSON web uploads and `import_file()` for CLI file imports. `reconciler.py` handles user-scoped reconciliation and occurrence-aware SHA-256 IDs. `calculator.py` computes on-demand financial metrics. `analytics_engine.py` is a compatibility facade; the active analytics engine and rollup builders live under `core/analytics/`. `query_helpers.py` provides shared database-agnostic SQL aggregation helpers. `insights.py`, `report_generator.py`, and `time_filter.py` handle insights, reports, and date ranges. `ledger_clock.py` is the single source of naive IST `now`/`today`/month/FY boundaries -- never anchor a user-facing window on `datetime.now(UTC)`. `expense_class.py` holds the realised-capital-loss taxonomy that keeps trading losses out of consumption totals. `encryption.py` writes authenticated `ls-byok:v3:` AES-256-GCM envelopes derived with HKDF-SHA256 from `LEDGER_SYNC_ENCRYPTION_KEY`; authenticated legacy v1 PBKDF2 and v2 HKDF ciphertexts remain readable and can be rewrapped. `core/auth/` handles JWT token creation/verification.
- **`ingest/`** - Data ingestion pipeline used by CLI: `excel_loader.py` -> `normalizer.py` -> `validator.py` -> `hash_id.py`. The web upload path bypasses the file loaders -- frontend parses files client-side and sends structured JSON; `normalizer.normalize_from_dict()` handles dict-based normalization.
- **`db/`** - SQLAlchemy 2.0 models and session factory. `models.py` is the public facade over `_models/`, split by domain across `user.py`, `transactions.py`, `organization.py`, `investments.py`, `analytics.py`, `planning.py`, and `ai_usage.py`. Consumer code imports from `ledger_sync.db.models`, never directly from `_models`. Financial data is user-scoped. Structured preference values such as salary structure, RSU grants, and growth assumptions are JSON-serialized into `TEXT` columns.
- **`schemas/`** - Pydantic models for request/response validation. Includes `upload.py` with `TransactionRow` and `TransactionUploadRequest` for whole-batch JSON validation, `goals.py` for goal mutations, and `salary.py` with `SalaryComponents`, `RsuGrant`, `GrowthAssumptions` schemas for tax projection inputs.
- **`services/`** - Cross-router workflows, including immutable OAuth identity resolution in `auth_service.py` and user-scoped goal mutation behavior in `goal_service.py`.
- **`config/settings.py`** - Pydantic BaseSettings. All env vars prefixed with `LEDGER_SYNC_` (e.g., `LEDGER_SYNC_DATABASE_URL`, `LEDGER_SYNC_JWT_SECRET_KEY`).

### Frontend (`frontend/src/`)

- **`pages/`** - 29 routed page components: Home, Dashboard, OAuth Callback, and Demo Entry are eager; 25 heavier workspace pages are lazy-loaded, with matching chunks prefetched on internal-link hover, focus, or touch after authentication initializes. The router exposes 3 public routes and 26 protected page routes. Pages import directly without page-level barrels. Multi-file pages use kebab-case directories with a thin page component, hook, types, helpers, and local components. Settings uses `sections/` because "section" is the domain term. See [`docs/HANDBOOK.md`](docs/HANDBOOK.md) for user workflows and [`docs/PAGES.md`](docs/PAGES.md) for the route/data catalog.
- **`components/`** - Organized by domain: `analytics/`, `chat/`, `layout/` (`AppLayout`, `WorkspaceHeader`, sidebar, mobile tab bar), `shared/`, `transactions/`, `upload/`, and `ui/`. Shared UI includes ChartContainer, PageContainer, PageHeader, PageErrorState, Spinner, DataTable, ConfirmDialog, CollapsibleSection, Money, and chart defaults.
- **`hooks/`** - Custom React hooks. `useAnalyticsTimeFilter` encapsulates time-filter state (view mode, date range, FY) shared across all analytics pages. `useChartDimensions` provides responsive chart sizing. `hooks/api/` contains TanStack Query hooks for API calls, configured with `staleTime: Infinity` and `gcTime: 1 hour`.
- **`services/api/`** - Axios-based API client. Interceptors attach JWT `Authorization`, coordinate refresh, and reject work from an obsolete session. OAuth uses an isolated client without cookies or demo interception. `aiConfig.ts` handles AI provider configuration CRUD.
- **`store/`** - Zustand stores: `authStore`, `demoStore`, `themeStore`, `motionStore`, `accountStore`, `budgetStore`, `investmentAccountStore`, and `preferencesStore`.
- **`types/`** - Shared TypeScript type definitions. `salary.ts` defines `SalaryComponents`, `RsuGrant`, `GrowthAssumptions`, and `ProjectedFYBreakdown` interfaces.
- **`constants/`** - Colors, animations, chart configuration tokens. `columns.ts` defines flexible column name mappings (`COLUMN_MAPPINGS`), required columns, and valid transaction types for the client-side file parser.
- **`lib/`** - Utility functions: formatters, date helpers, tax/FIRE/projection calculators, export helpers, and parsing. `fileParser.ts` handles client-side Excel/CSV parsing, SHA-256 file hashing, column mapping, and validation. `chatAdapters.ts` implements non-streaming JSON adapters and provider-neutral tool blocks. `chatContext.ts` fetches preferences only and builds a minimal currency/date/FY/tool-guidance prompt. `tax-config/` holds versioned fiscal-year tax rules with newest-first fallback.

### Key Patterns

- **Auth flow**: OAuth-only (Google, GitHub) with S256 PKCE. No email/password. `GET /api/auth/oauth/providers?flow_version=2` reports configuration; `POST /api/auth/oauth/{provider}/authorize` binds a 10-minute signed state to the provider, challenge, and configured redirect. Unversioned clients receive navigation-only `/api/auth/oauth/v2/{provider}/restart` URLs; the current frontend starts fresh PKCE from that bridge. Missing-verifier callbacks get a readable HTTP 409 refresh/sign-in message, and legacy state is never accepted. The browser tab retains the verifier and consumes its matching `sessionStorage` attempt before callback. The backend atomically consumes the pending `audit_logs` record before provider exchange, including when that exchange subsequently fails. Cross-origin Pages/Vercel sign-in uses no third-party cookies. Immutable provider subjects identify users; verified-email fallback may claim only legacy users whose provider and subject are both null. The callback fetches the profile before installing user and tokens together. `authStore` persists JWTs, `ProtectedRoute` enforces auth, and `useAuthInit` verifies startup state. Logout revokes outstanding token versions and ends the local session.
- **Session boundaries**: `lib/session.ts` aborts old work, advances its generation, cancels and clears query caches, and resets preferences, accounts, investment mappings, and budget stores. Request dispatch and publication retain/check the original signal; queued user mutations include the generation in their keys. The authenticated layout is keyed by identity to discard local drafts on account/demo changes. Token refresh within the same identity keeps the generation. Transaction-only resets retain settings stores; full resets clear them. Theme and motion remain device preferences.
- **Path alias**: `@/*` maps to `./src/*` in frontend TypeScript config.
- **Styling**: Tailwind CSS 4 with extensive CSS custom properties in `index.css` (design tokens for colors, typography, spacing, animations). Light and dark are the two themes; a user with no stored choice gets the OS `prefers-color-scheme` value. The compact financial workspace uses restrained neutral surfaces and semantic colors (income=green, expense=red, savings=purple, transfer=teal, investment=blue).
- **API proxy**: Vite proxies `/api` requests to `http://localhost:8000` during development.
- **Upload pipeline**: Files are parsed client-side using lazy-loaded SheetJS. The frontend hashes the raw file, maps flexible columns, validates rows, then requires a review of accounts, dates, counts, and complete-ledger scope. Confirmed `TransactionUploadRequest` JSON (`file_name`, 64-character `file_hash`, 1-100,000 `rows`, `force`) goes to `/api/upload`. The backend normalizes and validates every row, with decimal INR amounts required. It commits both transaction/transfer reconciliation and import history as one unit; missing rows are soft-deleted user-wide, including when one ledger group is empty. Analytics runs in a separate transaction and reports ready/failed status. The frontend calls `/api/analytics/v2/refresh` only for an explicit retry, not after every successful upload. The CLI retains the file-based `import_file()` path.
- **Server-side aggregation (v2.17+)**: Analytics pages use rollups (`/api/analytics/v2/*`, `/api/calculations/{totals,monthly-aggregation,category-breakdown}`) and focused read endpoints: `transactions/facets`, `calculations/{quick-insights,data-date-range,income-analysis,category-monthly-history,category-daily-series}`, and `analytics/v2/cohort-spending`. The shared `useAnalyticsTimeFilter` accepts either a transactions array (legacy) or a `{minDate,maxDate}` bounds object (from `data-date-range`). Preference-sensitive tax, GST, net-worth, health-score, and projection calculations still run client-side where needed. Book-value contributions and realised cash events must not be presented as actual market returns. Startup prefetch loads only preferences, active recurring commitments, and Data Health.
- **Settings**: Settings batches ordinary preferences and salary/RSU/growth inputs into one preferences request; classification and rule writes remain separate. Save waits for affected writes before final rehydration and retains drafts on partial failure.
- **Goals**: Create/edit/progress/allocation/delete operations persist through user-scoped goal APIs; demo equivalents live only for the current page visit. Never automatically apply or mutate the three old global browser keys. Authenticated, non-demo recovery compares recognized fields only with the current account's fetched positive goal IDs, requires explicit field selection and ownership confirmation, and confirms deletion separately. IDs 1-4 have a possible-demo warning. Refetch and compare current server/browser values before acting, guard the session around writes, and preserve drafts on failure. Account/goal/field acknowledgment markers prevent repeated proposals only after confirmed choices or successful writes.
- **Tax rules**: `getStandardDeduction(fy, regime)` retains default-new compatibility. Old-regime deduction is INR 50,000; new-regime deduction is INR 75,000 from FY 2024-25. Comparisons, break-even, previous-year values, and effective-rate charts use the appropriate regime. The UI states income basis, deductions, fiscal-year rules, and any latest-known fallback.
- **Data deduplication**: Transaction IDs hash user ID, date, amount, account, note, category, subcategory, type, and an occurrence suffix for otherwise-identical rows. Re-uploading the same data is idempotent without collapsing legitimate duplicates.
- **Database**: SQLite for development (`./ledger_sync.db`), Neon PostgreSQL for the hosted deployment. Alembic manages schema evolution; startup `init_db()` creates missing tables but does not migrate existing columns. SQLite connections apply WAL mode, 64MB cache, NORMAL sync, and foreign-key enforcement. PostgreSQL pooling is configurable through `LEDGER_SYNC_DB_*` settings (pool_size, max_overflow, pool_recycle_seconds, connect_timeout_seconds, statement_timeout_seconds, idle_transaction_timeout_seconds; defaults 5/3/300/10/30/60). Transaction-local timeouts support Neon's PgBouncer pooler. Dialect verification uses native PostgreSQL locally and in CI.
- **Database-agnostic SQL**: SQLite uses `strftime()`, PostgreSQL uses `to_char()`. Always use `query_helpers.py` helpers (`fmt_year_month`, `fmt_year`, `fmt_month`, `fmt_date`) instead of `func.strftime()` directly -- raw SQLite SQL will break production.
- **DB URL normalization**: `session.py` auto-converts `postgresql://` and `postgresql+psycopg2://` to `postgresql+psycopg://` (psycopg v3 driver).
- **Security**: Slowapi protects token refresh and OAuth callbacks by IP, plus upload and Bedrock chat by authenticated user and IP. Security headers, query timeouts, one-use browser-bound OAuth state, server-side token revocation, and user-scoped data access are required. SheetJS is pinned from the vendor CDN package. Current AI API-key writes use authenticated v3 AES-256-GCM envelopes with HKDF-SHA256 and a dedicated key; legacy v1/v2 reads require successful authentication before rewrapping. Bedrock quota reservations live in the database across serverless instances.
- **AI Chatbot (app_bedrock + BYOK, tool-calling)**: Two modes stored in `user_preferences.ai_mode`:
  - **`app_bedrock` (default)** -- when the server has Bedrock credentials configured, users share the app-funded model and region. `LEDGER_SYNC_AI_DAILY_MESSAGE_LIMIT` applies per user (default 10 model invocations/day, including tool rounds). The server reserves usage before invoking the provider and returns 429 when the applicable budget is exhausted.
  - **`byok`** -- user configures provider, model, API key, and daily/monthly token limits. OpenAI and Anthropic use the user key directly. Bedrock requires a decryptable, nonempty, non-sentinel personal bearer key; incomplete configuration returns 400 before reservation or invocation. Shared access requires explicit `app_bedrock` mode. Browser-direct budgets are informational, while backend-proxied budgets are enforced.
  - **Key preservation**: Same-provider model/region saves omit `api_key` or send null and require a usable stored key. A supplied blank/sentinel key or changed provider cannot overwrite it. Concurrent replacement returns 409 and the UI reloads metadata while keeping the draft. `has_key` means stored personal-key availability, not a successful live login. App mode preserves personal configuration; explicit removal uses DELETE.
  - **Transport**: OpenAI and Anthropic go browser-direct. Bedrock goes through `/api/ai/bedrock/chat` because it requires server-side authentication and does not support browser CORS. All providers use non-streaming JSON responses so tool calling remains one bounded request per round.
  - **Tool calling (v2.5+)**: The bot has 15 read-only tools registered in `backend/src/ledger_sync/api/ai_tools_impl/` (registry pattern; `ai_tools.py` is the thin router) -- `list_accounts`, `search_transactions`, `get_monthly_summary`, `list_categories`, `get_category_spending`, `get_net_worth`, `list_recurring`, `list_goals`, `list_recent_months`, `get_fy_summary`, `list_budgets`, `get_cash_flow`, `get_tax_summary`, `get_preferences_summary`, `list_anomalies`. The registry's Pydantic argument models define both advertised schemas and execution validation. Frontend `useChat` sends -> receives `tool_use` -> executes tools in parallel -> appends `tool_result` -> repeats until `end_turn` or the 6-round limit. Every tool is scoped through `CurrentUser` and has bounded arguments/results. Returned financial data enters the selected provider's conversation.
  - **System prompt**: `chatContext.ts` supplies preferences, date, fiscal-year context, and tool guidance. Financial summaries are fetched through tools when needed.
  - **Usage accounting**: `ai_usage_log` tracks funding source, reservation state, tokens, model, estimated cost, and rounds. Bedrock checks shared caps and token budgets under a user lock, commits the reservation before calling the provider, and settles once. Zero blocks; null removes a personal cap. Pending reservations count, and usage responses expose `reserved_tokens` and `pending_call_count` separately from completed totals. Client/credential/bearer setup failures and known nonbillable provider rejections, including `ModelNotReadyException`, release reservations. Ambiguous inference failures retain them within their original UTC windows. Provider retries are disabled. Browser-direct OpenAI/Anthropic reports track personal usage but cannot enforce a vendor spending ceiling.
- **PWA**: App is installable on mobile/desktop. Config lives in `frontend/vite.config.ts` (`VitePWA` plugin). Manifest uses relative `start_url`/`scope` for `/ledger-sync/`. Workbox precaches the static app shell and emitted chunks for offline use, including for anonymous sessions; runtime intent loading does not imply zero page-asset downloads. API data has no service-worker cache and uses TanStack Query invalidation. Icons are generated from `frontend/public/pwa-icon-source.svg` via `pnpm run generate:icons`; `pwa-assets.config.ts` overrides `minimal-2023`'s apple transform to `padding: 0` + transparent background so the gradient paints corner-to-corner and iOS applies its own squircle mask. Do NOT pass `--preset` on the generator CLI -- it overrides the config file. `registerType: 'autoUpdate'` and `clientsClaim` update the worker; an old open page can need a reload to execute the current app.
- **Mobile navigation**: Phone viewports below `lg` get a bottom tab bar with Dashboard, Transactions, Cash Flow, and More. `/more` mirrors all desktop navigation groups. The global `WorkspaceHeader` handles top safe-area placement; page-level `PageHeader` remains static in content flow. `AppLayout` reserves bottom-tab and home-indicator space. Use `h-dvh`, not `h-screen`, in layout primitives.

### Deployment

Hosted service boundaries:

| Service | Platform | URL |
|---------|----------|-----|
| Frontend | GitHub Pages | `sagargupta.online/ledger-sync/` |
| Backend | Vercel (serverless) | `ledger-sync-api.vercel.app` |
| Database | Neon PostgreSQL | PgBouncer pooler (Vercel integration) |

- **Frontend deployment** is called from CI on `main` after frontend, backend, native PostgreSQL, and security checks, then the production migration job. `.github/workflows/deploy-frontend.yml` builds with `GITHUB_PAGES=true` (Vite `base: '/ledger-sync/'`) and copies `index.html` to `404.html` for SPA routing. `VITE_API_BASE_URL` is a repository variable pointing to the backend.
- **Backend deployment** uses Vercel's Git integration, outside the GitHub Actions migration/Pages dependency chain. Coordinate schema-compatible releases using [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md). Vercel installs from `uv.lock`; `backend/vercel.json` routes to `api/index.py`, which exposes the FastAPI ASGI `app`. The `Mangum` handler is for an AWS Lambda target. The reusable migration workflow uses Python 3.13 and runs `alembic upgrade head` after checks. CI verifies empty SQLite bootstrap and native PostgreSQL migrations separately.
- **Vercel config** is defined in `backend/vercel.json`. Root directory is set to `backend` in Vercel project settings. Env vars (secrets) are set in the Vercel dashboard. The Neon database is connected via Vercel's Neon integration (Storage tab).
- **Neon connection string** must use the pooler URL with `?sslmode=require` and must NOT include `channel_binding=require` (PgBouncer doesn't support it).
- **OAuth redirect URIs** must be registered separately per environment (dev vs prod) -- GitHub only allows one callback URL per OAuth app.
- **JWT secret** is auto-generated in development. In production, `LEDGER_SYNC_JWT_SECRET_KEY` must be set (min 32 chars) or the app refuses to start.
- **App-funded Bedrock chat** requires configured server credentials: a Bedrock bearer token through `LEDGER_SYNC_BEDROCK_API_KEY`/`AWS_BEARER_TOKEN_BEDROCK`, or the supported AWS credential chain. The `LEDGER_SYNC_` bearer variant is bridged at startup. Missing server configuration returns HTTP 503; a usable personal Bedrock key follows the separate user-funded path.
- **AI rollout** requires the reservation migration before new workers, draining old workers before v3 ciphertext writes, and retaining previous encryption material until rewrapping completes. Database reservations serialize quotas across instances. Global per-minute limits still require external distributed SlowAPI storage.

### CI Pipeline (`.github/workflows/ci.yml`)

Check jobs run on push/PR and manual dispatch: `frontend` (shared `node-ci.yml`),
`backend` (locked wheel-only `uv sync`, Ruff, format check, mypy, pytest, and
empty SQLite Alembic bootstrap on Python 3.13), `postgres-migrations` (isolated
native PostgreSQL), and `security` (shared scan). On non-PR `main` runs,
successful checks gate the reusable `migrate` job, which gates Pages deployment.
No hosted deployment result is implied by a local check.

## Code Quality Rules

- Keep components/modules under 200 lines. If a file exceeds 250 lines, extract sub-components or hooks.
- One component per file (small styled wrappers co-located are fine).
- No `any` type -- use proper TypeScript types. Use `unknown` and narrow if unsure.
- No `console.log` in committed code. Use error boundaries or structured logging.
- Run `pnpm run check` before considering any feature complete.

## Toolchain Gotchas

- **This repo is CRLF** (`core.autocrlf=true`, no `.gitattributes`; ~75 of 80 sampled source files). `sed -i` and Python `read_text`/`write_text` both normalize to LF and produce a diff touching every line. Use the Edit tool. `backend/uv.lock` is legitimately LF at HEAD -- check a file's own baseline before "fixing" it.
- **`typescript-eslint` gates the TypeScript version.** 8.65.0 declares peer `typescript: >=4.8.4 <6.1.0` and hard-errors on TS 7 ("typescript-eslint does not support TS 7.0"), which breaks `pnpm run lint` repo-wide and therefore CI, since the shared `node-ci.yml` gates on lint with no `|| true`. TypeScript is deliberately pinned at 6.0.3; only 8.65.1-alpha builds attempt TS 7. Do not bump TypeScript until a stable typescript-eslint supports it.
- **`react-router-dom` has no 8.x line.** GHSA-qwww-vcr4-c8h2 (high, RSC-mode CSRF) is patched only in the `react-router` package at 8.3.0, which in v8 replaces `react-router-dom`. "Upgrading" is a migration across all routed pages, not a version bump. Dependabot alert 105 stays open by decision; the advisory does not apply here because the app renders a client-side `BrowserRouter` with no RSC APIs and no `@react-router/*` server packages.
- **Git worktrees belong at the repo root, never under `frontend/`.** A nested worktree gives typescript-eslint two tsconfig roots and the pre-commit hook then fails repo-wide with zero real lint problems.
- **`backend/ledger_sync.db` is the LOCAL dev database, not production.** It holds real personal data and is gitignored: read-only SQL only, never commit it or anything derived from it, report shares and counts rather than balances or full account names. Production is Neon; its values differ from this file, so never present a local read as a prod fact.

## Project Skills

The repo-specific skill set (atlas/craft/task skills under `.claude/skills/`) was untracked and removed from the working tree on 2026-07-03 (commit 594f102, "untrack AI assistant local files"). It no longer exists locally -- recover from git history at `594f102^` if ever needed. Until restored, workspace-level and user-level skills cover this repo.

## New Feature Patterns

- **New page (single-file)**: Create `<PageName>Page.tsx` directly in `pages/`. Use PascalCase. Add lazy import in `App.tsx`, add sidebar entry. Keep under 300 lines.
- **New page (multi-file, >300 lines)**: Create kebab-case directory: `pages/<page-name>/`. Structure: `<PageName>Page.tsx` (thin orchestrator) + `use<Page>.ts` (hook for state/data) + `types.ts` + `<page>Utils.ts` + `components/` subfolder for sub-components. Lazy-load new feature pages by default; eager imports are reserved for core first-navigation pages with a documented reason.
- **New API endpoint**: Router in `api/`, business logic in `core/`, schema in `schemas/`. No business logic in routers. Always prefix routes with `/api/...` in the router prefix for consistency.
- **New DB model**: Add to appropriate `db/_models/` file (e.g., `user.py`, `transactions.py`). Re-export from `db/_models/__init__.py`. The `db/models.py` facade picks it up automatically. Always create an Alembic migration.
- **New hook**: API hooks in `hooks/api/` using TanStack Query with `staleTime: Infinity`. UI hooks in `hooks/`. Mutation hooks capture `getSessionSignal()` during render, include `getSessionGeneration()` in their key, assert the captured session before service dispatch, and carry the signal through `onMutate` context. Check that original context with `isCurrentSession()` before publishing results or invalidating caches.
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
- **Themes**: Light and dark only -- the `system` mode was removed, so `ThemeMode` is `'dark' | 'light'` and `resolveTheme` is now identity. Users with no stored choice get the OS `prefers-color-scheme` value once at load; a stored legacy `'system'` value falls back the same way. Keep every shared token and new component readable in both themes.
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
- Irreversible migrations fail closed instead of pretending to downgrade. Use the backup and forward-repair procedures in [`docs/DATABASE.md`](docs/DATABASE.md); verify dialect behavior with synthetic SQLite and native PostgreSQL databases.
- Hosted PostgreSQL can suspend while idle. Default connection timeout is 10s and statement timeout is 30s; confirm configured values when diagnosing a deployment.

## Performance Rules

- Lazy-load feature pages with `React.lazy` + `Suspense`. Keep only the four core first-navigation pages eager unless measured startup behavior justifies another exception.
- Memoize expensive computations with `useMemo`. Use `useCallback` for handlers passed as props.
- Use TanStack Query for API calls. Never raw `useEffect` + `fetch`.

## Knowledge Graph (graphify)

- `graphify-out/` holds a prebuilt code graph (gitignored). For architecture/relationship questions ("what calls X", "trace Y to the DB", impact of a change), query it before grepping: `graphify query "<question>"`, `graphify path "A" "B"`, `graphify explain "X"`, `graphify affected "X"`.
- Treat the graph as a map and verify important claims against current source. Record refresh scope: local AST extraction can refresh code structure without a model call, while semantic document extraction may require a provider. Do not describe every `graphify update .` run as AST-only.
- Use the installed Graphify runtime and supported extract/merge APIs for a code-only refresh when requested; do not install dependencies or process `.env`, credentials, databases, or generated data. Preserve unrelated graph content and verify source hashes after extraction. If `graphify-out/` is missing, fall back to normal search unless a rebuild is requested.

The maintained system, import, OAuth, session, analytics, and AI diagrams are in
[`docs/architecture.md`](docs/architecture.md).
