# Ledger Sync Frontend

Modern financial analytics dashboard built with React 19, TypeScript, and Vite.

## Tech Stack

- **React 19** - UI framework with latest features
- **TypeScript** - Type safety
- **Vite** - Fast build tool and dev server
- **TanStack Query** - Server state management and caching
- **Zustand** - Lightweight global state management
- **Recharts** - Charting library for data visualization
- **Tailwind CSS** - Utility-first styling

## Project Structure

```
src/
├── pages/              # 13 page components
│   ├── DashboardPage.tsx
│   ├── TransactionsPage.tsx
│   ├── SpendingAnalysisPage.tsx
│   ├── IncomeAnalysisPage.tsx
│   └── ... (9 more pages)
├── components/
│   ├── analytics/      # 13 analytics components
│   │   ├── FinancialHealthScore.tsx
│   │   ├── YearOverYearComparison.tsx
│   │   ├── PeriodComparison.tsx
│   │   ├── CashFlowForecast.tsx
│   │   └── ... (9 more components)
│   ├── layout/         # Layout components
│   ├── shared/         # Shared components
│   ├── transactions/   # Transaction components
│   ├── ui/            # Base UI components
│   └── upload/        # Upload components
├── hooks/             # Custom React hooks
│   └── api/           # API-specific hooks
├── services/          # API client services
│   └── api/           # API modules
├── store/             # Zustand state stores
├── lib/               # Utilities
├── types/             # TypeScript types
└── constants/         # App constants
```

## Getting Started

```bash
# Install dependencies
pnpm install

# Start development server
pnpm run dev

# Build for production
pnpm run build

# Preview production build
pnpm run preview
```

## Key Features

### Analytics Components

- **Financial Health Score** - Comprehensive scoring with 6 metrics
- **Year-over-Year Comparison** - FY comparison (April-March)
- **Period Comparison** - Month selector for quick comparisons
- **Cash Flow Forecast** - Future cash flow predictions
- **Recurring Transactions** - Automatic recurring payment detection
- **Budget Tracker** - Budget tracking visualization
- **Expense Treemap** - Visual expense breakdown
- **Subcategory Analysis** - Category drill-down

### State Management

- **TanStack Query** - API data caching and synchronization
- **Zustand** - Persistent stores for user preferences

## Environment Variables

```env
VITE_API_URL=http://localhost:8000
```

## Development

See the main [Development Guide](../docs/DEVELOPMENT.md) for comprehensive instructions.
