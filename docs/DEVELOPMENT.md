# Development Guide

Current for Ledger Sync 2.22.0.

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
| Python | 3.13 or newer |
| Python package manager | uv |
| Node.js | 22 or newer |
| JavaScript package manager | pnpm 11.10.0 |
| Backend | FastAPI, SQLAlchemy 2, Alembic, Pydantic 2 |
| Frontend | React 19, TypeScript 6, Vite 8, Tailwind CSS 4 |

Git is required. SQLite is used by default for local development; production
uses PostgreSQL 17.

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
commands.

### Local configuration

Copy `backend/.env.example` to `backend/.env` and change only the values needed
for local development. Never commit `backend/.env`.

The backend automatically creates an ephemeral JWT secret in development. At
least one OAuth provider is required for real sign-in:

| Provider | Local callback |
| --- | --- |
| Google | `http://localhost:5173/auth/callback/google` |
| GitHub | `http://localhost:5173/auth/callback/github` |

Set `LEDGER_SYNC_FRONTEND_URL=http://localhost:5173`. Register the matching
callback with the provider and configure its client ID and secret.

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
| OpenAPI UI | `http://localhost:8000/docs` |
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

Migrations from 2026-02-03 onward intentionally do not provide automatic
downgrades. Do not rely on `alembic downgrade -1`. Use a backup, a forward
repair migration, or both. See the
[migration notes](../backend/src/ledger_sync/db/migrations/MIGRATION_NOTES.md).

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
attempts a full analytics refresh. The CLI retains the file-based ingestion
path.

## Frontend Development

### Routing and pages

`App.tsx` currently defines:

- 3 public routes
- 24 protected workspace routes
- 4 eager page components
- 23 lazy page components

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
3. Use stable query keys.
4. Invalidate only affected keys after mutations.

The shared Axios client attaches bearer tokens, serializes refresh attempts,
replays queued requests, and handles demo-mode interception. Do not bypass it
with ad hoc authenticated fetch calls.

TanStack Query owns API server state. Use Zustand only for state that must
persist or coordinate across pages, such as authentication, preferences,
theme, and demo mode.

### UI and responsive behavior

Use the shared page, control, table, money, loading, empty, error, and chart
primitives before adding a new variant. Use design tokens from `index.css`
instead of raw colors.

Requirements:

- Keep interactive targets at least 44 by 44 CSS pixels on touch layouts.
- Use `PageContainer` and `PageHeader` for page structure.
- Use `DataTable` with `mobileCards` for wide flat tables.
- Use `Money` where amounts could be compressed.
- Give every chart an accessible name.
- Preserve Light, Dark, and System themes.
- Verify 320 px phone, phone landscape, tablet, desktop, and wide desktop
  layouts in a real browser.
- Do not hide required workflows on mobile.

## Testing

Focused backend checks:

```powershell
cd backend
uv run ruff check src/ tests/
uv run ruff format --check src/ tests/
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
not query application data, but backend startup initializes the database, so an
unreachable database can prevent the service from starting at all.

## Common Problems

### PowerShell blocks `pnpm`

Use the Windows command shim:

```powershell
pnpm.cmd run check
```

### Backend does not start

- Confirm Python 3.13 and uv are available.
- Run `uv sync --group dev` inside `backend`.
- Run `uv run alembic upgrade head`.
- Check whether port 8000 is already in use.
- Check `/health/db` after startup.

### Frontend does not start

- Confirm Node.js 22 and pnpm 11.10.0.
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
