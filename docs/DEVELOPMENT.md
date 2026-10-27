# Development Guide

Current for Ledger Sync 2.31.0.

This guide covers the supported local workflow. For behavior and ownership
details, also see:

- [Architecture](architecture.md)
- [API Reference](API.md)
- [Database](DATABASE.md)
- [Testing](TESTING.md)
- [Deployment](DEPLOYMENT.md)

## Toolchain

| Tool | Supported baseline |
| --- | --- |
| Python | 3.14 (`requires-python = ">=3.14,<3.15"`) |
| Python package manager | uv |
| Node.js | 22.22.0 or newer (the `react-router` 8 engines minimum) |
| JavaScript package manager | pnpm, the version in `package.json` `packageManager` |
| Backend | FastAPI, SQLAlchemy 2, Alembic, Pydantic 2 |
| Frontend | React 19, TypeScript 7, Vite 8, Tailwind CSS 4 |

Git is required. SQLite is used by default for local development; production
uses PostgreSQL 17. Only PostgreSQL test runs need the pgvector extension (see
[Database changes](#database-changes)).

## First Setup

```powershell
git clone https://github.com/Sagargupta16/ledger-sync.git
cd ledger-sync

pnpm install --frozen-lockfile
pnpm run setup

cd backend
uv run alembic upgrade head
cd ..
```

`pnpm run setup` installs the backend development group and frontend
dependencies. The root install provides the task runner used by the combined
commands. `alembic upgrade head` creates the local schema: backend startup does
not create tables unless the development-only
`LEDGER_SYNC_DB_BOOTSTRAP_ON_STARTUP=true` option is set (default off). Rerun it
after pulling new revisions.

### Local configuration

Copy the root [`.env.example`](../.env.example) to `backend/.env` and change only
the values needed for local development. Never commit `backend/.env`.

The backend automatically creates an ephemeral JWT secret in development. At
least one OAuth provider is required for real sign-in:

| Provider | Local callback |
| --- | --- |
| Google | `http://localhost:5173/auth/callback/google` |
| GitHub | `http://localhost:5173/auth/callback/github` |

Set `LEDGER_SYNC_FRONTEND_URL=http://localhost:5173`. Register the matching
callback with the provider and configure its client ID and secret.

Phone alerts (`LEDGER_SYNC_VAPID_PUBLIC_KEY`, `LEDGER_SYNC_VAPID_PRIVATE_KEY`,
`LEDGER_SYNC_VAPID_SUBJECT`, `CRON_SECRET`) and semantic search
(`LEDGER_SYNC_EMBEDDING_*`) read their own settings classes. Set their values in
the shell that starts the backend, never in `backend/.env`: `Settings` forbids
any key it does not declare, so an undeclared one in that file stops the
backend at start-up, and the error echoes its value.
[DEPLOYMENT.md](DEPLOYMENT.md#optional-phone-alerts-web-push) has the
PowerShell key generator. Smart search also needs Bedrock credentials
(`LEDGER_SYNC_BEDROCK_API_KEY`, a declared setting). On SQLite it stores float32
bytes and ranks with numpy, so it needs no extension.

Two things differ under `pnpm run dev`. The PWA service worker is off, so the
Settings > Notifications panel reports that alerts cannot be turned on; the
worker, and so Web Push, exists only in a production build. Vite proxies only
`/api`, so the MCP address Settings shows is `http://localhost:8000/mcp`.

No frontend environment file is needed locally. The frontend uses same-origin
`/api` requests, and Vite proxies them to `http://localhost:8000`.

Use `/demo` when working on UI that does not require a real OAuth session or
database data.

## Run the App

From the repository root:

```powershell
pnpm run dev
```

Services:

| Service | URL |
| --- | --- |
| Frontend | `http://localhost:5173` |
| Backend | `http://localhost:8000` |
| OpenAPI UI (development only) | `http://localhost:8000/docs` |
| API health | `http://localhost:8000/health` |
| Database health | `http://localhost:8000/health/db` |

To run the services separately:

```powershell
pnpm run dev:backend
pnpm run dev:frontend
```

The backend reloads Python files under `backend/src`. Vite provides frontend
hot-module replacement.

## Root Commands

| Command | Purpose |
| --- | --- |
| `pnpm run setup` | Install backend and frontend dependencies |
| `pnpm run dev` | Start both development servers |
| `pnpm run lint` | Run Ruff and ESLint |
| `pnpm run type-check` | Run mypy and TypeScript checks |
| `pnpm run test` | Run pytest and Vitest |
| `pnpm run check` | Run lint, type checks, and tests |
| `pnpm run format` | Apply Ruff and ESLint fixes |
| `pnpm run build` | Build the production frontend |

The full local release gate is:

```powershell
pnpm run check
pnpm run build
```

See [TESTING.md](TESTING.md) for focused commands and the current suite
baseline.

## Repository Layout

```text
ledger-sync/
  backend/
    api/
    src/ledger_sync/
      api/
      config/
      core/
        analytics/
        auth/
      db/
        _models/
        migrations/
      ingest/
      schemas/
      services/
    tests/
  frontend/
    public/
    src/
      components/
      constants/
      hooks/
      lib/
      pages/
      services/api/
      store/
      types/
      workers/
  docs/
  .github/workflows/
```

## Backend Development

### Request ownership

Keep responsibilities separated:

| Layer | Responsibility |
| --- | --- |
| `api/` | Routing, dependencies, validation, and HTTP responses |
| `schemas/` | Pydantic request and response contracts |
| `core/` | Financial, reconciliation, and analytics behavior |
| `services/` | Cross-cutting provider and auth services |
| `db/_models/` | SQLAlchemy models grouped by domain |
| `db/migrations/` | Alembic schema history |

All financial queries must be scoped by `current_user.id`. Do not put domain
logic in a router.

A minimal authenticated route uses the shared dependencies:

```python
from fastapi import APIRouter

from ledger_sync.api.deps import CurrentUser, DatabaseSession

router = APIRouter(prefix="/api/example", tags=["example"])


@router.get("")
def get_example(
    current_user: CurrentUser,
    db: DatabaseSession,
) -> dict[str, int]:
    count = load_user_scoped_count(db, user_id=current_user.id)
    return {"count": count}
```

Register new routers in `api/main.py`, place reusable behavior in `core/`, and
add integration coverage for the HTTP contract.

A route that only an automation token may call depends on
`require_token_scope(scope)` from `api/deps.py` instead of `CurrentUser`. Add a
new scope to `TOKEN_SCOPES` in `db/_models/upload_tokens.py` first. Every
token holds one scope and cannot sign in or reach any other route.

### Database changes

1. Add the model to the relevant module under `db/_models/`.
2. Export it from `db/_models/__init__.py`.
3. Generate an Alembic revision.
4. Inspect the generated operations.
5. Test a clean upgrade.

```powershell
cd backend
uv run alembic revision --autogenerate -m "add example table"
uv run alembic upgrade head
uv run alembic current
```

`db/models.py` is a compatibility facade, not the place to define a model.

A table that no older backend names ships expand-only. Vercel can serve the new
code before CI migrates the database, so an import or reset path that touches
the table must tolerate its absence (`has_table`, as in `_delete_if_migrated`
in `services/auth_account_data.py`); the routes that read it may fail until the
revision runs. A PostgreSQL-only type needs a dialect-aware column: see
`EmbeddingVector` in `db/_models/transaction_embeddings.py`, pgvector
`vector(512)` on PostgreSQL and float32 bytes on SQLite, with a `before_create`
hook that runs `CREATE EXTENSION IF NOT EXISTS vector` so `metadata.create_all`
works too.

Unsupported historical downgrades fail before any step in the rollback plan
changes the schema or version marker. New revision templates use the same
backup/forward-recovery guard. Use a verified backup or a forward repair rather
than relying on `alembic downgrade -1`. See the
[migration notes](../backend/src/ledger_sync/db/migrations/MIGRATION_NOTES.md).

Run `uv run pytest tests/integration/test_migrations_from_scratch.py` for SQLite
bootstrap and constraint behavior. Set `LEDGER_SYNC_TEST_POSTGRES_URL` to a local
disposable PostgreSQL database named `ledger_sync_test*` to run the same checks
on PostgreSQL. CI starts an isolated native PostgreSQL cluster using installed
runner binaries and gates releases on it, without containers.

A local test PostgreSQL needs the pgvector extension installed for its major
version, because the migration and `create_all` create `transaction_embeddings`
with a `vector(512)` column. The fixtures create a schema per test and the
extension inside it, so never run `alembic upgrade` against that database's
`public` schema. If a stray `vector` extension ends up in `public`, run
`DROP EXTENSION vector CASCADE` there. CI installs `postgresql-<major>-pgvector`
before it starts its cluster and runs pytest before its CLI upgrade.

Keep real imports in ignored `imports/` or `private/` directories and database
backups in `backups/`. Environment variants, CSV/TSV imports, SQL dumps, and key
files are ignored. Only synthetic files under `tests/fixtures/` or `examples/`
and explicit `.env*.example`, `.env*.template`, or `.env*.sample` templates are
eligible for source control.

Use `fmt_year_month`, `fmt_year`, `fmt_month`, and `fmt_date` from
`core/query_helpers.py` instead of raw SQLite `strftime` calls. Production
queries must also work on PostgreSQL.

### Upload path

The web upload endpoint does not receive multipart files. The browser:

1. Parses Excel or CSV with SheetJS.
2. Maps and validates columns.
3. Computes a SHA-256 file hash.
4. Sends `TransactionUploadRequest` JSON to `POST /api/upload`.

The backend normalizes and reconciles the rows, persists the ledger, and then
runs a selective `refresh_analytics()` in a separate transaction: a current
generation skips all work, daily and monthly summaries and category trends
rebuild only their dirty days and months, and the other rollup domains rebuild
in full. The CLI retains the file-based ingestion path.

A Money Manager `.mmbak` backup (`POST /api/upload/money-manager`) and a CAS PDF
(`POST /api/upload/cas`, read in memory) are read on the server instead; see
[Architecture](architecture.md).

## Frontend Development

### Routing and pages

`App.tsx` currently defines:

- 3 public routes
- 30 protected workspace routes
- 4 eager page components
- 29 lazy page components

Add a route constant, direct page import, nested route, and navigation entry
for every new page. Do not add page-level barrel files.

Simple pages can remain one component. Larger features use:

```text
pages/<feature>/
  <Feature>Page.tsx
  use<Feature>.ts
  types.ts
  <feature>Utils.ts
  components/
```

Keep the page component focused on composition. Put data access in hooks and
pure transformations in utility modules.

### Server state and API calls

1. Add a typed method under `services/api/`.
2. Add or extend a TanStack Query hook under `hooks/api/`.
3. Use stable query keys. A figure that depends on preferences or
   classifications goes under `calculations`, so `invalidatePreferenceDependents`
   refreshes it.
4. Invalidate only affected keys after mutations.
5. Add a `DEMO_ROUTES` entry in `services/api/client.ts` for every GET the page
   makes, so `/demo` answers it from the demo ledger. The first substring match
   wins, so specific paths precede generic ones. Load a feature resolver
   through `lazyDemo(...)` to keep it out of the first-load bundle.

The shared Axios client attaches bearer tokens, serializes refresh attempts,
replays queued requests, and handles demo-mode interception. Do not bypass it
with ad hoc authenticated fetch calls.

TanStack Query owns API server state. Use Zustand only for state that must
persist or coordinate across pages, such as authentication, preferences,
theme, and demo mode.

### Web Workers

Put a worker in `src/workers/` and start it with an inline
`new Worker(new URL('../../workers/x.worker.ts', import.meta.url), { type: 'module' })`
so Vite bundles it; the literal URL must stay inline. Keep a main-thread
fallback, as `useMonteCarloRunner` does for the FIRE Monte Carlo. The CSP already
allows `worker-src 'self'`, and Workbox precaches the worker chunk.

### UI and responsive behavior

Use the shared page, control, table, money, loading, empty, error, and chart
primitives before adding a new variant. Use design tokens from `index.css`
instead of raw colors.

Requirements:

- Keep interactive targets at least 44 by 44 CSS pixels on touch layouts.
- Use `PageContainer` and `PageHeader` for page structure.
- Use `DataTable` with `mobileCards` for wide flat tables.
- Use `Money` where amounts could be compressed.
- Pass an `ariaLabel` to every chart and preserve its accessible table.
- Preserve both the Light and Dark themes.
- Honor the existing Full and Reduced motion preference.
- Verify 320 px phone, phone landscape, tablet, desktop, and wide desktop
  layouts in a real browser.
- Do not hide required workflows on mobile.

### Building and extending charts

Use the [shared chart composition](architecture.md#shared-chart-composition)
reference for component ownership and source links. Keep financial queries,
classification, date filtering, and calculations in feature hooks and utilities.
Pass the resulting rows, labels, colors, formatters, and drilldown callbacks to
the Standard chart adapters.

For a custom plot, compose the kit in `components/charts/`: `CartesianChart`
with `Bars`, `LineSeries`, `AreaSeries`, `Axis`, `Grid`, `References`,
`Crosshair`, and `CartesianTooltip`, or `PieChart`, `RadarChart`, and
`SankeyDiagram`. Each root draws inside `ChartFrame`, which already follows
the live theme, motion, viewport, and print settings, so a plot needs no
subscription of its own. Read series colors through `usePaletteSnapshot` so
they repaint on a theme toggle, and time any new animation with the
`chartMotion` tokens. `ChartSeriesLegend` and `PieChartLedger` in
`components/ui/` cover HTML beside the plot.

Standard adapters already render accessible data tables. For custom plots,
follow [chartDataTable](../frontend/src/components/ui/chartDataTable.tsx): keep
the captioned table outside the plot's image wrapper, with exactly one scoped
row-header column. The required shape is:

```tsx
<>
  <CartesianChart data={rows} categoryKey="month" series={series} height={280} ariaLabel={description}>
    <Bars dataKey="amount" color={palette.expense} />
  </CartesianChart>
  {chartDataTable(rows, columns, description, rowKey)}
</>
```

Do not wrap this fragment or a Standard chart in another `role="img"` element;
that would hide the table's semantics. Use the same series labels and value
formatting as the plot. Pie fallbacks use the same grouped slices as the wedges,
including the exact Other amount; category clicks go through `sliceClickTarget`.

When changing chart presentation, verify the affected behavior:

- Check the table's caption, headers, rows, values, and absence of any
  `role="img"` ancestor. The existing
  [accessible chart checks](../frontend/src/components/analytics/__tests__/StandardAccessibleCharts.test.tsx)
  cover data parity; inspect accessibility in a browser too, since jsdom does
  not implement image descendants becoming presentational.
- Toggle Light/Dark and Full/Reduced while the chart is mounted. Check SVG
  paint, tooltip motion, ledger interactions, and retention of page state.
  Keep colors derived from tokens and animations tied to the existing stores.
- Preserve all selected-period rows when adding a brush or mobile window.
  Keep controlled range state in `useChartRange` above the chart and pass it as
  `visibleRange`, so only the plot zooms. Check both history endpoints, earlier/later controls,
  period changes, and the full table and summary totals. See the
  [monthly range regression checks](../frontend/src/components/analytics/__tests__/MonthlyFlowChartRange.test.tsx).
- Exercise empty and single-point series, negative values, long labels, and
  narrow layouts; confirm existing category drilldown still reaches its target.

## Testing

Focused backend checks:

```powershell
cd backend
uv run ruff check .
uv run ruff format --check .
uv run mypy src/
uv run pytest tests/ -q
```

Focused frontend checks:

```powershell
cd frontend
pnpm run lint
pnpm run type-check
pnpm test
pnpm run build
```

Test business logic and API behavior on the backend. On the frontend, prioritize
hooks, utilities, state transitions, accessibility behavior, and regressions
over render-only snapshots.

## Sign-In Troubleshooting

The sign-in dialog distinguishes two cases:

- **No configured providers:** the provider request succeeded with an empty
  list.
- **Could not reach the sign-in service:** the provider request failed before a
  valid response arrived.

For the second case:

1. Open `http://localhost:8000/health`.
2. Open `http://localhost:8000/api/auth/oauth/providers`.
3. Confirm the frontend is running through Vite on port 5173.
4. Confirm local `VITE_API_BASE_URL` is unset so the Vite proxy is used.
5. Confirm `LEDGER_SYNC_FRONTEND_URL` exactly matches the frontend origin.
6. Check backend startup output for database connection or configuration
   failure.

A database migration is not the first assumption. The provider endpoint does
not query application data, and backend startup does not open the database
unless `LEDGER_SYNC_DB_BOOTSTRAP_ON_STARTUP=true` is set (development only,
default off). A failed provider request therefore usually means the backend is
not running or the proxy or origin is wrong. Missing tables show up later, on
the first data request, when `uv run alembic upgrade head` has not been run.

## Common Problems

### PowerShell blocks `pnpm`

Use the Windows command shim:

```powershell
pnpm.cmd run check
```

### Backend does not start

- Confirm Python 3.14 and uv are available.
- Run `uv sync --group dev` inside `backend`.
- Run `uv run alembic upgrade head`.
- If the error says `Extra inputs are not permitted`, `backend/.env` holds a key
  that `Settings` does not declare. Move `LEDGER_SYNC_VAPID_*`,
  `LEDGER_SYNC_EMBEDDING_*`, and `CRON_SECRET` to the shell environment.
- Check whether port 8000 is already in use.
- Check `/health/db` after startup.

### Frontend does not start

- Confirm Node.js 22.22.0 or newer and the pnpm version in `packageManager`.
- Run `pnpm install --frozen-lockfile` inside `frontend`.
- Run `pnpm run clean` if the Vite cache is stale.
- Check whether port 5173 is already in use.

### Production-only query failure

Search the affected query for SQLite-only functions. Replace raw date
formatting with `core/query_helpers.py` helpers and test against PostgreSQL
semantics.

## Git Workflow

Start from `main` and use the repository naming convention:

```powershell
git switch main
git pull --ff-only origin main
git switch -c feat/example
```

Before publishing:

```powershell
pnpm run check
pnpm run build
git diff --check
git status --short
```

Stage intended files by name, use a conventional lowercase commit, push the
feature branch, and open a pull request to `main`. Never commit directly to
`main`, skip hooks, or stage the whole worktree blindly.
