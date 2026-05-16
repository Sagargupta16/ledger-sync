---
name: schema-drift-check
description: Use when finishing a backend change that touches a Pydantic schema in backend/src/ledger_sync/schemas/ or a response shape in any router. Compares the Pydantic schema against the corresponding TypeScript type in frontend/src/types/ or frontend/src/services/api/. This catches the silent runtime bug class — backend ships a renamed field, frontend keeps the old name, page renders blank in production. Trigger when user says "I changed the schema", "added a field to the response", "modified the API contract", or before opening a PR that includes backend schema changes.
---

# Pydantic <-> TypeScript drift check

## Why this skill exists

There is no codegen between backend Pydantic and frontend TypeScript. Schemas are kept in sync **manually**. When a backend field is added, renamed, or has its type changed, the frontend type silently lags. The bug shows up as `undefined` reads at runtime — the page renders blank or a chart goes flat. TypeScript can't catch it because the type lies.

This is debt #4 from the 2026-05 audit. Until codegen lands, this skill is the manual check.

## The matched pairs (the only places this matters)

| Backend Pydantic | Frontend TypeScript |
|---|---|
| [backend/src/ledger_sync/schemas/upload.py](backend/src/ledger_sync/schemas/upload.py) | [frontend/src/services/api/upload.ts](frontend/src/services/api/upload.ts) |
| [backend/src/ledger_sync/schemas/auth.py](backend/src/ledger_sync/schemas/auth.py) | [frontend/src/services/api/auth.ts](frontend/src/services/api/auth.ts) |
| [backend/src/ledger_sync/schemas/transactions.py](backend/src/ledger_sync/schemas/transactions.py) | [frontend/src/services/api/transactions.ts](frontend/src/services/api/transactions.ts) and [types/transaction.ts](frontend/src/types/transaction.ts) (if exists) |
| [backend/src/ledger_sync/schemas/salary.py](backend/src/ledger_sync/schemas/salary.py) | [frontend/src/types/salary.ts](frontend/src/types/salary.ts) |
| Inline response models inside `api/<resource>.py` (Pydantic models defined alongside the endpoint, e.g. `BedrockChatResponse` in ai_chat.py) | The matching `services/api/<resource>.ts` |
| `api/ai_usage.py` `UsageResponse` | `services/api/aiUsage.ts` `UsageResponse` |
| `api/rates.py` JSON shape | `services/api/rates.ts` `InstrumentRates` interface |

## How to run the check

1. **Identify what you changed.** Read the diff: which Pydantic class? Which fields? Renamed, added, removed, type changed?

2. **Find the matching TypeScript.** Use the table above. If your change is to an inline response model, search for the field name across `frontend/src/services/api/` and `frontend/src/types/`.

3. **Compare field-by-field:**
   - Field names match exactly (case sensitive, snake_case in Python -> snake_case in TS interfaces in this codebase, NOT camelCase — verify against existing pairs)
   - Optional fields are marked `Optional[X]` / `X | None` on backend AND `field?: X` or `field: X | null` on frontend
   - Types correspond:
     - `int` / `float` -> `number`
     - `str` -> `string`
     - `bool` -> `boolean`
     - `datetime` -> `string` (ISO 8601 — backend serializes via Pydantic JSON encoder)
     - `Decimal` -> `number` or `string` (check the encoder; Pydantic v2 default is string — frontend should match)
     - `list[X]` -> `X[]` or `Array<X>`
     - `dict[str, X]` -> `Record<string, X>`
     - `Literal["a", "b"]` -> `'a' | 'b'`
     - Pydantic enum -> TS string union or const enum

4. **Common drift bugs (in order of how often they bite):**
   - Backend renames `daily_token_limit` to `token_limit_daily`. Frontend keeps the old name. `usage.daily_token_limit` is `undefined`. UI shows `undefined`.
   - Backend changes `Decimal` to `float` (or vice versa). Frontend reads as `number` but the JSON has a string. `parseFloat` is missing. Calculation produces `NaN`.
   - Backend adds a field that's now required. Frontend's request omits it. POST returns 422. Quiet UI failure.
   - Backend changes a `Literal` enum value. Frontend's switch statement falls through to default.
   - Backend nests a previously flat field. Frontend reads the wrong path.

5. **Fix on the frontend side** unless the backend just landed a typo. The backend is the contract; the frontend conforms.

## Quick verification flow

```bash
# 1. List Pydantic classes you changed
git diff main backend/src/ledger_sync/schemas/ backend/src/ledger_sync/api/

# 2. For each changed class, find frontend usages
grep -rn "<FieldName>\|<ClassName>" frontend/src/services frontend/src/types frontend/src/hooks

# 3. Visually diff the field lists
```

A future automated version of this skill could:
- Generate `openapi.json` from FastAPI (`uvicorn` exposes `/openapi.json`)
- Run `npx openapi-typescript` to produce TS types from it
- Diff against `frontend/src/types/api-generated.ts`

That's the eventual fix; until it lands, the manual check is mandatory before any PR with schema changes.

## Definition of done

- [ ] Identified every backend file that changed shape
- [ ] Found every matching frontend type definition
- [ ] Field names, optionality, and type mappings match
- [ ] Updated frontend types to match (no backend rollback)
- [ ] Spot-tested the affected page with `pnpm run dev` — confirmed no `undefined` reads
- [ ] If a Decimal/string/number mismatch, verified the JSON wire format with `curl` or browser devtools
