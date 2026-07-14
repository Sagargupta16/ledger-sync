# API Reference

Human-readable reference for Ledger Sync API version 2.22.0.

The generated OpenAPI document is the contract source of truth. This guide was
verified against that document on 2026-07-14.

Current OpenAPI inventory:

- 99 paths
- 113 HTTP operations
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
frontend and API use different origins.

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
- `POST /api/auth/oauth/google/callback`
- `POST /api/auth/oauth/github/callback`
- `POST /api/auth/refresh`, which authenticates with a refresh token in the body

All financial data, preferences, external-rate proxies, and AI operations
require an authenticated user.

### OAuth flow

1. The frontend requests `GET /api/auth/oauth/providers`.
2. The backend returns each configured provider plus a signed state token.
3. The browser opens the provider authorization URL.
4. The provider redirects to `/auth/callback/:provider` with `code` and `state`.
5. The frontend posts both values to the matching backend callback.
6. The backend validates the HMAC-SHA256 state token and its 10-minute expiry.
7. The backend exchanges the code, verifies the provider identity, and creates
   or loads the local user.
8. The callback returns an access token and refresh token.

The authoritative identity is `(auth_provider, auth_provider_id)`. The backend
does not silently merge an email already linked to another provider.

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
| 409 | Import or identity conflict |
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
| `GET` | `/api/auth/oauth/providers` | List configured providers and signed state |
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
| `POST` | `/api/upload` | Reconcile browser-parsed transaction rows |
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
| `GET` | `/api/analytics/v2/spending-rule` | Needs, wants, and savings analysis |
| `GET` | `/api/analytics/v2/net-worth` | Net worth history |
| `GET` | `/api/analytics/v2/fy-summaries` | Fiscal-year rollups |
| `GET` | `/api/analytics/v2/anomalies` | Detected anomalies |
| `POST` | `/api/analytics/v2/anomalies/{anomaly_id}/review` | Review or dismiss an anomaly |
| `GET`, `POST` | `/api/analytics/v2/budgets` | List or create category budgets |
| `GET`, `POST` | `/api/analytics/v2/goals` | List or create financial goals |
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
| `GET`, `DELETE` | `/api/account-classifications/{account_name}` | Read or remove one mapping |
| `GET` | `/api/account-classifications/type/{account_type}` | Accounts in one type |
| `GET`, `PUT` | `/api/preferences` | Read or partially update all preferences |
| `POST` | `/api/preferences/reset` | Restore preference defaults |
| `PUT` | `/api/preferences/fiscal-year` | Fiscal-year start |
| `PUT` | `/api/preferences/essential-categories` | Essential categories |
| `PUT` | `/api/preferences/investment-mappings` | Investment account mappings |
| `PUT` | `/api/preferences/income-sources` | Income tax-treatment groups |
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
| `GET` | `/api/exchange-rates` | Currency rates by base currency |
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
- Amounts are non-negative.
- Import row types are `Income`, `Expense`, `Transfer-In`, or `Transfer-Out`.
- `force=true` bypasses the already-imported file check.

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
  "file_name": "statement.xlsx"
}
```

The upload endpoint normalizes rows, creates occurrence-aware transaction
hashes, reconciles the current user's ledger, and runs a full analytics
refresh. A refresh failure is logged but does not roll back successfully
persisted transactions. `POST /api/analytics/v2/refresh` remains available for
a manual retry.

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

- `app_bedrock` uses the server-configured Bedrock model and credential.
- `byok` uses a saved OpenAI, Anthropic, or Bedrock configuration.

Saved API keys are encrypted at rest with AES-256-GCM. Current v2 ciphertexts
derive their key with HKDF-SHA256 from `LEDGER_SYNC_ENCRYPTION_KEY`. Legacy v1
PBKDF2 ciphertexts remain readable and are rewritten as v2 when revealed.

`GET /api/preferences/ai-config` never includes the key. The explicit key
endpoint returns `Cache-Control: no-store, no-cache, private, max-age=0`.

All 15 financial tools are read-only, user-scoped, and response-capped. The AI
cannot mutate ledger data through the tool endpoint. Provider calls are
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
| OAuth callbacks | IP | 20/minute |
| Token refresh | IP | 20/minute |
| Upload | Authenticated user | 10/minute |
| Upload | IP | 50/minute |
| Bedrock chat | Authenticated user | 30/minute |
| Bedrock chat | IP | 60/minute |

The app-provided Bedrock mode also has a configurable per-user daily message
limit. BYOK token limits are independently configurable per user.

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
