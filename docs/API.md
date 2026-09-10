# API Reference

Human-readable reference for Ledger Sync API version 2.24.1.

The generated OpenAPI document is the contract source of truth. This guide was
verified against that document on 2026-09-09.

Current OpenAPI inventory:

- 108 paths
- 123 HTTP operations
- Swagger UI at `/docs`
- ReDoc at `/redoc`
- Raw schema at `/openapi.json`

To inspect the current schema locally:

```bash
cd backend
uv run uvicorn ledger_sync.api.main:app --reload --port 8000
```

## Base URLs

| Environment | URL |
| --- | --- |
| Local | `http://localhost:8000` |
| Hosted | `https://ledger-sync-api.vercel.app` |

Frontend code should use relative `/api/...` paths through
`frontend/src/services/api/client.ts`. Local Vite development proxies those
requests to port 8000. `VITE_API_BASE_URL` is needed only when the built
frontend and API use different origins. Public OAuth requests use the separate
client in `frontend/src/services/api/auth.ts` so demo interception and an old
session cannot interfere with sign-in.

## Authentication

Ledger Sync uses OAuth for sign-in and JWT bearer tokens for authenticated API
requests.

```http
Authorization: Bearer <access_token>
```

Public operations:

- `GET /health`
- `GET /health/db`
- `GET /api/auth/oauth/providers`
- `POST /api/auth/oauth/{provider}/authorize`
- `GET /api/auth/oauth/v2/{provider}/restart`
- `POST /api/auth/oauth/google/callback`
- `POST /api/auth/oauth/github/callback`
- `POST /api/auth/refresh`, which authenticates with a refresh token in the body

All financial data, preferences, external-rate proxies, and AI operations
require an authenticated user.

### OAuth flow

1. The frontend requests `GET /api/auth/oauth/providers?flow_version=2`.
2. The browser generates a private verifier and its S256 challenge, then posts
   `{"code_challenge": "<S256-challenge>"}` to the selected provider's
   `/api/auth/oauth/{provider}/authorize` endpoint.
3. The backend returns state bound to that provider, challenge, and configured
   redirect. The browser saves the state and verifier in the initiating tab's
   `sessionStorage`, then opens the provider authorization URL.
4. The provider redirects to `/auth/callback/:provider` with `code` and `state`.
5. The frontend consumes the matching browser attempt and posts `code`, `state`,
   and `code_verifier` to the matching backend callback.
6. The backend validates the signed state, provider, redirect, challenge, and
   10-minute expiry, then atomically consumes its pending database record.
7. The backend exchanges the code with the verifier, verifies the provider
   identity, and creates or loads the local user.
8. The callback returns access and refresh tokens. The frontend verifies the
   profile before installing the new user and tokens together.

The browser verifier is never placed in a redirect URL. The flow does not
require third-party cookies. A consumed attempt cannot be retried, including
after a failed provider exchange; start a fresh sign-in instead.

Older clients that omit `flow_version` receive navigation-only restart URLs.
The restart endpoint ignores client-supplied redirect, code, and state values
and redirects to the configured frontend callback to begin a new S256 flow.
A still-cached older frontend displays refresh/sign-in guidance. A callback
without `code_verifier` returns HTTP 409 with that guidance; legacy state is
never accepted as a substitute for browser proof.

The authoritative identity is `(auth_provider, auth_provider_id)`. The backend
does not silently merge an email already linked to another provider or
subject. Verified email can claim only a legacy user whose provider and
provider subject are both null.

### Token lifecycle

- Access tokens expire after 30 minutes by default.
- Refresh tokens expire after 7 days by default.
- `POST /api/auth/refresh` returns a fresh access and refresh token pair.
- Every token carries the user's `token_version`.
- Logout and account reset increment `token_version`, invalidating all
  outstanding access and refresh tokens server-side.

```json
{
  "refresh_token": "<refresh-token>"
}
```

### Logout and account reset

| Method | Path | Behavior |
| --- | --- | --- |
| `POST` | `/api/auth/logout` | Revokes all current token pairs for the user |
| `POST` | `/api/auth/account/reset?mode=full` | Clears user data and recreates default preferences |
| `POST` | `/api/auth/account/reset?mode=transactions` | Clears transactions and derived analytics while preserving settings, budgets, goals, and account classifications |
| `DELETE` | `/api/auth/account` | Permanently deletes the account and its data |

## Response and Error Conventions

FastAPI validation failures use HTTP 422 and the standard `detail` array.
Most application errors return a string in `detail`.

```json
{
  "detail": "Invalid refresh token"
}
```

Database outages are normalized to:

```json
{
  "error": "Database unavailable",
  "code": "DB_ERROR"
}
```

Unhandled failures return a non-sensitive correlation ID:

```json
{
  "error": "Internal server error",
  "code": "INTERNAL_ERROR",
  "error_id": "0123456789abcdef"
}
```

Common status codes:

| Status | Meaning |
| --- | --- |
| 200 | Successful read or update |
| 201 | Resource created |
| 204 | Successful deletion with no body |
| 400 | Invalid operation or upstream request |
| 401 | Missing, expired, or revoked token |
| 404 | Resource not found |
| 409 | Import, identity, saved-key conflict, or required OAuth restart |
| 413 | Upload body exceeds the configured size limit |
| 422 | Request validation failure |
| 429 | Rate limit exceeded |
| 500 | Unexpected server error |
| 502 | External provider failure |
| 503 | Database or configured service unavailable |

## Endpoint Inventory

### Health and authentication

| Methods | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` | API process and version health |
| `GET` | `/health/db` | Database connectivity |
| `POST` | `/api/auth/refresh` | Exchange a refresh token for a new token pair |
| `GET`, `PUT` | `/api/auth/me` | Read or update the current profile |
| `POST` | `/api/auth/logout` | Revoke all current sessions |
| `DELETE` | `/api/auth/account` | Delete the current account |
| `POST` | `/api/auth/account/reset` | Reset full or transaction-only data |
| `GET` | `/api/auth/oauth/providers` | List provider configuration for the requested flow version |
| `POST` | `/api/auth/oauth/{provider}/authorize` | Bind a fresh state to a browser S256 challenge |
| `GET` | `/api/auth/oauth/v2/{provider}/restart` | Restart an older client using the current frontend flow |
| `POST` | `/api/auth/oauth/google/callback` | Complete Google OAuth |
| `POST` | `/api/auth/oauth/github/callback` | Complete GitHub OAuth |

### Transactions, import, tags, and saved organization

| Methods | Path | Purpose |
| --- | --- | --- |
| `GET`, `POST` | `/api/transactions` | Paginated list or manual transaction creation |
| `GET` | `/api/transactions/all` | Full active transaction list |
| `GET` | `/api/transactions/facets` | Accounts, categories, tags, and type counts |
| `GET` | `/api/transactions/search` | Filtered transaction search |
| `GET` | `/api/transactions/export` | Filtered CSV export |
| `PUT` | `/api/transactions/{transaction_id}/tags` | Replace a transaction's tags |
| `POST` | `/api/upload` | Replace the current user's complete INR ledger snapshot |
| `GET` | `/api/upload/history` | Most-recent-first import history and row counts |
| `GET`, `POST` | `/api/saved-views` | List or create saved filters |
| `DELETE` | `/api/saved-views/{view_id}` | Delete a saved filter |
| `GET`, `POST` | `/api/categorization-rules` | List or create rules |
| `PUT`, `DELETE` | `/api/categorization-rules/{rule_id}` | Update or delete a rule |
| `POST` | `/api/categorization-rules/apply` | Apply active rules to existing transactions |

### Analytics

| Methods | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/analytics/overview` | Income, expenses, savings, and account overview |
| `GET` | `/api/analytics/behavior` | Spending behavior metrics |
| `GET` | `/api/analytics/trends` | Trend metrics |
| `GET` | `/api/analytics/wrapped` | Year summary |
| `GET` | `/api/analytics/kpis` | Dashboard KPIs |
| `GET` | `/api/analytics/charts/income-expense` | Income and expense chart data |
| `GET` | `/api/analytics/charts/categories` | Category chart data |
| `GET` | `/api/analytics/charts/monthly-trends` | Monthly trend chart data |
| `GET` | `/api/analytics/charts/account-distribution` | Account distribution chart data |
| `GET` | `/api/analytics/insights/generated` | Rule-generated financial insights |
| `GET` | `/api/analytics/v2/monthly-summaries` | Persisted monthly rollups |
| `GET` | `/api/analytics/v2/daily-summaries` | Persisted daily rollups |
| `GET` | `/api/analytics/v2/cohort-spending` | Day and month spending cohorts |
| `GET` | `/api/analytics/v2/investment-holdings` | Derived investment holdings |
| `GET` | `/api/analytics/v2/category-trends` | Monthly category and subcategory trends |
| `GET` | `/api/analytics/v2/transfer-flows` | All-time account-pair transfer totals |
| `GET`, `POST` | `/api/analytics/v2/recurring-transactions` | List or create recurring entries |
| `PATCH`, `DELETE` | `/api/analytics/v2/recurring-transactions/{item_id}` | Update or delete a recurring entry |
| `GET` | `/api/analytics/v2/merchant-intelligence` | Merchant aggregates |
| `GET` | `/api/analytics/v2/data-health` | Ledger coverage, last-import row counts, and rollup freshness |
| `GET` | `/api/analytics/v2/spending-rule` | Needs, wants, and savings analysis |
| `GET` | `/api/analytics/v2/net-worth` | Net worth history |
| `GET` | `/api/analytics/v2/fy-summaries` | Fiscal-year rollups |
| `GET` | `/api/analytics/v2/anomalies` | Detected anomalies |
| `POST` | `/api/analytics/v2/anomalies/{anomaly_id}/review` | Review or dismiss an anomaly |
| `GET`, `POST` | `/api/analytics/v2/budgets` | List or create category budgets |
| `GET`, `POST` | `/api/analytics/v2/goals` | List or create financial goals |
| `PATCH`, `DELETE` | `/api/analytics/v2/goals/{goal_id}` | Update saved goal details/progress or delete the current user's goal |
| `POST` | `/api/analytics/v2/refresh` | Recompute all persisted analytics |

### Calculations and reports

| Methods | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/calculations/categories/master` | Category hierarchy |
| `GET` | `/api/calculations/totals` | Income, expenses, net change, and savings rate |
| `GET` | `/api/calculations/monthly-aggregation` | Monthly values for a requested period |
| `GET` | `/api/calculations/yearly-aggregation` | Yearly values |
| `GET` | `/api/calculations/category-breakdown` | Category and subcategory totals |
| `GET` | `/api/calculations/account-balances` | Ledger-derived account balances |
| `GET` | `/api/calculations/insights` | Calculated insight metrics |
| `GET` | `/api/calculations/category-monthly-history` | Monthly history for categories |
| `GET` | `/api/calculations/data-date-range` | Earliest and latest active transaction dates |
| `GET` | `/api/calculations/income-facets` | Income category and subcategory buckets with row counts and totals |
| `GET` | `/api/calculations/income-analysis` | Income source analysis |
| `GET` | `/api/calculations/category-daily-series` | Daily category series |
| `GET` | `/api/calculations/quick-insights` | Dashboard quick-insight values |
| `GET` | `/api/calculations/daily-net-worth` | Daily ledger net worth |
| `GET` | `/api/calculations/top-categories` | Highest-value categories |
| `GET` | `/api/reports/monthly` | Monthly HTML report |

### Metadata, accounts, and preferences

| Methods | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/meta/types` | Transaction type values |
| `GET` | `/api/meta/accounts` | Active account names |
| `GET` | `/api/meta/filters` | Filter values |
| `GET` | `/api/meta/buckets` | Dynamic budget-rule buckets |
| `GET`, `POST` | `/api/account-classifications` | Read all mappings or upsert one |
| `GET` | `/api/account-classifications/closed` | List accounts marked closed |
| `PUT` | `/api/account-classifications/status` | Update an account's open/closed status |
| `GET`, `DELETE` | `/api/account-classifications/{account_name}` | Read or remove one mapping |
| `GET` | `/api/account-classifications/type/{account_type}` | Accounts in one type |
| `GET`, `PUT` | `/api/preferences` | Read or partially update all preferences |
| `POST` | `/api/preferences/reset` | Restore preference defaults |
| `PUT` | `/api/preferences/fiscal-year` | Fiscal-year start |
| `PUT` | `/api/preferences/essential-categories` | Essential categories |
| `PUT` | `/api/preferences/investment-mappings` | Investment account mappings |
| `PUT` | `/api/preferences/income-sources` | Income tax-treatment groups |
| `PUT` | `/api/preferences/capital-loss-categories` | Configure realised capital-loss category treatment |
| `PUT` | `/api/preferences/budget-defaults` | Budget defaults |
| `PUT` | `/api/preferences/display` | Number, currency, and time display |
| `PUT` | `/api/preferences/anomaly-settings` | Anomaly settings |
| `PUT` | `/api/preferences/recurring-settings` | Recurring detection settings |
| `PUT` | `/api/preferences/spending-rule` | Needs, wants, and savings targets |
| `PUT` | `/api/preferences/credit-card-limits` | Credit-card limits |
| `PUT` | `/api/preferences/earning-start-date` | Optional chart start date |
| `PUT` | `/api/preferences/salary-structure` | Fiscal-year salary data |
| `PUT` | `/api/preferences/rsu-grants` | RSU grants and vestings |
| `PUT` | `/api/preferences/growth-assumptions` | Projection assumptions |

### AI and external data

| Methods | Path | Purpose |
| --- | --- | --- |
| `GET`, `PUT`, `DELETE` | `/api/preferences/ai-config` | Read, save, or remove BYOK configuration |
| `PATCH` | `/api/preferences/ai-config/mode` | Switch `app_bedrock` or `byok` |
| `PATCH` | `/api/preferences/ai-config/limits` | Set or clear user token limits |
| `GET` | `/api/preferences/ai-config/key` | Reveal the current user's decrypted key |
| `POST` | `/api/ai/bedrock/chat` | Non-streaming Bedrock Converse proxy |
| `GET` | `/api/ai/tools` | List 15 read-only tool schemas |
| `POST` | `/api/ai/tools/execute` | Execute one user-scoped tool |
| `POST` | `/api/ai/usage/log` | Record browser-direct provider usage |
| `GET` | `/api/ai/usage` | Today, month-to-date, and all-time usage |
| `GET` | `/api/exchange-rates` | Latest or historical currency rates by base currency |
| `GET` | `/api/rates/instruments` | EPF, PPF, and NPS reference rates |
| `GET` | `/api/stock-price/{symbol}` | Latest or historical stock price |

## Upload Contract

The browser parses Excel or CSV content with SheetJS. The API never receives
the original statement file on the web path.

```http
POST /api/upload
Content-Type: application/json
Authorization: Bearer <access_token>
```

```json
{
  "file_name": "statement.xlsx",
  "file_hash": "0000000000000000000000000000000000000000000000000000000000000000",
  "force": false,
  "rows": [
    {
      "date": "2026-07-01",
      "amount": 1250.5,
      "currency": "INR",
      "type": "Expense",
      "account": "Bank",
      "category": "Food",
      "subcategory": "Groceries",
      "note": "Market"
    }
  ]
}
```

Contract rules:

- `file_hash` is exactly 64 hexadecimal characters.
- `rows` contains 1 to 100,000 items.
- Every date must be a valid `YYYY-MM-DD` calendar date.
- Amounts are non-negative and at most `9999999999999.99`; normalization uses
  decimal rounding to two places.
- Source currency must be INR. Display-currency conversion remains separate.
- Account, category, and subcategory labels are at most 255 characters; notes
  are at most 10,000 characters, and the file name is at most 500 characters.
- The configured upload-size limit, 50 MiB by default, also applies to streamed
  JSON request bodies before parsing.
- Import row types are `Income`, `Expense`, `Transfer-In`, or `Transfer-Out`.
- `force=true` bypasses the already-imported file check.
- The batch is a complete snapshot of all accounts and history to retain.
  Entries absent from it are soft-deleted. An invalid row rejects the complete
  batch before any ledger mutation.

Successful response:

```json
{
  "success": true,
  "message": "Successfully processed statement.xlsx",
  "stats": {
    "processed": 1,
    "inserted": 1,
    "updated": 0,
    "deleted": 0,
    "unchanged": 0
  },
  "file_name": "statement.xlsx",
  "analytics_status": "ready",
  "analytics_message": null
}
```

The upload endpoint normalizes rows, creates occurrence-aware transaction
hashes, and commits reconciliation and import history in one transaction.
Empty transaction or transfer groups still participate in reconciliation.
The API then runs one full analytics refresh. A failed refresh returns
`analytics_status: "failed"` with an explanation; the saved ledger remains
committed. Retry only `POST /api/analytics/v2/refresh` in that case.
An older server that omits the status is shown as unconfirmed by the current
frontend, with the same separate refresh action.

`GET /api/upload/history?limit=10` returns the authenticated user's imports in
most-recent-first order. `limit` accepts 1 through 100. Each row includes the
file name and hash, an explicit-UTC import timestamp, and processed, inserted,
updated, deleted, and skipped counts; `total_count` reports the full unpaginated
history size.

`GET /api/exchange-rates?base=USD` returns the latest rates. Adding
`on_date=YYYY-MM-DD` requests the rate published for that historical date and
returns both `requested_date` and the actual `as_of` publication date. Historical
lookups bypass the latest-rate cache and present-day fallback table so a failed
lookup cannot silently substitute today's FX for an RSU vest date.

## Transaction Contracts

Manual creation accepts:

```json
{
  "date": "2026-07-01T10:00:00Z",
  "amount": 1250.5,
  "type": "Expense",
  "category": "Food",
  "subcategory": "Groceries",
  "account": "Bank",
  "note": "Market",
  "from_account": null,
  "to_account": null
}
```

Manual `type` values are `Income`, `Expense`, and `Transfer`. Transfers should
provide `from_account` and `to_account`.

Tag replacement accepts up to 10 tags. Each trimmed tag must be 1 to 50
characters. An empty list clears all tags.

```json
{
  "tags": ["reimbursable", "work"]
}
```

## Goal Contracts

Goal reads, creation, updates, and deletion are scoped to the authenticated
user. `PATCH /api/analytics/v2/goals/{goal_id}` changes only supplied fields:

```json
{
  "name": "Emergency fund",
  "current_amount": 75000,
  "target_amount": 300000,
  "target_date": "2027-03-31",
  "notes": "Six months of essential expenses"
}
```

Targets must be positive; allocated amounts must be non-negative. Both fit
15 decimal digits with two decimal places. Names are limited to 255 characters,
goal types to 50, and notes to 10,000. Setting `target_date` or `notes` to null
clears that value. An empty patch, null required field, or unknown field is
rejected. Older ISO datetime deadlines retain their chosen calendar date.

The server derives progress and completion from the saved amounts. Allocating
money to a goal does not create or modify a ledger transaction.
`DELETE /api/analytics/v2/goals/{goal_id}` removes the goal after UI confirmation.
A missing goal or a goal belonging to another account returns 404.

Older browser-only goal changes have a separate, explicit recovery review.
The frontend offers only records matching goals in the current account,
requires confirmation, and persists selected changes through these same
endpoints. The original browser records remain intact. Demo edits remain
temporary and never trigger these writes.

## Account Classifications

`POST /api/account-classifications` takes `account_name` and `account_type` as
query parameters. Valid persisted account types are:

- `Cash`
- `Bank Accounts`
- `Credit Cards`
- `Investments`
- `Loans/Lended`
- `Other Wallets`

`GET /api/account-classifications` returns an account-to-type object:

```json
{
  "Salary Account": "Bank Accounts",
  "Broker": "Investments"
}
```

An unclassified single-account lookup returns `Other` without creating a row.

## Salary and Projection Preferences

Salary structure is keyed by fiscal-year label:

```json
{
  "salary_structure": {
    "2026-27": {
      "base_salary_annual": 2400000,
      "hra_annual": 600000,
      "bonus_annual": 300000,
      "epf_monthly": 3600,
      "nps_monthly": 0,
      "special_allowance_annual": 0,
      "other_taxable_annual": 0
    }
  }
}
```

RSU grants use dated vestings. `price_at_vest` is optional and stores a locked
historical price for completed vestings.

```json
{
  "rsu_grants": [
    {
      "id": "grant-1",
      "stock_name": "Example Corp",
      "stock_price": 100,
      "grant_date": "2026-01-01",
      "notes": null,
      "vestings": [
        {
          "date": "2026-08-01",
          "quantity": 10,
          "price_at_vest": null
        }
      ]
    }
  ]
}
```

Growth assumptions:

```json
{
  "growth_assumptions": {
    "base_salary_growth_pct": 8,
    "bonus_growth_pct": 5,
    "epf_scales_with_base": true,
    "nps_growth_pct": 0,
    "stock_price_appreciation_pct": 7,
    "projection_years": 3
  }
}
```

## AI Configuration and Tools

Modes:

- `app_bedrock` uses the server-configured Bedrock model, region, and credential
  while retaining any saved personal configuration.
- `byok` uses a saved personal OpenAI, Anthropic, or Bedrock configuration.
  Personal Bedrock requires a usable personal key; a missing or unreadable key
  returns 400 before inference. Shared funding requires explicit app mode.

Saved API keys are encrypted at rest with AES-256-GCM. Current v3 envelopes
derive their key with HKDF-SHA256 from the configured encryption material.
Authenticated legacy v1/v2 ciphertexts remain readable and can be rewrapped.
Drain older workers before v3 writes and retain previous encryption material
during rotation; see [the deployment guide](DEPLOYMENT.md).

`GET /api/preferences/ai-config` never includes the key. The explicit key
endpoint returns `Cache-Control: no-store, no-cache, private, max-age=0`.

`has_key` describes a decryptable, nonempty personal key, not live provider
authentication. `funding_source` separately reports `app`, `personal`, or null.
A model/region-only `PUT` may omit `api_key` only when the same provider has a
usable stored key. A supplied blank or legacy placeholder key is rejected.
A concurrent key/provider change returns 409; reload the saved configuration
before retrying. No key reveal is required for a model-only save.

Configured token budgets apply to both shared and personal Bedrock proxy calls.
Zero blocks calls, while null or the existing clear flags remove a budget.
Pending reservations count against the applicable UTC daily/monthly windows.
Usage rollups expose `reserved_tokens` and `pending_call_count` separately from
completed-call totals. Known failures before inference release quota; ambiguous
inference failures retain the reservation until its accounting window ends.

OpenAI and Anthropic calls go directly from the browser to their provider.
Their usage reports are bounded and personal-funded; configured limits are
informational and do not replace provider spending controls.

All 15 financial tools validate arguments and are read-only, user-scoped, and
response-capped. The AI cannot mutate ledger data through the tool endpoint. Provider calls are
non-streaming JSON requests with a maximum tool-round count enforced by the
frontend.

## Exchange and Instrument Data

`GET /api/exchange-rates?base=INR` uses frankfurter.dev and a 24-hour,
per-process memory cache.

- Fresh results include `base`, `rates`, and Unix `fetched_at`.
- A failed upstream refresh can return the existing cache with `stale: true`.
- If no INR cache exists, the endpoint returns dated fallback rates with
  `fallback: true` and `fallback_as_of`.
- A non-INR request with no usable result returns HTTP 502.

`GET /api/stock-price/{symbol}` returns the latest Yahoo Finance market price.
Pass `on_date=YYYY-MM-DD` for the closing price on that date or the nearest
prior trading day within seven days. Historical responses include `as_of`.

## Rate Limiting

| Operation | Limit key | Limit |
| --- | --- | --- |
| OAuth initiation | IP | 20/minute |
| OAuth callbacks | IP | 20/minute |
| Token refresh | IP | 20/minute |
| Upload | Authenticated user | 10/minute |
| Upload | IP | 50/minute |
| Bedrock chat | Authenticated user | 30/minute |
| Bedrock chat | IP | 60/minute |

One limiter checks both the account and IP bounds. Cross-instance per-minute
enforcement requires distributed SlowAPI storage; the default is process-local.
The app-provided Bedrock mode also has a configurable per-user daily call
limit. Each provider round counts, so a tool-assisted message can use multiple
calls. Database reservations serialize that daily quota and configured
Bedrock token budgets across workers.

## CORS, Caching, and Security Headers

- CORS uses an explicit origin allowlist plus the configured frontend origin.
- Bearer authentication does not use credentialed cookies.
- Authenticated API GET responses use `Cache-Control: no-store`.
- The PWA service worker does not cache `/api/*`.
- GZip applies to responses of at least 1,000 bytes.
- Responses include content-type, frame, referrer, permissions, and content
  security headers.
- Production responses also include HSTS.

## Related Reading

- [Architecture](architecture.md)
- [Database](DATABASE.md)
- [Calculations](CALCULATIONS.md)
- [Deployment](DEPLOYMENT.md)
