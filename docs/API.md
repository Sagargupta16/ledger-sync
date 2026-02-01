# API Documentation

## Base URL

```
http://localhost:8000
```

## Authentication

Currently, the API does not require authentication. All endpoints are public.

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

### Upload Excel File

**POST** `/api/upload`

Upload an Excel file for transaction import and reconciliation.

**Parameters:**

- `file` (multipart/form-data, required) - Excel file (.xlsx or .xls)
- `force` (query param, optional) - Force re-import if file already exists

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

- 400: Invalid file format
- 409: File already imported (use force=true to override)
- 500: Server error

**Example:**

```bash
curl -X POST http://localhost:8000/api/upload \
  -F "file=@transactions.xlsx"
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

Currently no rate limiting is implemented. For production use, add rate limiting via middleware.

---

## CORS

CORS is enabled for cross-origin requests from frontend during development.

Allowed Origins (configurable):

- http://localhost:3000
- http://localhost:5173

---

## Interactive Documentation

Access interactive API documentation at:

- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc
