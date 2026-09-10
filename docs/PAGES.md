# Pages Reference

Developer-facing route and data-source catalog for the current Ledger Sync source.

Checked against `frontend/src/App.tsx`, navigation configuration, page components, and API hooks on 2026-09-09.

## Router Summary

The application has 29 routed page components:

- 3 public page routes.
- 26 protected workspace page routes.
- 4 eager page components: Home, Dashboard, Demo Entry, and OAuth Callback.
- 25 lazy page components, prefetched on route intent after authentication initializes.

`/home` is a protected compatibility route that redirects to `/dashboard`.

## Shared Route States

Data-driven protected pages keep their title and route context visible when a query fails, then provide a Try again action through the shared `PageErrorState`. Failed requests are evaluated before empty-data rendering so a network or backend failure cannot appear as a valid zero-value financial state.

Upload and Sync handles parsing, conflict, persistence, and refresh failures inside its workflow because retry behavior depends on the selected file. More is navigation-only and has no financial query state.

The multi-category chart has its own loading, failure, and Retry states. A
failed chart request does not become an empty series or a zero-value result.

## Public Routes

| Route | Component | Purpose |
| --- | --- | --- |
| `/` | `pages/home/HomePage.tsx` | Public product page and sign-in entry |
| `/demo` | `pages/DemoEntryPage.tsx` | Seeds demo state and enters Dashboard |
| `/auth/callback/:provider` | `pages/OAuthCallbackPage.tsx` | Consumes the tab's matching OAuth attempt, exchanges the code, fetches the new profile, and installs the session |

The public Home route remains available to authenticated users. Its primary action changes from sign-in to opening the workspace.

`AuthModal` starts a fresh provider-specific S256 PKCE attempt through
`services/api/auth.ts`. The callback consumes matching `sessionStorage` state
before posting the verifier, removes callback query parameters from browser
history, and offers Sign in again or Return home for expired, cancelled,
mismatched, or failed attempts. Its isolated API client supports signing in
from demo mode without third-party cookies. See
[Authentication Flow](architecture.md#authentication-flow).

Version 2 clients request provider metadata with `flow_version=2`. Older
clients receive a navigation-only restart bridge; the current callback
recognizes `restart=2` and starts new PKCE instead of exchanging old parameters.
Legacy callbacks without a verifier receive a readable HTTP 409 upgrade
message that their existing error handler can display.

## Protected Routes

| Group | Route | Page |
| --- | --- | --- |
| Core | `/dashboard` | Dashboard |
| Core | `/overview` | Overview |
| Analytics | `/spending` | Expense Analysis |
| Analytics | `/merchants` | Merchant Intelligence |
| Analytics | `/income` | Income Analysis |
| Analytics | `/income-expense-flow` | Cash Flow |
| Analytics | `/comparison` | Comparison |
| Analytics | `/year-in-review` | Year in Review |
| Wealth | `/net-worth` | Net Worth |
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
| Planning | `/data-health` | Data Health |
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
- Age of Money and Days of Buffering. Buffering uses only accounts classified as Cash, Bank Accounts, or Other Wallets, then subtracts credit-card debt and overdrawn balances. See [CALCULATIONS.md](CALCULATIONS.md) for the definition.
- Financial Health Score.
- Income Sources and Expense Sources pies with drill-down links.
- Grouped monthly income-versus-spending bars for complete months, with any excluded in-progress month disclosed below the chart.

When the selected period contains no transactions, the page shows a full-page upload prompt.

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

### Merchant Intelligence

**Route:** `/merchants`

**Source:** `frontend/src/pages/merchant-intelligence/MerchantIntelligencePage.tsx`

Displays:

- Merchant count, share of spend covered, and the Pareto concentration point.
- Ranked merchants with spend, transaction count, average ticket, and first and last seen.
- Recurring-only filter and free-text search.

Primary source: `/api/analytics/v2/merchant-intelligence`.

Merchant labels are derived from transaction notes. A note that cannot be resolved to a confident merchant is kept as a full descriptor rather than being truncated to its first word, so unrelated purchases are not merged under one label.

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

- Book-value contributions
- Portfolio Assets
- Recorded investment P and L
- Largest holding and its share of invested value
- Optional Monthly Target
- Asset allocation and growth charts
- Account, value, and allocation table

The page discloses that its figures are cost basis. Portfolio return and XIRR
need market values absent from the imported statements. There is no eight-type
holdings editor on this page.

### Projections

**Route:** `/investments/sip-projection`

**Source:** `frontend/src/pages/mutual-fund-projection/MutualFundProjectionPage.tsx`

Combines detected mutual-fund transfers and account balances with user inputs:

- Current value
- Monthly SIP
- Annual step-up
- Expected return
- Projection years

Outputs invested amount, projected value, gains, growth path, expected-value
benchmark, and PPF/EPF/NPS instrument projections. Historical Total Return and
XIRR require an explicit current-value input; the book balance alone does not
enable those return tiles.

### Returns Analysis

**Route:** `/investments/returns`

**Source:** `frontend/src/pages/returns-analysis/ReturnsAnalysisPage.tsx`

Displays:

- Realised income, costs, and net investment P and L.
- Count of booked income and cost events.
- Monthly investment cash flows.
- Dividend, interest, profit/loss, and broker-cost breakdowns.
- Book-value holdings.

Uses the shared time filter and client-side classification of user-scoped
transactions and balances. The valuation notice explains why CAGR and monthly
ROI cannot be derived from these cost-basis statements.

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
- Persisted current amounts and allocations for signed-in users.

`useGoalActions` uses `POST /api/analytics/v2/goals` for creation and `PATCH` or
`DELETE /api/analytics/v2/goals/{goal_id}` for changes. The backend validates
payloads, scopes queries to `CurrentUser`, and returns `current_amount`.
Mutations invalidate goal queries. Failed edits keep the form open; deletion
uses a confirmation dialog.

Demo actions update page-local sample goals and never call these mutations.
The identity-keyed page discards that state when remounted.

`LegacyGoalRecovery` appears only for authenticated, non-demo sessions. It
compares recognized older browser values with positive goal IDs fetched for
the current account: allocations, name, target amount, calendar date, and
hidden-goal choices. Recovering fields requires explicit selection and
ownership confirmation; deletion has a separate confirmation. IDs 1-4 carry
a possible-demo warning because the original global keys contain no account
ownership.

Recovery PATCH sends only selected fields. A selected allocation becomes the
absolute `current_amount`; unselected fields and account notes are retained.
A hidden-goal entry records only an earlier browser hiding choice. Keeping
the goal visible or dismissing displayed changes makes no server mutation.

Before acting, recovery refetches the goal, rejects changed server or browser
values, and checks the session around writes. Failed writes preserve the
draft and original values. These are frontend preflight checks; the APIs do
not add atomic server version preconditions. The three original global keys
are never changed. Separate acknowledgment markers are keyed by account,
goal, and field, and store the reviewed value. They suppress the same proposal
only after a confirmed choice or successful write. Changed browser values can
be reviewed again.
If marker storage fails after an account update, the UI distinguishes the
successful update from the browser's inability to remember it. No legacy
value is automatically applied, imported, or deleted.

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

### Data Health

**Route:** `/data-health`

**Source:** `frontend/src/pages/data-health/DataHealthPage.tsx`

Displays:

- The last date the ledger covers and how many days since then are unimported.
- Rows processed, inserted, and already present from the most recent import.
- Placeholder-note, uncategorized, and future-dated row counts.
- Whether the analytics rollups are behind the committed transactions, with an in-place recompute action.

Primary source: `/api/analytics/v2/data-health`.

When the rollups lag a committed import, the page states that displayed figures come from the previous import rather than showing them as current.

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

Tax math is client-side and uses versioned fiscal-year tax configuration. Vested RSU rows use a stored vest-date stock price converted at vest-date FX when available; optional net quantity reports sell-to-cover proceeds without changing the gross taxable quantity. Upcoming rows use the configured appreciation assumption.

The estimate states its income basis, regime deduction, FY rules, and any
latest-known fallback. `getStandardDeduction(fy, regime)` defaults to the new
regime for existing callers. The old regime stays at INR 50,000; the new regime
uses INR 75,000 from FY 2024-25. Regime comparison, break-even, effective-rate
charts and their current-regime marker, and previous-year values use the
corresponding regime's rules.

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
3. Review source counts, dates, INR currency, and accounts, then acknowledge a complete ledger snapshot.
4. Post structured rows to `/api/upload`, which commits reconciliation and import history together.
5. Read the backend's separate analytics status and invalidate affected workspace queries.

`UploadReview` gates the upload, including forced reuploads. Rows omitted from
the confirmed snapshot are soft-deleted across the user's ledger. The backend
rejects invalid batches before reconciliation. Review is an aggregate summary,
not a row editor or column-remapping step; the expected-format table remains
static.

The normal upload performs one backend analytics refresh. A saved import with
failed analytics offers an explicit refresh-only call to
`/api/analytics/v2/refresh`. A timeout directs the user to history before
retrying because ledger persistence may already have completed.

The account-scoped Import History section reads `GET /api/upload/history`, lists
the most recent runs and row counts, and switches to mobile cards below `sm`.
Demo mode omits the section because it has no server-side import log.

### Settings

**Route:** `/settings`

**Source:** `frontend/src/pages/settings/SettingsPage.tsx`

Twelve sections:

1. Financial Settings
2. Income and Salary Structure
3. Account Classifications
4. Expense Categories
5. Income Classification (reads `/api/calculations/income-facets` to audit the four `*_income_categories` lists against the ledger: unclassified buckets with their amount, plus saved keys matching no transactions)
6. Categorization Rules
7. Investment Mappings
8. Display Preferences
9. Notifications
10. Dashboard Widgets
11. AI Assistant
12. Advanced

Only Financial Settings starts expanded. The other eleven sections start collapsed to keep the initial desktop and phone scan compact.

Settings are grouped under Money Setup, Categories and Classification, Profile and Display, and Advanced. Save persists staged preference changes. Reset restores default preferences but preserves account classifications.

The preferences request includes salary structure, RSU grants, and growth
assumptions alongside ordinary preferences. Classifications and categorization
rules have separate writes. Save settles all affected writes before final
preference/rule rehydration. A partial failure retains the draft and allows
retry; the overall Settings save is not a single database transaction.

Display Preferences includes a device-local Full/Reduced motion choice. It applies immediately and does not remount the active page or discard staged settings.

AI configuration endpoints are under `/api/preferences/ai-config`.

AI settings distinguish stored personal-key availability from app/personal
funding. Same-provider model/region saves omit an unchanged key and never
reveal it. A changed provider needs a new key; incomplete Bedrock BYOK is
rejected rather than charged to shared funding. A 409 conflict offers a
metadata reload without discarding the draft. Token limits show pending,
saved, and error states; zero blocks proxied calls, blank clears a cap, and
pending reservations are included. Browser-direct limits are informational.

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

`themeStore` persists Light or Dark mode. A user with no stored choice gets the operating system `prefers-color-scheme` value, resolved once before first paint.

`motionStore` persists Full or Reduced motion. The preference is resolved before first paint and shared with Motion so page state remains mounted when it changes.

### Demo mode

Demo Entry seeds deterministic sample transactions and query data. Real API
mutations are blocked and explain that sign-in is required. Goals have a
page-local editing path that resets on remount. OAuth initiation still reaches
the authentication service. Leaving demo cancels outstanding work and clears
the seeded query cache and user stores.

### Session boundaries and prefetch

`lib/session.ts` aborts prior-session requests, cancels queries, clears caches,
and resets user-scoped stores on session termination or identity change.
`AuthenticatedLayout` remounts local page state for a different identity.
Theme and motion remain device preferences. Responses and refresh results
must still belong to the initiating session before they can update state.

Signed-in startup prefetch loads preferences, active recurring commitments,
and Data Health. Internal link hover, focus, or touch can load the matching
lazy page module. Runtime startup does not eagerly import every page or fetch
the full ledger. Workbox independently precaches production static chunks for
offline use, including for anonymous sessions.

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

The registry's typed argument models define both advertised schemas and runtime
validation. Results are read-only, bounded, and may be sent to the selected
model provider. OpenAI and Anthropic use browser-direct BYOK calls; Bedrock uses
the backend with app or personal funding. See
[AI Architecture](architecture.md#ai-architecture) for usage reservations,
explicit funding selection, and tool-data boundaries.

### Currency

Display conversion uses the selected currency and cached exchange rates.
New imports accept INR source amounts only. Changing display currency does not
rewrite ledger rows or convert a foreign-currency source file into a supported
snapshot.

## Known Boundaries

- No direct bank account synchronization.
- No PDF statement parser.
- No persisted transaction edit, split, or delete UI.
- No invoice-level GST extraction.
- No live mutual-fund NAV ingestion.
- Cost-basis statements do not establish live portfolio values or actual returns.
