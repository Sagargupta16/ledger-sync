# Ledger Sync API Package

FastAPI routers for Ledger Sync. The generated OpenAPI document is the schema source of truth; [docs/API.md](../../../../docs/API.md) provides the maintained human-readable inventory.

## Start the API

From `backend/`:

```bash
uv sync --group dev
uv run alembic upgrade head
uv run uvicorn ledger_sync.api.main:app --reload --port 8000
```

Open:

- Swagger UI: `http://localhost:8000/docs` (development only)
- ReDoc: `http://localhost:8000/redoc` (development only)
- OpenAPI JSON: `http://localhost:8000/openapi.json` (development only)
- Health: `http://localhost:8000/health`
- Database health: `http://localhost:8000/health/db`

The application version is `2.32.0`.

## Authentication

Only these runtime endpoints are public:

- `GET /health`
- `GET /health/db`
- `GET /api/auth/oauth/providers`
- `GET /api/auth/oauth/v2/{provider}/restart`
- `POST /api/auth/oauth/{provider}/authorize`
- `POST /api/auth/oauth/google/callback`
- `POST /api/auth/oauth/github/callback`
- `POST /api/auth/refresh`

Financial and preference endpoints require:

```http
Authorization: Bearer <access-token>
```

Four paths accept another credential. Three take an `lsu_` access token that holds one scope (created in Settings > Advanced > Access Tokens): `POST /api/upload/money-manager` (`mmbak:upload`, which also accepts a signed-in access token), `POST /mcp` (`ledger:read`) and `POST /api/ingest/text` (`alerts:ingest`). `GET` and `POST /api/push/run-due`, the daily Vercel cron, take `Authorization: Bearer <CRON_SECRET>`. A token reaches only the route that requires its scope; `require_token_scope(scope)` in `api/deps.py` enforces it.

`POST /api/auth/oauth/{provider}/authorize` returns a 10-minute HMAC-signed, one-use OAuth state bound to the provider and the browser's S256 PKCE challenge. Callback requests without a valid, unexpired, unconsumed state or the matching verifier are rejected.

Logout calls `POST /api/auth/logout`, increments the user's `token_version`, and invalidates outstanding access and refresh tokens.

## JSON Upload

`POST /api/upload` accepts parsed transaction rows, not multipart files.

```bash
curl -X POST http://localhost:8000/api/upload \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "file_name": "statement.xlsx",
    "file_hash": "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    "force": false,
    "rows": [
      {
        "date": "2026-07-01",
        "amount": 85000,
        "currency": "INR",
        "type": "Income",
        "account": "HDFC Bank",
        "category": "Salary",
        "subcategory": "Monthly",
        "note": "July salary"
      }
    ]
  }'
```

Request rules:

- `file_name` must be non-empty.
- `file_hash` must contain exactly 64 characters.
- `rows` must contain 1 to 100,000 items.
- Each row requires date, amount, type, account, and category.
- `force` defaults to `false`.

Success response:

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

The upload endpoint normalizes and reconciles rows, then runs a versioned analytics refresh in a separate transaction. If that refresh fails after transaction persistence, the upload still succeeds with `analytics_status: "failed"` and `POST /api/analytics/v2/refresh` can be retried.

## Router Groups

| Package area | Prefix |
| --- | --- |
| Authentication | `/api/auth` |
| OAuth | `/api/auth/oauth` |
| Transactions | `/api/transactions` |
| Upload (spreadsheet, Money Manager backup, history) | `/api/upload` |
| CAS import and mutual fund holdings | `/api/upload/cas`, `/api/mf-holdings` |
| Access tokens | `/api/upload-tokens` |
| Analytics | `/api/analytics` |
| Analytics v2 (budgets and recurring edits included) | `/api/analytics/v2` |
| Calculations | `/api/calculations` |
| Dashboard metrics | `/api/dashboard-metrics` |
| Weekly recap | `/api/weekly-recap` |
| Safe to spend | `/api/safe-to-spend` |
| Card cycles | `/api/card-cycles` |
| Preferences | `/api/preferences` |
| Account classifications | `/api/account-classifications` |
| Categorization rules | `/api/categorization-rules` |
| Saved views (watchlist tiles and pins included) | `/api/saved-views` |
| Review queue | `/api/review-queue` |
| Category suggestions | `/api/category-suggestions` |
| Balance checks | `/api/balance-checks` |
| Bank alerts | `/api/bank-alerts`, `/api/ingest` |
| Tax deductions | `/api/tax-deductions` |
| AIS totals | `/api/tax-ais` |
| RSU tax records | `/api/rsu-tax` |
| Semantic search | `/api/semantic-search` |
| Push alerts | `/api/push` |
| MCP server (no `/api` prefix) | `/mcp` |
| AI | `/api/ai` |
| Exchange rates | `/api/exchange-rates` |
| Instrument rates | `/api/rates` |
| Stock prices | `/api/stock-price` |

## Errors and Limits

FastAPI validation errors use HTTP 422. Application errors use standard status codes and a JSON `detail` or structured `error` response.

Important limits:

- Upload: 10 requests per authenticated user per minute, 50 per IP per minute.
- Bedrock chat: 30 requests per authenticated user per minute, 60 per IP per minute.
- AI tool execution: 120 requests per authenticated user per minute.
- Analytics refresh (`POST /api/analytics/v2/refresh`): 10 requests per authenticated user per minute.
- Exchange rates: 60 requests per authenticated user per minute.
- Stock prices: 60 requests per authenticated user per minute.
- OAuth authorize and callbacks: 20 requests per IP per minute each.
- Token refresh: 20 requests per IP per minute.
- MCP (`POST /mcp`): 60 per minute and 1,000 per hour per token plus 120 per minute per IP, counted before the token check; bodies over 64 KiB get 413.
- Bank alert ingest (`POST /api/ingest/text`): 30 per minute and 500 per day per token, 60 per minute per IP, and at most 500 new alerts per user in any 24 hours (counted in the database).
- CAS upload: 10 per minute and 30 per hour per authenticated user, body up to 4.5 MB; mutual fund holdings: 30 per minute.
- Category suggestions for unsaved rows: 30 requests per authenticated user per minute.
- Semantic search: indexing 30 per user and 60 per IP per minute; search 60 per user and 120 per IP per minute.
- RSU vest close, lot ledger, Schedule FA and FAST-DS: 20 requests per authenticated user per minute each.
- Push: device registration 30 per hour and test alerts 6 per minute per authenticated user.

## Deployment

Production is Vercel serverless:

- `backend/vercel.json` routes requests.
- `backend/api/index.py` exposes the FastAPI ASGI app to Vercel's Python runtime.
- Neon PostgreSQL provides production storage.
- `.github/workflows/migrate.yml` applies Alembic migrations.

Do not use the old multipart examples or Gunicorn instructions that appeared in earlier versions of this file.
