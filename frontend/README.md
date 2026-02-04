# Ledger Sync Frontend

Modern financial analytics dashboard built with React 18, TypeScript, and Vite.

## Tech Stack

- **React 18** - UI framework
- **TypeScript** - Type safety
- **Vite** - Fast build tool and dev server
- **TanStack Query** - Server state management and caching
- **Zustand** - Lightweight global state management
- **Recharts** - Charting library for data visualization
- **Tailwind CSS** - Utility-first styling
- **Framer Motion** - Animations
- **Sonner** - Toast notifications

## Project Structure

```
src/
├── pages/              # Page components
│   ├── DashboardPage.tsx
│   ├── UploadSyncPage.tsx       # Beautiful upload UI with hero section
│   ├── TransactionsPage.tsx
│   ├── SpendingAnalysisPage.tsx # 50/30/20 budget rule
│   ├── IncomeAnalysisPage.tsx
│   ├── IncomeExpenseFlowPage/   # Sankey diagrams
│   ├── InvestmentAnalyticsPage.tsx # 4 investment categories
│   ├── MutualFundProjectionPage.tsx
│   ├── TaxPlanningPage.tsx
│   ├── NetWorthPage.tsx
│   ├── TrendsForecastsPage.tsx
│   └── SettingsPage.tsx
├── components/
│   ├── analytics/      # Analytics components
│   │   ├── FinancialHealthScore.tsx
│   │   ├── YearOverYearComparison.tsx
│   │   ├── CashFlowForecast.tsx
│   │   ├── ExpenseTreemap.tsx
│   │   └── ...
│   ├── layout/         # Layout components (Sidebar, AppLayout)
│   ├── shared/         # Shared components (EmptyState, TimeFilter)
│   ├── transactions/   # Transaction table components
│   ├── ui/             # Base UI components (shadcn-style)
│   └── upload/         # Upload components (DropZone)
├── hooks/              # Custom React hooks
│   ├── api/            # TanStack Query hooks
│   │   ├── useTransactions.ts
│   │   ├── useUpload.ts
│   │   ├── usePreferences.ts
│   │   └── useAnalytics.ts
│   └── usePeriodNavigation.ts
├── services/api/       # API client modules
├── store/              # Zustand state stores
├── lib/                # Utilities (formatters, dateUtils)
├── types/              # TypeScript type definitions
└── constants/          # App constants and colors
```

## Key Features

### Upload & Sync Page

- Hero section with gradient background and grid pattern
- Inline drag-and-drop upload zone
- Sample Excel format preview table
- Toast notifications for upload status (bottom-right, glassy style)

### Spending Analysis

- **50/30/20 Budget Rule** with 3 entities:
  - Needs (50% of income) - Essential expenses
  - Wants (30% of income) - Discretionary expenses
  - Savings (20% of income) - Income minus expenses
- Pie chart with all 3 categories
- Progress bars showing current vs target

### Investment Analytics

- **4 Investment Categories**:
  - FD/Bonds (fixed deposits, bonds)
  - Mutual Funds
  - PPF/EPF (provident funds)
  - Stocks
- NET investment calculation (Inflows - Outflows)
- Collective portfolio view (no time filter)
- Asset allocation pie chart

### Cash Flow (Sankey)

- Income sources → Expense categories
- Visual flow of money through accounts

## Getting Started

```bash
# Install dependencies
pnpm install

# Start development server
pnpm run dev

# Type check
pnpm run typecheck

# Build for production
pnpm run build
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

- `preferencesStore` - User preferences
- `accountStore` - Account mappings
- `investmentAccountStore` - Investment category mappings
- `budgetStore` - Budget settings

## Toast Notifications

Configured globally in `App.tsx`:

- Position: bottom-right
- Dark theme with glassy background
- 4-second default duration
- Backdrop blur effect

## Development

See the main [Development Guide](../docs/DEVELOPMENT.md) for comprehensive instructions.
