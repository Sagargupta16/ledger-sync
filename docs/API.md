# API Reference

Human-readable reference for Ledger Sync API version 2.31.0.

The generated OpenAPI document is the contract source of truth. This guide was
verified against that document on 2026-09-09; the 2.31.0 additions were checked
against the code and the OpenAPI path list on 2026-10-27.

Current OpenAPI inventory:

- 141 paths
- 171 HTTP operations
- Swagger UI at `/docs`
- ReDoc at `/redoc`
- Raw schema at `/openapi.json`

All three are served only when `LEDGER_SYNC_ENVIRONMENT=development` (the
default for a local run); staging and production return 404 for them, so the
hosted API does not publish its route inventory. To inspect the current schema
locally:

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

Four paths take another credential. Three accept an `lsu_` access token that
holds one scope: `POST /api/upload/money-manager` (`mmbak:upload`, which also
accepts a signed-in access token), `POST /mcp` (`ledger:read`) and
`POST /api/ingest/text` (`alerts:ingest`). `GET` and `POST /api/push/run-due`,
the daily cron, take `Authorization: Bearer <CRON_SECRET>`. See
[Access tokens](#access-tokens), [MCP Server](#mcp-server),
[Bank Alerts](#bank-alerts) and [Push Alerts](#push-alerts).

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
| 403 | Authenticated account is disabled |
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
| `GET`, `PUT` | `/api/auth/me` | Read or update the current profile; `is_admin` is true for an account in `LEDGER_SYNC_ADMIN_EMAILS` |
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
| `POST` | `/api/upload/money-manager` | Replace the ledger with a Money Manager `.mmbak` backup (raw body); a backup with repeat rules or budgets also updates scheduled payments and budgets |
| `GET` | `/api/upload/history` | Most-recent-first import history and row counts |
| `GET`, `POST` | `/api/upload-tokens` | List active access tokens, or create one for a scope (plaintext returned once) |
| `DELETE` | `/api/upload-tokens/{token_id}` | Revoke an access token |
| `GET`, `POST` | `/api/saved-views` | List or create saved filters |
| `DELETE` | `/api/saved-views/{view_id}` | Delete a saved filter |
| `GET` | `/api/saved-views/tiles` | Pinned views as Dashboard watch tiles (month to date, the same days last month, six complete months), or last month's top 3 spending categories as suggestions when none are pinned |
| `PUT`, `DELETE` | `/api/saved-views/{view_id}/pin` | Pin a saved view (idempotent; 409 past 8 pins, 404 if not the user's) or unpin it |
| `PUT` | `/api/saved-views/pins/order` | Reorder pins with `{"view_ids": [...]}`; unlisted pins follow in their current order |
| `POST` | `/api/saved-views/pins/category` | Pin a category's spending with `{"category": ...}`, reusing an exact saved view or creating one |
| `GET`, `POST` | `/api/categorization-rules` | List or create rules |
| `PUT`, `DELETE` | `/api/categorization-rules/{rule_id}` | Update or delete a rule |
| `POST` | `/api/categorization-rules/apply` | Apply active rules to existing transactions |

`GET /api/transactions` and date-sorted `/api/transactions/search` return an
optional `next_cursor` alongside the existing `data`, `total`, `limit`, `offset`,
and `has_more` fields. For sequential pages, send that value as `cursor` and
omit `offset`. Keep the same filters, excluded-account settings, and sort
direction. The signed cursor is bound to its user and query; invalid or
mismatched values return 422. Non-date sorting and arbitrary page jumps retain
offset pagination. Totals remain exact; pagination does not freeze the ledger
against intervening edits.

### Analytics

| Methods | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/analytics/overview` | Income, expenses, savings, and account overview |
| `GET` | `/api/analytics/behavior` | Spending behavior metrics |
| `GET` | `/api/analytics/trends` | Trend metrics |
| `GET` | `/api/analytics/kpis` | Dashboard KPIs |
| `GET` | `/api/analytics/v2/monthly-summaries` | Persisted monthly rollups |
| `GET` | `/api/analytics/v2/daily-summaries` | Persisted daily rollups |
| `GET` | `/api/analytics/v2/cohort-spending` | Day and month spending cohorts |
| `GET` | `/api/analytics/v2/investment-holdings` | Derived investment holdings |
| `GET` | `/api/analytics/v2/category-trends` | Monthly category and subcategory trends |
| `GET` | `/api/analytics/v2/transfer-flows` | All-time account-pair transfer totals |
| `GET`, `POST` | `/api/analytics/v2/recurring-transactions` | List or create recurring entries |
| `PATCH`, `DELETE` | `/api/analytics/v2/recurring-transactions/{item_id}` | Update or delete a recurring entry; set or reset its amount |
| `GET` | `/api/analytics/v2/merchant-intelligence` | Merchant aggregates |
| `GET` | `/api/analytics/v2/data-health` | Ledger coverage, last-import row counts, and rollup freshness |
| `GET` | `/api/analytics/v2/spending-rule` | Needs, wants, and savings analysis |
| `GET` | `/api/analytics/v2/net-worth` | Net worth history |
| `GET` | `/api/analytics/v2/fy-summaries` | Fiscal-year rollups |
| `GET` | `/api/analytics/v2/anomalies` | Detected anomalies of eight check types |
| `POST` | `/api/analytics/v2/anomalies/{anomaly_id}/review` | Review or dismiss an anomaly |
| `GET`, `POST` | `/api/analytics/v2/budgets` | List category budgets (`active_only=false` adds paused ones) or create one |
| `PATCH`, `DELETE` | `/api/analytics/v2/budgets/{budget_id}` | Change the current user's monthly limit, alert threshold or `is_active` (pause and resume), or delete the budget |
| `GET`, `POST` | `/api/analytics/v2/goals` | List or create financial goals |
| `PATCH`, `DELETE` | `/api/analytics/v2/goals/{goal_id}` | Update saved goal details/progress or delete the current user's goal |
| `POST` | `/api/analytics/v2/refresh` | Refresh invalidated analytics; `?force_full=true` forces a recovery rebuild |

### Calculations

| Methods | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/calculations/categories/master` | Category hierarchy |
| `GET` | `/api/calculations/totals` | Income, expenses, net change, and savings rate |
| `GET` | `/api/calculations/monthly-aggregation` | Monthly values for a requested period |
| `GET` | `/api/calculations/yearly-aggregation` | Yearly values |
| `GET` | `/api/calculations/category-breakdown` | Category and subcategory totals |
| `GET` | `/api/calculations/account-balances` | Ledger-derived account balances |
| `GET` | `/api/calculations/category-monthly-history` | Monthly history for categories |
| `GET` | `/api/calculations/data-date-range` | Earliest and latest active transaction dates |
| `GET` | `/api/calculations/income-facets` | Income category and subcategory buckets with row counts and totals |
| `GET` | `/api/calculations/income-analysis` | Income source analysis |
| `GET` | `/api/calculations/category-daily-series` | Daily category series |
| `GET` | `/api/calculations/quick-insights` | Dashboard quick-insight values |
| `GET` | `/api/calculations/daily-net-worth` | Daily ledger net worth |

### Dashboard and planning reads

| Methods | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/dashboard-metrics/pulse` | Age of Money, Days of Buffering and the investment-transfer split for an optional `start_date`/`end_date` window, over the rows `/api/transactions/all` returns for it. Buffering divides today's net spendable balance by the window's mean daily spend in the 90 days to today, so a past window reads `null` |
| `GET` | `/api/dashboard-metrics/health` | The current financial-health analysis the FinHealth and CFP scores read: the trailing 24 completed months bounded by the employment start, with lifetime account balances. `current_health` is `null` below 10 rows or 3 completed months |
| `GET` | `/api/weekly-recap` | Last full IST week: spending against the 4-week average, top category movers, book-value net-worth change and driver, commitments due in 7 days, open anomalies and days to payday |
| `GET` | `/api/safe-to-spend` | Money safe to spend until the next payday, with a per-day allowance, spending pace and the first projected low balance |
| `GET` | `/api/safe-to-spend/projection` | End-of-day balance of each cash, bank and wallet account for 7 to 90 days, with crossings of zero and a threshold |
| `GET` | `/api/card-cycles` | Statement cycles of open credit cards: last and next statement, due date, billed and unbilled amounts, payment status, and the cash left in the paying account after dues |

### Accounts and preferences

| Methods | Path | Purpose |
| --- | --- | --- |
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

### Data Health, review and alerts

| Methods | Path | Purpose |
| --- | --- | --- |
| `GET`, `POST` | `/api/balance-checks` | Per-account balance checks, freshness and month coverage, or record what the bank showed for a day |
| `PUT`, `DELETE` | `/api/balance-checks/{check_id}` | Correct a check's day or amount, or delete it |
| `POST` | `/api/ingest/text` | Store one bank SMS or email alert from an `alerts:ingest` token (parsed fields and hashes only, never the text) |
| `GET` | `/api/bank-alerts` | Recent alerts matched against the ledger as `matched`, `missing` or `ignored` |
| `PATCH` | `/api/bank-alerts/{alert_id}` | Ignore an alert or restore it |
| `GET` | `/api/review-queue` | Newest unreviewed income and expense rows of a recent window, with category suggestions and the picker's categories |
| `PUT`, `DELETE` | `/api/review-queue/{transaction_id}` | Keep a row's category or change it (re-applied on every import), or undo the review |
| `GET` | `/api/category-suggestions/status` | Whether the per-user category model is on, with its thresholds and placeholder labels |
| `POST` | `/api/category-suggestions` | Suggested categories for unsaved upload rows (read-only; saves nothing) |

### Tax and RSUs

| Methods | Path | Purpose |
| --- | --- | --- |
| `GET`, `PATCH`, `DELETE` | `/api/tax-deductions/{tax_year}` | Read the old-regime deductions saved for one tax year, set the sections sent (zero removes one), or clear the year |
| `GET` | `/api/tax-ais` | Every tax year with saved AIS totals, newest first |
| `GET`, `PUT`, `DELETE` | `/api/tax-ais/{tax_year}` | One year's AIS totals (`null` when none), replace them, or remove them |
| `GET` | `/api/rsu-tax/vest-fx` | Every vest conversion record the user entered |
| `PUT`, `DELETE` | `/api/rsu-tax/vest-fx/{vesting_id}` | Create or replace one vest's conversion (employer figure, SBI TT buying rate or ECB approximation), or go back to the ECB approximation |
| `GET` | `/api/rsu-tax/vest-close/{vesting_id}` | The vest-date close in the stock's currency, before later splits |
| `POST` | `/api/rsu-tax/events` | Record a sale from one vest or a dividend on one of the user's stocks |
| `PATCH`, `DELETE` | `/api/rsu-tax/events/{event_id}` | Point a sale at another vest or a dividend at another stock, or remove the event |
| `GET` | `/api/rsu-tax/lots` | Lot ledger: one lot per vest that has happened, with sales, dividends and splits |
| `GET` | `/api/rsu-tax/schedule-fa` | Schedule FA (Table A3) rows for the calendar `year` |
| `GET` | `/api/rsu-tax/fast-ds` | FAST-DS 2026 valuation of each lot held on 31 March 2026 |

### Investments, search, push and MCP

| Methods | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/upload/cas` | Import a CAS PDF (multipart `file` and `password`, 4.5 MB cap); replaces the holdings of the same issuer kind |
| `GET` | `/api/mf-holdings` | CAS holdings at AMFI's latest NAV with cost, gain, XIRR, NAV freshness and the import list |
| `GET` | `/api/semantic-search/status` | Whether semantic search can run for this user and how much of the ledger is indexed |
| `POST`, `DELETE` | `/api/semantic-search/index` | Embed the next batch of new or changed rows (call until `done`), or remove every vector |
| `GET` | `/api/semantic-search` | Rank the user's rows by meaning for `q`, within the Transactions-page filters |
| `GET` | `/api/push/config` | Whether Web Push is configured: `enabled`, `daily_alerts`, the VAPID public key and the missing variable names |
| `GET`, `POST` | `/api/push/subscriptions` | List the user's devices, or store this browser's subscription |
| `DELETE` | `/api/push/subscriptions/{device_id}` | Stop alerts to one device |
| `POST` | `/api/push/subscriptions/unsubscribe` | Forget this browser by its endpoint (sign-out) |
| `POST` | `/api/push/test` | Send a test alert to one device or to every device |
| `GET`, `POST` | `/api/push/run-due` | The daily alert run (the cron uses `GET`), authenticated with `CRON_SECRET` |
| `POST` | `/mcp` | Read-only MCP server (no `/api` prefix) for a `ledger:read` access token |

### AI and external data

| Methods | Path | Purpose |
| --- | --- | --- |
| `GET`, `PUT`, `DELETE` | `/api/preferences/ai-config` | Read, save, or remove BYOK configuration |
| `PATCH` | `/api/preferences/ai-config/mode` | Switch `app_bedrock` or `byok` |
| `PATCH` | `/api/preferences/ai-config/limits` | Set or clear user token limits |
| `GET` | `/api/preferences/ai-config/key` | Reveal the current user's decrypted key |
| `POST` | `/api/ai/bedrock/chat` | Non-streaming Bedrock Converse proxy |
| `GET` | `/api/ai/tools` | List 16 read-only tool schemas |
| `POST` | `/api/ai/tools/execute` | Execute one user-scoped tool |
| `POST` | `/api/ai/usage/log` | Record browser-direct provider usage |
| `GET` | `/api/ai/usage` | Today, month-to-date, and all-time usage, plus this user's limits (`limits.app_daily_messages` is 0 for an account in `LEDGER_SYNC_AI_UNLIMITED_EMAILS` or `LEDGER_SYNC_ADMIN_EMAILS`) |
| `GET` | `/api/exchange-rates` | Latest or historical currency rates by base currency |
| `GET` | `/api/rates/instruments` | EPF, PPF, and NPS reference rates |
| `GET` | `/api/stock-price/{symbol}` | Latest or historical stock price |

### Owner admin

| Methods | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/admin/stats` | App-wide counts and sums for an account in `LEDGER_SYNC_ADMIN_EMAILS`; 403 for everyone else |

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

The upload endpoint normalizes rows, captures versioned source fingerprints
before categorization rules, and commits reconciliation, import history, and
analytics invalidation in one transaction. Category edits preserve public IDs.
Empty transaction or transfer groups still participate in reconciliation.
The API then refreshes analytics, skipping unchanged inputs or selectively
rebuilding daily/monthly summaries when possible. A failed refresh returns
`analytics_status: "failed"` with an explanation; the saved ledger remains
committed. Retry only `POST /api/analytics/v2/refresh` in that case.
An older server that omits the status is shown as unconfirmed by the current
frontend, with the same separate refresh action.

`GET /api/upload/history?limit=10` returns the authenticated user's imports in
most-recent-first order. `limit` accepts 1 through 100. Each row includes the
file name and hash, an explicit-UTC import timestamp, and processed, inserted,
updated, deleted, and skipped counts; `total_count` reports the full unpaginated
history size.

### Money Manager backups

A Money Manager (Realbyte) backup is read on the server, so the body is the
`.mmbak` file itself, raw or gzip- or zip-compressed. Vercel refuses request
bodies over 4.5 MB, so the frontend gzips it (a 5 MB backup compresses to
about 1.3 MB).

```http
POST /api/upload/money-manager?file_name=20260501_090000.mmbak&dry_run=true
Content-Type: application/gzip
Authorization: Bearer <access_token or mmbak:upload access token>
```

```json
{
  "status": "preview",
  "file_name": "20260501_090000.mmbak",
  "stats": { "processed": 1250, "inserted": 40, "updated": 3, "deleted": 1, "unchanged": 1207 },
  "summary": { "transactions": 1000, "transfers": 250, "accounts": 12, "first_date": "2024-04-01", "last_date": "2026-10-20" },
  "analytics_status": "skipped",
  "analytics_message": null
}
```

- The backup replaces the ledger like `POST /api/upload`: missing rows are
  soft-deleted. Each row keeps its Money Manager UID in
  `transactions.source_uid`, so a later backup that edits a row's amount, date,
  account, note or category updates it in place under the same public ID.
  Rows imported earlier from a spreadsheet are adopted on the first backup.
- `status` is `imported`, `preview` (`dry_run=true`; nothing committed) or
  `unchanged` (this exact database was already imported; `force=true`
  re-imports it). Errors carry `detail` and no `status`.
- A backup that would remove more than 5% of the live ledger (at least 25
  rows) returns 409 and changes nothing, unless `allow_large_delete=true`
  confirms a reviewed preview.
- Live accounts store the backup's group, card statement and payment days and
  paying account. An account with no type takes the one its Money Manager group
  implies; a chosen type is never replaced.
- 400 covers an unreadable file, non-INR transactions and rows without an
  account; 413 a body over the upload limit.
- A backup with repeat-rule or budget tables also returns `planning`:
  `{"repeat_rules": counts | null, "budgets": counts | null}`. `counts` is
  `{found, added, updated, unchanged, kept, removed, skipped}`, where `skipped`
  maps a reason to a count. Repeat rules skip as `unknown_type`, `transfer`,
  `not_inr`, `ended`, `incomplete` or `invalid`; budgets as `yearly`,
  `subcategory`, `unsupported`, `missing_category`, `no_amount`, `invalid` or
  `conflict`. A preview's counts are what the import would do. Live repeat
  rules are written to `scheduled_transactions` and monthly whole-category
  budgets to `budgets`, each linked to its Money Manager UID in
  `external_refs`. `kept` counts imported rows edited in Ledger Sync since the
  last import, which the import leaves alone. `removed` counts linked rows
  switched off because their rule or budget is gone. Rows created in Ledger
  Sync are never changed; a budget whose category already has one counts as
  `conflict`. `planning` is null for an `unchanged` reply, for a backup without
  those tables, until the `external_refs` migration has run, and when the
  repeat rules and budgets could not be compared or stored (the ledger still
  imports). Token uploads get the same field.

### Access tokens

Automations such as an iOS Shortcut or an MCP client cannot run the OAuth
sign-in, so a user creates an access token in Settings > Advanced > Access
Tokens. `POST /api/upload-tokens` with
`{"name": "iPhone Shortcut", "scope": "mmbak:upload"}` returns 201 with `token`
(`lsu_...`) once; only its SHA-256 is stored. `scope` is optional and is one of
`mmbak:upload` (the default, so older clients keep working), `ledger:read` or
`alerts:ingest`; anything else returns 422. `GET /api/upload-tokens` lists the
active tokens of every scope, oldest first, with `id`, `name`, `scope`,
`prefix`, `created_at`, `expires_at` and `last_used_at` (written at most once a
minute); `DELETE /api/upload-tokens/{token_id}` revokes one (204, or 404 for an
unknown id). A user holds at most five active tokens per scope; the sixth
returns 409 naming the scope, such as "You already have 5 active MCP read
tokens. Revoke one first." Each token expires after 365 days. Token creation is
limited to 10 an hour.

Each token holds exactly one scope and reaches only the route that requires it:

| Scope | Route | Purpose |
| --- | --- | --- |
| `mmbak:upload` | `POST /api/upload/money-manager` | Upload a Money Manager backup |
| `ledger:read` | `POST /mcp` | Read-only ledger tools for an MCP client |
| `alerts:ingest` | `POST /api/ingest/text` | Post bank SMS or email text to the alert inbox |

A token cannot sign in or call any other endpoint. A revoked, expired, unknown
or other-scope token returns 401 with `WWW-Authenticate: Bearer`. The backup
route also accepts a signed-in access token. A token upload cannot read data,
preview, or override the deletion guard: `dry_run` and `allow_large_delete` are
ignored and every token upload commits under the guard.

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

## Budget Contracts

Budget reads and writes are scoped to the authenticated user.

- `GET /api/analytics/v2/budgets` returns `{"data": [...], "count": n}`, most
  used first, with this IST month's spend counted at request time.
  `active_only=false` adds paused budgets. Each item carries `id`, `category`,
  `subcategory`, `monthly_limit`, `current_spent`, `remaining`, `usage_pct`,
  `alert_threshold`, `avg_actual`, `months_over`, `months_under` and
  `is_active`.
- `POST` takes `category` (1 to 255 characters after trimming), `monthly_limit`
  (0.01 up to 9,999,999,999,999.99), an optional `subcategory` and an optional
  `alert_threshold` (0 to 100, default 80). It returns
  `{"success": true, "budget_id": 7, "reactivated": false}`. A scope (a category
  and its optional subcategory) holds one budget, paused or not: a paused one
  takes the new values and returns `reactivated: true`, and an active one
  returns 409. Out-of-range values return 422.
- `PATCH /api/analytics/v2/budgets/{budget_id}` accepts any of `monthly_limit`,
  `alert_threshold` and `is_active` (pause and resume) and returns the updated
  budget in the list shape. Omitted fields keep their value. A missing budget
  or another user's returns 404, and `budget_id` must be a positive 32-bit
  integer.
- `DELETE` removes only that budget and returns `{"success": true}`; ledger
  transactions are untouched. A missing or foreign budget returns 404.

Create (and resume) and a change to the limit or `is_active` store this month's
spend on the row at once, instead of leaving zero until the next import. Create,
resume, delete and those changes mark preferences changed, so the next refresh
rebuilds budget tracking and budget-exceeded anomalies. Those changes and a
delete also clear the category's open budget alert once nothing there is over
its limit. A threshold-only change invalidates nothing.

## Recurring Amount Contracts

The recurring list returns the effective amount as `expected_amount`: the
user's amount when `amount_edited` is true, else the detected one.
`detected_amount` is what detection last derived from history (null on an entry
added by hand), and `amount_edited` is true while the user's amount differs
from it. Sorting and `summary.total_monthly_recurring` use the effective
amount.

`PATCH /api/analytics/v2/recurring-transactions/{item_id}`:

- `{"expected_amount": n}` on a detected entry stores the user's amount beside
  the detected one, so analytics refresh keeps it. An amount equal to the
  detected one clears it instead.
- `{"reset_amount": true}` clears it and the detected amount applies again.
- Sending both returns 422, as does `expected_amount` with
  `is_confirmed=false`. Un-confirming an entry (`is_confirmed=false`) clears
  the user's amount, because refresh deletes and re-derives unconfirmed rows.
- An entry added by hand keeps its amount in `expected_amount` and is never
  `amount_edited`.
- Any edit confirms the entry unless the body sets `is_confirmed` itself.
- Every response carries `status`, `id`, `expected_amount`, `detected_amount`
  and `amount_edited`. A missing entry returns 404, and an invalid frequency,
  pattern kind or amount change returns 422.

## Anomaly Contracts

`GET /api/analytics/v2/anomalies` lists detected anomalies, newest detection
first. `type` is any of `high_expense`, `unusual_category`, `large_transfer`,
`duplicate_suspected`, `missing_recurring`, `budget_exceeded`,
`closed_account_activity` and `fee_charge`, and `severity` is `low`, `medium`,
`high` or `critical`. `limit` (default 50, at most 200) caps `data`; `count` and
`summary` (high, medium and low counts) cover every match. Reviewed and
dismissed rows appear only with `include_reviewed=true`. An auto-dismissed row
has `is_reviewed` and `is_dismissed` true, `reviewed_at` null and
`review_notes` starting `Auto-dismissed: `.

`POST /api/analytics/v2/anomalies/{anomaly_id}/review` takes
`{"dismiss": false, "notes": null}` and returns
`{"success": true, "anomaly_id": id}`; a missing anomaly or another user's
returns 404.

`PUT /api/preferences/anomaly-settings` saves `anomaly_expense_threshold` (1 to
10), `anomaly_types_enabled` and `auto_dismiss_recurring_anomalies`, and the
analytics refresh reads all three. `anomaly_types_enabled` lists the checks to
run: unset, or exactly the old default four (`high_expense`,
`unusual_category`, `large_transfer`, `budget_exceeded`), runs every check; a
list naming none of the newer types keeps the newer ones on; any other list is
the complete set. `auto_dismiss_recurring_anomalies` files recurring matches as
dismissed. Call `POST /api/analytics/v2/refresh` afterwards to rebuild the list;
the Anomaly Review panel does this.

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
  while retaining any saved personal configuration. The default model is Claude
  Haiku 5.5 (`us.anthropic.claude-haiku-5-5`, `LEDGER_SYNC_AI_DEFAULT_BEDROCK_MODEL`).
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

The Bedrock proxy adds Converse `additionalModelRequestFields` for Claude 5.x
models, because the chat wire format carries only text, `tool_use` and
`tool_result` blocks and a reasoning block would not survive to the next tool
round. Thinking is turned off for Haiku 5.5, Sonnet 5 and Opus 5, and set to low
effort for Sonnet 5.5, Opus 5.5 and Fable 5 and 5.1, which reject a disabled
setting. Models that think only when asked get no extra fields.

All 16 financial tools validate arguments and are read-only, user-scoped, and
response-capped. The AI cannot mutate ledger data through the tool endpoint. Provider calls are
non-streaming JSON requests with a maximum tool-round count enforced by the
frontend.

`aggregate_transactions` is the general read for any breakdown or history the
fixed summary tools do not give (`api/ai_tools_impl/aggregate.py`). Arguments:

- `group_by`: `month`, `quarter`, `fiscal_year` or `year` for periods, or
  `category`, `subcategory`, `account` or `type` for a ranking (default `month`).
- `split_by`: `category`, `account` or `type`, one series per value, for period
  groupings only; it must differ from `group_by`.
- Filters: `type` (`Income`, `Expense` or `Transfer`), `categories` (each name
  matched exactly without case, else by substring), `subcategories` and
  `accounts` (exact, without case), up to 20 names each, `note_contains`, and
  `start_date`/`end_date` (`YYYY-MM-DD`, inclusive).
- `measure`: `sum` of amounts (default) or `count` of rows; `limit` 1 to 60
  periods or groups (default 36, the most recent periods); `series_limit` 1 to
  6 series (default 5), the rest folded into `Other`.

A period grouping returns `rows` of `{period, value}`, or `{period, values,
total}` with `series` when split, for every period in the range: a period with
no rows is zero, the range ends at today, a fiscal year uses the user's start
month (`FY2026-27`) and a quarter is a calendar quarter (`2026-Q2`). A ranking
returns `rows` of `{key, value}`, largest first, and `other` with the count and
total of the groups left out. Every result also carries `transactions` (rows
matched), `matched_categories`, the grouping, measure and dates asked for, and
today's date. Rows come
from the live ledger minus excluded accounts, and Expense rows in a classified
capital-loss taxonomy are left out, as every spending total in the app does. An
invalid combination (for example `split_by` with a ranking) is a 422 the model
can correct.

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

## Dashboard Reads

All of these are read-only and scoped to the authenticated user. Money is a
JSON number in INR and dates are IST `YYYY-MM-DD`.

`GET /api/dashboard-metrics/pulse` takes optional `start_date` and `end_date`
(inclusive, as on `/api/transactions/all`) and returns `age_of_money` and
`days_of_buffering` (integers or `null`) and `investment_transfers`
(`contributions`, `withdrawals`, `net_contributions`, `internal_transfers`,
`other_transfers`). `GET /api/dashboard-metrics/health` returns
`{"current_health": null}` or `{"current_health": {analysis, period,
earning_start}}`: `analysis` holds the inputs the FinHealth and CFP scores read,
`period` the completed months it covers, and `earning_start` the employment
start and whether it was `saved`, `inferred` or `unknown`. Both take the shared
analytics read lock, as the analytics v2 reads do, and replace the Dashboard's
download of `/api/transactions/all`.

`GET /api/weekly-recap` returns the last full Monday-to-Sunday IST week:
`week` (`start`, `end`, `as_of`, `baseline_start`, `baseline_weeks`,
`data_from`, `data_through`, `is_complete`), `spending` (`this_week`,
`weekly_average`, `change`, `change_pct`), up to five `movers`, `net_worth` at
book value (`start`, `end`, `change`, `income`, `expenses`, `driver`), `bills`
(`window_start`, `window_end`, `total`, `items`), up to five `anomalies` with
`anomaly_count`, and `payday` (`day_of_month`, `next_date`, `days_until`). The
baseline averages up to four full weeks before the recap week, leaving out
weeks before the first transaction, and a `null` always means "no basis to
compare against", never zero. `bills` covers recurring expense commitments due
from today through the seventh day after it, as the notification bell does; card
statement dues are not included. The optional Explain narrative has no endpoint
of its own: the browser sends the recap figures through
`POST /api/ai/bedrock/chat`, or to the user's own browser-direct provider
followed by `POST /api/ai/usage/log`, so it counts against the same daily quota
as a chat message.

`GET /api/safe-to-spend` takes an optional `threshold` (INR, 0 to
1,000,000,000,000, at most two decimals, default 0; 0 flags only a fall below
zero) and returns `as_of`, `balance_as_of` (the newest transaction used),
`threshold`, `cycle` (`start`, `next_payday`, `days_left`, `total_days`,
`payday`, `basis` as `payday` or `month_end`, `detected_payday`), `liquid`
(`gross`, `liabilities`, `net`, `spendable_accounts`, `card_accounts`,
`unclassified_accounts`), `bills_before_payday`, `bill_count`, up to 12 `bills`
(`name`, `account`, `date`, signed `amount`), `reserve` (`amount`, `status` as
`covered`, `reserved` or `no_recurring_income`, `cycles`), `safe_to_spend`,
`per_day`, `typical_daily_spend` (the median day), `pace` (or `null`) and
`low_balance` (the first account projected below zero or the threshold within
30 days, or `null`).

`GET /api/safe-to-spend/projection` takes `days` (7 to 90, default 30) and the
same `threshold`, and returns `as_of`, `balance_as_of`, `days`, `threshold`,
`dates`, a `total` series and per-account `accounts` series (`name`,
`start_balance`, `balances` with one end-of-day value per date, `lowest`,
`lowest_on`, `below_zero_on`, `below_threshold_on`, `starts_below_zero`,
`daily_spend`, `daily_transfer`; accounts with the earliest crossing first),
`events` (commitments and schedules inside the horizon) and `assumptions`
(`lookback_days`, `daily_spend`, `transfer_months`, `unassigned_flows`). Flags
are crossings: an account must start at or above the level. A negative or
non-numeric `threshold`, or `days` outside 7 to 90, returns 422.

`GET /api/card-cycles` takes `history` (1 to 24, default 6; 422 outside it), the
number of closed statements returned per card, and returns `as_of`, `cards`,
`paying_accounts` and `skipped`. Each card carries `account_id`, `name`,
`statement_day`, `payment_day`, `paying_account_id`, `paying_account`, its latest
statement (`last_statement_date`, `due_date`, `days_to_due`, `billed_amount`,
`paid_amount`, `due_amount`, `carried_in`, `status`, `paid_on`,
`paid_from_paying_account`), the open cycle (`next_statement_date`,
`unbilled_amount`, never below 0, `next_due_date`, `days_to_next_due`) and
`cycles`: `cycles[0]` is the open period, then closed statements newest first,
each with `period_start`, `statement_date`, `due_date`, `status`, `spend`,
`billed`, `paid`, `remaining`, `paid_on` and `paid_from_paying_account`.
`status` is `open`, `nothing_due` (billed INR 1 or less), `paid`, `partial`,
`due`, `overdue` or `rolled_over` (an older statement not yet paid; what it
still owes is inside the next bill). Each entry of `paying_accounts` has
`account_id`, `name`, the signed ledger `balance` today, `upcoming_dues` (the
unpaid part of each of its cards' latest statements), `unbilled`,
`cash_after_dues` and the `cards` it pays. `skipped` lists cards with no cycle
(`account_id`, `name`, `reason` as `closed` or `no_settings`); the statement and
payment days come only from a Money Manager backup import. Rows dated after
today are ignored.

## Balance Checks

`POST /api/balance-checks` takes
`{"account": "HDFC Savings", "check_date": "2026-10-20", "balance": "52340.50"}`
and returns `{id, account, check_date, balance}` with 200, for a new check and
for a replaced one. `balance` is signed INR with at most two decimals, sent as a
JSON number or a decimal string, within plus or minus 9,999,999,999,999.99; card
dues and overdrafts are negative. `check_date` runs from 2000-01-01 to today in
IST, and the account must appear on at least one of the user's live rows. A day
before 2000 returns the standard 422 array; a day after today, or an account no
row uses, returns 422 with a `detail` string. A second check on the same
account and day replaces the amount and keeps the same `id`.

`PUT /api/balance-checks/{check_id}` takes `{check_date, balance}`; the account
cannot change. It returns 404 for a missing check or another user's, 409 when
the account already has a check on the new day, and 422 for the date range.
`DELETE /api/balance-checks/{check_id}` returns 204 whether or not the check
existed.

`GET /api/balance-checks` returns `as_of` (today in IST), `idle_days` (30),
`tolerance` (1.0) and `accounts`, ordered by name: every account with live rows
that is not in `excluded_accounts`, plus any account that has a check. Each
account carries:

- `account`, `is_closed`, `status`, `ledger_balance` and `rows_after_check`
  (both as of `as_of`), and `transaction_count`, `first_date` and `last_date`
  (these include rows dated later).
- `last_activity`: the later of the newest row on or before `as_of` and the
  newest check, which idleness counts from.
- `checks`, newest first. Each has `id`, `check_date`, `balance`,
  `ledger_balance` at the end of `check_date`, `difference` (bank minus ledger)
  and `matches`.
- `months`: the months that have rows, oldest first, each with its row count.

The ledger balance counts every live row that touches the account, transfers to
excluded accounts included. `status` is decided in this order: `mismatch` when
the newest check is more than INR 1 off, `idle` when the newest row or check is
more than 30 days old, `unchecked` when there is no check, `changed` when rows
are dated after the newest check, otherwise `matched`. The ledger figures are
recomputed on every read; nothing from the ledger is stored with a check.

## Bank Alerts

`POST /api/ingest/text` takes `Authorization: Bearer lsu_...` with an
`alerts:ingest` token only (an access token or any other scope gets 401) and a
body of `{"text": "<1 to 10,000 characters>", "sender": "<optional, at most
120>"}`. It stores the parsed alert, never the text.

- 201 `{"status": "created", "alert": {...}}` for a new alert.
- 200 `{"status": "duplicate", "alert": {...}}` for the same normalised text on
  the same alert day, or the same reference (nine or more characters) and amount
  in the same direction.
- 422 `{"detail": ...}` when the text does not read as a completed INR debit or
  credit with an account, card or reference number. Nothing is stored.
- 429 over 30 a minute or 500 a day per token, 60 a minute per IP, or when the
  user already stored 500 new alerts in the last 24 hours.

`alert` is `{id, direction, amount, account_tail, merchant, bank, occurred_on}`:
`direction` is `debit` or `credit`, `account_tail` is at most four digits (or
`null`), `bank` is a display name (or `null`) and `occurred_on` is the IST date.

`GET /api/bank-alerts?days=60` (`days` 1 to 366) returns `alerts`, `counts`
(`matched`, `missing`, `ignored`), `window_days` (2), `since` (IST date),
`truncated` and `last_import_at` (UTC, or `null`). `alerts` is newest first, at
most 500, and each entry adds `received_at` (UTC), `status`, `after_last_import`
and `matched_transaction_id`. When more alerts fall in the window than one read
returns, it keeps whole days only, moves `since` up to the oldest day kept and
sets `truncated`, so `alerts` and `counts` describe the same days. Statuses are
recomputed on every read against live ledger rows: an alert is `matched` when a
row has the same amount to the paisa, a date within two days and a fitting side
(a debit matches an Expense or a transfer out, a credit an Income or a transfer
in), and each row answers one alert. `PATCH /api/bank-alerts/{alert_id}` takes
`{"ignored": true}` and returns `{id, ignored}`; it returns 404 for an unknown id
or another user's alert. Alerts never become ledger rows.

## Review Queue and Category Suggestions

`GET /api/review-queue` takes `limit` (1 to 50, default 20) and `days` (7 to
366, default 30). The window is the `days` calendar days ending on the day of the
newest income or expense row, or on today when rows run past today; a row dated
after today joins the queue on its day. Transfers and excluded accounts are
left out, and rows come newest first. It returns `items`, `remaining` (every
unreviewed row in the window, `items` included), `reviewed` (the window's rows
that already carry a decision), `window_start` (`null` with no income or expense
row), `window_days` and `categories` (every income and expense category in use,
most used first, each with `type`, `category`, `subcategories` and `count`). An
item has `transaction_id`, `date`, `amount`, `type` (`Income` or `Expense`),
`account`, `category`, `subcategory`, `note` and at most two `suggestions`
(`category`, `subcategory`, `confidence`) from the category suggester, never the
row's own label.

`PUT /api/review-queue/{transaction_id}` takes `{"action": "keep"}` or
`{"action": "change", "category": "Groceries", "subcategory": "Vegetables"}`.
Labels are trimmed and at most 255 characters, a blank subcategory clears it,
the category takes the stored spelling of an existing one, and a change needs a
category. A change rewrites the row and its dimension IDs and marks its day for
analytics without refreshing; call `POST /api/analytics/v2/refresh` after a
batch. Keeping a row that already has a change leaves the change in place.
Choosing the label a row already has counts as a keep, except on a row with a
change, where it replaces the stored change. The response is
`{transaction_id, decision, category, subcategory, imported_category,
imported_subcategory}`, where the `imported_*` pair is the label the latest
import gave the row. A missing, deleted or other user's transaction returns 404;
a transfer, or a change without a category, returns 422.
`DELETE /api/review-queue/{transaction_id}` forgets the review and, for a
change, puts the imported label back; it returns 204, also when the row has no
review. Every import applies a change again (see Reconciliation in
[Database](DATABASE.md)).

`GET /api/category-suggestions/status` returns `ready`, `training_rows`,
`category_count` (the most categories within one type), `min_training_rows`
(30), `min_categories` (2), `confidence_floor` (0.5) and `placeholder_labels`
(the casefolded labels that count as not categorised). `POST
/api/category-suggestions` takes `{"rows": [...]}`, 1 to 2,000 rows shaped like
`/api/upload` rows, and returns `{"ready": true, "suggestions": [[...], ...],
"rule_matched": 0}` in request order. It saves nothing. A suggestion is
`{category, subcategory, confidence}` with a probability from 0 to 1. A row gets
its best label when that is at least 0.5, plus the runner-up when the runner-up
is at least 0.05; otherwise `[]`, as it does until `ready` is true, for a
transfer, and for a row an active categorization rule will recategorize on
import (counted in `rule_matched`). The model is a per-user naive Bayes over the
caller's live income and expense rows whose category and subcategory are not
both placeholders; it reads the note's words (UPI references and card digits
stripped), the account, the amount's size and the weekday, with income and
expense trained separately.

## Saved View Pins

`GET /api/saved-views/tiles` returns `period` (`today`, `month_start`,
`previous_start`, `previous_end`, `trend_months`), `tiles`, `suggestions`,
`suggestions_month` and `max_pins` (8). A tile has `view_id`, `name`,
`position`, `measure` (`expense`, `income` or `transfer`: the type its view
filters to, or spending when it has none), `filters_valid`, `has_date_range`,
`other_types_present`, `month_to_date`, `previous_same_period` (the same days of
last month, clamped to its length), `change_pct` (`null` when that is 0),
`transaction_count` and `trend` (the six complete months before this one, oldest
first). A tile sums exactly the rows its view lists on the Transactions page,
with excluded accounts dropped; a view with no type filter counts expense rows
only, and `other_types_present` says it also lists income or transfer rows.
`filters_valid` is false, and the sums are 0, when the stored filters fail
validation, including any filter text over 500 characters. With nothing pinned,
`suggestions` lists last month's top three spending categories (`category`,
`amount`, `transaction_count`) for one-tap pins.

`PUT /api/saved-views/{view_id}/pin` pins a view at the end of the order and
returns `{view_id, position}`; an existing pin keeps its place. It returns 404
when the view is not the user's and 409 past 8 pins. `DELETE` unpins and returns
204 (the view stays; also 204 when it was not pinned).
`PUT /api/saved-views/pins/order` takes `{"view_ids": [...]}` (up to 50 ids, no
repeats), puts those pins first in that order, keeps the rest in their current
order and skips ids that are not pinned; it returns `[{view_id, position}]`.
`POST /api/saved-views/pins/category` takes `{"category": "Food"}` (1 to 255
characters, not blank) and reuses a saved view that already filters to exactly
that category's expenses, or creates one named after the category (a suffix such
as " (watch)" is added when another view holds the name), pins it and returns
`{view_id, name, position}`; 409 past 8 pins or when no free name is left.
Deleting a saved view removes its pin.

## Tax Deductions and AIS Totals

Both are user records for the Income Tax page, not ledger data, so no write
touches analytics. `tax_year` is two consecutive years such as `2026-27`
(April to March); anything else returns 422.

`GET /api/tax-deductions/{tax_year}` returns
`{"tax_year": "2026-27", "deductions": {"80C": 150000.0, "80D": 25000.0}}`, with
an empty map when nothing is saved. `PATCH` takes
`{"deductions": {"80C": 150000, "80D": 25000}}` and sets each section sent: a
positive amount is stored, zero removes the section, and a section left out
keeps its saved amount, so a page that has not loaded the year or a second tab
holding older amounts cannot erase sections it never showed. Keys are `80C`,
`80CCD(1B)`, `80D`, `HRA` and `24(b)`, the 1961 Act names the page has always
used, with amounts from 0 to 10,000,000 and at most two decimals; unknown keys
and extra fields return 422. It returns the year's saved state, or 409 if a
concurrent save conflicts twice. `DELETE` clears the year and returns 204, also
when nothing was saved.

`GET /api/tax-ais` returns `{"summaries": [...]}` for every year with saved AIS
totals, newest first. `GET /api/tax-ais/{tax_year}` returns
`{tax_year, tds_salary, tds_other, interest, dividends, updated_at}` (UTC ISO
8601) or `null`. `PUT` replaces the year with exactly `{tds_salary, tds_other,
interest, dividends}` in INR, each from 0 to 10^12 with at most two decimals;
any other field, a PAN for example, returns 422. `DELETE` returns 204, also for a
year with none. The AIS file is decrypted and parsed in the browser: the server
never receives it, the PAN or the date of birth.

## RSU Tax Records

A computation aid for an Indian return, not tax advice. Stored inputs are exact
decimals, computed values are JSON numbers, and Schedule FA and FAST-DS rupee
figures are whole rupees.

- `GET /api/rsu-tax/vest-fx` lists the user's conversion records.
  `PUT /api/rsu-tax/vest-fx/{vesting_id}` takes `{quote_price?, quote_currency
  (default "USD"), fx_rate?, fx_date?, employer_perquisite_inr?}` and derives
  `fx_source`: `employer` when `employer_perquisite_inr` is set, else
  `sbi_ttbr` when `fx_rate` is set (which needs `quote_price`; `fx_date`
  defaults to the last day of the month before the vest month), else `ecb`, the
  approximation. 404 for a vest that is not the user's, 409 on a lost race, and
  422 for an empty body, a vest that has not vested yet or a future date.
  `DELETE` returns 204 and is idempotent.
- `GET /api/rsu-tax/vest-close/{vesting_id}` returns `{symbol, currency, price,
  as_of, adjusted_price, split_factor}`: the vest-date close in the stock's
  currency before later splits. 404, 422 for a vest that has not passed, and 502
  when no close could be loaded.
- `POST /api/rsu-tax/events` (201) takes `{kind: "sale" | "dividend", lot_id,
  symbol, event_date, quantity, gross_amount, tax_withheld, fx_rate, fx_date,
  notes}`. A sale needs `lot_id` (the vest) and `quantity`, and cannot be dated
  before that vest. A dividend needs `symbol`, which must match one of the
  user's grant stock names (case-insensitive), and `tax_withheld` cannot exceed
  `gross_amount`. Amounts are in the stock's own currency, so there is no
  currency field; `fx_rate` and `fx_date` are an optional SBI TT buying rate.
  The date cannot be in the future. 404, 409 and 422 as above.
- `PATCH /api/rsu-tax/events/{event_id}` takes exactly one of `{"lot_id": ...}`
  for a sale or `{"symbol": ...}` for a dividend and points the event at another
  vest or stock. `DELETE` returns 204 and is idempotent.
- `GET /api/rsu-tax/lots` returns `{lots, events, symbols, first_year,
  current_year, warnings}`: one lot per vest that has happened, with its tax and
  ECB values, sales, remaining quantity and splits.
- `GET /api/rsu-tax/schedule-fa?year=YYYY` (2000 to 2100; a year that has not
  started returns 422) returns `{calendar_year, period_start, period_end,
  in_progress, return_label, rate_basis, rows, totals, warnings}`.
- `GET /api/rsu-tax/fast-ds` returns `{valuation_date, deadline, days_left,
  rate_basis, rows, total_value_inr, complete, warnings}` for holdings on
  2026-03-31 and the 2026-12-31 deadline; `days_left` is 0 on the deadline day
  and negative after it.

`vest-close`, `lots`, `schedule-fa` and `fast-ds` call Yahoo's chart API for
daily closes, and the two rupee reports (`schedule-fa`, `fast-ds`) also call
frankfurter.dev for the ECB series, one request per ticker or currency. They are
limited to 20 a minute per user each.

## Mutual Fund Holdings (CAS)

`POST /api/upload/cas` takes `multipart/form-data` with a `file` (the CAS PDF)
and a `password` (up to 128 characters). It needs an access token; upload
tokens are refused. The server reads the body into memory (4.5 MB cap, 413
beyond it), parses the form itself and opens the PDF with casparser. The PDF,
the password, the PAN and the investor's name, email, address and phone are
never written to disk, stored or logged. The password is tried as typed, then
trimmed, then in capitals. A CAMS or KFintech CAS (detailed or summary) supplies
folios and transactions; an NSDL or CDSL CAS supplies mutual fund holdings only.
An import replaces the user's holdings of the same issuer kind (CAMS and
KFintech, or NSDL and CDSL) in one locked transaction.

It returns `{source, cas_type, statement_from, statement_to, folios, schemes,
holdings, transactions, replaced, warnings}`. Errors: 400 with a plain reason
(not a PDF, the password did not open it, an MFCentral statement, a re-printed
or "Save as PDF" copy, not a CAS, no mutual fund schemes, or a malformed form),
413 over 4.5 MB, 429 over 10 a minute or 30 an hour per user, 500 if the
save fails, and 503 when the server was installed without the optional `cas`
extra, as the hosted backend is (see DEPLOYMENT.md, "Function size").

`GET /api/mf-holdings` (30 a minute per user, access token only) values every
held scheme at AMFI's latest NAV and returns:

- `holdings`, largest value first: `id`, `source`, `folio`, `amc`,
  `scheme_name`, `isin`, `amfi_code`, `scheme_type`, `units`, `nav`, `nav_date`,
  `nav_source` (`amfi` or `statement`), `current_value`, `cost`, `gain`,
  `gain_pct`, `xirr`, `xirr_since` and `xirr_note`.
- `summary`: `current_value`, `cost`, `gain`, `gain_pct`, `xirr`, `xirr_since`,
  `xirr_schemes`, `holdings`, `closed`, `cost_schemes` and `unpriced_schemes`.
- `nav`: `checked_at` (UTC), `newest_nav_date`, `stale` and `message`.
- `imports`: `source`, `cas_type`, `statement_from`, `statement_to`,
  `imported_at` and `schemes` for each stored statement.

`xirr` is the annualised percent on a 365-day year (Excel's convention). When a
holding has none, `xirr_note` says why: `no_transactions` (a summary or demat
CAS), `opening_balance` (the detailed CAS starts after the first purchase),
`no_nav` or `no_solution`. The read may first download AMFI's `NAVAll.txt` when
a held scheme's cached NAV was checked before the latest 10:30 IST (the file is
capped at 20 MB and parsed by header name). It never fails on an AMFI outage: it
falls back to the last saved NAVs or the statement's own NAV and sets `stale`
and `message`.

## Semantic Search

Smart search is opt-in. Nothing is embedded until the user calls
`POST /api/semantic-search/index`, and only each transaction's note, category,
subcategory and account text is sent to Amazon Titan Text Embeddings V2
(`amazon.titan-embed-text-v2:0`, 512 dimensions), never amounts or dates.
Funding follows the chat: App Bedrock mode uses the server's Bedrock
credentials, BYOK Bedrock the user's own key, and a BYOK OpenAI or Anthropic
user must choose App Bedrock or save a Bedrock key. Every Bedrock call is
reserved in the usage log and then settled under the provider `bedrock-embed`.
It counts toward the daily and monthly token budgets and the `/api/ai/usage`
rollups, but not the app-mode message cap; app-funded calls also have their own
daily token cap per user (`LEDGER_SYNC_EMBEDDING_DAILY_TOKEN_LIMIT`).

- `GET /api/semantic-search/status` reads only and never calls Bedrock. It
  returns `available`, `reason` (`server_not_configured`,
  `personal_key_missing` or `provider_not_bedrock`), `message`, `funding` (`app`
  or `personal`), `model`, `dimensions`, `region`, `total`, `indexed`, `pending`,
  `batch_size`, `daily_token_limit` and `tokens_today`.
- `POST /api/semantic-search/index` embeds up to `batch_size` rows that have no
  vector or whose text changed, newest first, and returns `{embedded, failed,
  total, indexed, pending, done, input_tokens, cost_usd, error}`. Call it until
  `done`. 30 a minute per user and 60 a minute per IP.
- `GET /api/semantic-search?q=` takes `q` (1 to 200 characters) and `limit` (1 to
  100, default 25) plus the same filters as `/api/transactions/search`
  (`query` is ignored). It returns `{query, results: [{transaction, score}],
  indexed, model}`, best first, where `transaction` is the regular transaction
  row and `score` is the cosine similarity from -1 to 1. Before the first index
  it returns empty results with `indexed` 0 and makes no Bedrock call. 60 a
  minute per user and 120 a minute per IP.
- `DELETE /api/semantic-search/index` removes every vector the user has and
  returns `{deleted}`.

The routes that call Bedrock answer 400 when the user's AI settings cannot reach
Bedrock, 429 when a token budget or the app-funded allowance is spent or Bedrock
throttles, 502 when Bedrock fails or rejects the call, and 503 when the server
has no Bedrock credentials.

## Push Alerts

Web Push alerts stay off until `LEDGER_SYNC_VAPID_PUBLIC_KEY`,
`LEDGER_SYNC_VAPID_PRIVATE_KEY` and `LEDGER_SYNC_VAPID_SUBJECT` are all set; the
daily run also needs `CRON_SECRET`. Until then each route says which variables
are missing instead of failing quietly, and nothing returns an endpoint URL, a
private key or a secret.

- `GET /api/push/config` returns `{enabled, daily_alerts, public_key, missing,
  reason}`: the VAPID public key the browser subscribes with and the names of the
  missing variables. `daily_alerts` is false until `CRON_SECRET` is set, while
  test alerts already work.
- `GET /api/push/subscriptions` returns `{devices, limit}` (limit 10), oldest
  first. A device has `id`, `label`, `endpoint_hash` (SHA-256 of the endpoint, so
  a browser can find its own row), `created_at` and `last_success_at`.
- `POST /api/push/subscriptions` takes `{endpoint, keys: {p256dh, auth}, label}`
  (`PushSubscription.toJSON()` plus a label of 1 to 60 characters) and returns
  201 with the device. 409 at 10 devices, 422 for an endpoint that is not an
  https FCM, Mozilla, Apple or Windows push service or keys that are not a P-256
  point and a 16-byte secret, 503 when push is off. 30 an hour per user. A device
  belongs to one user at a time: subscribing a browser that another user holds
  moves the row and clears its alert history.
- `DELETE /api/push/subscriptions/{device_id}` returns 204 (404 for an unknown
  device). `POST /api/push/subscriptions/unsubscribe` takes `{endpoint}` and
  returns 204 even for an unknown endpoint; sign-out calls it.
- `POST /api/push/test` takes `{device_id}` (omit it for every device) and
  returns `{sent, failed, removed}`, where `removed` counts devices a push
  service reported gone, which are deleted. 404 for an unknown device, 503 when
  push is off. 6 a minute per user.
- `GET` and `POST /api/push/run-due` run the daily alert pass for every user.
  Vercel's cron calls it with `GET` (`0 3 * * *` UTC in `backend/vercel.json`),
  and `POST` starts it by hand, both with `Authorization: Bearer <CRON_SECRET>`.
  It returns `{sent, failed, removed, users, devices, up_to_date, deferred}`;
  `deferred` counts messages left for the next run because the 8 second send
  budget was spent. 503 until `CRON_SECRET` and the VAPID variables are set, 401
  for a wrong secret. Each device is told about an item once per stage, so a
  repeated run sends nothing new.

Alerts are Declarative Web Push JSON: `{"web_push": 8030, "notification":
{title, body, navigate, tag, icon, lang, dir, silent, data, app_badge},
"app_badge"}`. The body carries counts and timing, never amounts or names;
`navigate` is an absolute URL under the frontend origin; `tag` is
`ledger-sync-<kind>`, and `data.kind` is `bills`, `budgets`, `anomalies` or
`test`. Requests carry `Topic: <kind>`, `Urgency: normal` and a TTL of one day
for alerts and five minutes for a test.

## MCP Server

`POST /mcp` (no `/api` prefix) is a read-only Model Context Protocol server over
Streamable HTTP, for Claude Code and other clients that can send a static
`Authorization` header. Connect with a `ledger:read` access token:

```bash
claude mcp add --transport http ledger-sync <API>/mcp --header "Authorization: Bearer <token>"
```

claude.ai web connectors are not supported because they need an OAuth
authorization server. Tool results go to the model in the user's own Claude
account. Tax, savings and net-worth figures are computation aids, not advice.

Transport:

- One JSON-RPC 2.0 message per POST and one JSON body back: no SSE stream, no
  sessions and no server-to-client requests. `GET` and `DELETE` return 405. A
  batch, a response object or an id that is not a string or integer returns
  -32600 (400); a body that is not JSON returns -32700 (400); a body over
  64 KiB returns 413.
- A browser `Origin` outside the CORS allowlist returns 403. The token must be a
  `ledger:read` access token, otherwise 401 with `WWW-Authenticate: Bearer`. The
  limits are 60 a minute and 1000 an hour per token plus 120 a minute per IP,
  counted before the token check (429).
- Protocol `2026-07-28` (current) offers `server/discover`, `tools/list` and
  `tools/call`. Every request carries `params._meta` with
  `io.modelcontextprotocol/protocolVersion` and
  `io.modelcontextprotocol/clientCapabilities`, the `MCP-Protocol-Version` and
  `Mcp-Method` headers and, on `tools/call`, `Mcp-Name` (the `=?base64?...?=`
  form is decoded). Errors: -32020 header mismatch (400), -32022 unsupported
  protocol version (400, with `data.supported` and `data.requested`), -32602 for
  a missing `_meta` field (400) and -32601 for an unknown method (404). Results
  carry `resultType: "complete"` and the server info in `_meta`; `server/discover`
  and `tools/list` add `ttlMs` (3,600,000) and `cacheScope: "private"`.
- Legacy `2025-11-25`, `2025-06-18` and `2025-03-26` offer `initialize` (it
  echoes a supported version, else `2025-11-25`), `ping`, `tools/list` and
  `tools/call`. A message without an `id` is a notification and gets 202 with
  no body. A request with no version header is treated as `2025-03-26`, and an
  unknown method is an in-band -32601.

`tools/list` returns the 16 read-only tools of `GET /api/ai/tools`, in
registration order, plus `get_today` (today's date in India and the month the
fiscal year starts), each with `name`, `description`, `inputSchema` and
`annotations` `{readOnlyHint: true, openWorldHint: false}`. `tools/call`
validates arguments with the same models as the in-app chat. An unknown tool or
non-object arguments return -32602; invalid arguments return an `isError` result
listing the field errors; a tool that cannot complete returns an `isError`
result saying so; any other failure returns an `isError` result with an error
id. Success returns one text content block holding the tool's JSON result. Every
call runs in a transaction that cannot write (`SET TRANSACTION READ ONLY` on
PostgreSQL, flush and commit refused, always rolled back) and is logged once
with a request id, never its arguments or result.

## Admin Stats

`GET /api/admin/stats` answers only an account whose stored email is listed in
`LEDGER_SYNC_ADMIN_EMAILS` (a JSON array, matched without case; sign-in stores a
provider-verified address and the column is unique). Everyone else gets 403 with
`Admin only`. It is the one route that reads across accounts on purpose, and it
returns counts and sums only (`core/admin_stats.py`), never a row, email,
account name, file name or amount of any user:

```json
{
  "as_of": "2026-10-28T05:30:00+00:00",
  "users": {"total": 2, "signed_in_7d": 1, "signed_in_30d": 2, "new_30d": 2},
  "ledger": {"transactions": 9000, "imports_30d": 3, "rows_imported_30d": 27000},
  "ai": {
    "today": {"calls": 2, "tokens": 300, "cost_usd": 0.012},
    "last_30d": {"calls": 3, "tokens": 450, "cost_usd": 0.015},
    "by_funding_30d": [{"funding_source": "app", "calls": 2, "cost_usd": 0.005}],
    "daily": [{"date": "2026-09-29", "calls": 0, "cost_usd": 0.0}]
  }
}
```

`signed_in_*` counts `last_login` (set at OAuth sign-in) and `new_30d` counts
`created_at`. `transactions` counts live rows; imports count `import_logs` in
the last 30 days. AI usage counts completed and reserved calls, as the quota
does, over UTC days: `daily` has 30 entries, oldest first and zero-filled, and
`cost_usd` is the estimate recorded with each call, in US dollars. An admin also
has no app-mode daily call limit.

## Rate Limiting

| Operation | Limit key | Limit |
| --- | --- | --- |
| OAuth initiation | IP | 20/minute |
| OAuth callbacks | IP | 20/minute |
| Token refresh | IP | 20/minute |
| Upload | Authenticated user | 10/minute |
| Upload | IP | 50/minute |
| Money Manager backup upload | User or `mmbak:upload` token | 10/minute and 60/hour |
| Money Manager backup upload | IP | 50/minute |
| Access token creation | Authenticated user | 10/hour |
| Bank alert ingest (`POST /api/ingest/text`) | Alert inbox token | 30/minute and 500/day |
| Bank alert ingest | IP | 60/minute |
| MCP (`POST /mcp`) | Access token | 60/minute and 1000/hour |
| MCP | IP | 120/minute |
| CAS upload | Authenticated user | 10/minute and 30/hour |
| Mutual fund holdings | Authenticated user | 30/minute |
| Category suggestions for unsaved rows (`POST`) | Authenticated user | 30/minute |
| Semantic search indexing | Authenticated user | 30/minute |
| Semantic search indexing | IP | 60/minute |
| Semantic search query | Authenticated user | 60/minute |
| Semantic search query | IP | 120/minute |
| RSU vest close, lot ledger, Schedule FA and FAST-DS | Authenticated user | 20/minute each |
| Push device registration | Authenticated user | 30/hour |
| Push test | Authenticated user | 6/minute |
| Bedrock chat | Authenticated user | 30/minute |
| Bedrock chat | IP | 60/minute |
| AI tool execution | Authenticated user | 120/minute |
| Analytics refresh | Authenticated user | 10/minute |
| Admin stats | Authenticated user | 30/minute |
| Exchange rates | Authenticated user | 60/minute |
| Stock price | Authenticated user | 60/minute |

One limiter checks both the account and IP bounds. Cross-instance per-minute
enforcement requires distributed SlowAPI storage; the default is process-local,
so the per-token limits are best effort on serverless. The MCP limits are
counted before the token check, so guessed tokens are throttled too. The bank
alert inbox also stores at most 500 new alerts per user in any 24 hours, a cap
counted in the database.
The app-provided Bedrock mode also has a configurable per-user daily call
limit. Each provider round counts, so a tool-assisted message can use multiple
calls. Database reservations serialize that daily quota and configured
Bedrock token budgets across workers.

## CORS, Caching, and Security Headers

- CORS uses an explicit origin allowlist plus the configured frontend origin.
  `POST /mcp` applies the same allowlist to a browser `Origin` header (403
  otherwise); a request with no `Origin` is not affected.
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
