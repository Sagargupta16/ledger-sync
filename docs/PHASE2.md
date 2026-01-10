# Phase 2: Financial Insights Dashboard

**Insight-first analytics frontend built on top of Ledger Sync's transaction data**

## Overview

Phase 2 adds a comprehensive insights dashboard that reads your existing transaction data and provides meaningful financial narratives, behavioral analysis, and trend visualization—all without CRUD operations or budgeting features.

## Features

### 📊 Overview Dashboard

- **Total Income & Real Spend**: Clear view of earnings vs. expenses
- **Net Change**: Your financial surplus or deficit
- **Asset Allocation**: Current balance across all accounts
- **Best & Worst Months**: Identify your financial peaks and valleys

### 🧠 Behavior Analysis

- **Average Transaction Size**: How much you typically spend
- **Spending Frequency**: Transactions per month
- **Convenience Spending**: Percentage spent on discretionary categories
- **Lifestyle Inflation**: How your spending has changed over time
- **Top Categories**: Where your money actually goes

### 📈 Trends & Consistency

- **Monthly Trends**: Income vs. Expenses over time
- **Surplus Trend**: Track your savings patterns
- **Consistency Score**: How predictable your expenses are (0-100)

### ✨ Yearly Wrapped

- **Text-Based Insights**: Human-readable stories about your money
- **Key Highlights**: Biggest expense, most frequent category, best month
- **Savings Rate**: Percentage of income saved
- **Daily Average**: Your average daily spending

## Tech Stack

**Backend Additions:**

- New analytics router with 4 endpoints
- Read-only data aggregation queries
- Monthly grouping and trend calculations

**Frontend:**

- Next.js 15 with App Router
- React 19 with TypeScript (strict mode)
- Tailwind CSS for styling
- shadcn/ui components
- Axios for API calls

## API Endpoints

All endpoints are under `/api/analytics/`:

### GET /api/analytics/overview

Returns total income, expenses, net change, best/worst month, and asset allocation.

**Response:**

```json
{
  "total_income": 500000,
  "total_expenses": 350000,
  "net_change": 150000,
  "best_month": {
    "month": "2024-03",
    "income": 55000,
    "expenses": 25000,
    "surplus": 30000
  },
  "worst_month": { ... },
  "asset_allocation": [
    {"account": "Savings", "balance": 100000},
    ...
  ],
  "transaction_count": 1234
}
```

### GET /api/analytics/behavior

Returns spending patterns and behavioral metrics.

**Response:**

```json
{
  "avg_transaction_size": 2500,
  "spending_frequency": 45.5,
  "convenience_spending_pct": 35.2,
  "lifestyle_inflation": 12.5,
  "top_categories": [
    {"category": "Food", "amount": 45000},
    ...
  ]
}
```

### GET /api/analytics/trends

Returns monthly trends and consistency score.

**Response:**

```json
{
  "monthly_trends": [
    {
      "month": "2024-01",
      "income": 50000,
      "expenses": 35000,
      "surplus": 15000
    },
    ...
  ],
  "surplus_trend": [...],
  "consistency_score": 75.5
}
```

### GET /api/analytics/wrapped

Returns text-based insights and narratives.

**Response:**

```json
{
  "insights": [
    {
      "title": "Total Spending",
      "value": "₹350,000",
      "description": "You spent ₹350,000 across 450 transactions"
    },
    ...
  ]
}
```

## Metrics Explained

### Convenience Spending

Represents spending on shopping, entertainment, dining, and other discretionary categories. High percentages aren't necessarily bad—they reflect lifestyle priorities.

### Lifestyle Inflation

Compares average spending in your first 3 months vs. last 3 months. Positive values indicate increased spending; negative values show decreased spending.

### Consistency Score

Measures expense predictability using coefficient of variation:

- **80-100**: Excellent - Very stable spending
- **60-79**: Good - Fairly predictable
- **40-59**: Moderate - Some variation
- **20-39**: Variable - Significant fluctuations
- **0-19**: Inconsistent - Highly unpredictable

Lower variation = higher score.

### Surplus Trend

Monthly income minus expenses. Positive values = saving, negative = deficit.

## Routes

- `/insights` - Overview dashboard
- `/insights/behavior` - Spending behavior analysis
- `/insights/trends` - Financial trends over time
- `/insights/wrapped` - Yearly wrapped (text insights)

## Component Structure

```
frontend/
├── app/
│   ├── insights/
│   │   ├── page.tsx          # Overview
│   │   ├── behavior/
│   │   │   └── page.tsx      # Behavior analysis
│   │   ├── trends/
│   │   │   └── page.tsx      # Trends & consistency
│   │   └── wrapped/
│   │       └── page.tsx      # Yearly wrapped
├── components/
│   └── insights/
│       ├── InsightsNav.tsx   # Tab navigation
│       └── StatCard.tsx      # Stat display card
└── lib/
    ├── api.ts               # API client functions
    └── insights.ts          # Type definitions & helpers
```

## Helper Functions

Located in `frontend/lib/insights.ts`:

- `formatCurrency(amount)` - Format numbers as INR
- `formatMonth(monthStr)` - Convert "YYYY-MM" to readable format
- `getSurplusColor(amount)` - Get color class for positive/negative values
- `getConsistencyRating(score)` - Convert score to text rating
- `getLifestyleInflationText(pct)` - Interpret inflation percentage
- `shortenNumber(num)` - Display large numbers as K/L/Cr

## Usage

### Start the Application

```bash
# From project root
npm run dev
```

This starts both backend (8000) and frontend (3000).

### Navigate to Insights

1. Visit http://localhost:3000
2. Click "View Financial Insights" button
3. Explore the 4 insight screens using the tabs

### Requirements

- Must have transaction data in the database
- Use Phase 1's upload feature to import Excel files first
- At least 6 months of data recommended for best insights

## Design Philosophy

### Insight-First

Every number is accompanied by an explanation. Users shouldn't need to interpret raw data—the app tells the story.

### Calm UI

- Minimal animations
- Soft glassmorphism effects
- Dark theme with subtle gradients
- Plenty of whitespace
- Clear typography hierarchy

### No Clutter

- No transaction tables by default
- No manual data entry
- No budgeting features
- Focus on understanding, not management

## Development

### Adding New Metrics

1. **Backend**: Add calculation logic to appropriate endpoint in `backend/src/ledger_sync/api/analytics.py`
2. **Types**: Update TypeScript interfaces in `frontend/lib/insights.ts`
3. **Display**: Add to relevant page component
4. **Helper**: Create formatter/interpreter if needed

### Testing the API

Visit http://localhost:8000/docs for interactive API documentation.

Example:

```bash
curl http://localhost:8000/api/analytics/overview
```

## Troubleshooting

### "No data available"

- Ensure you've uploaded transaction data using Phase 1's upload feature
- Check that transactions exist: `sqlite3 backend/ledger_sync.db "SELECT COUNT(*) FROM transactions WHERE is_deleted=0"`

### CORS Errors

- Backend already configured for localhost:3000
- If using different ports, update `backend/src/ledger_sync/api/main.py`

### Type Errors

- Run `npm run lint` in frontend directory
- Ensure all TypeScript interfaces match API response structure

## Future Enhancements

Possible additions (not implemented):

- Seasonal spending analysis
- Category-level deep dives
- Expense forecasting
- Comparison with previous years
- Export insights as PDF
- Recharts for visual trends (currently minimal charts)

## Credits

Built with:

- FastAPI for high-performance backend
- Next.js 15 for modern React framework
- shadcn/ui for beautiful components
- Tailwind CSS for styling
- Lucide icons for clean visuals

---

**Phase 2 focuses on insights, not actions. It's about understanding your financial story, not changing it.**
