# Pages Reference

Developer-facing route and data-source catalog for Ledger Sync 2.22.0.

Verified against `frontend/src/App.tsx`, navigation configuration, page components, and API hooks on 2026-07-14.

## Router Summary

The application has 27 routed page components:

- 3 public page routes.
- 24 protected workspace page routes.
- 4 eager page components: Home, Dashboard, Demo Entry, and OAuth Callback.
- 23 lazy page components, prefetched during browser idle time.

`/home` is a protected compatibility route that redirects to `/dashboard`.

## Public Routes

| Route | Component | Purpose |
| --- | --- | --- |
| `/` | `pages/home/HomePage.tsx` | Public product page and sign-in entry |
| `/demo` | `pages/DemoEntryPage.tsx` | Seeds demo state and enters Dashboard |
| `/auth/callback/:provider` | `pages/OAuthCallbackPage.tsx` | Completes Google or GitHub OAuth |

The public Home route remains available to authenticated users. Its primary action changes from sign-in to opening the workspace.

## Protected Routes

| Group | Route | Page |
| --- | --- | --- |
| Core | `/dashboard` | Dashboard |
| Core | `/overview` | Overview |
| Analytics | `/spending` | Expense Analysis |
| Analytics | `/income` | Income Analysis |
| Analytics | `/income-expense-flow` | Cash Flow |
| Analytics | `/comparison` | Comparison |
| Analytics | `/year-in-review` | Year in Review |
| Wealth | `/net-worth` | Net Worth Tracker |
| Wealth | `/forecasts` | Trends and Forecasts |
| Wealth | `/investments/analytics` | Investment Analytics |
| Wealth | `/investments/sip-projection` | Projections |
| Wealth | `/investments/returns` | Returns Analysis |
| Commitments | `/subscriptions` | Recurring |
| Commitments | `/bill-calendar` | Bill Calendar |
| Planning | `/budgets` | Budget Rule |
| Planning | `/goals` | Financial Goals |
| Planning | `/fire-calculator` | FIRE Calculator |
| Planning | `/anomalies` | Anomaly Review |
| Tax | `/tax` | Income Tax |
| Tax | `/tax/gst` | Indirect Tax (GST) |
| Data | `/transactions` | Transactions |
| Data | `/upload` | Upload and Sync |
| Data | `/settings` | Settings |
| Mobile | `/more` | More |

## Shared Time Filter

`AnalyticsTimeFilter` appears on nine pages:

- Dashboard
- Expense Analysis
- Income Analysis
- Cash Flow
- Year in Review
- Net Worth
- Trends and Forecasts
- Investment Analytics
- Returns Analysis

Available modes are:

- All Time
- FY
- Yearly
- Monthly

Year in Review limits the control to Yearly and FY. The filter does not provide a custom date range. Previous and next navigation is bounded by the available data range where that range is known.

## Core

### Dashboard

**Route:** `/dashboard`

**Source:** `frontend/src/pages/DashboardPage.tsx`

Purpose: operating view for the selected period.

Displays:

- Ledger snapshot through configurable Quick Insights.
- Confirmed active recurring expenses as fixed commitments.
- Age of Money and Days of Buffering. Buffering uses only accounts classified as Cash, Bank Accounts, or Other Wallets.
- Financial Health Score.
- Income Sources and Expense Sources pies with drill-down links.

There is no trailing recent-trends chart. When the selected period contains no transactions, the page shows a full-page upload prompt.

Primary sources:

- `/api/calculations/*`
- `/api/analytics/*`
- `/api/analytics/v2/recurring-transactions`
- `/api/account-classifications`

### Overview

**Route:** `/overview`

**Source:** `frontend/src/pages/OverviewPage.tsx`

Purpose: fixed whole-picture summary with direct links into detail pages.

Displays:

- Income, spending, net saved, savings rate, and a Net Worth link.
- Top three income and expense sources.
- Budgets at or above their alert threshold.
- Up to four active financial goals.

Primary sources:

- Shared Dashboard metrics.
- `/api/analytics/v2/budgets`
- `/api/analytics/v2/goals`

Overview is not the public Home page and is not the configurable Dashboard.

## Analytics

### Expense Analysis

**Route:** `/spending`

**Source:** `frontend/src/pages/spending-analysis/SpendingAnalysisPage.tsx`

Displays:

- Spending, monthly average, category count, and largest expense.
- 50/30/20 context.
- Category and subcategory breakdowns.
- Monthly expense trend.
- Multi-category and cohort views.

Category deep links use the `category` query parameter. Calculations combine the filtered ledger with user preferences such as essential categories.

### Income Analysis

**Route:** `/income`

**Source:** `frontend/src/pages/income-analysis/IncomeAnalysisPage.tsx`

Displays:

- Total and average income.
- Primary source share and income trend.
- Income categories and configured tax buckets.
- Monthly income series and category drill-down.

Primary sources:

- `/api/calculations/income-analysis`
- `/api/calculations/data-date-range`
- `/api/calculations/category-breakdown`
- `/api/calculations/category-monthly-history`

The active route is `/income`, not `/income-analysis`.

### Cash Flow

**Route:** `/income-expense-flow`

**Source:** `frontend/src/pages/income-expense-flow/IncomeExpenseFlowPage.tsx`

Displays:

- Income, expenses, savings, and savings rate.
- Desktop Sankey from income sources through total income into expense categories and savings.
- Mobile vertical flow summary below the desktop breakpoint.

The largest nodes are retained and smaller nodes are grouped into Other so displayed flows reconcile with totals.

### Comparison

**Route:** `/comparison`

**Source:** `frontend/src/pages/comparison/ComparisonPage.tsx`

Modes:

- Month
- Year
- FY

Each side has an independent period selector. The page compares:

- Income
- Expenses
- Savings
- Savings rate
- Expense distribution
- Category movement
- Generated comparison insights

There is no custom-range mode, net-worth delta, or normalized trend overlay.

### Year in Review

**Route:** `/year-in-review`

**Source:** `frontend/src/pages/year-in-review/YearInReviewPage.tsx`

Supports Yearly and FY views.

Headline metrics:

- Total Spending
- Total Earning
- Savings Rate
- Daily Average

Also displays a spending heatmap, monthly breakdown, day-of-week analysis, and generated year insights. It does not include merchant-growth, category-growth, net-worth, or milestone sections.

## Wealth

### Net Worth Tracker

**Route:** `/net-worth`

**Source:** `frontend/src/pages/net-worth/NetWorthPage.tsx`

Displays:

- Net worth, total assets, and total liabilities.
- Transaction-derived book-value trend.
- Linear projection band based on average monthly net-worth delta.
- Milestone ladder.
- Expandable account-category tables.
- Credit-card health.

There are no asset/liability donut charts or separate liquid-net-worth and emergency-fund KPI cards.

Primary sources:

- `/api/calculations/daily-net-worth`
- `/api/calculations/account-balances`
- User account classifications.

### Trends and Forecasts

**Route:** `/forecasts`

**Source:** `frontend/src/pages/trends-forecasts/TrendsForecastsPage.tsx`

Displays filtered monthly income, expenses, and savings with rolling context, trend metrics, daily cumulative savings behavior, and monthly breakdown tables.

Historical data is capped at today. Projection pages build their own future ranges.

### Investment Analytics

**Route:** `/investments/analytics`

**Source:** `frontend/src/pages/investment-analytics/InvestmentAnalyticsPage.tsx`

Configured account mappings are normalized into four display categories:

- FD and Bonds
- Mutual Funds
- PPF and EPF
- Stocks

Displays:

- Total Investment Value
- Portfolio Assets
- Net Investment P and L
- Cashflow XIRR
- Optional Monthly Target
- Asset allocation and growth charts
- Account, value, and allocation table

There is no eight-type holdings editor on this page.

### Projections

**Route:** `/investments/sip-projection`

**Source:** `frontend/src/pages/mutual-fund-projection/MutualFundProjectionPage.tsx`

Combines detected mutual-fund transfers and account balances with user inputs:

- Current value
- Monthly SIP
- Annual step-up
- Expected return
- Projection years

Outputs invested amount, projected value, gains, growth path, expected-value benchmark, XIRR context, and PPF/EPF/NPS instrument projections.

### Returns Analysis

**Route:** `/investments/returns`

**Source:** `frontend/src/pages/returns-analysis/ReturnsAnalysisPage.tsx`

Displays:

- Investment-flow summary.
- Monthly net investment.
- Estimated CAGR.
- Account ranking and return status.
- Best and weakest accounts.

Uses the shared time filter and client-side return calculations over user-scoped transactions and balances.

## Commitments

### Recurring

**Route:** `/subscriptions`

**Source:** `frontend/src/pages/subscription-tracker/SubscriptionTrackerPage.tsx`

Displays active confirmed commitments, detected candidates, and inactive items.

Actions:

- Confirm a detected item.
- Add an item manually.
- Update amount, cadence, category, or active state.
- Delete an item.

Mutations use `POST`, `PATCH`, and `DELETE /api/analytics/v2/recurring-transactions`.

### Bill Calendar

**Route:** `/bill-calendar`

**Source:** `frontend/src/pages/bill-calendar/BillCalendarPage.tsx`

Displays:

- Next upcoming bill.
- Month grid with recurring and scheduled items.
- Amount-scaled dots from 4px to 9px.
- Due, paid, missed, and variance context.
- Focused-day details.

Data comes from recurring commitments and calendar utility calculations.

## Planning

### Budget Rule

**Route:** `/budgets`

**Source:** `frontend/src/pages/budget/BudgetPage.tsx`

This is a 50/30/20 analysis page, not a category budget CRUD table.

Displays:

- Needs, Wants, and Savings cards.
- Target, actual, delta, and score for each bucket.
- Grouped category averages.
- Period choices for 1 year, 2 years, 5 years, All Time, and Custom.

Primary source: `/api/analytics/v2/spending-rule`.

### Financial Goals

**Route:** `/goals`

**Source:** `frontend/src/pages/goals/GoalsPage.tsx`

Displays:

- Savings pool summary.
- Inline Create Goal form.
- Goal progress and feasibility.
- Average-monthly-savings projections.
- Local allocation overrides.

The backend creates goals and returns `current_amount`. Current edit, progress, allocation, and delete interactions are browser-local overrides rather than persisted goal mutations.

### FIRE Calculator

**Route:** `/fire-calculator`

**Source:** `frontend/src/pages/FIRECalculatorPage.tsx`

Displays:

- FIRE number.
- Years to FIRE.
- Coast FIRE.
- Savings rate.
- Lean, Barista, Standard, and Fat variants.
- Retirement corpus and contribution projections.

Inputs include safe withdrawal rate, real return, retirement horizon, Barista income, inflation, and expected nominal return. Defaults are seeded from ledger totals and monthly history where available.

### Anomaly Review

**Route:** `/anomalies`

**Source:** `frontend/src/pages/AnomalyReviewPage.tsx`

Current anomaly types:

- High Expense
- Unusual Category
- Large Transfer
- Budget Exceeded

Actions:

- Review
- Dismiss
- Add Note

The page can include reviewed items and exposes anomaly preference controls.

## Tax

### Income Tax

**Route:** `/tax`

**Source:** `frontend/src/pages/tax-planning/TaxPlanningPage.tsx`

Displays:

- Old and new regime comparison.
- Taxable-income classification.
- Deductions and regime recommendation.
- Salary and RSU projection mode.
- Multi-year projection table.
- Optional projected TDS schedule for the current FY.

Tax math is client-side and uses versioned fiscal-year tax configuration. Vested RSU rows use a stored vest-date price when available; upcoming rows use the configured appreciation assumption.

### Indirect Tax (GST)

**Route:** `/tax/gst`

**Source:** `frontend/src/pages/gst-analysis/GSTAnalysisPage.tsx`

Estimates indirect tax from categorized expenses and date-aware GST slab rules. Results are estimates because imported bank rows do not contain invoice-level GST components.

## Data

### Transactions

**Route:** `/transactions`

**Source:** `frontend/src/pages/TransactionsPage.tsx`

Columns:

- Date
- Type
- Category, subcategory, and tags
- Account
- Amount
- Note
- Tag action

Filters:

- Search
- Category
- Subcategory
- Account
- Type
- Tags
- Date range
- Amount range
- Saved view

The table uses server pagination. Sorting is supported for Date and Amount. There is no inline edit, split, delete, or client virtualization workflow.

Related endpoints:

- `GET /api/transactions`
- `GET /api/transactions/facets`
- `GET /api/transactions/export`
- `PUT /api/transactions/{transaction_id}/tags`
- `/api/saved-views`

### Upload and Sync

**Route:** `/upload`

**Source:** `frontend/src/pages/upload-sync/UploadSyncPage.tsx`

Accepts `.xlsx`, `.xls`, and `.csv`.

Flow:

1. Parse and validate in the browser.
2. Compute a SHA-256 file hash.
3. Post structured rows to `/api/upload`.
4. Request `/api/analytics/v2/refresh`.
5. Invalidate cached workspace data.

Rows upload immediately after successful parsing. There is no 50-row preview or column-remapping step. The page shows a static expected-format table.

### Settings

**Route:** `/settings`

**Source:** `frontend/src/pages/settings/SettingsPage.tsx`

Twelve sections:

1. Financial Settings
2. Income and Salary Structure
3. Account Classifications
4. Expense Categories
5. Income Classification
6. Categorization Rules
7. Investment Mappings
8. Display Preferences
9. Notifications
10. Dashboard Widgets
11. AI Assistant
12. Advanced

The first six sections start expanded. The remaining six start collapsed.

Settings are grouped under Money Setup, Categories and Classification, Profile and Display, and Advanced. Save persists staged preference changes. Reset restores default preferences but preserves account classifications.

AI configuration endpoints are under `/api/preferences/ai-config`.

## Mobile

### More

**Route:** `/more`

**Source:** `frontend/src/pages/MorePage.tsx`

Phone navigation mirror grouped as:

- Overview
- Analytics
- Wealth
- Commitments
- Planning
- Tax
- Data

The page includes sign-out and exposes every route that is not a dedicated bottom-tab destination.

## Cross-Page Mechanics

### Responsive tables

`DataTable.mobileCards` switches below the `sm` breakpoint, 640px. Tables with genuinely different shapes use responsive column visibility or a purpose-built mobile layout.

### Themes

`themeStore` persists Light, Dark, or System mode. Light is the default for new users.

### Demo mode

Demo Entry seeds deterministic sample transactions and query data. Real API mutations are blocked and explain that sign-in is required. Demo state is session-scoped.

### AI assistant

The assistant has these 15 tools:

1. `list_accounts`
2. `search_transactions`
3. `get_monthly_summary`
4. `list_categories`
5. `get_category_spending`
6. `get_net_worth`
7. `list_recurring`
8. `list_goals`
9. `list_recent_months`
10. `get_fy_summary`
11. `list_budgets`
12. `get_cash_flow`
13. `get_tax_summary`
14. `get_preferences_summary`
15. `list_anomalies`

Tools execute through the authenticated backend and are scoped to the current user.

### Currency

Display conversion uses the selected currency and cached exchange rates. Stored transaction values remain in their imported currency context; changing display currency does not rewrite ledger rows.

## Known Boundaries

- No direct bank account synchronization.
- No PDF statement parser.
- No persisted transaction edit, split, or delete UI.
- No invoice-level GST extraction.
- No live mutual-fund NAV ingestion.
- Goal edits and progress overrides are not yet fully persisted.
