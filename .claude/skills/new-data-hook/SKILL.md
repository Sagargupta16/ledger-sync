---
name: new-data-hook
description: Use when adding a new TanStack Query hook + axios service to talk to a backend endpoint. Enforces the project's caching contract (staleTime Infinity, gcTime 1 hour) which exists because financial data only changes on upload, the JWT-injecting axios client, and a compiled-in fallback pattern for endpoints that should keep working when the backend is unreachable. Trigger when the user says "fetch from /api/...", "call the backend", "useQuery hook", "wire up the X endpoint", or adds a frontend feature that needs server data.
---

# Adding a frontend data hook for a backend endpoint

## Why the staleTime invariant matters

This codebase sets `staleTime: Infinity, gcTime: 1h` on every analytics hook. **This is deliberate, not laziness.** Financial data only changes when the user uploads a new file. Refetching on focus / mount would create flicker for zero benefit. The cache is invalidated explicitly on upload success.

Don't override `staleTime` to something shorter without a written reason. If you think you need to, you probably want a different cache key or a manual `refetch()` button.

## The three files you'll touch

1. **`services/api/<resource>.ts`** — typed service object that wraps axios calls
2. **`hooks/api/use<Resource>.ts`** — TanStack Query wrapper
3. The component that consumes the hook

## Steps

1. **Service layer** in [services/api/<resource>.ts](frontend/src/services/api/):
   ```ts
   import { apiClient } from './client'

   export interface MyResponse {
     // mirror the backend Pydantic schema EXACTLY
     // see schema-drift-check skill for the manual sync hazard
   }

   export const <resource>Service = {
     async getThing(): Promise<MyResponse> {
       const res = await apiClient.get<MyResponse>('/api/<resource>/<path>')
       return res.data
     },
   }
   ```
   `apiClient` is the shared axios instance — its request interceptor auto-attaches `Authorization: Bearer <jwt>` and the response interceptor handles 401 with transparent token refresh via mutex.

2. **Hook** in [hooks/api/use<Resource>.ts](frontend/src/hooks/api/):
   ```ts
   import { useQuery } from '@tanstack/react-query'
   import { <resource>Service, type MyResponse } from '@/services/api/<resource>'
   import { useAuthStore } from '@/store/authStore'

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

3. **Compiled-in fallback** (only for endpoints that *must* render even when backend is down — currency display, instrument rates, any "always-show-something" UI):
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
   See [hooks/api/useInstrumentRates.ts](frontend/src/hooks/api/useInstrumentRates.ts) for the canonical example. Skip this for analytics hooks — they should show `EmptyState`, not fake data.

4. **Cache invalidation** on upload — only matters if your data changes when transactions change. Find the upload mutation in [hooks/api/useUpload.ts](frontend/src/hooks/api/useUpload.ts) and add `queryClient.invalidateQueries({ queryKey: ['thing'] })` to its `onSuccess`.

5. **Don't rebuild what exists.** Before writing a new hook, check:
   - [hooks/api/useAnalytics.ts](frontend/src/hooks/api/useAnalytics.ts) — V1 (on-the-fly) analytics
   - [hooks/api/useAnalyticsV2.ts](frontend/src/hooks/api/useAnalyticsV2.ts) — V2 (pre-aggregated, fast) analytics
   - [hooks/api/useTransactions.ts](frontend/src/hooks/api/useTransactions.ts) — raw transactions
   - [hooks/api/usePreferences.ts](frontend/src/hooks/api/usePreferences.ts) — user preferences

   The dashboard already loads these — adding another hook for the same data is waste.

## V1 vs V2 — which analytics endpoint to call

- **V2** (`/api/analytics/v2/*`) — reads pre-aggregated tables (`monthly_summaries`, `daily_summaries`, etc). Fast (~50ms). Always fresh because upload runs analytics inline. **Default choice.**
- **V1** (`/api/analytics/*`) — on-the-fly aggregation. Use only when V2 doesn't have the shape you need (e.g. arbitrary user-typed date filters).

If you're adding a new aggregation that should be cached, the right move is to add a V2 endpoint + a new pre-aggregated table + a mixin in [core/analytics/](backend/src/ledger_sync/core/analytics/) — not to add a slow V1 query.

## Hard rules

- **`staleTime: Infinity`** unless you have a written reason
- **No `axios.get(...)` directly** in components — always go through a service
- **Type the response** — never `Promise<any>`
- **`enabled: !!accessToken`** for auth-required endpoints — avoids 401s on app boot
- **Pydantic schema mirror is manual.** Re-check shape before committing (see schema-drift-check skill)

## Definition of done

- [ ] Service in `services/api/<resource>.ts` with typed response
- [ ] Hook in `hooks/api/use<Thing>.ts` with `staleTime: Infinity, gcTime: 1h`
- [ ] `enabled: !!accessToken` if auth-required
- [ ] Cache invalidation wired into upload mutation if data is upload-derived
- [ ] No duplicate of an existing hook
