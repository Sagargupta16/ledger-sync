# Frontend Rebuild Plan - Ledger Sync

## 🎯 Project Goal

Upload Excel → Auto-sync transactions → Beautiful visualizations to track spending, income, and net worth

**Core Principle**: Excel is the source of truth. Frontend is **read-only analytics dashboard**.

---

## 🎨 Navigation Structure

### **Left Sidebar Navigation** (Grouped)

**📊 Overview**

- Dashboard (General Stats)

**📁 Data Management**

- Upload & Sync
- Account Configuration

**💰 Transactions**

- All Transactions
- Income Transactions
- Expense Transactions
- Transfers

**💼 Investments**

- Investment Analytics
- Mutual Fund Projections (SIP Calculator)
- Returns Analysis
- Investment Accounts

**💳 Tax Planning**

- Tax Summary
- Tax-saving Investments (80C, 80D, etc.)
- Projected Tax Liability
- Tax Deductions Tracker

**📈 Net Worth**

- Net Worth Tracker
- Account Balances
- Asset Allocation
- Wealth Growth

**📊 Spending Analysis**

- Category-wise Spending
- Subcategory Breakdown
- Income Analysis
- Monthly Trends

**🔮 Trends & Forecasts**

- Spending Forecasts
- Income Projections
- Recurring Payments Tracker
- Budget Predictions
- Future Net Worth Projections

**⚙️ Settings**

- Preferences
- Export Data

---

## 📋 Pages & Features

### 1. **Upload & Sync Page** (Combined Data Management)

**Upload Section:**

- [ ] Drag & drop Excel file
- [ ] Upload progress indicator
- [ ] Sync results display:
  - X transactions inserted
  - Y transactions updated
  - Z transactions deleted
- [ ] Last sync timestamp
- [ ] Button to download sample Excel template

**Account Configuration Section:**

- [ ] List of all accounts (from `/api/meta/accounts`)
- [ ] For each account, select classification:
  - [ ] **Investment Account** (checkbox)
  - [ ] **Deposit Account** (checkbox)
  - [ ] **Loan Account** (checkbox)
- [ ] Save configuration button
- [ ] Visual indicators for account types (badges/icons)

**APIs**:

- `POST /api/upload`
- `GET /api/meta/accounts`
- (Future) `POST /api/accounts/classify` - save account classifications

---

### 2. **Dashboard (Overview)**

**General Overview Stats:**

- [ ] Hero metrics cards:
  - Total Income (green)
  - Total Expenses (red)
  - Net Savings (blue)
  - Savings Rate % (purple)
- [ ] Quick summary charts:
  - Mini net worth trend (sparkline)
  - Income vs Expenses (last 6 months, mini bar chart)
  - Top 3 spending categories (compact)
- [ ] Recent activity:
  - Last 5 transactions
  - Recent uploads
- [ ] Quick insights:
  - Top spending category this month
  - Biggest transaction this month
  - Average daily spending
- [ ] Time range selector: 1M | 3M | 6M | 1Y | All Time

**APIs**:

- `/api/analytics/kpis`
- `/api/calculations/totals`
- `/api/transactions` (limit=5 for recent)

---

### 3. **Transactions Explorer**

- [ ] Searchable table with columns:
  - Date | Amount | Type | Category | Account | Note
- [ ] Filters:
  - Date range picker
  - Type dropdown (Income/Expense/Transfer)
  - Category dropdown
  - Account dropdown
  - Amount range (min/max)
- [ ] Search bar (search in notes/category)
- [ ] Sort by: Date | Amount | Category
- [ ] Pagination (100 per page)
- [ ] Export filtered results to CSV

**APIs**:

- `/api/transactions/search` (with filters)
- `/api/meta/accounts`
- `/api/meta/filters`

---

### 4. **Investment Analytics**

**Investment Overview:**

- [ ] Total investment value across all investment accounts
- [ ] Total returns (absolute & percentage)
- [ ] Investment allocation chart (by account)
- [ ] Performance metrics by account

**APIs**:

- `/api/calculations/account-balances` (filter investment accounts)
- `/api/calculations/category-breakdown` (investment categories)

---

### 5. **Mutual Fund Projections (SIP Calculator)**

**SIP Projection Features:**

- [ ] Detect SIP transactions from history (recurring amounts to Mutual Fund accounts)
- [ ] Calculate average monthly SIP amount
- [ ] Project future value with compound interest
- [ ] Show projection for: 5Y, 10Y, 15Y, 20Y
- [ ] Allow user to adjust:
  - Expected return rate (default 12%)
  - SIP amount
  - Investment horizon
- [ ] Chart: Current value vs Projected value
- [ ] Breakdown: Total invested vs Expected returns

**Logic (Frontend):**

1. Filter transactions to investment accounts (mutual fund type)
2. Identify recurring monthly investments
3. Calculate average SIP amount
4. Apply compound interest formula: FV = P × [((1 + r)^n - 1) / r] × (1 + r)
5. Show year-wise breakdown table

**APIs**:

- `/api/transactions/search` (filter by investment accounts, recurring)
- (Backend can add `/api/investments/sip-projection` later)

---

### 6. **Tax Planning**

**Tax Summary:**

- [ ] Total taxable income (Income - deductions)
- [ ] Tax-saving investments (80C limit ₹1.5L)
- [ ] Health insurance deductions (80D)
- [ ] Other deductions (80G, HRA, etc.)
- [ ] Projected tax liability with slabs
- [ ] Suggested tax-saving actions

**Tax Deductions Tracker:**

- [ ] Table of eligible deductions with categories
- [ ] Show used vs remaining limits
- [ ] Visual progress bars for each section

**APIs**:

- `/api/calculations/totals` (income)
- `/api/calculations/category-breakdown` (tax-saving categories)
- (Future) `/api/tax/summary`

---

### 7. **Net Worth Tracker**

- [ ] Net Worth Area Chart (cumulative over time)
- [ ] Current net worth breakdown:
  - Assets (Investment accounts + Deposit accounts)
  - Liabilities (Loan accounts)
  - Net Worth = Assets - Liabilities
- [ ] Account balances table (grouped by type)
- [ ] Wealth growth metrics:
  - Month-over-month change
  - Year-over-year change
  - All-time growth %

**APIs**:

- `/api/calculations/daily-net-worth`
- `/api/calculations/account-balances`

---

### 8. **Spending Analysis**

**Category-wise Spending:**

- [ ] Pie/Doughnut chart: Spending by category
- [ ] Top 10 expense categories (horizontal bar)
- [ ] Category breakdown table with percentages
- [ ] Month-over-month comparison per category

**Subcategory Breakdown:**

- [ ] Drill-down from category to subcategories
- [ ] Treemap or sunburst chart for hierarchy
- [ ] Table with category → subcategory → amount

**Income Analysis:**

- [ ] Income sources breakdown (pie chart)
- [ ] Income trends (line chart)
- [ ] Income by category and subcategory

**Monthly Trends:**

- [ ] Monthly Income vs Expenses (bar chart)
- [ ] Spending Trend (line chart, last 12 months)
- [ ] Savings trend over time

**APIs**:

- `/api/analytics/charts/income-expense`
- `/api/analytics/charts/categories`
- `/api/analytics/charts/monthly-trends`
- `/api/calculations/category-breakdown`
- `/api/calculations/monthly-aggregation`

---

### 9. **Returns Analysis** (Investments)

- [ ] Calculate XIRR/CAGR for each investment account
- [ ] Compare returns across different investments
- [ ] Best/worst performing investments
- [ ] Returns chart over time

**APIs**:

- `/api/calculations/account-balances` (investment accounts)
- (Future) `/api/investments/returns`

---

### 10. **Trends & Forecasts**

**Recurring Payments Tracker:**

- [ ] Auto-detect recurring transactions (rent, electricity, subscriptions, EMIs)
- [ ] Identify patterns:
  - Monthly fixed (same amount, same date range)
  - Monthly variable (same merchant/category, varying amount)
  - Quarterly/Annual (insurance, renewals)
- [ ] List all recurring payments with:
  - Payment name/category
  - Average amount
  - Frequency (monthly/quarterly/yearly)
  - Next expected date
  - Trend (increasing/decreasing/stable)
- [ ] Alert if recurring payment is missing

**Spending Forecasts:**

- [ ] Predict next month's spending by category
- [ ] Use historical average + trend analysis
- [ ] Show forecast vs actual comparison chart
- [ ] Confidence intervals for predictions

**Income Projections:**

- [ ] Forecast next month's income
- [ ] Predict salary increments based on history
- [ ] Show expected vs actual income trends

**Budget Predictions:**

- [ ] Based on recurring payments + average variable spending
- [ ] Suggest monthly budget per category
- [ ] Show "if current trend continues" scenarios

**Future Net Worth Projections:**

- [ ] Linear projection based on savings rate
- [ ] Optimistic/Pessimistic scenarios
- [ ] Goal-based projections (reach X amount by Y date)
- [ ] Interactive: "What if I save X more per month?"

**Forecast Visualization:**

- [ ] Historical data (solid line) + Forecasted data (dashed line)
- [ ] Confidence bands (shaded area)
- [ ] Scenario comparison (multiple lines)

**Logic (Frontend):**

1. Detect recurring patterns using transaction history
2. Apply moving average for trend calculation
3. Use linear regression for simple forecasts
4. Calculate standard deviation for confidence intervals
5. Allow user to adjust forecast parameters

**APIs**:

- `/api/transactions/search` (get historical data)
- `/api/analytics/behavior` (may include patterns)
- (Future) `/api/forecasts/spending`
- (Future) `/api/forecasts/recurring-payments`

---

### 7. **Net Worth Tracker**

- [ ] Net Worth Area Chart (cumulative over time)
- [ ] Current net worth breakdown:
  - Assets (Investment accounts + Deposit accounts)
  - Liabilities (Loan accounts)
  - Net Worth = Assets - Liabilities
- [ ] Account balances table (grouped by type)
- [ ] Wealth growth metrics:
  - Month-over-month change
  - Year-over-year change
  - All-time growth %

**APIs**:

- `/api/calculations/daily-net-worth`
- `/api/calculations/account-balances`

---

### 8. **Spending Analysis**

**Category-wise Spending:**

**Category-wise Spending:**

- [ ] Pie/Doughnut chart: Spending by category
- [ ] Top 10 expense categories (horizontal bar)
- [ ] Category breakdown table with percentages
- [ ] Month-over-month comparison per category

**Subcategory Breakdown:**

- [ ] Drill-down from category to subcategories
- [ ] Treemap or sunburst chart for hierarchy
- [ ] Table with category → subcategory → amount

**Income Analysis:**

- [ ] Income sources breakdown (pie chart)
- [ ] Income trends (line chart)
- [ ] Income by category and subcategory

**Monthly Trends:**

- [ ] Monthly Income vs Expenses (bar chart)
- [ ] Spending Trend (line chart, last 12 months)
- [ ] Savings trend over time

**APIs**:

- `/api/analytics/charts/income-expense`
- `/api/analytics/charts/categories`
- `/api/analytics/charts/monthly-trends`
- `/api/calculations/category-breakdown`
- `/api/calculations/monthly-aggregation`

---

### 9. **Returns Analysis** (Investments)

- `/api/calculations/category-breakdown`

---

## 🛠️ Tech Stack (Latest & Modern)

### Core

- **Vite 6+** - Fastest build tool with HMR
- **React 19** - Latest UI library with Compiler
- **TypeScript 5+** - Strict type safety
- **React Router v7** - Modern file-based routing

### Styling (Modern & Beautiful)

- **Tailwind CSS v4** - Latest utility-first CSS
- **shadcn/ui** - Beautiful, accessible components (Radix UI primitives)
- **Framer Motion** - Smooth animations & transitions
- **Lucide React** - Modern icon library (tree-shakeable)

### Data & State

- **TanStack Query v5** - Server state management with auto-caching
- **Zustand** - Lightweight UI state (< 1KB)
- **Zod** - Runtime type validation for API responses

### Data Visualization (Modern Charts)

- **Recharts v2** - Declarative, responsive charts (primary)
- **Tremor** - Modern dashboard components with built-in charts
- **Victory Charts** (alternative) - Composable, animated charts
- **Chart.js v4** (alternative) - Highly customizable

**Chart Types Used:**

- Area charts (net worth, forecasts with confidence bands)
- Bar/Column charts (income vs expenses, category comparison)
- Line charts (trends, projections with dashed lines)
- Pie/Doughnut (category breakdown)
- Treemap/Sunburst (hierarchical spending)
- Sparklines (mini trend indicators)

### Tables & Forms

- **TanStack Table v8** - Headless table with virtualization
- **React Hook Form** - Performant form handling
- **date-fns** - Modern date manipulation

### UI/UX Enhancements

- **Sonner** - Beautiful toast notifications
- **cmdk** - Command palette (Cmd+K)
- **vaul** - Modern drawer component
- **react-hot-toast** - Toast notifications

---

## 🎨 Design System (Modern Theme)

**Color Palette:**

- **Primary**: Purple/Violet (#8B5CF6) - Investment, wealth
- **Secondary**: Blue (#3B82F6) - Analytics, insights
- **Success**: Green (#10B981) - Income, profit
- **Danger**: Red (#EF4444) - Expenses, losses
- **Warning**: Amber (#F59E0B) - Alerts, forecasts
- **Neutral**: Slate (#64748B) - Text, borders

**Theme Style:**

- **Modern Glass Morphism** - Frosted glass cards with backdrop blur
- **Gradient Accents** - Smooth purple-to-blue gradients
- **Neumorphism Cards** - Soft shadows for depth
- **Dark Mode Primary** - Dark theme with vibrant accents
- **Smooth Animations** - Framer Motion for page transitions, card hover effects
- **Micro-interactions** - Button ripples, loading states

**Typography:**

- **Font**: Inter (system-ui fallback)
- **Hierarchy**: Clear font sizes (text-xs to text-5xl)
- **Weight**: 400 (normal), 600 (semibold), 700 (bold)

**Layout:**

- **Sidebar**: Collapsible with grouped navigation
- **Cards**: Rounded (rounded-2xl), elevated shadows
- **Spacing**: Consistent 4px/8px/16px/24px/32px scale
- **Responsive**: Mobile-first (sm/md/lg/xl breakpoints)

---

## 📁 Folder Structure (Clean & Reusable Architecture)

```
frontend/
├── index.html
├── package.json
├── vite.config.ts
├── tailwind.config.js
├── tsconfig.json
├── components.json           # shadcn/ui config
└── src/
    ├── main.tsx              # App entry point with providers
    ├── App.tsx               # Route definitions
    │
    ├── pages/                # Route pages (one per route)
    │   ├── UploadSyncPage.tsx
    │   ├── DashboardPage.tsx
    │   ├── TransactionsPage.tsx
    │   ├── InvestmentAnalyticsPage.tsx
    │   ├── MutualFundProjectionPage.tsx
    │   ├── ReturnsAnalysisPage.tsx
    │   ├── TaxPlanningPage.tsx
    │   ├── NetWorthPage.tsx
    │   ├── SpendingAnalysisPage.tsx
    │   ├── IncomeAnalysisPage.tsx
    │   └── TrendsForecastsPage.tsx
    │
    ├── components/           # All reusable components
    │   │
    │   ├── ui/              # shadcn base components (Button, Card, etc.)
    │   │   ├── button.tsx
    │   │   ├── card.tsx
    │   │   ├── dialog.tsx
    │   │   ├── dropdown-menu.tsx
    │   │   ├── input.tsx
    │   │   ├── select.tsx
    │   │   ├── skeleton.tsx
    │   │   ├── table.tsx
    │   │   ├── tabs.tsx
    │   │   └── toast.tsx
    │   │
    │   ├── layout/          # Layout components (used across pages)
    │   │   ├── AppLayout.tsx              # Main layout wrapper
    │   │   ├── Sidebar/
    │   │   │   ├── Sidebar.tsx            # Main sidebar
    │   │   │   ├── SidebarGroup.tsx       # Reusable group component
    │   │   │   ├── SidebarItem.tsx        # Reusable nav item
    │   │   │   └── SidebarToggle.tsx      # Mobile toggle button
    │   │   ├── Header.tsx                 # Top header
    │   │   └── PageContainer.tsx          # Consistent page wrapper
    │   │
    │   ├── shared/          # Shared components (used in multiple features)
    │   │   ├── MetricCard/
    │   │   │   ├── MetricCard.tsx         # Main card component
    │   │   │   ├── MetricCardSkeleton.tsx # Loading state
    │   │   │   └── MetricCardGroup.tsx    # Grid wrapper for cards
    │   │   ├── FilterBar/
    │   │   │   ├── FilterBar.tsx          # Main filter component
    │   │   │   ├── DateRangePicker.tsx    # Reusable date picker
    │   │   │   ├── CategoryFilter.tsx     # Dropdown filter
    │   │   │   └── AccountFilter.tsx      # Dropdown filter
    │   │   ├── TimeRangeSelector.tsx      # 1M/3M/6M/1Y/All buttons
    │   │   ├── DataTable/                 # Reusable table
    │   │   │   ├── DataTable.tsx          # Main table component
    │   │   │   ├── DataTablePagination.tsx
    │   │   │   └── DataTableToolbar.tsx
    │   │   ├── EmptyState.tsx             # Empty data placeholder
    │   │   ├── ErrorBoundary.tsx          # Error handling
    │   │   ├── LoadingSpinner.tsx         # Loading indicator
    │   │   └── PageHeader.tsx             # Consistent page titles
    │   │
    │   ├── charts/          # Chart components (reusable across features)
    │   │   ├── base/                      # Base chart wrappers
    │   │   │   ├── ChartContainer.tsx     # Wrapper with title/controls
    │   │   │   ├── ChartLegend.tsx        # Reusable legend
    │   │   │   ├── ChartTooltip.tsx       # Custom tooltip
    │   │   │   └── ChartSkeleton.tsx      # Loading skeleton
    │   │   ├── AreaChart.tsx              # Reusable area chart
    │   │   ├── BarChart.tsx               # Reusable bar chart
    │   │   ├── LineChart.tsx              # Reusable line chart
    │   │   ├── PieChart.tsx               # Reusable pie/doughnut
    │   │   ├── TreemapChart.tsx           # Hierarchical chart
    │   │   ├── SparklineChart.tsx         # Mini trend indicator
    │   │   ├── NetWorthChart.tsx          # Net worth specific
    │   │   ├── CategoryPieChart.tsx       # Category breakdown
    │   │   ├── MonthlyBarChart.tsx        # Income/expense bars
    │   │   ├── SIPProjectionChart.tsx     # SIP projection visual
    │   │   ├── TaxBreakdownChart.tsx      # Tax deductions
    │   │   ├── ForecastChart.tsx          # Forecast with bands
    │   │   └── TrendLineChart.tsx         # Trend analysis
    │   │
    │   ├── upload/          # Upload feature components
    │   │   ├── DropZone.tsx               # Drag & drop area
    │   │   ├── UploadProgress.tsx         # Progress indicator
    │   │   ├── UploadResults.tsx          # Sync results display
    │   │   └── AccountClassifier/
    │   │       ├── AccountClassifier.tsx  # Main classifier
    │   │       ├── AccountTypeSelector.tsx
    │   │       └── AccountList.tsx
    │   │
    │   ├── transactions/    # Transaction feature components
    │   │   ├── TransactionTable.tsx       # Main table
    │   │   ├── TransactionRow.tsx         # Table row
    │   │   ├── TransactionFilters.tsx     # Filter controls
    │   │   └── TransactionSearch.tsx      # Search input
    │   │
    │   ├── investments/     # Investment feature components
    │   │   ├── InvestmentCard.tsx         # Account card
    │   │   ├── InvestmentCardGrid.tsx     # Grid wrapper
    │   │   ├── SIPCalculator/
    │   │   │   ├── SIPCalculator.tsx      # Main calculator
    │   │   │   ├── SIPInputs.tsx          # User inputs
    │   │   │   ├── SIPProjection.tsx      # Results display
    │   │   │   └── SIPYearTable.tsx       # Year-wise breakdown
    │   │   └── ReturnsTable.tsx           # Returns comparison
    │   │
    │   ├── tax/             # Tax planning components
    │   │   ├── TaxSummaryCard.tsx         # Overview card
    │   │   ├── DeductionTracker/
    │   │   │   ├── DeductionTracker.tsx   # Main tracker
    │   │   │   ├── DeductionProgress.tsx  # Progress bar
    │   │   │   └── DeductionItem.tsx      # Single deduction
    │   │   └── TaxSlabCalculator.tsx      # Slab calculation
    │   │
    │   ├── forecasts/       # Forecast feature components
    │   │   ├── RecurringPaymentsList/
    │   │   │   ├── RecurringPaymentsList.tsx
    │   │   │   ├── RecurringPaymentCard.tsx
    │   │   │   └── RecurringPaymentAlert.tsx
    │   │   ├── SpendingForecast.tsx       # Category predictions
    │   │   ├── IncomeForecast.tsx         # Income predictions
    │   │   ├── NetWorthProjection/
    │   │   │   ├── NetWorthProjection.tsx # Main projection
    │   │   │   ├── ScenarioSelector.tsx   # Optimistic/Pessimistic
    │   │   │   └── WhatIfCalculator.tsx   # Interactive calculator
    │   │   └── BudgetSuggestions.tsx      # AI-suggested budgets
    │   │
    │   └── networth/        # Net worth components
    │       ├── NetWorthSummary.tsx
    │       ├── AssetLiabilityBreakdown.tsx
    │       └── AccountBalanceTable.tsx
    │
    ├── features/            # Feature-specific logic (not components)
    │   ├── upload/
    │   │   └── uploadSlice.ts             # Upload state (if using Zustand)
    │   ├── transactions/
    │   │   └── transactionUtils.ts        # Transaction helpers
    │   ├── investments/
    │   │   └── investmentCalculations.ts  # Investment logic
    │   └── forecasts/
    │       └── forecastModels.ts          # Forecast algorithms
    │
    ├── hooks/               # Custom React hooks (reusable logic)
    │   ├── api/             # API-related hooks
    │   │   ├── useUpload.ts
    │   │   ├── useTransactions.ts
    │   │   ├── useAnalytics.ts
    │   │   ├── useInvestments.ts
    │   │   └── useMetadata.ts
    │   ├── calculations/    # Calculation hooks
    │   │   ├── useSIPProjection.ts
    │   │   ├── useTaxCalculation.ts
    │   │   ├── useRecurringPayments.ts
    │   │   └── useForecast.ts
    │   ├── ui/              # UI-related hooks
    │   │   ├── useAccountTypes.ts
    │   │   ├── useFilters.ts
    │   │   ├── useTimeRange.ts
    │   │   └── useToast.ts
    │   └── index.ts         # Centralized hook exports
    │
    ├── services/            # API layer (backend communication)
    │   ├── api/
    │   │   ├── client.ts                  # Base API client (axios/fetch)
    │   │   ├── transactions.ts            # Transaction endpoints
    │   │   ├── analytics.ts               # Analytics endpoints
    │   │   ├── calculations.ts            # Calculation endpoints
    │   │   ├── metadata.ts                # Metadata endpoints
    │   │   └── upload.ts                  # Upload endpoint
    │   └── index.ts         # Centralized service exports
    │
    ├── store/               # Global state management
    │   ├── index.ts                       # Store setup (Zustand)
    │   ├── slices/
    │   │   ├── accountTypesSlice.ts       # Account classifications
    │   │   ├── uiSlice.ts                 # UI state (sidebar, theme)
    │   │   └── filtersSlice.ts            # Persistent filters
    │   └── persist.ts       # Persistence config
    │
    ├── lib/                 # Third-party library configs
    │   ├── queryClient.ts                 # React Query config
    │   ├── chartDefaults.ts               # Chart.js/Recharts defaults
    │   └── cn.ts            # Tailwind class merger (shadcn)
    │
    ├── types/               # TypeScript definitions
    │   ├── index.ts                       # Central type exports
    │   ├── api.ts                         # API response types
    │   ├── transaction.ts                 # Transaction types
    │   ├── investment.ts                  # Investment types
    │   ├── forecast.ts                    # Forecast types
    │   └── chart.ts                       # Chart data types
    │
    ├── utils/               # Pure utility functions
    │   ├── format/
    │   │   ├── currency.ts                # Currency formatting
    │   │   ├── date.ts                    # Date formatting
    │   │   └── number.ts                  # Number formatting
    │   ├── calculations/
    │   │   ├── sipCalculations.ts         # SIP formulas
    │   │   ├── taxCalculations.ts         # Tax calculations
    │   │   ├── statistics.ts              # Mean, median, std dev
    │   │   └── compound.ts                # Compound interest
    │   ├── analysis/
    │   │   ├── forecastEngine.ts          # Linear regression
    │   │   ├── recurringDetector.ts       # Pattern detection
    │   │   └── trendAnalyzer.ts           # Trend analysis
    │   ├── export.ts                      # CSV/PDF export
    │   ├── validation.ts                  # Input validation
    │   └── index.ts         # Centralized util exports
    │
    ├── constants/           # App constants
    │   ├── routes.ts                      # Route paths
    │   ├── api.ts                         # API endpoints
    │   ├── colors.ts                      # Color palette
    │   └── config.ts                      # App configuration
    │
    └── styles/              # Global styles
        ├── globals.css                    # Tailwind base + globals
        └── animations.css                 # Custom animations
```

---

## 🏗️ Architecture Principles

### **1. Component Reusability**

- **Base components** (`ui/`) are pure, no business logic
- **Shared components** (`shared/`) handle common patterns (cards, filters, tables)
- **Feature components** are specific but composed from shared/base
- **Chart components** have a base wrapper (`ChartContainer`) with consistent styling

### **2. Separation of Concerns**

- **Pages**: Only routing and layout composition
- **Components**: Only UI rendering
- **Hooks**: Business logic and side effects
- **Services**: API communication
- **Utils**: Pure functions, no side effects
- **Store**: Global state only (avoid overuse)

### **3. DRY (Don't Repeat Yourself)**

- Centralized API client configuration
- Reusable form patterns (React Hook Form)
- Shared type definitions across frontend/backend
- Common chart configurations
- Utility function libraries

### **4. Folder Naming Conventions**

- **PascalCase** for component files (`MetricCard.tsx`)
- **camelCase** for hook files (`useTransactions.ts`)
- **camelCase** for utility files (`formatCurrency.ts`)
- **Feature folders** for related components (`investments/`, `tax/`)
- **Index files** for clean imports

### **5. Import Patterns**

```typescript
// ❌ Avoid deep imports
import { Button } from "../../../../components/ui/button";

// ✅ Use path aliases (tsconfig paths)
import { Button } from "@/components/ui/button";
import { useTransactions } from "@/hooks/api/useTransactions";
import { formatCurrency } from "@/utils/format/currency";

// ✅ Centralized exports via index.ts
import { MetricCard, FilterBar } from "@/components/shared";
import { useFilters, useTimeRange } from "@/hooks";
```

### **6. Component Composition Pattern**

```typescript
// ❌ Monolithic component
<TransactionPage>
  {/* 500 lines of code */}
</TransactionPage>

// ✅ Composed from smaller pieces
<TransactionPage>
  <PageHeader title="Transactions" />
  <TransactionFilters />
  <TransactionTable />
  <TransactionPagination />
</TransactionPage>
```

### **7. Testing Structure** (Future)

```
src/
├── components/
│   ├── shared/
│   │   ├── MetricCard.tsx
│   │   └── MetricCard.test.tsx        # Co-located tests
├── hooks/
│   ├── useTransactions.ts
│   └── useTransactions.test.ts
└── utils/
    ├── calculations/
    │   ├── sipCalculations.ts
    │   └── sipCalculations.test.ts
```

---

## 🎨 Design Style

- **Dark theme** with purple/blue gradients
- **Glass morphism** cards
- **Smooth animations** (fade-in, hover effects)
- **Responsive** (mobile-friendly)
- **Color coding**:
  - 🟢 Green = Income
  - 🔴 Red = Expenses
  - 🔵 Blue = Net Savings
  - 🟣 Purple = Insights

---

## 🚀 Build Order (Step-by-Step)

### Phase 1: Setup (30 min) ✅ COMPLETED

1. ✅ Create Vite project with React + TypeScript
2. ✅ Install dependencies (React Router, TanStack Query, Tailwind, shadcn, Recharts)
3. ✅ Setup Tailwind + configure theme colors
4. ✅ Create basic routing structure
5. ✅ Setup API client with base URL
6. ✅ Create Sidebar component with grouped navigation

### Phase 2: Upload & Account Configuration (1.5 hours) ✅ COMPLETED

1. ✅ Create DropZone component (drag & drop)
2. ✅ Implement upload mutation with React Query
3. ✅ Show loading spinner during upload
4. ✅ Display sync results (inserted/updated/deleted counts)
5. ✅ Add success/error toast notifications
6. ⏭️ Create AccountClassifier component (deferred - not critical for MVP)
7. ⏭️ Fetch accounts from `/api/meta/accounts`
8. ⏭️ Add checkboxes for Investment/Deposit/Loan classification
9. ⏭️ Store classifications in localStorage

### Phase 3: Dashboard (1.5 hours) ✅ COMPLETED

1. ✅ Create MetricCard component
2. ✅ Fetch KPIs from `/api/analytics/kpis`
3. ✅ Create useKPIs and useRecentTransactions hooks with React Query
4. ✅ Display 4 metric cards (Income, Expenses, Savings, Savings Rate %)
5. ✅ Create RecentTransactions component with animated cards
6. ✅ Show recent 5 transactions with date, category, amount
7. ⏭️ Add mini charts (sparklines) - deferred for Phase 3.5
8. ⏭️ Add time range selector (1M, 3M, 6M, 1Y, All) - deferred for Phase 3.5
9. ⏭️ Show quick insights section - deferred for Phase 3.5

### Phase 4: Transactions (1.5 hours)

1. Create transaction table with TanStack Table
2. Implement search with debouncing
3. Add filter dropdowns (type, category, account)
4. Add date range picker
5. Implement pagination
6. Add CSV export button

### Phase 5: Investment Pages (3 hours)

**Investment Analytics (1 hour):**

1. Show total investment value
2. Create investment allocation chart
3. Display per-account investment cards
4. Show basic returns metrics

**Mutual Fund SIP Projections (1.5 hours):**

1. Create SIP calculator utility (compound interest)
2. Fetch investment account transactions
3. Identify recurring SIP patterns
4. Calculate projections (5Y, 10Y, 15Y, 20Y)
5. Create projection chart component
6. Add user input controls (return rate, SIP amount, horizon)
7. Show year-wise breakdown table

**Returns Analysis (30 min):**

1. Calculate returns per account
2. Create comparison table
3. Add simple returns chart

### Phase 6: Tax Planning (1.5 hours)

1. Create tax calculation utilities (Indian tax slabs)
2. Fetch income and deduction categories
3. Calculate taxable income
4. Track 80C/80D/80G deductions with limits
5. Create visual deduction tracker (progress bars)
6. Show projected tax liability
7. Suggest tax-saving actions

### Phase 7: Net Worth & Spending (2 hours)

**Net Worth (1 hour):**

1. Create area chart for net worth over time
2. Fetch account balances grouped by type
3. Calculate Assets - Liabilities
4. Show growth metrics (MoM, YoY)

**Spending Analysis (1 hour):**

1. Create category pie chart
2. Create subcategory drill-down table
3. Add monthly trend charts
4. Create income breakdown charts

### Phase 8: Trends & Forecasts (2.5 hours)

**Recurring Payments Detection (1 hour):**

1. Create `recurringDetector.ts` utility
2. Analyze transaction history for patterns:
   - Group by category/merchant/amount
   - Calculate frequency (monthly/quarterly/yearly)
   - Identify date patterns (same day/week/range)
3. Display recurring payments list with next expected date
4. Add "missing payment" alerts

**Spending Forecasts (1 hour):**

1. Create `forecastEngine.ts` utility
2. Implement moving average calculation
3. Apply linear regression for trend
4. Calculate confidence intervals
5. Create ForecastChart component:
   - Historical data (solid line)
   - Forecasted data (dashed line with gradient)
   - Confidence bands (shaded area)
6. Show category-wise spending predictions

**Net Worth Projections (30 min):**

1. Calculate savings rate from history
2. Project future net worth (linear + optimistic/pessimistic)
3. Add interactive "What if" calculator
4. Show goal-based projections

### Phase 9: Polish & Animations (1.5 hours)

1. Add Framer Motion page transitions
2. Card hover effects and micro-interactions
3. Loading skeletons with shimmer effect
4. Handle empty states with illustrations
5. Add error boundaries
6. Improve mobile responsiveness (collapsible sidebar)
7. Add keyboard shortcuts (Cmd+K for command palette)
8. Toast notifications for actions
9. Test all navigation flows

**Total Time: ~15-17 hours**

---

## 📊 Sample API Response Formats

### Upload Response

```json
{
  "success": true,
  "message": "Upload successful",
  "stats": {
    "inserted": 45,
    "updated": 12,
    "deleted": 3
  },
  "file_name": "transactions_2025_01.xlsx"
}
```

### Transactions Response

```json
{
  "transactions": [
    {
      "id": "abc123",
      "date": "2025-01-10",
      "amount": 5000,
      "type": "Income",
      "category": "Salary",
      "account": "Bank Account",
      "note": "Monthly salary"
    }
  ],
  "total": 1250,
  "page": 1,
  "limit": 100
}
```

### KPIs Response

```json
{
  "total_income": 150000,
  "total_expenses": 85000,
  "net_savings": 65000,
  "savings_rate": 43.3,
  "top_expense_category": "Rent",
  "biggest_expense": 25000,
  "average_daily_spending": 2833
}
```

---

## ✅ MVP Checklist (Minimum for Launch)

- [x] Left sidebar navigation with 8 groups (Overview, Data, Transactions, Investments, Tax, Net Worth, Spending, **Forecasts**)
- [x] Upload page with sync results
- [x] Dashboard with general stats overview (KPI cards + recent transactions)
- [ ] Account classification (Investment/Deposit/Loan) - Deferred
- [ ] Transaction list with search and filters
- [ ] Basic investment analytics
- [ ] SIP projection calculator (mutual funds)
- [ ] Tax planning with deduction tracker
- [ ] Net worth tracker with asset/liability breakdown
- [ ] Category-wise spending analysis
- [ ] **Recurring payments detection** (rent, electricity, subscriptions, EMIs)
- [ ] **Spending forecasts** with confidence bands
- [ ] **Net worth projections** (optimistic/pessimistic scenarios)
- [ ] Time range filtering works everywhere
- [ ] **Modern glassmorphism UI** with smooth Framer Motion animations
- [ ] Mobile responsive (collapsible sidebar)

---

## 🔮 Future Enhancements (Post-MVP)

- [ ] Advanced XIRR/CAGR calculations for investments
- [ ] Machine learning for better forecast accuracy
- [ ] Integration with actual mutual fund NAVs (API)
- [ ] Real-time tax calculation with latest slabs
- [ ] Budget tracking (set monthly budgets per category)
- [ ] Anomaly detection (unusual spending patterns)
- [ ] Goal setting (save X by date Y) with progress tracking
- [ ] Multi-currency support with exchange rates
- [ ] PDF export of reports with charts
- [ ] Dark/light theme toggle
- [ ] Comparison view (this month vs last month vs forecast)
- [ ] Export investment statements
- [ ] Notification system for missing recurring payments
- [ ] AI-powered insights and recommendations
- [ ] Custom dashboard widgets (drag & drop)

---

## 🎯 Success Metrics

Frontend is successful if:

1. ✅ Upload takes < 5 seconds for typical file
2. ✅ Dashboard loads in < 2 seconds with modern animations
3. ✅ Charts are visually stunning and informative (Recharts/Tremor)
4. ✅ Filters respond instantly (< 100ms)
5. ✅ Forecasts are intuitive with clear confidence indicators
6. ✅ Recurring payments are accurately detected (>90%)
7. ✅ Works smoothly on mobile with touch interactions
8. ✅ User can answer:
   - "Where did my money go?" in < 30 seconds
   - "What are my recurring expenses?" in < 10 seconds
   - "When will I reach X net worth?" in < 20 seconds
9. ✅ Filters respond instantly (< 100ms)
10. ✅ Works smoothly on mobile
11. ✅ User can answer: "Where did my money go?" in < 30 seconds

---

## 📝 Notes & Decisions

**Why Recharts over Chart.js?**

- More React-friendly (declarative)
- Better TypeScript support
- Simpler API for common charts

**Why TanStack Query?**

- Auto-caching reduces backend load
- Automatic refetch after upload
- Loading/error states built-in

**Why no Redux/Complex State?**

- Backend is source of truth
- React Query handles server state
- Zustand for minimal UI preferences

**Read-only by Design**

- Excel is the master data source
- Users edit in Excel, upload updates
- Prevents data conflicts
- Simpler UX and implementation
