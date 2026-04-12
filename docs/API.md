# API Documentation

## Base URL

```
http://localhost:8000
```

## Authentication

OAuth-only authentication via Google and GitHub. The API issues JWT Bearer tokens after OAuth login.

### OAuth Flow

1. `GET /api/auth/oauth/providers` — Returns enabled OAuth providers (Google, GitHub) with authorize URLs
2. Frontend redirects user to provider's authorize URL
3. Provider redirects back to `{frontend_url}/auth/callback/{provider}?code=...`
4. Frontend sends code to `POST /api/auth/oauth/{provider}/callback`
5. Backend exchanges code for user info, creates/links user, returns JWT tokens

### OAuth Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/auth/oauth/providers` | No | List enabled OAuth providers |
| POST | `/api/auth/oauth/google/callback` | No | Exchange Google auth code for JWT |
| POST | `/api/auth/oauth/github/callback` | No | Exchange GitHub auth code for JWT |
| POST | `/api/auth/refresh` | No | Refresh access token |
| GET | `/api/auth/me` | Yes | Get current user profile |
| PUT | `/api/auth/me` | Yes | Update profile (name) |
| POST | `/api/auth/logout` | Yes | Logout (blacklist token) |
| DELETE | `/api/auth/account` | Yes | Delete account permanently |
| POST | `/api/auth/account/reset` | Yes | Reset account data (supports `mode` param) |

All other endpoints require `Authorization: Bearer <access_token>` header.

### Reset Account

**POST** `/api/auth/account/reset`

Reset account data while keeping the OAuth login. Supports two modes:

**Query Parameters:**

- `mode` (string, optional) - Reset scope (default: `full`)
  - `full` — Deletes all user data (transactions, analytics, preferences, budgets, goals, account classifications)
  - `transactions` — Deletes only transactions, import logs, and analytics. Preserves preferences, budgets, goals, and account classifications.

**Response (200 OK):**

```json
{
  "message": "Transactions and analytics cleared. Preferences preserved."
}
```

or (for `mode=full`):

```json
{
  "message": "Account reset to fresh state. All data cleared."
}
```

## Common Response Format

### Success Response

```json
{
  "success": true,
  "data": {
    /* endpoint-specific data */
  },
  "message": "Operation successful"
}
```

### Error Response

```json
{
  "success": false,
  "error": "Error description",
  "detail": "Detailed error message"
}
```

## Upload Endpoints

### Upload Transactions (JSON)

**POST** `/api/upload`

Upload pre-parsed transaction rows as structured JSON. Files are parsed client-side using SheetJS; the frontend computes a SHA-256 file hash, maps columns, validates rows, and sends the result here.

**Request Body (JSON):**

```json
{
  "file_name": "MoneyManager.xlsx",
  "file_hash": "a1b2c3d4e5f6...",
  "rows": [
    {
      "date": "2025-01-15",
      "amount": 5000.0,
      "type": "Expense",
      "category": "Groceries",
      "subcategory": "Supermarket",
      "account": "HDFC Savings",
      "note": "Weekly groceries"
    }
  ],
  "force": false
}
```

**Fields:**

- `file_name` (string, required) - Original file name
- `file_hash` (string, required) - SHA-256 hash of the file (for deduplication)
- `rows` (array, required) - Array of `TransactionRow` objects with `date`, `amount`, `type`, `category`, `subcategory`, `account`, `note`
- `force` (boolean, optional) - Force re-import if file hash already exists (default: false)

**Response (200 OK):**

```json
{
  "success": true,
  "message": "File uploaded and processed successfully",
  "stats": {
    "processed": 291,
    "inserted": 45,
    "updated": 12,
    "deleted": 3,
    "unchanged": 231
  },
  "file_name": "MoneyManager.xlsx"
}
```

**Error Responses:**

- 400: Invalid data or missing required fields
- 409: File already imported (use `force: true` to override)
- 500: Server error

**Example:**

```bash
curl -X POST http://localhost:8000/api/upload \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "file_name": "transactions.xlsx",
    "file_hash": "abc123...",
    "rows": [{"date": "2025-01-15", "amount": 5000, "type": "Expense", "category": "Food", "subcategory": "Dining", "account": "HDFC", "note": ""}],
    "force": false
  }'
```

---

## Transaction Endpoints

### Get All Transactions

**GET** `/api/transactions`

Retrieve all transactions from the database.

**Query Parameters:**

- `skip` (integer, optional) - Number of records to skip (default: 0)
- `limit` (integer, optional) - Number of records to return (default: 100)

**Response (200 OK):**

```json
{
  "data": [
    {
      "id": "abc123def456...",
      "date": "2025-01-15",
      "amount": 5000.0,
      "type": "Expense",
      "category": "Groceries",
      "subcategory": "Supermarket",
      "account": "Checking",
      "description": "Weekly groceries",
      "file_source": "MoneyManager.xlsx",
      "created_at": "2025-01-15T10:30:00Z",
      "updated_at": "2025-01-15T10:30:00Z"
    }
  ],
  "total": 1234,
  "skip": 0,
  "limit": 100
}
```

### Get All Transactions (No Pagination)

**GET** `/api/transactions/all`

Return every non-deleted transaction in a single JSON array. Designed for the frontend analytics layer which needs the full dataset for client-side aggregation.

**Query Parameters:**

- `start_date` (ISO date, optional) - Start date filter
- `end_date` (ISO date, optional) - End date filter

**Response (200 OK):**

```json
[
  {
    "id": "abc123def456...",
    "date": "2025-01-15",
    "amount": 5000.0,
    "type": "Expense",
    "category": "Groceries",
    "subcategory": "Supermarket",
    "account": "Checking",
    "description": "Weekly groceries",
    "file_source": "MoneyManager.xlsx"
  }
]
```

### Search Transactions

**GET** `/api/transactions/search`

Search and filter transactions with pagination, sorting, and full-text search across notes, category, and account fields.

**Query Parameters:**

- `query` (string, optional) - Search text in notes, category, account
- `category` (string, optional) - Filter by category
- `subcategory` (string, optional) - Filter by subcategory
- `account` (string, optional) - Filter by account
- `type` (string, optional) - Filter by type (`Income`, `Expense`, `Transfer`)
- `min_amount` (float, optional) - Minimum amount
- `max_amount` (float, optional) - Maximum amount
- `start_date` (ISO date, optional) - Start date filter
- `end_date` (ISO date, optional) - End date filter
- `limit` (integer, optional) - Max results to return (1-1000, default: 100)
- `offset` (integer, optional) - Number of results to skip (default: 0)
- `sort_by` (string, optional) - Sort field: `date`, `amount`, `category`, or `account` (default: `date`)
- `sort_order` (string, optional) - `asc` or `desc` (default: `desc`)

**Response (200 OK):**

```json
{
  "data": [
    {
      "id": "abc123def456...",
      "date": "2025-01-15",
      "amount": 5000.0,
      "type": "Expense",
      "category": "Groceries",
      "account": "Checking"
    }
  ],
  "total": 234,
  "limit": 100,
  "offset": 0,
  "has_more": true
}
```

### Export Transactions as CSV

**GET** `/api/transactions/export`

Export all non-deleted transactions as a CSV file download.

**Query Parameters:**

- `start_date` (ISO date, optional) - Start date filter
- `end_date` (ISO date, optional) - End date filter

**Response (200 OK):** CSV file with headers: `id`, `date`, `amount`, `currency`, `type`, `category`, `subcategory`, `account`, `from_account`, `to_account`, `note`, `source_file`, `last_seen_at`

---

## Meta Endpoints

Metadata endpoints for populating dropdowns and filter options. All require authentication.

### List Account Names

**GET** `/api/meta/accounts`

Return unique account names from all transactions (including transfer from/to accounts).

**Response (200 OK):**

```json
{
  "accounts": ["Checking", "HDFC Savings", "Grow Mutual Funds"]
}
```

### Get Filter Options

**GET** `/api/meta/filters`

Return combined filter metadata (transaction types + account names).

**Response (200 OK):**

```json
{
  "transaction_types": ["Expense", "Income", "Transfer"],
  "accounts": ["Checking", "HDFC Savings", "Grow Mutual Funds"]
}
```

### Get Category Buckets

**GET** `/api/meta/buckets`

Return dynamically classified category buckets (needs/wants/savings/investment) based on existing transaction data.

**Response (200 OK):**

```json
{
  "needs": ["Food", "Rent", "Utilities"],
  "wants": ["Entertainment", "Shopping"],
  "savings": ["Emergency Fund"],
  "investment_categories": ["Mutual Funds", "Stocks"],
  "investment_accounts": ["Grow Mutual Funds", "Zerodha Stocks"]
}
```

---

## Analytics Endpoints

### Get Financial Overview

**GET** `/api/analytics/overview`

Get high-level financial metrics.

**Query Parameters:**

- `time_range` (string, optional) - Filter by time range
  - `all_time` (default)
  - `last_month`
  - `last_3_months`
  - `last_6_months`
  - `last_year`

**Response (200 OK):**

```json
{
  "total_income": 450000.0,
  "total_expenses": 285000.0,
  "net_change": 165000.0,
  "best_month": {
    "month": "December",
    "net": 45000.0
  },
  "worst_month": {
    "month": "October",
    "net": 8000.0
  },
  "account_distribution": {
    "Savings": 250000.0,
    "Checking": 150000.0,
    "Credit Card": -50000.0
  }
}
```

### Get KPIs

**GET** `/api/analytics/kpis`

Get key performance indicators.

**Query Parameters:**

- `time_range` (string, optional) - Time range filter

**Response (200 OK):**

```json
{
  "total_income": 450000.0,
  "total_expenses": 285000.0,
  "net_savings": 165000.0,
  "savings_rate": 0.3667,
  "transaction_count": 1234,
  "average_transaction": 365.57,
  "expense_count": 945,
  "income_count": 289,
  "top_category": {
    "category": "Rent",
    "amount": 120000.0,
    "percentage": 0.42
  },
  "top_income_source": {
    "category": "Salary",
    "amount": 400000.0,
    "percentage": 0.89
  }
}
```

### Get Spending Behavior

**GET** `/api/analytics/behavior`

Get behavioral insights about spending patterns.

**Query Parameters:**

- `time_range` (string, optional) - Time range filter

**Response (200 OK):**

```json
{
  "average_monthly_spending": 23750.0,
  "spending_velocity": 2847.25,
  "expense_concentration": 0.42,
  "top_categories": [
    {
      "category": "Rent",
      "amount": 120000.0,
      "percentage": 0.42,
      "trend": "stable"
    },
    {
      "category": "Food",
      "amount": 45000.0,
      "percentage": 0.16,
      "trend": "increasing"
    }
  ],
  "lifestyle_changes": [
    "Increased dining out spending",
    "More frequent entertainment expenses"
  ]
}
```

### Get Financial Trends

**GET** `/api/analytics/trends`

Get spending and income trends over time.

**Query Parameters:**

- `time_range` (string, optional) - Time range filter

**Response (200 OK):**

```json
{
  "monthly_trends": [
    {
      "month": "January",
      "income": 37500.0,
      "expenses": 23750.0,
      "net": 13750.0,
      "trend": "up"
    }
  ],
  "consistency_score": 0.85,
  "surplus_trend": "increasing",
  "average_monthly_surplus": 13750.0,
  "forecast_next_month": 14200.0
}
```

### Get Yearly Wrapped

**GET** `/api/analytics/wrapped`

Get text-based insights and narratives about financial year.

**Query Parameters:**

- `time_range` (string, optional) - Time range filter

**Response (200 OK):**

```json
{
  "summary": "You had a financially strong year with consistent savings.",
  "income_narrative": "You earned ₹450,000 from 289 income transactions...",
  "expense_narrative": "Your expenses totaled ₹285,000...",
  "highlights": [
    "Highest spending month was October",
    "Food expenses increased 15% YoY",
    "Maintained 37% savings rate"
  ],
  "recommendations": [
    "Consider reducing discretionary spending",
    "Track subscription costs more carefully"
  ]
}
```

---

## Calculation Endpoints

### Get Totals

**GET** `/api/calculations/totals`

Calculate total income, expenses, and net savings.

**Query Parameters:**

- `start_date` (ISO date, optional) - Start date filter
- `end_date` (ISO date, optional) - End date filter

**Response (200 OK):**

```json
{
  "total_income": 450000.0,
  "total_expenses": 285000.0,
  "net_savings": 165000.0,
  "income_transactions": 289,
  "expense_transactions": 945
}
```

### Get Monthly Aggregation

**GET** `/api/calculations/monthly-aggregation`

Get monthly income and expense data.

**Query Parameters:**

- `start_date` (ISO date, optional)
- `end_date` (ISO date, optional)

**Response (200 OK):**

```json
{
  "months": [
    {
      "month": "2025-01",
      "income": 37500.0,
      "expenses": 23750.0,
      "net": 13750.0,
      "transactions": 45
    }
  ]
}
```

### Get Category Breakdown

**GET** `/api/calculations/category-breakdown`

Get spending by category.

**Query Parameters:**

- `start_date` (ISO date, optional)
- `end_date` (ISO date, optional)
- `transaction_type` (string, optional) - "Income" or "Expense"

**Response (200 OK):**

```json
{
  "categories": [
    {
      "category": "Rent",
      "amount": 120000.0,
      "percentage": 0.42,
      "transaction_count": 12
    },
    {
      "category": "Food",
      "amount": 45000.0,
      "percentage": 0.16,
      "transaction_count": 234
    }
  ],
  "total": 285000.0
}
```

### Get Account Balances

**GET** `/api/calculations/account-balances`

Get current balance for each account.

**Query Parameters:**

- `start_date` (ISO date, optional)
- `end_date` (ISO date, optional)

**Response (200 OK):**

```json
{
  "accounts": [
    {
      "name": "Savings",
      "balance": 250000.0
    },
    {
      "name": "Checking",
      "balance": 150000.0
    }
  ],
  "total_balance": 400000.0
}
```

### Get Financial Insights

**GET** `/api/calculations/insights`

Get comprehensive financial insights.

**Query Parameters:**

- `start_date` (ISO date, optional)
- `end_date` (ISO date, optional)

**Response (200 OK):**

```json
{
  "average_daily_income": 1232.88,
  "average_daily_expense": 780.82,
  "average_monthly_expense": 23750.0,
  "savings_rate": 0.3667,
  "largest_transaction": {
    "amount": 120000.0,
    "category": "Rent",
    "date": "2025-01-01"
  },
  "unusual_spending": [
    {
      "amount": 95000.0,
      "category": "Travel",
      "date": "2025-06-15",
      "reason": "2x normal spending"
    }
  ]
}
```

### Get Top Categories

**GET** `/api/calculations/top-categories`

Get top spending categories.

**Query Parameters:**

- `start_date` (ISO date, optional)
- `end_date` (ISO date, optional)
- `limit` (integer, optional) - Number of categories (default: 10)
- `transaction_type` (string, optional) - "Income" or "Expense"

**Response (200 OK):**

```json
[
  {
    "category": "Rent",
    "amount": 120000.0,
    "percentage": 0.42,
    "count": 12
  },
  {
    "category": "Food",
    "amount": 45000.0,
    "percentage": 0.16,
    "count": 234
  }
]
```

---

## Account Classification Endpoints

### Get All Account Classifications

**GET** `/api/account-classifications`

Get all account classifications set by user.

**Response (200 OK):**

```json
{
  "classifications": [
    {
      "account_name": "Grow Mutual Funds",
      "account_type": "investment"
    },
    {
      "account_name": "HDFC Savings",
      "account_type": "savings"
    }
  ]
}
```

### Get Account Classification

**GET** `/api/account-classifications/{account_name}`

Get classification for a specific account.

**Response (200 OK):**

```json
{
  "account_name": "Grow Mutual Funds",
  "account_type": "investment"
}
```

### Set Account Classification

**POST** `/api/account-classifications`

Set or update account classification.

**Request Body:**

```json
{
  "account_name": "Grow Mutual Funds",
  "account_type": "investment"
}
```

**Response (200 OK):**

```json
{
  "success": true,
  "message": "Account classification saved"
}
```

### Delete Account Classification

**DELETE** `/api/account-classifications/{account_name}`

Remove account classification.

**Response (200 OK):**

```json
{
  "success": true,
  "message": "Account classification removed"
}
```

### Get Accounts by Type

**GET** `/api/account-classifications/type/{account_type}`

Get all accounts of a specific type.

**Parameters:**

- `account_type` - One of: `investment`, `savings`, `checking`, `credit`, `loan`

**Response (200 OK):**

```json
{
  "accounts": ["Grow Mutual Funds", "Zerodha Stocks", "PPF Account"]
}
```

---

## Analytics V2 Endpoints

Pre-aggregated analytics data. All require authentication.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/analytics/v2/daily-summaries` | Daily income/expense/net aggregations |
| GET | `/api/analytics/v2/investment-holdings` | Investment portfolio holdings |
| GET | `/api/analytics/v2/monthly-summaries` | Monthly income/expense/savings |
| GET | `/api/analytics/v2/category-trends` | Category-level trends over time |
| GET | `/api/analytics/v2/transfer-flows` | Account-to-account transfer flows |
| GET | `/api/analytics/v2/recurring-transactions` | Detected recurring patterns |
| GET | `/api/analytics/v2/merchant-intelligence` | Merchant spending insights |
| GET | `/api/analytics/v2/net-worth` | Net worth snapshots over time |
| GET | `/api/analytics/v2/fy-summaries` | Fiscal year summaries |
| GET | `/api/analytics/v2/anomalies` | Detected spending anomalies |
| GET | `/api/analytics/v2/budgets` | Budget tracking data |
| GET | `/api/analytics/v2/goals` | Financial goals and progress |
| POST | `/api/analytics/v2/budgets` | Create a new budget |
| POST | `/api/analytics/v2/goals` | Create a new financial goal |
| POST | `/api/analytics/v2/anomalies/{id}/review` | Mark anomaly as reviewed |

---

## Preferences Endpoints

User preference management. All require authentication.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/preferences` | Get all preferences |
| PUT | `/api/preferences` | Update preferences (partial) |
| POST | `/api/preferences/reset` | Reset to defaults |
| PUT | `/api/preferences/fiscal-year` | Update fiscal year |
| PUT | `/api/preferences/essential-categories` | Update essential categories |
| PUT | `/api/preferences/investment-mappings` | Update investment mappings |
| PUT | `/api/preferences/income-sources` | Update income classification |
| PUT | `/api/preferences/budget-defaults` | Update budget defaults |
| PUT | `/api/preferences/display` | Update display preferences |
| PUT | `/api/preferences/anomaly-settings` | Update anomaly settings |
| PUT | `/api/preferences/recurring-settings` | Update recurring settings |
| PUT | `/api/preferences/spending-rule` | Update 50/30/20 targets |
| PUT | `/api/preferences/credit-card-limits` | Update credit card limits |
| PUT | `/api/preferences/earning-start-date` | Update earning start date |
| PUT | `/api/preferences/salary-structure` | Update salary CTC structure per FY |
| PUT | `/api/preferences/rsu-grants` | Update RSU grant list with vesting schedules |
| PUT | `/api/preferences/growth-assumptions` | Update growth assumptions (hike %, variable growth, stock appreciation, projection years) |

Preferences include 20 sections: fiscal year, essential categories, investment mappings, income classification, budget defaults, display format, anomaly settings, recurring settings, spending rule targets, credit card limits, earning start date, fixed expense categories, savings/investment targets, payday, tax regime, excluded accounts, notification preferences, salary structure, RSU grants, and growth assumptions.

### Update Salary Structure

**PUT** `/api/preferences/salary-structure`

Update the salary CTC structure per fiscal year. Each FY key maps to a salary components object.

**Request Body:**

```json
{
  "salary_structure": {
    "2025-26": {
      "basic_annual": 600000,
      "hra_annual": 300000,
      "special_allowance_annual": 200000,
      "epf_monthly": 1800,
      "nps_monthly": null,
      "professional_tax_annual": 2400,
      "variable_pay_annual": 100000,
      "other_annual": 0,
      "is_new_regime": true
    }
  }
}
```

### Update RSU Grants

**PUT** `/api/preferences/rsu-grants`

Update the list of RSU grants with vesting schedules.

**Request Body:**

```json
{
  "rsu_grants": [
    {
      "id": "grant-1",
      "company": "ACME Corp",
      "grant_date": "2025-01-15",
      "total_shares": 100,
      "stock_price": 1500,
      "vesting_schedule": [
        { "date": "2026-01-15", "quantity": 25 },
        { "date": "2027-01-15", "quantity": 25 },
        { "date": "2028-01-15", "quantity": 25 },
        { "date": "2029-01-15", "quantity": 25 }
      ]
    }
  ]
}
```

### Update Growth Assumptions

**PUT** `/api/preferences/growth-assumptions`

Update the assumptions used for multi-year tax projections.

**Request Body:**

```json
{
  "growth_assumptions": {
    "salary_hike_pct": 10,
    "variable_growth_pct": 5,
    "stock_appreciation_pct": 8,
    "projection_years": 3,
    "include_rsu_in_projection": true
  }
}
```

---

## Chart Data Endpoints

### Income/Expense Chart

**GET** `/api/analytics/charts/income-expense`

Get monthly income vs expense data for charts.

**Response (200 OK):**

```json
{
  "data": [
    {
      "month": "Jan 2025",
      "income": 150000,
      "expense": 85000
    }
  ]
}
```

### Category Chart

**GET** `/api/analytics/charts/categories`

Get category breakdown for pie/donut charts.

**Response (200 OK):**

```json
{
  "data": [
    {
      "category": "Food",
      "amount": 25000,
      "percentage": 0.15
    }
  ]
}
```

### Monthly Trends Chart

**GET** `/api/analytics/charts/monthly-trends`

Get monthly trend data for line charts.

**Response (200 OK):**

```json
{
  "data": [
    {
      "month": "2025-01",
      "income": 150000,
      "expense": 85000,
      "savings": 65000
    }
  ]
}
```

### Account Distribution Chart

**GET** `/api/analytics/charts/account-distribution`

Get account balance distribution.

**Response (200 OK):**

```json
{
  "data": [
    {
      "account": "HDFC Savings",
      "balance": 250000,
      "percentage": 0.45
    }
  ]
}
```

---

## Generated Insights

### Get AI-Generated Insights

**GET** `/api/analytics/insights/generated`

Get AI-generated financial insights and recommendations.

**Response (200 OK):**

```json
{
  "insights": [
    {
      "type": "spending",
      "message": "Your food expenses increased 20% this month",
      "severity": "warning"
    },
    {
      "type": "savings",
      "message": "Great job! You saved 35% of your income",
      "severity": "success"
    }
  ]
}
```

---

## Exchange Rate Endpoints

### Get Exchange Rates

**GET** `/api/exchange-rates`

Fetch live exchange rates from the European Central Bank (via frankfurter.dev) with 24-hour in-memory cache.

**Query Parameters:**

- `base` (string, optional) - Base currency (default: `INR`)

**Response (200 OK):**

```json
{
  "base": "INR",
  "rates": {
    "USD": 0.01179,
    "EUR": 0.01087,
    "GBP": 0.00935
  },
  "updated_at": "2026-04-11T10:30:00Z"
}
```

**Fallback behavior:** Fresh cache -> stale cache -> hardcoded fallback rates. Returns 502 only if all three tiers fail.

---

## Stock Price Endpoints

### Get Stock Price

**GET** `/api/stock-price/{symbol}`

Fetch the latest regular-market price for a stock ticker via Yahoo Finance. Proxied through the backend to avoid CORS restrictions.

**Path Parameters:**

- `symbol` (string, required) - Stock ticker symbol (e.g. `AMZN`, `AAPL`, `GOOGL`). Max 10 characters.

**Response (200 OK):**

```json
{
  "symbol": "AMZN",
  "price": 186.49,
  "currency": "USD"
}
```

**Error Responses:**

- 400: Invalid symbol (empty or exceeds 10 chars)
- 502: Could not fetch price from Yahoo Finance

---

## Error Codes

| Code | Meaning      | Action                                 |
| ---- | ------------ | -------------------------------------- |
| 200  | OK           | Success                                |
| 400  | Bad Request  | Check parameters                       |
| 404  | Not Found    | Resource doesn't exist                 |
| 409  | Conflict     | File already imported (use force=true) |
| 500  | Server Error | Contact support                        |

---

## Rate Limiting

Rate limiting is implemented using **slowapi** (based on limits). Endpoints are rate-limited per user/IP to prevent abuse.

---

## CORS

CORS is enabled for cross-origin requests. Allowed origins are configurable via the `LEDGER_SYNC_CORS_ORIGINS` environment variable (JSON array).

Default origins (development):

- http://localhost:5173
- http://localhost:5174

Production origins are set via the `LEDGER_SYNC_CORS_ORIGINS` environment variable on Vercel.

---

## Interactive Documentation

Access interactive API documentation at:

- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc
