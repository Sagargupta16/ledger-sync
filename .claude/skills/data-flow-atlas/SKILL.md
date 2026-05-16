---
description: End-to-end traces of how data moves through the ledger-sync stack — upload pipeline, OAuth login, AI chat tool loop, analytics V1 vs V2 path, currency conversion, tax calculation. Loads when Claude needs to understand cross-cutting flows that span frontend + backend + database. Use when debugging "why is this number wrong", "where does X get computed", "what happens after upload", or planning a feature that touches multiple layers.
user-invocable: false
---

# Data flow atlas

The five flows below are the load-bearing paths through this codebase. Most "wrong number" bugs and "where do I add X" questions resolve to one of them.

## 1. Upload → dashboard render (the most important flow)

```
User picks .xlsx
  ↓ frontend/src/lib/fileParser.ts
SheetJS lazy-loads → SHA-256 via crypto.subtle → column mapping → row validation
  ↓ POST /api/upload (axios with JWT auto-injected)
backend/src/ledger_sync/api/upload.py
  ↓ rate limit (10/min via slowapi)
SyncEngine.import_rows(rows, file_hash, force)
  ↓ core/sync_engine.py
For each row: Normalizer.normalize_from_dict()      ← ingest/normalizer.py
  ↓
Reconciler.reconcile_batch()                         ← core/reconciler.py (852 LOC)
  • Phase 1: pre-compute SHA-256 hashes
  • Phase 2: batch-fetch existing in chunks of 500
  • Phase 3: insert / update / soft-delete (anything not seen)
  ↓ INLINE (synchronous — see "non-obvious" below)
AnalyticsEngine.run_full_analytics()                 ← core/analytics_engine.py
  → 9 mixins repopulate daily/monthly/category/transfer/merchant/recurring/networth/investment/fy/anomaly
  ↓ HTTP 200 returned
Frontend: TanStack Query invalidates upload key
  ↓
Dashboard hooks refetch → V2 endpoints (pre-aggregated tables) → charts render
```

**End-to-end:** ~5–15s for a typical 500-row import.

**Non-obvious:** uploads run analytics **synchronously inline**, not via `BackgroundTasks`. Vercel serverless workers don't reliably finish async tasks after returning. The cost is upload latency; the benefit is zero stale-V2 bugs. See `api/upload.py:80-94`.

**Idempotency:** transactions get a deterministic SHA-256 PK from `(user_id, date, amount, account, category, note)`. Re-uploading the same file is safe — same rows produce same IDs, no duplicates.

## 2. OAuth login

```
LandingPage → click Google
  ↓ GET /api/auth/oauth/providers
   (returns authorize URL + 10-min state token, in-memory store with thread lock)
window.location → Google
  ↓ user consents
Google → /auth/callback/google?code=...&state=...
  ↓ OAuthCallbackPage
POST /api/auth/oauth/google/callback {code, state}    ← rate limit 20/min
  ↓ api/oauth.py:150-224
validate state (10-min TTL, in-memory dict, thread-safe)
  ↓
httpx → google token endpoint (exchange code) → google userinfo endpoint
  ↓
AuthService.oauth_login_or_register() — User upsert by email
  ↓
JWT access (30min) + refresh (7d) returned, HS256
  ↓
authStore (Zustand persist) → localStorage 'ledger-sync-auth'
  ↓
ProtectedRoute lets user in; useAuthInit verifies on next mount
```

**Caveat:** the in-memory state-token store doesn't survive a Vercel cold start. Users finishing OAuth during a deploy might see "invalid state" — they retry and it works. Mitigation requires Redis; not yet wired (debt #2 from the audit).

**Logout:** frontend clears tokens from `authStore`. Server returns success but does not maintain a revocation list -- the access token stays valid until its 30-min expiry.

## 3. AI chat tool loop

```
User types question
  ↓ useChat.send() in components/chat/useChat.ts
resolveCredentials() → app_bedrock | byok-OpenAI | byok-Anthropic | byok-Bedrock
  ↓
sendChat(provider, messages, tools, system)         ← lib/chatAdapters.ts
  ↓
  OpenAI/Anthropic: direct browser POST + SSE       │  Bedrock: POST /api/ai/bedrock/chat (server proxy)
  ↓                                                  │  ↓ rate limit 30/min
  parses tool_use blocks client-side                 │  boto3 → bedrock-runtime.converse() (non-streaming)
  ↓                                                  │  returns full JSON
  Response has stop_reason === 'tool_use'?
  ↓ if yes
Promise.all(toolUses.map(tu => POST /api/ai/tools/execute))   ← parallel
  ↓ each tool: api/ai_tools.py executor function
  ALL TOOLS USER-SCOPED via CurrentUser dependency injection
  the LLM cannot pass user_id to access another user's data
  ↓
Append tool_result blocks to convo, recurse
  ↓ MAX 6 ROUNDS (hard cap, prevents runaway loops)
Final text → ChatMessage rendered
  ↓
aiUsageService.log() → POST /api/ai/usage  (records token spend)
```

**Why the asymmetry (OpenAI/Anthropic direct, Bedrock proxied):**
- Bedrock requires AWS SigV4 signing — browser can't sign
- Mangum buffers SSE on Vercel serverless — true streaming wouldn't work end-to-end through Bedrock proxy anyway
- So Bedrock uses non-streaming `converse()` returning full JSON
- See the long docstring at top of `api/ai_chat.py`

**Modes (stored in `user_preferences.ai_mode`):**
- `app_bedrock` (default) — server's shared key, fixed Haiku model, 10 msg/day cap
- `byok` — user's encrypted API key, user picks provider+model, optional per-user token caps

## 4. Analytics V1 vs V2

```
Dashboard mount
  ↓ TanStack Query
  ↓
GET /api/analytics/v2/<endpoint>     ← DEFAULT CHOICE
  ↓ api/analytics_v2.py
SELECT * FROM monthly_summaries WHERE user_id = ?    ← pre-aggregated
  ↓ ~50ms response
Charts render

vs.

GET /api/analytics/<endpoint>        ← FALLBACK for arbitrary date filters
  ↓ api/analytics.py
SELECT … FROM transactions WHERE … GROUP BY …       ← on-the-fly aggregation
  ↓ slower, but flexible
Charts render
```

**Pre-aggregated tables** (rebuilt on every upload via `AnalyticsEngine`):
`daily_summaries`, `monthly_summaries`, `category_trends`, `transfer_flows`, `merchant_intelligence`, `recurring_transactions`, `net_worth_snapshots`, `investment_holdings`, `fy_summaries`, `anomalies`.

**When to add V2 vs V1:** if the new aggregation has a stable shape that doesn't depend on user-typed date filters, add it as a V2 endpoint + new pre-aggregated table + a mixin in `core/analytics/`. Otherwise V1.

**Stale V2 = #1 cause of "wrong number" bugs.** If a feature mutates transactions outside upload, it must call `AnalyticsEngine.run_full_analytics()` itself or call `POST /api/analytics/v2/refresh`.

## 5. Currency conversion

```
useExchangeRate hook
  ↓ if displayCurrency !== 'INR'
preferencesService.getExchangeRates('INR')
  ↓ GET /api/exchange-rates
api/exchange_rates.py
  ↓ try frankfurter.dev (24h in-memory cache)
  ↓ fallback: 24h-stale cache
  ↓ fallback: hardcoded _FALLBACK_RATES + fallback_as_of timestamp
TanStack Query caches 24h
  ↓
preferencesStore.setExchangeRate(rate, updatedAt)    ← Zustand
  ↓ synchronous reads anywhere
formatters.ts uses rate for display
```

**Three-tier fallback** is deliberate — frontend always has a number to render. UI shows a stale-warning when `fallback: true` is in the response.

## 6. Tax calculation

```
Tax Planning page → form inputs (SalaryComponents, RsuGrant[], GrowthAssumptions)
  ↓
calculateTax(income, slabs, ...)                     ← lib/taxCalculator.ts
  ↓ slabs sourced from getTaxConfig(fyStartYear)     ← lib/tax-config/index.ts
                                                      per-FY blocks (2023-24, 2024-25, 2025-26+)
                                                      newest-first fallback for unknown future FYs
projectMultipleYears(...)                            ← lib/projectionCalculator.ts
  ↓ applies salary growth, stock appreciation per year
  ↓ calls calculateTax() per future FY
Rendered: tax slabs, effective rate, net income, multi-year projection table
```

**Tax rules are data, not code.** Adding Budget 2026 = one new FY entry in `tax-config/index.ts`. The calculator is constant.

## When you're debugging — the seven failure modes

Walk these in order, cheap checks first. Use the **debug-finance** skill for the full ranked list:

1. Stale V2 analytics (most common)
2. `user_id` scoping miss in a query
3. Raw `func.strftime()` (works dev, breaks prod)
4. Indian FY off-by-one (April-March, not calendar year)
5. Decimal vs float vs string serialization mismatch
6. Pydantic↔TypeScript schema drift
7. Empty `investment_account_mappings` preference (since 2.10.0 default is `{}`)
