---
description: Walks the full-stack workflow for adding a feature to ledger-sync — backend endpoint, frontend page/component, TanStack Query hook + axios service, Pydantic↔TS contract, optional DB model. Use when adding a new feature that spans more than one layer ("expose X to the dashboard", "add a /endpoint that the UI consumes", "build a new page showing Y"). Single-layer tasks (Alembic migration only, AI tool only, release notes) have their own dedicated skills.
---

# Add a feature — full-stack workflow

Most ledger-sync features touch 3-5 places: a backend router, a Pydantic schema, sometimes a model, a frontend service, a hook, a page or component. This skill walks the whole stack so you don't end up with a half-wired feature.

If your task is **strictly one layer**, prefer:
- `new-migration` — model/schema change only
- `new-ai-tool` — adding to the chatbot tool registry
- `release-changelog` — version bump
- `schema-drift-check` — already changed a Pydantic schema, want to verify TS

## Decision tree

```
Does the feature need to persist data?
  YES → start with new-migration skill (model + Alembic), come back here
  NO  → continue
        ↓
Does the frontend need to fetch new data?
  YES → backend endpoint (Section A) + service + hook (Section C)
  NO  → frontend pure-function only (Section B)
        ↓
Does the user see something new?
  YES → page or component (Section B)
  NO  → done after backend
        ↓
Did Pydantic schemas change?
  YES → run schema-drift-check before committing
  NO  → ready
```

---

## Section A — Backend endpoint

### Hard rules (these are how the code is held together)

1. **Layering is one-way.** `api/` calls `services/` and `core/`, `core/` calls `db/`. Never call `db.session` from a router. Never put business logic in a router.
2. **Multi-tenancy is non-negotiable.** Every protected endpoint takes `current_user: CurrentUser` and every query filters `WHERE user_id = current_user.id`. Integration test [test_analytics_user_scoping.py](backend/tests/integration/test_analytics_user_scoping.py) catches violations.
3. **Routes prefixed `/api/...`** — set in the router's `APIRouter(prefix="/api/<resource>")`.
4. **Register in `main.py`.** Forgetting this is the #1 "endpoint returns 404" bug. Both the import block and the `app.include_router()` block.
5. **DB-agnostic SQL.** Use `query_helpers.fmt_year_month`, `fmt_year`, `fmt_month`, `fmt_date`. Never raw `func.strftime()` — works on SQLite, silently breaks Postgres.

### Pattern

Pick the right router file under [backend/src/ledger_sync/api/](backend/src/ledger_sync/api/). Each file owns one resource. If genuinely new, create `api/<resource>.py`.

```python
from fastapi import APIRouter, HTTPException
from sqlalchemy import select

from ledger_sync.api.deps import CurrentUser, DatabaseSession
from ledger_sync.db.models import Transaction
from ledger_sync.schemas.<resource> import MyResponse  # always Pydantic, never raw dict

router = APIRouter(prefix="/api/<resource>", tags=["<resource>"])


@router.get("/<path>")
def my_endpoint(
    current_user: CurrentUser,
    db: DatabaseSession,
) -> MyResponse:
    stmt = select(Transaction).where(
        Transaction.user_id == current_user.id,  # always
        Transaction.is_deleted.is_(False),
    )
    rows = db.execute(stmt).scalars().all()
    return MyResponse(...)
```

### Rate limiting (only if mutation-heavy / auth-adjacent / hits external paid service)

```python
from fastapi import Request
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)

@router.post("/...")
@limiter.limit("10/minute")
def my_endpoint(
    request: Request,  # slowapi requires this *exact* name  # noqa: ARG001
    payload: MyPayload,
    current_user: CurrentUser,
    ...
):
```

**Gotcha:** if your body schema is also called `request`, rename it (`payload`, `body`). slowapi looks up `kwargs.get("request")` and breaks otherwise. See [api/ai_chat.py](backend/src/ledger_sync/api/ai_chat.py) for the pattern.

### Register in main.py

```python
# Imports (alphabetical-ish, match the surrounding pattern)
from ledger_sync.api.<resource> import router as <resource>_router

# Below other registrations
app.include_router(<resource>_router)
```

### Backend test

`backend/tests/unit/test_<resource>.py` using FastAPI's `TestClient` with dep overrides. See [tests/unit/test_ai_chat.py](backend/tests/unit/test_ai_chat.py) for the dependency-override pattern.

---

## Section B — Frontend page or component

### The single decision: multi-file or single-file?

- **<300 lines, no sub-components:** single file, PascalCase, in `pages/`. Examples: `DashboardPage.tsx`, `BudgetPage.tsx`, `TransactionsPage.tsx`.
- **≥300 lines OR has sub-components OR has a custom hook:** kebab-case directory. Examples: [pages/tax-planning/](frontend/src/pages/tax-planning/), [pages/comparison/](frontend/src/pages/comparison/).

If unsure, start single-file. Promote to a directory when the file crosses 300 — don't pre-split.

### Multi-file layout

```
pages/<page-name>/
  <PageName>Page.tsx       # thin orchestrator (~100 lines): hook + layout
  use<PageName>.ts         # hook owning state + data fetching
  types.ts                 # local types
  <page>Utils.ts           # pure helpers (testable)
  components/              # 1 component per file
    SubComponent.tsx
```

Settings page is the exception — uses `sections/` instead of `components/` because "section" is the domain term. Don't carry that to other pages.

### Page shell

```tsx
import { PageHeader } from '@/components/ui'

export default function MyPage() {
  return (
    <>
      <PageHeader title="My Page" subtitle="Optional" />
      {/* content */}
    </>
  )
}
```

`PageHeader` already bakes `env(safe-area-inset-top)` for iOS notch — don't reinvent.

### Lazy-import in [App.tsx](frontend/src/App.tsx)

```tsx
const MyPage = lazy(() => import('@/pages/<my-page>/MyPage'))
// OR
const MyPage = lazy(() => import('@/pages/MyPage'))
```

**Do NOT use a barrel `index.ts`.** App.tsx imports the entry file directly.

Add the route inside `<Routes>`. Wrap in `<ProtectedRoute>` if auth is required (almost always).

Add a sidebar entry. If the page is mobile-secondary, also add to `MorePage.tsx` (the phone grid launcher). The 4 primary tabs in `MobileTabBar` (Home / Txns / Flow / More) don't change — extend `MorePage` instead.

### Frontend hard rules

- **No `console.log`** committed. **No `any`** in TypeScript. **No `dark:` Tailwind prefixes.** **No raw inline hex.** **No `h-screen`** in layouts (use `h-dvh`). **No `../../`** imports — always `@/`.
- **Charts** wrap in `ChartContainer` from `@/components/ui`. Pull colors from [constants/colors.ts](frontend/src/constants/colors.ts) via `rawColors`. Animations auto-disable above 500 points if you import `shouldAnimate`.
- **Tables** use `DataTable` from `@/components/ui` for sortable + flat shapes.
- **Time-filtered analytics?** Use `useAnalyticsTimeFilter` and `AnalyticsTimeFilter` for consistent view-mode + date-range + FY across pages.

---

## Section C — Data hook + axios service

### The staleTime invariant

Every analytics hook in this codebase sets `staleTime: Infinity, gcTime: 1h`. **This is deliberate.** Financial data only changes when the user uploads a new file. Refetching on focus / mount creates flicker for zero benefit. Cache is invalidated explicitly on upload success.

Don't override `staleTime` to something shorter without a written reason.

### Three files

**1. Service** in [services/api/<resource>.ts](frontend/src/services/api/):

```ts
import { apiClient } from './client'

export interface MyResponse {
  // mirror the backend Pydantic schema EXACTLY (no codegen, manual sync)
  // run schema-drift-check skill before committing if backend changed
}

export const <resource>Service = {
  async getThing(): Promise<MyResponse> {
    const res = await apiClient.get<MyResponse>('/api/<resource>/<path>')
    return res.data
  },
}
```

`apiClient` (from [services/api/client.ts](frontend/src/services/api/client.ts)) auto-attaches `Authorization: Bearer <jwt>` and handles 401-with-refresh via mutex.

**2. Hook** in [hooks/api/use<Resource>.ts](frontend/src/hooks/api/):

```ts
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/store/authStore'
import { <resource>Service, type MyResponse } from '@/services/api/<resource>'

const ONE_HOUR_MS = 60 * 60 * 1000

export function useThing() {
  const accessToken = useAuthStore((s) => s.accessToken)
  return useQuery({
    queryKey: ['thing'],
    queryFn: <resource>Service.getThing,
    enabled: !!accessToken,
    staleTime: Infinity,   // financial data only changes on upload
    gcTime: ONE_HOUR_MS,
  })
}
```

**3. Compiled-in fallback** (only for "always-show-something" UI like currency display, instrument rates):

```ts
const FALLBACK_DATA: MyResponse = { ... }

export function useThing() {
  const query = useQuery({ ... })
  return {
    data: query.data ?? FALLBACK_DATA,
    isFallback: !query.data,
    isLoading: query.isLoading,
  }
}
```

See [hooks/api/useInstrumentRates.ts](frontend/src/hooks/api/useInstrumentRates.ts). **Skip for analytics hooks** — they should show `EmptyState`, not fake data.

### Cache invalidation on upload

Only matters if your data changes when transactions change. Find the upload mutation in [hooks/api/useUpload.ts](frontend/src/hooks/api/useUpload.ts) and add `queryClient.invalidateQueries({ queryKey: ['thing'] })` to its `onSuccess`.

### V1 vs V2 — which analytics endpoint to call

- **V2** (`/api/analytics/v2/*`) — reads pre-aggregated tables, ~50ms. Always fresh because upload runs analytics inline. **Default.**
- **V1** (`/api/analytics/*`) — on-the-fly. Use only when V2 doesn't have the shape (e.g. arbitrary user-typed date filters).

If you're adding a new aggregation that should be cached: add a V2 endpoint + a new pre-aggregated table + a mixin in [core/analytics/](backend/src/ledger_sync/core/analytics/). Not a slow V1 query.

### Don't rebuild what exists

Before writing a new hook:
- [useAnalytics.ts](frontend/src/hooks/api/useAnalytics.ts) — V1 analytics
- [useAnalyticsV2.ts](frontend/src/hooks/api/useAnalyticsV2.ts) — V2
- [useTransactions.ts](frontend/src/hooks/api/useTransactions.ts) — raw transactions
- [usePreferences.ts](frontend/src/hooks/api/usePreferences.ts) — user preferences

The dashboard already loads these. Adding another hook for the same data is waste.

---

## Definition of done

- [ ] Backend endpoint registered in `main.py`, returns Pydantic model not dict, queries filter by `user_id`, uses `query_helpers` for date functions
- [ ] Rate-limited if mutation/auth/external-paid (with the `request: Request` slowapi gotcha handled)
- [ ] Backend unit test exists with dep overrides
- [ ] Pydantic schemas changed? Run `schema-drift-check` skill — frontend types must mirror exactly
- [ ] Frontend service in `services/api/<resource>.ts` with typed response
- [ ] Frontend hook in `hooks/api/use<Thing>.ts` with `staleTime: Infinity, gcTime: 1h`, `enabled: !!accessToken`
- [ ] Cache invalidation wired into upload mutation if data is upload-derived
- [ ] Page/component lazy-imported in App.tsx, route + sidebar + MorePage entry where applicable
- [ ] No `any`, no `console.log`, no raw hex, no `dark:` prefix, no `h-screen`, no `../` imports
- [ ] No duplicate of an existing hook
- [ ] Models changed? Used `new-migration` skill (empty `downgrade()` per project convention)
