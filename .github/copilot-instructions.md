# Ledger Sync - AI Agent Instructions

## Architecture Overview

**Monorepo structure:** Python FastAPI backend + React/TypeScript frontend, sharing a single pnpm workspace. Backend in `backend/`, frontend in `frontend/`, documentation in `docs/`.

**Core data flow:** Excel → Normalizer → Validator → Hash ID Generator → Reconciler → SQLite DB → FastAPI → React Dashboard. The reconciler uses SHA-256 hashing of `(date, amount, account, note, category, subcategory, type)` to generate deterministic transaction IDs for idempotent ingestion.

**Key architectural decision:** Transactions are immutable once imported. Reconciliation performs INSERT (new hash), UPDATE (existing hash but changed data), or SOFT_DELETE (not in import) - never hard deletes. This enables audit trails and re-sync from Excel sources.

## Development Workflows

**Start everything:** `pnpm run dev` from root (uses `concurrently` to run both services)

- Backend: http://localhost:8000
- Frontend: http://localhost:3000
- First-time setup: `pnpm run setup`

**Testing backend:** Run from `backend/` directory: `pytest` (unit tests in `tests/unit/`, integration in `tests/integration/`)

- Coverage: `pytest --cov=ledger_sync tests/`
- Specific file: `pytest tests/unit/test_hash_id.py -v`

**Database migrations:** Alembic manages schema (run from `backend/` directory)

- Create: `alembic revision --autogenerate -m "description"`
- Apply: `alembic upgrade head`
- DB file: `ledger_sync.db` (SQLite, configured in `backend/src/ledger_sync/config/settings.py`)

**Code formatting:** `pnpm run format` from root (formats both backend and frontend)

- Backend only: `pnpm run format:backend` (Black + Ruff)
- Frontend only: `pnpm run format:frontend` (ESLint with auto-fix)

## Backend Patterns

**Layered architecture** (do NOT mix layers):

1. `api/` - FastAPI endpoints only, no business logic. Use dependency injection via `Depends(get_session)`.
2. `core/` - Business logic (reconciler, sync engine, calculator). Pure functions where possible.
3. `db/` - SQLAlchemy ORM models and session management. Models use `Mapped[type]` annotations.
4. `ingest/` - Excel processing pipeline (loader → normalizer → validator → hash_id).

**Transaction ID generation** (`ingest/hash_id.py`): Always normalize inputs (lowercase, strip, ISO dates, 2-decimal amounts) before hashing. Include all 7 fields for uniqueness. Example:

```python
hasher = TransactionHasher()
tx_id = hasher.generate_transaction_id(date, amount, account, note, category, subcategory, tx_type)
```

**Session management:** Use `get_session()` dependency in FastAPI routes. Never create sessions manually in endpoints.

**Enums:** Use SQLAlchemy `Enum` with Python `Enum` subclass: `class TransactionType(str, PyEnum)`. Store as strings in DB.

## Frontend Patterns

**State management:** TanStack Query for server state, Zustand for client state (user preferences, UI state in `store/`).

**API hooks pattern** (`hooks/api/`): Wrap `useQuery` for reads, `useMutation` for writes. Always invalidate queries on mutation success:

```typescript
const queryClient = useQueryClient();
return useMutation({
  mutationFn: apiCall,
  onSuccess: () => queryClient.invalidateQueries(),
});
```

**Query configuration:** Global defaults in `lib/queryClient.ts`: 5min staleTime, 30min gcTime, 1 retry, no refetchOnWindowFocus.

**Component organization:**

- `pages/` - Route-level components (13 financial pages)
- `components/analytics/` - Complex chart/KPI components (FinancialHealthScore, CashFlowForecast, etc.)
- `components/ui/` - Base UI primitives (shadcn-style)
- `components/shared/` - Reusable business components

**Styling:** Tailwind CSS only. Use `cn()` utility (`lib/cn.ts`) for conditional classes: `cn("base-class", condition && "conditional-class")`.

**Routing:** React Router v7. Page components in `pages/`, routes defined in `App.tsx`.

## Critical Conventions

**Financial calculations:** Always use `Decimal` in Python backend, never floats. Frontend receives numbers as strings, parse carefully.

**Date handling:**

- Backend: UTC `datetime` objects, stored as ISO-8601 strings
- Frontend: `date-fns` for parsing/formatting, NOT moment.js
- Fiscal year: April 1 - March 31 (India FY), critical for YoY comparisons

**API response patterns:** FastAPI endpoints return Pydantic models or plain dicts. No manual JSON serialization. Use `response_model` on routes.

**Error handling:**

- Backend: Raise `HTTPException(status_code=4xx, detail="message")` from FastAPI routes
- Frontend: TanStack Query handles errors automatically, access via `error` in hook return

**Type safety:** TypeScript `strict` mode enabled. Define types in `frontend/src/types/index.ts`. Never use `any` except for truly dynamic data.

## Integration Points

**CORS:** Backend allows `localhost:3000`, `localhost:5173`, `localhost:5174` (configured in `settings.py`). Add production origins to `cors_origins` list.

**File uploads:** Frontend uses `react-dropzone`, sends multipart/form-data to `/api/upload`. Backend expects `.xlsx` files, processes with `openpyxl`.

**Column mapping:** Backend normalizes various Excel column names via settings (e.g., "Period"/"Date"/"date" all map to `date`). See `config/settings.py` column mappings.

**Excel format assumption:** Money Manager Pro export format (specific columns). See `docs/DATABASE.md` for schema expectations.

## Common Tasks

**Add new API endpoint:**

1. Create route in appropriate `api/*.py` file
2. Add business logic to `core/*.py`
3. Add database queries to `db/models.py` or service layer
4. Create frontend hook in `hooks/api/`
5. Use hook in component/page

**Add new analytics component:**

1. Create component in `components/analytics/`
2. Fetch data via TanStack Query hook
3. Use Recharts for visualization (preferred over Chart.js)
4. Add to relevant page in `pages/`

**Modify database schema:**

1. Update `backend/src/ledger_sync/db/models.py` SQLAlchemy model
2. From `backend/` directory, run: `alembic revision --autogenerate -m "description"`
3. Review generated migration in `backend/alembic/versions/`
4. Apply: `alembic upgrade head`

**Debug reconciliation:** Check `reconciler.py` logs. Use `ReconciliationStats` to track INSERT/UPDATE/DELETE/SKIP counts. Verify hash generation with `TransactionHasher.generate_transaction_id()` against known inputs.
