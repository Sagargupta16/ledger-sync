---
name: new-endpoint
description: Use when adding or modifying a backend FastAPI endpoint (any file under backend/src/ledger_sync/api/). Enforces the project's strict layering (api -> services -> core -> db, never reversed), CurrentUser dependency injection for multi-tenancy, slowapi rate limits on sensitive endpoints, and the registration step in main.py. Trigger when the user mentions "endpoint", "API route", "router", "/api/...", or asks to expose new backend functionality.
---

# Adding a backend endpoint to ledger-sync

## Hard rules

- **Layering:** `api/` -> `services/` (thin) -> `core/` (business logic) -> `db/`. Never call `db.session` from a router; never put business logic in a router.
- **Multi-tenancy is non-negotiable.** Every protected endpoint takes `current_user: CurrentUser` and every query filters `WHERE user_id = current_user.id`. The integration test [test_analytics_user_scoping.py](backend/tests/integration/test_analytics_user_scoping.py) exists to prove this — break it and CI fails.
- **Routes prefixed `/api/...`** — set in the router's `APIRouter(prefix="/api/<resource>")`. Never bare-mount.
- **Register in `main.py`.** Forgetting this is the #1 "endpoint returns 404" bug. Check both the import block and the `app.include_router()` block.
- **Empty migration `downgrade()` if you touched models.** Project convention since 2026-02-03.

## Steps

1. **Pick the right router file** under [backend/src/ledger_sync/api/](backend/src/ledger_sync/api/). Each file owns one resource — don't sprinkle endpoints across files. If genuinely new, create `api/<resource>.py`.

2. **Imports** (mirror existing routers):
   ```python
   from fastapi import APIRouter, HTTPException
   from ledger_sync.api.deps import CurrentUser, DatabaseSession
   ```
   Add `Request` and slowapi imports only if rate-limiting (see step 5).

3. **Router instance:**
   ```python
   router = APIRouter(prefix="/api/<resource>", tags=["<resource>"])
   ```

4. **Endpoint signature:**
   ```python
   @router.get("/<path>")
   def my_endpoint(
       current_user: CurrentUser,
       db: DatabaseSession,
       # ... other params last
   ) -> ResponseSchema:
   ```
   Return a Pydantic model from `schemas/`, never a dict — keeps OpenAPI docs accurate and gives the frontend stable types.

5. **Rate limiting** (only if endpoint is mutation-heavy, auth-adjacent, or hits an external paid service like Bedrock):
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
   **Gotcha:** if your body schema is also called `request`, rename it (`payload`, `body`) — slowapi looks up `kwargs.get("request")` and breaks otherwise. See [api/ai_chat.py](backend/src/ledger_sync/api/ai_chat.py) for the pattern.

6. **Multi-tenancy enforcement:**
   ```python
   stmt = select(Transaction).where(
       Transaction.user_id == current_user.id,  # always
       Transaction.is_deleted.is_(False),       # most queries
       # ... business filters
   )
   ```
   If you accept a `user_id` from the request body or path, that's a bug — kill it.

7. **Register in [api/main.py](backend/src/ledger_sync/api/main.py):**
   ```python
   from ledger_sync.api.<resource> import router as <resource>_router
   # ... below other imports

   app.include_router(<resource>_router)
   # ... below other registrations
   ```
   Imports are alphabetical, registrations follow a logical resource order — match the surrounding pattern.

8. **Database queries** — use [core/query_helpers.py](backend/src/ledger_sync/core/query_helpers.py) for date formatting (`fmt_year_month`, `fmt_year`, `fmt_month`). **Never `func.strftime()` directly** — it only works on SQLite and breaks production Postgres silently. This is the most common production-only bug in this codebase.

9. **Test** — add a unit test under `backend/tests/unit/test_<resource>.py` using FastAPI's `TestClient`:
   ```python
   from fastapi.testclient import TestClient
   from ledger_sync.api.deps import get_current_user, get_session
   # override deps with fakes; see test_ai_chat.py for the pattern
   ```

## Definition of done

- [ ] Endpoint returns a Pydantic model, not a raw dict
- [ ] `current_user.id` filters every query touching user data
- [ ] Registered in `main.py` (both import + `include_router`)
- [ ] Rate-limited if mutation/auth/external-paid
- [ ] Uses `query_helpers.fmt_*` for date formatting (not raw `strftime`)
- [ ] Has a `tests/unit/test_<resource>.py` test
- [ ] If models changed: Alembic migration with **empty `downgrade()`**
- [ ] If response shape will be consumed by frontend: TypeScript type added/updated in [frontend/src/services/api/](frontend/src/services/api/) (see new-data-hook skill)
