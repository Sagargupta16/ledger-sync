# Ledger Sync Handbook

User guide for Ledger Sync 2.22.0.

Verified against the live frontend source on 2026-07-24. For exact routes and data sources, see [PAGES.md](PAGES.md). For formulas, see [CALCULATIONS.md](CALCULATIONS.md). For request contracts, see [API.md](API.md).

## Start Here

Open the public Home page and choose one of these paths:

- **Sign in** or **Get started free** opens the OAuth dialog.
- **Explore demo** opens a seeded sample workspace without an account.
- **Open workspace** or **Open dashboard** appears when already authenticated.
- **See capabilities** moves to the product capabilities section.

Google and GitHub buttons appear only when the backend reports those providers as configured.

If the dialog says it could not reach the sign-in service, use Try again once. If it keeps failing, check the backend and database health endpoints described in [DEPLOYMENT.md](DEPLOYMENT.md#sign-in-service-unavailable).

## Workspace Layout

### Desktop

The left sidebar contains:

- Dashboard and Overview at the top.
- Analytics, Wealth, Commitments, Planning, Tax, and Data groups.
- Search, currency, theme, Upload, Settings, and sign-out controls.
- The current user profile at the bottom.

The global workspace header shows the current page and provides Search, Ask AI, and notifications when available.

### Phone

The bottom bar exposes:

- Dashboard
- Transactions
- Cash Flow
- More

More mirrors every remaining desktop group. The menu button also opens the full sidebar. Primary touch targets are at least 44px.

### Search

Use the sidebar Search control, the workspace header, or `Ctrl+K` to open the command palette.

### Themes

Light is the default. Settings and the sidebar theme control support Light, Dark, and System.

### Data errors and recovery

Financial pages distinguish loading, empty, and failed requests. A failed request keeps the page title visible and shows Try again; it does not replace missing data with zero balances or an empty ledger. Settings uses the same recovery behavior for initial preference loading. Upload and Sync keeps file-specific parsing and upload failures beside the selected file so the exact operation can be retried.

## Recommended Workflow

1. Sign in with Google or GitHub.
2. Open Upload and Sync.
3. Import an Excel or CSV statement.
4. Review Transactions, tags, and saved views.
5. Configure accounts, income buckets, expense categories, and investment mappings in Settings.
6. Use Dashboard and Overview for status.
7. Explore analytics, wealth, planning, and tax pages.
8. Ask the AI assistant targeted questions that it can answer through its read-only tools.

## Upload and Sync

**Route:** `/upload`

Supported files:

- `.xlsx`
- `.xls`
- `.csv`

The source file is parsed in the browser. The browser maps flexible column names, validates rows, and computes a SHA-256 file hash. Only structured transaction rows and file metadata are sent to the backend.

Expected row fields:

- Date
- Account
- Category
- Subcategory, optional
- Type
- Amount
- Note, optional
- Currency, optional and defaults to INR

Supported transaction types are Income, Expense, Transfer-In, and Transfer-Out.

After selection:

1. The page shows Parsing.
2. Valid rows are sent as JSON.
3. The backend reconciles new, changed, unchanged, and missing rows.
4. Analytics are recomputed.
5. The workspace cache refreshes.

An already imported file produces a conflict prompt. Use Force Reupload only when the new copy is intended to replace or reconcile the earlier import.

There is no separate mapping or row-preview screen. The table below the drop zone is an expected-format example, not imported data.

## Transactions

**Route:** `/transactions`

The transaction ledger is server-paginated.

Columns:

- Date
- Type
- Category with subcategory and tags
- Account
- Amount
- Note
- Tag action

Filter by search text, category, subcategory, account, type, tags, dates, or amount range. Saved Views store reusable filter combinations. Date and Amount are sortable. Export downloads the filtered result as CSV.

The current UI does not edit, split, or delete transaction rows. Tags can be replaced from the row action.

## Dashboard

**Route:** `/dashboard`

Use Dashboard for the selected period's operating signals.

### Ledger snapshot

Quick Insights include configurable items such as:

- Income, expenses, net savings, and savings rate.
- Net cashback.
- Average, median, and largest expense.
- Fixed commitments from confirmed active recurring expenses.
- Age of Money.
- Days of Buffering from classified liquid accounts.
- Weekend and weekday spending context.

Dashboard settings control which available items appear.

### Financial Health Score

The score summarizes spending, saving, borrowing, and planning signals. Treat it as a directional diagnostic, not a credit score or financial recommendation.

### Income and expense sources

The two source panels show the largest categories and group smaller slices into Other. Selecting a category opens the matching analysis page with that category applied.

When no transactions exist for the selected period, Dashboard shows a single upload prompt rather than empty widgets.

## Overview

**Route:** `/overview`

Overview is a fixed whole-picture summary:

- Income
- Spending
- Net Saved and savings rate
- Net Worth link
- Top income and spending sources
- Budgets at risk
- Active goal progress

Select any block to open the corresponding detail page. Overview is separate from both the public Home page and the configurable Dashboard.

## Analytics

### Expense Analysis

**Route:** `/spending`

Use this page to answer where spending went and how it changed.

It combines:

- Total and average spending.
- Largest expense and category count.
- Needs, Wants, and Savings context.
- Category and subcategory breakdown.
- Monthly trend.
- Multi-category and cohort analysis.

Category deep links keep the selected category visible until cleared.

### Income Analysis

**Route:** `/income`

Use this page to review income sources, monthly trend, primary-source share, and configured tax buckets. Selecting an income category filters the page to that source.

Income classification comes from Settings. Unclassified items should be resolved there before relying on tax planning.

### Cash Flow

**Route:** `/income-expense-flow`

The desktop Sankey follows money from income sources through total income into expense categories and savings. Phone layouts use a vertical summary instead of compressing the Sankey.

Small categories are grouped into Other so the visible flows reconcile with the headline totals.

### Comparison

**Route:** `/comparison`

Choose Month, Year, or FY, then select two independent periods. The page compares income, expenses, savings, savings rate, expense distribution, and category movement.

There is no custom date-range comparison.

### Year in Review

**Route:** `/year-in-review`

Choose a calendar year or fiscal year.

The page includes:

- Total Spending
- Total Earning
- Savings Rate
- Daily Average
- Spending heatmap
- Monthly breakdown
- Day-of-week analysis
- Generated observations

The page does not currently include net-worth milestones, merchant growth, or category-growth rankings.

## Wealth

### Net Worth Tracker

**Route:** `/net-worth`

Net Worth combines account classifications and transaction-derived balances.

It includes:

- Net worth
- Total assets
- Total liabilities
- Book-value trend
- Linear projection band based on average monthly change
- Milestone ladder
- Expandable account groups
- Credit-card health

Investment values are book-value estimates unless a connected balance or current value is available. The page is not a live brokerage valuation.

### Trends and Forecasts

**Route:** `/forecasts`

Review filtered monthly income, expenses, savings, rolling context, daily savings progression, and monthly breakdowns. Historical charts stop at today.

### Investment Analytics

**Route:** `/investments/analytics`

Settings map accounts into four display categories:

- FD and Bonds
- Mutual Funds
- PPF and EPF
- Stocks

The page shows total value, portfolio asset count, net investment P and L, cashflow XIRR, an optional monthly target, allocation, growth, and an account table.

### Projections

**Route:** `/investments/sip-projection`

Adjust:

- Current portfolio value
- Monthly SIP
- Annual SIP step-up
- Expected return
- Projection period

The page combines detected contribution history with projected invested value and growth. It also includes PPF, EPF, and NPS calculators using configured instrument rates.

### Returns Analysis

**Route:** `/investments/returns`

Review monthly net investment, estimated CAGR, account ranking, and winner or weak-account context. Return calculations depend on imported cash flows and available balances, not live market data.

## Commitments

### Recurring

**Route:** `/subscriptions`

The page separates:

- Active confirmed commitments.
- Detected candidates awaiting confirmation.
- Inactive commitments.

You can confirm detected items, add one manually, change its cadence or amount, deactivate it, or delete it.

### Bill Calendar

**Route:** `/bill-calendar`

Use the month grid to inspect upcoming, paid, missed, and variable recurring amounts. Dot size increases with the bill amount. Select a day to see its detail list.

## Planning

### Budget Rule

**Route:** `/budgets`

This page analyzes the 50/30/20 rule. It is not the older category-budget editor.

The three buckets are:

- Needs
- Wants
- Savings

Each card shows target, actual, delta, and score. Category averages are grouped below each bucket. Choose 1 year, 2 years, 5 years, All Time, or Custom.

Targets and category rules come from Settings.

### Financial Goals

**Route:** `/goals`

Create Goal expands an inline form below the summary area. Each goal shows target, current progress, deadline, feasibility, and a savings projection based on average monthly savings.

Current behavior to note:

- Goal creation is persisted through the backend.
- Edit, progress, allocation, and delete interactions currently use browser-local overrides.
- Clearing browser storage can remove those local overrides.

### FIRE Calculator

**Route:** `/fire-calculator`

The calculator supports Lean, Barista, Standard, and Fat variants.

Adjust:

- Safe withdrawal rate
- Real return
- Years to retirement
- Barista monthly income
- Inflation
- Expected nominal return
- Retirement duration

Ledger totals and monthly history seed starting values when available. Results are scenario estimates, not financial advice.

### Anomaly Review

**Route:** `/anomalies`

Current detector labels:

- High Expense
- Unusual Category
- Large Transfer
- Budget Exceeded

Review, dismiss, or attach a note. You can also include previously reviewed items and adjust anomaly detection preferences.

## Tax

### Income Tax

**Route:** `/tax`

The page compares India's old and new tax regimes using the selected fiscal year and configured income classifications.

It includes:

- Recorded-income analysis.
- Deductions.
- Regime comparison and recommendation.
- Salary and RSU projection mode.
- Multi-year projections.
- Optional projected TDS schedule for the current FY.

Vested RSUs use their stored vest-date price when available. Upcoming vestings use the configured appreciation assumption.

Tax rules are versioned by fiscal year, but results remain estimates. Verify final filing values against official records.

### Indirect Tax (GST)

**Route:** `/tax/gst`

The GST page estimates indirect tax from categorized expenses and date-aware slab assumptions. Bank statements do not expose invoice tax components, so this is an approximation.

## Settings

**Route:** `/settings`

Settings has 12 sections in four workflow groups.

### Money Setup

1. **Financial Settings** - fiscal year, budget targets, fixed expenses, tax preferences, TDS schedule, EPF treatment, savings and payday settings.
2. **Income and Salary Structure** - fiscal-year salary components, RSU grants and vestings, vest-date prices, and growth assumptions.

Both start expanded.

### Categories and Classification

3. **Account Classifications** - assign accounts to Cash, Bank Accounts, Credit Cards, Investments, Loans/Lended, or Other Wallets.
4. **Expense Categories** - essential and fixed-expense classification.
5. **Income Classification** - taxable, investment return, non-taxable, and other income buckets.
6. **Categorization Rules** - ordered note/account matching rules with optional retroactive application.
7. **Investment Mappings** - map investment accounts to the four analytics categories.

The first four sections in this group start expanded; Investment Mappings starts collapsed.

### Profile and Display

8. **Display Preferences** - number format, display currency, default range, earning start date, and Light/Dark/System theme.
9. **Notifications** - budget, anomaly, and upcoming-bill preferences.
10. **Dashboard Widgets** - choose visible Quick Insights.
11. **AI Assistant** - app Bedrock or BYOK mode, provider/model/key, and token limits.

These sections start collapsed.

### Advanced

12. **Advanced** - excluded accounts, credit-card limits, and other power-user controls.

This section starts collapsed.

The Save button is a solid foreground action with a Save icon and activates only when staged settings changed. Reset restores preference defaults but preserves account classifications.

## AI Assistant

The assistant is available from the workspace header or floating chat control when configured.

It can use 15 read-only tools for:

- Accounts
- Transactions
- Monthly summaries
- Categories and category spending
- Net worth
- Recurring items
- Goals
- Fiscal-year summaries
- Budgets
- Cash flow
- Tax summary
- Preference summary
- Anomalies

The prompt contains currency, date, fiscal-year, and tool guidance. The assistant fetches actual numbers through tools and should state when no data is found.

OpenAI and Anthropic BYOK calls are browser-direct. Bedrock calls always pass through the backend and use the server's Bedrock credential, including a BYOK configuration that selects Bedrock.

## Demo Mode

Demo mode seeds deterministic sample transactions and analytics in the browser.

- Read-only analysis pages work without real API calls.
- Mutations are blocked with a sign-in explanation.
- Demo state lasts for the browser session.
- Exiting demo clears the seeded query cache.

## Time and Currency

The shared analytics filter provides All Time, FY, Yearly, and Monthly modes on supported pages. Year in Review provides only FY and Yearly.

Changing display currency changes formatting and converted display values. It does not rewrite imported ledger rows.

## Current Limitations

- No direct bank synchronization.
- No PDF statement import.
- No transaction split/edit/delete UI.
- No invoice-level GST extraction.
- No live mutual-fund NAV feed.
- Goal edits and progress overrides are not fully server-persisted.
