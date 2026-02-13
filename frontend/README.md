# Ledger Sync Frontend

Modern financial analytics dashboard built with React 19, TypeScript 5.9, and Vite 7.

## Tech Stack

- **React 19** - UI framework
- **TypeScript 5.9** - Type safety
- **Vite 7** - Fast build tool and dev server
- **Tailwind CSS 4** - Utility-first styling
- **TanStack Query 5** - Server state management and caching
- **Zustand 5** - Lightweight global state management
- **Recharts 3** - Charting library for data visualization
- **Framer Motion 12** - Animations and micro-interactions
- **Sonner** - Toast notifications

## Project Structure

```
src/
├── pages/                    # Page components (20 pages)
│   ├── HomePage.tsx
│   ├── DashboardPage.tsx
│   ├── UploadSyncPage.tsx
│   ├── TransactionsPage.tsx
│   ├── SpendingAnalysisPage.tsx
│   ├── IncomeAnalysisPage.tsx
│   ├── ComparisonPage.tsx
│   ├── TrendsForecastsPage.tsx
│   ├── IncomeExpenseFlowPage/     # Sankey diagrams
│   ├── InvestmentAnalyticsPage.tsx
│   ├── MutualFundProjectionPage.tsx
│   ├── ReturnsAnalysisPage.tsx
│   ├── TaxPlanningPage.tsx
│   ├── NetWorthPage.tsx
│   ├── BudgetPage.tsx
│   ├── GoalsPage.tsx
│   ├── InsightsPage.tsx
│   ├── AnomalyReviewPage.tsx
│   ├── YearInReviewPage.tsx
│   └── SettingsPage.tsx
├── components/
│   ├── analytics/      # Analytics components (25+)
│   ├── layout/         # Layout components (Sidebar, AppLayout)
│   ├── shared/         # Shared components (EmptyState, TimeFilter, MetricCard)
│   ├── transactions/   # Transaction table components
│   ├── ui/             # Base UI components
│   └── upload/         # Upload components (DropZone)
├── hooks/              # Custom React hooks
│   ├── api/            # TanStack Query hooks
│   └── useDashboardMetrics.ts
├── services/api/       # API client modules
├── store/              # Zustand state stores
├── lib/                # Utilities (formatters, dateUtils, transactionUtils)
├── types/              # TypeScript type definitions
└── constants/          # Colors, animations, chart config
```

## Key Features

### Upload & Sync

- Hero section with gradient background and grid pattern
- Inline drag-and-drop upload zone
- Sample Excel format preview table
- Toast notifications for upload status

### Spending Analysis

- **50/30/20 Budget Rule** with configurable targets:
  - Needs (50% of income) - Essential expenses
  - Wants (30% of income) - Discretionary expenses
  - Savings (20% of income) - Income minus expenses
- Expense treemap, top merchants, subcategory deep-dive
- Year-over-year comparison, recurring transaction detection

### Investment Analytics

- **4 Investment Categories**: FD/Bonds, Mutual Funds, PPF/EPF, Stocks
- NET investment calculation (Inflows - Outflows)
- Asset allocation visualization
- Mutual fund SIP projection calculator

### Cash Flow (Sankey)

- Income sources → Expense categories
- Visual flow of money through accounts

### Additional Pages

- **Dashboard** - KPIs, sparklines, financial health score, quick insights
- **Income Analysis** - Income sources, growth tracking
- **Comparison** - Period-over-period financial comparison
- **Trends & Forecasts** - Trend lines, rolling averages, cash flow forecast
- **Tax Planning** - India FY-based tax insights and slab breakdown
- **Net Worth** - Assets, liabilities, and credit card health
- **Budget** - Budget tracking and monitoring
- **Goals** - Financial goal setting and progress
- **Insights** - Spending velocity, income stability, savings milestones
- **Anomaly Review** - Flag and review unusual transactions
- **Year in Review** - Annual financial summary

## Getting Started

```bash
# Install dependencies
pnpm install

# Start development server
pnpm run dev

# Type check
pnpm run type-check

# Lint
pnpm run lint

# Build for production
pnpm run build

# Run tests
pnpm run test
```

## Environment Variables

```env
VITE_API_URL=http://localhost:8000
```

## State Management

### TanStack Query (Server State)

- Automatic caching with 5min staleTime
- Background refetching
- Query invalidation on mutations

### Zustand (Client State)

- `preferencesStore` - User display preferences
- `accountStore` - Account mappings
- `investmentAccountStore` - Investment category mappings
- `budgetStore` - Budget settings

## Development

See the main [Development Guide](../docs/DEVELOPMENT.md) for comprehensive instructions.
