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

- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`
- OpenAPI JSON: `http://localhost:8000/openapi.json`
- Health: `http://localhost:8000/health`
- Database health: `http://localhost:8000/health/db`

The application version is `2.22.0`.

## Authentication

Only these runtime endpoints are public:

- `GET /health`
- `GET /health/db`
- `GET /api/auth/oauth/providers`
- `POST /api/auth/oauth/google/callback`
- `POST /api/auth/oauth/github/callback`
- `POST /api/auth/refresh`

Financial and preference endpoints require:

```http
Authorization: Bearer <access-token>
```

Provider responses include a 10-minute HMAC-signed OAuth state token. Callback requests without a valid, unexpired state are rejected.

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
  "file_name": "statement.xlsx"
}
```

The upload endpoint normalizes and reconciles rows, then attempts a full analytics refresh. If that refresh fails after transaction persistence, the upload still succeeds and `POST /api/analytics/v2/refresh` can be retried.

## Router Groups

| Package area | Prefix |
| --- | --- |
| Authentication | `/api/auth` |
| OAuth | `/api/auth/oauth` |
| Transactions | `/api/transactions` |
| Upload | `/api/upload` |
| Analytics | `/api/analytics` |
| Analytics v2 | `/api/analytics/v2` |
| Calculations | `/api/calculations` |
| Preferences | `/api/preferences` |
| Account classifications | `/api/account-classifications` |
| Categorization rules | `/api/categorization-rules` |
| Saved views | `/api/saved-views` |
| Reports | `/api/reports` |
| AI | `/api/ai` |
| Exchange rates | `/api/exchange-rates` |
| Instrument rates | `/api/rates` |
| Stock prices | `/api/stock-price` |

## Errors and Limits

FastAPI validation errors use HTTP 422. Application errors use standard status codes and a JSON `detail` or structured `error` response.

Important limits:

- Upload: 10 requests per authenticated user per minute, 50 per IP per minute.
- Bedrock chat: 30 requests per authenticated user per minute, 60 per IP per minute.
- OAuth callbacks: 20 requests per IP per minute.
- Token refresh: 20 requests per IP per minute.

## Deployment

Production is Vercel serverless:

- `backend/vercel.json` routes requests.
- `backend/api/index.py` wraps the FastAPI app with Mangum.
- Neon PostgreSQL provides production storage.
- `.github/workflows/migrate.yml` applies Alembic migrations.

Do not use the old multipart examples or Gunicorn instructions that appeared in earlier versions of this file.
