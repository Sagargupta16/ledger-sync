# Pages Reference

Developer-facing route and data-source catalog for the current Ledger Sync source.

Checked against `frontend/src/App.tsx`, navigation configuration, page components, and API hooks on 2026-10-27.

## Router Summary

The application has 32 routed page components:

- 3 public page routes.
- 29 protected workspace page routes.
- 4 eager page components: Home, Dashboard, Demo Entry, and OAuth Callback.
- 28 lazy page components, prefetched on route intent after authentication initializes.

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
| Planning | `/budgets` | Budgets |
| Planning | `/goals` | Financial Goals |
| Planning | `/fire-calculator` | FIRE Calculator |
| Planning | `/anomalies` | Anomaly Review |
| Planning | `/review` | Review Queue |
| Planning | `/data-health` | Data Health |
| Tax | `/tax` | Income Tax |
| Tax | `/tax/gst` | Indirect Tax (GST) |
| Tax | `/tax/foreign-assets` | Foreign Assets |
| Tax | `/tax/ais` | AIS Import |
| Data | `/transactions` | Transactions |
| Data | `/upload` | Upload and Sync |
| Data | `/settings` | Settings |
| Mobile | `/more` | More |

## Shared Time Filter

`AnalyticsTimeFilter` appears on ten pages:

- Dashboard
- Overview
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

Displays, from the top. The first three sit below the time filter, outside the period-settling wrapper, and do not follow the selected period:

- Safe to spend until payday, with the per-day allowance, the breakdown, the spending pace and a low-balance warning (`components/analytics/SafeToSpendCard.tsx`). Its 30-day balance projection opens from the card and lazy-loads `BalanceProjectionChart`, which hosts the "Warn me below" threshold, kept in `localStorage` per signed-in identity.
- Weekly recap of the last full Monday to Sunday week in India time (`components/analytics/WeeklyRecapCard.tsx`): spending against the average of up to four earlier weeks, the top category movers, the book-value net-worth change and its driver, recurring commitments due today and in the next seven days, open anomalies, and days to payday. An optional Explain button asks the configured AI assistant for a three-sentence summary of those figures.
- Watchlist: saved views pinned from Transactions as tiles (`components/analytics/WatchTiles.tsx`), each showing month to date against the same days last month with the last six complete months behind it, with Arrange to reorder or unpin. When nothing is pinned it offers last month's top three spending categories as one-tap pins.

Then, for the selected period:

- Ledger snapshot through configurable Quick Insights.
- Confirmed active recurring expenses as fixed commitments.
- Age of Money and Days of Buffering. Buffering uses only accounts classified as Cash, Bank Accounts, or Other Wallets, then subtracts credit-card debt and overdrawn balances. See [CALCULATIONS.md](CALCULATIONS.md) for the definition.
- Financial Health Score.
- Income Sources and Expense Sources pies with drill-down links.
- Grouped monthly income-versus-spending bars for complete months, with any excluded in-progress month disclosed below the chart.

When the selected period contains no transactions, the page shows a full-page prompt: an upload prompt for an empty ledger, or a link to the full history when data exists outside the period. With history, Safe to spend still shows above that prompt, because it depends on today, not on the period.

Primary sources:

- `/api/calculations/*`
- `/api/analytics/*`
- `/api/analytics/v2/recurring-transactions`
- `/api/dashboard-metrics/pulse` (Age of Money, Days of Buffering and investment transfers, part of the period snapshot) and `/api/dashboard-metrics/health` (Financial Health Score, requested with the page's other reads)
- `/api/safe-to-spend` and `/api/safe-to-spend/projection`
- `/api/weekly-recap`; Explain uses `POST /api/ai/bedrock/chat`, or a browser-direct provider call plus `POST /api/ai/usage/log`
- `/api/saved-views/tiles`; pins use `PUT` and `DELETE /api/saved-views/{view_id}/pin`, `PUT /api/saved-views/pins/order` and `POST /api/saved-views/pins/category`

The page never downloads the full ledger (`/api/transactions/all`).

Safe to spend and the Weekly recap are keyed under the `analyticsV2` family and the IST day, so uploads, preference saves, recurring edits and anomaly reviews refresh them and they turn over at midnight India time; Safe to spend re-reads the day every minute and when the page returns to the foreground. Explain shares the `['ai-config']` query with the chat widget and refreshes `['ai-usage']`. Demo mode answers each read from the demo ledger (`lib/demo/demoSafeToSpend.ts`, `demoWeeklyRecap.ts`, `demoWatchTiles.ts`, `demoDashboardMetrics.ts`); the pins are read-only there and Explain shows the demo-mode message.

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

- Shared Dashboard metrics, without the full ledger or either dashboard-metrics read.
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
- Category movement, as a slope chart of the top 10 expense categories by combined spend: each line runs from period A to period B, with rank moves, colored by rise or fall
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

The heatmap is desktop-only; phones get month tiles, because day cells are far below a 44px touch target. It waves in week by week and retints in a sweep when the year changes. Legend swatches highlight one level, and the grid is one tab stop: arrow keys move, Enter or Space selects a day, and Escape clears.

## Wealth

### Net Worth Tracker

**Route:** `/net-worth`

**Source:** `frontend/src/pages/net-worth/NetWorthPage.tsx`

Displays:

- Net worth, total assets, and total liabilities.
- Transaction-derived book-value trend.
- Compound projection band: the average monthly saving grows at the measured CAGR of yearly savings (the last up to three complete years, needing 24 complete months, held within plus or minus 15% a year) for the five years the chart draws, then holds. The previous straight line is drawn beside it for comparison when the projection compounds. Milestone ETAs follow the same path (`pages/net-worth/netWorthCompound.ts`).
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
- Mutual funds from a CAS: market value, cost, gain and XIRR tiles, a NAV status line (AMFI date, last check, stale message, a Check for new NAVs button), the imported statements, a holdings table (stacked cards on phones) and a CAS import panel (`components/MutualFundsSection.tsx`). The section also shows when no ledger accounts are classified.

The ledger figures above are cost basis, and the page says so. Portfolio return and
XIRR for those need market values absent from the imported statements; mutual
funds imported from a CAS carry market value and XIRR instead. There is no
eight-type holdings editor on this page.

CAS data sources: `GET /api/mf-holdings` (demo: `lib/demo/demoMfHoldings.ts`) and `POST /api/upload/cas`, a multipart upload that is off in demo mode. The import mutation clears the password field after every attempt and drops the settled mutation at once, so the password does not stay in the mutation cache.

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

Displays active confirmed commitments, detected candidates, and inactive items. Card amounts are effective amounts; an edited commitment shows an Edited chip and its detected amount with Reset.

Actions:

- Confirm a detected item.
- Add an item manually.
- Change an amount in place, or reset it to the detected amount (`useRecurringAmount`). The amount is entered in INR.
- Update name, cadence, category, or active state in the edit form; the amount is sent only when it changed.
- Delete an item.

Mutations use `POST`, `PATCH`, and `DELETE /api/analytics/v2/recurring-transactions`. An amount edit sends `PATCH {expected_amount}` or `{reset_amount: true}` and writes the answered amount state (`expected_amount`, `detected_amount`, `amount_edited`) into every cached recurring list before the refetch. Demo mode answers the list from `lib/demo/demoRecurring.ts`, where Mobile Recharge carries an edited amount.

### Bill Calendar

**Route:** `/bill-calendar`

**Source:** `frontend/src/pages/bill-calendar/BillCalendarPage.tsx`

Displays:

- Next upcoming bill.
- Month grid with recurring and scheduled items.
- Amount-scaled dots from 4px to 9px.
- Due, paid, missed, and variance context.
- Focused-day details.
- Credit card due dates as their own entries, purple while unpaid, red when overdue and green when paid (`cardBills.ts`). Only the latest unpaid statement asks for money and counts in the month's total, at what is left to pay. Paid statements and the open cycle's spend so far are informational markers outside every total and the next-bill pick.
- Advance tax instalment dates on 15 June, 15 September, 15 December and 15 March (`taxBills.ts`, dates from `lib/tax/advanceTaxRules.ts`). They carry no amount, stay outside totals, and link to `/tax`.
- Below the selected-day panel, the Card statements panel (`components/analytics/CardCyclesPanel.tsx`): four tiles (Due on statements, Unbilled so far, Next due, Cash after dues), a per-card table and a paying-account table that stack as cards below `sm`. It renders nothing when the user has no open credit cards, shows an import prompt when cards lack card days, and names closed cards it leaves out.

Data comes from recurring commitments (`GET /api/analytics/v2/recurring-transactions`), `GET /api/card-cycles?history=12` (shared with the panel), and calendar utility calculations. Card days, which only a Money Manager backup import writes, set each cycle. Demo mode answers the cycles from `lib/demo/demoCardCycles.ts`.

## Planning

### Budgets

**Route:** `/budgets`

**Source:** `frontend/src/pages/budget/BudgetPage.tsx`

Displays, in order:

- Category budgets for the current IST month (`components/CategoryBudgets.tsx`, state in `useCategoryBudgets.ts`): a totals band (Budgeted, Spent, Left to spend or Over budget, Need attention), active budgets sorted by usage, and a Paused group. Each row has inline limit and alert-threshold editing, pause or resume, and delete with a confirmation. Rows read On track, Near limit, Over limit (Limit reached at exactly the limit) or Paused. Add budget reuses `CreateBudgetForm`, which Settings > Financial Settings (Budget defaults) also uses.
- The 50/30/20 analysis (`components/BudgetRuleSection.tsx`): Needs, Wants, and Savings cards with target, actual, delta and score for each bucket, grouped category averages, and a sticky period picker (3 mo, 6 mo, 1 yr, 2 yr, 5 yr, All, FY, Custom; 1 yr by default) that applies to this part only.

Sources: `GET /api/analytics/v2/budgets?active_only=false` (`useAllBudgets`), `PATCH` and `DELETE /api/analytics/v2/budgets/{budget_id}` (`useUpdateBudget`, `useDeleteBudget` in `hooks/api/useBudgetMutations.ts`), `POST /api/analytics/v2/budgets` (`useCreateBudget`), and `/api/analytics/v2/spending-rule` for the 50/30/20 part.

Budget writes invalidate every `budgets` query, so the sidebar, mobile tab bar, notification center and Overview refresh with the page. A load failure in either part shows a retry inside that part and leaves the other usable. Demo mode serves the list from `lib/demo/demoBudgets.ts` and answers writes with a demo-mode toast.

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

**Source:** `frontend/src/pages/fire-calculator/FIRECalculatorPage.tsx`

The page has three tabs, each keeping its own edits and results while you switch: FIRE, Retirement and Monte Carlo.

Displays:

- FIRE number.
- Years to FIRE.
- Coast FIRE.
- Savings rate.
- Lean, Barista, Standard, and Fat variants.
- Retirement corpus and contribution projections.
- Monte Carlo tab: success rate, median balances at retirement and at the end age, failure ages, a 10th to 90th and 25th to 75th percentile fan, and an optional equity drawdown stress test.

Inputs include safe withdrawal rate, real return, retirement horizon, Barista income, inflation, and expected nominal return. Defaults are seeded from ledger totals and monthly history where available.

The Monte Carlo tab runs on demand (1,000, 5,000 or 10,000 seeded lifetimes) in a Web Worker built from `src/workers/monteCarlo.worker.ts`, with a main-thread fallback when workers are unavailable. It seeds equity, debt and cash pots from net worth, so it also reads `GET /api/calculations/account-balances`, `GET /api/account-classifications` and `preferences.investment_account_mappings`; those requests start when the tab opens. The engine is `lib/finance/monteCarlo.ts` (see [CALCULATIONS.md](CALCULATIONS.md)).

### Anomaly Review

**Route:** `/anomalies`

**Source:** `frontend/src/pages/AnomalyReviewPage.tsx` with `frontend/src/pages/anomaly-review/`

**Data:** `GET /api/analytics/v2/anomalies`, read three ways: the list with `limit=200` and the type, severity and `include_reviewed` filters; an unfiltered read for the type chips, which is the same request unless a filter is set; and the envelope totals (`count`, `summary`) for the severity tiles. `GET /api/preferences` feeds the detection panel. Reviews use `POST /api/analytics/v2/anomalies/{anomaly_id}/review`.

Anomaly types, in display order:

- Possible Duplicate
- Fee or Interest
- Missing Recurring
- Budget Exceeded
- Closed Account Activity
- Large Transfer
- Unusual Category
- High Expense

Cards sort open first, then by that order, severity and newest month, and render 50 at a time with Show more.

Actions:

- The two review outcomes in the type's own words (`dismiss` false or true); the chosen label becomes the note when none was typed
- Add Note
- A link to the page that owns the fix: commitments, budgets, closed accounts in Settings, or Spending on the category

The type filter lives in the `type` URL parameter, which the per-type chips also set. The page can include reviewed items. The Anomaly Detection panel saves `anomaly_expense_threshold`, `anomaly_types_enabled` and `auto_dismiss_recurring_anomalies` with `PUT /api/preferences/anomaly-settings`, then calls `POST /api/analytics/v2/refresh`. Demo mode builds the list from the demo transactions (`lib/demo/demoAnomalies.ts`, without the missing-entry check) and blocks saves and reviews.

### Review Queue

**Route:** `/review`

**Source:** `frontend/src/pages/review-queue/ReviewQueuePage.tsx`

Reads `GET /api/review-queue?limit=20` with `staleTime` set to infinity and `gcTime` 0, so a later visit never shows cards an earlier one decided. The window is the last 30 days ending on the newest income or expense row (or today when rows run past today), newest first, with transfers and excluded accounts left out.

Actions:

- Keep: swipe right, the Keep button, or K
- Change: swipe left, the Change button, or C. It opens the category picker with the category suggester's picks first
- Undo: the Undo button or U, back through every decision of the visit

Decisions apply at once and save in order in one mutation scope (`PUT /api/review-queue/{transaction_id}` per card, `DELETE` for Undo); a failed save puts its card back on top and closes the picker. The next batch is read once every write settles. One `POST /api/analytics/v2/refresh` runs when the queue ends or the page unmounts after a change, then the ledger and rollup queries are invalidated. States: loading skeleton, `PageErrorState` with Retry, an empty state linking to Upload and Sync when there is no income or expense row, and an end card with the visit's counts and Undo last. Demo mode serves the newest 20 demo rows from `lib/demo/demoReviewQueue.ts` and sends no writes.

### Data Health

**Route:** `/data-health`

**Source:** `frontend/src/pages/data-health/DataHealthPage.tsx`

Displays:

- The last date the ledger covers and how many days since then are unimported.
- Rows processed, inserted, and already present from the most recent import.
- Placeholder-note, uncategorized, and future-dated row counts.
- Whether the analytics rollups are behind the committed transactions, with an in-place recompute action.
- Balance checks per account: a freshness dot, the ledger balance today, and the newest check's verdict. The verdict is one of: matched, off by an amount, rows dated after the check, idle for 30 days, or never checked. Opening an account records, edits or deletes checks and shows a month-by-month coverage grid: months with rows, gaps between the first and last row, and months with checks (`pages/data-health/components/BalanceChecksPanel.tsx`).
- Bank alerts not in your ledger (`components/shared/BankAlertsPanel.tsx`): missing alerts newest first with payee, Debit or Credit, date, bank and last four digits, an After last backup tag, the amount and an Ignore button; an Ignored disclosure with Restore; and, until the first alert arrives, the steps to set up a Bank alert inbox token and a Shortcut.

Primary source: `/api/analytics/v2/data-health`.

Secondary sources: `GET /api/balance-checks` (with `POST`, `PUT` and `DELETE` for checks) and `GET /api/bank-alerts?days=60` (refetched on mount, because a Shortcut adds alerts server-side; `PATCH /api/bank-alerts/{id}` ignores or restores one). Each panel runs its own query, so a failed read shows Try again inside the panel and leaves the rest of the page in place. In demo mode `generateDemoBalanceChecks` builds the checks from the demo ledger with three sample checks, and `generateDemoBankAlerts` builds sample alerts; saving, Ignore and Restore are off.

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
- Withholding to date, which shows the actual payroll TDS from an imported AIS beside the estimate.
- Advance tax planner and Filing calendar panels.

Tax math is client-side and uses versioned fiscal-year tax configuration. Vested RSU rows use a stored vest-date stock price converted at vest-date FX when available; optional net quantity reports sell-to-cover proceeds without changing the gross taxable quantity. Upcoming rows use the configured appreciation assumption.

The estimate states its income basis, regime deduction, FY rules, and any
latest-known fallback. `getStandardDeduction(fy, regime)` defaults to the new
regime for existing callers. The old regime stays at INR 50,000; the new regime
uses INR 75,000 from FY 2024-25. Regime comparison, break-even, effective-rate
charts and their current-regime marker, and previous-year values use the
corresponding regime's rules.

Old-regime deduction inputs load and save through `/api/tax-deductions/{tax_year}` (`hooks/api/useTaxDeductions.ts`), keyed by `taxYearKey(fy)`, such as `2026-27`. `components/useDeductionDraft.ts` keeps unsaved edits per year and passes them to the comparison as they are typed. `DeductionSaveBar` shows the save state with Save deductions and Clear. The capped sections (80C, 80CCD(1B) and 24(b)) draw a `ProgressBar` of the limit used. `lib/tax-config` has an explicit Tax Year 2026-27 entry (Income-tax Act 2025 s.202 and Finance Act 2026, with the same figures as FY 2025-26). It also provides `formatTaxYearLabel(fy)` for the "Tax Year" name from 2026-27, and `TAX_SECTIONS` with `formatSectionRef(key, fy)` for labels such as "s.123 (old 80C)". Demo mode answers the GET from the demo ledger (`generateDemoTaxDeductions`) and blocks Save and Clear with the demo toast.

The Advance tax panel (`components/AdvanceTaxPlanner.tsx` with `AdvanceTaxInstalments.tsx` and `advanceTaxInputs.ts`) renders inside `TaxOverviewSections` after the withholding cards, and the Filing calendar panel (`components/FilingCalendar.tsx`) after `TaxOverviewSections`. They add no queries: they read `useTaxPlanning` (transactions and preferences) and the RSU grants from `preferencesStore`. The rules are in `lib/tax/`: `advanceTaxRules.ts` (the INR 10,000 gate, the instalment dates and `advanceTaxDueDates`), `advanceTax.ts` (the plan, ledger payment matching and s.234C or s.425 interest), `advanceTaxInterest.ts` (s.234B default interest), `taxPayments.ts` (rows named Advance Tax or self-assessment) and `filingDeadlines.ts`. The Withholding to date card reads `GET /api/tax-ais/{tax_year}` for the selected April to March year and links to `/tax/ais`.

### Indirect Tax (GST)

**Route:** `/tax/gst`

**Source:** `frontend/src/pages/gst-analysis/GSTAnalysisPage.tsx`

Estimates indirect tax from categorized expenses and date-aware GST slab rules. Results are estimates because imported bank rows do not contain invoice-level GST components.

### Foreign Assets

**Route:** `/tax/foreign-assets`

**Source:** `frontend/src/pages/foreign-assets/ForeignAssetsPage.tsx`

Lazy and protected, in the Tax nav group. Displays, under a `StickyToolbar` with the calendar-year select and Export CSV:

- The FAST-DS 2026 check card.
- Schedule FA (Table A3 rows per lot, `DataTable` with `mobileCards`).
- The lot ledger (`DataTable` with `mobileCards`).
- Sales and dividends, with an add form (an optional SBI TT buying rate per entry), an action to link a record the worksheet cannot place, and delete.

Data: `GET /api/rsu-tax/lots` first (database only), then `GET /api/rsu-tax/schedule-fa?year=` (previous data kept while the year changes) and `GET /api/rsu-tax/fast-ds`, which wait on market data. Writes: `POST`, `PATCH` and `DELETE /api/rsu-tax/events`. The empty state links to Settings when no vest has happened. Settings > Income and Salary Structure also holds the per-vest Tax value panel (`GET`, `PUT` and `DELETE /api/rsu-tax/vest-fx`). Demo: `lib/demo/demoRsuTax.ts` builds a synthetic stock; the page is read-only there.

### AIS Import

**Route:** `/tax/ais`

**Source:** `frontend/src/pages/ais-import/AisImportPage.tsx`

Displays an unlock card (an AIS JSON drop zone; the PAN and date of birth stay in component state). After a statement opens: a sticky tax-year toolbar, the four totals plus TCS, the ledger reconciliation in both directions, collapsed detail sections (TDS and TCS, interest and dividends, securities and mutual fund transactions, salary annexure, other information) and the saved years.

Decryption (`lib/tax/aisDecrypt.ts`, WebCrypto PBKDF2-SHA256 and AES-256-CBC) and parsing (`lib/tax/aisParser.ts`, `aisFields.ts`, `aisClassify.ts`, `aisSummary.ts`) run in the browser. Reconciliation (`lib/tax/aisReconcile.ts`, with `aisMatch.ts`) reads the year's income rows from `/api/transactions/search` and the income classification preferences. Only `PUT /api/tax-ais/{tax_year}` with four totals leaves the browser; `GET /api/tax-ais` lists saved years and `DELETE /api/tax-ais/{tax_year}` removes one. The Income Tax page's Withholding to date card reads `GET /api/tax-ais/{tax_year}` for the selected year. Demo: `generateDemoTaxAis` answers the GETs, the page offers a sample statement built from the demo ledger, and saving is disabled. In-browser decryption needs WebCrypto, which requires a secure context (GitHub Pages over https and localhost both provide one).

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

The table uses server pagination. Sorting is supported for Date and Amount. There is no inline edit, split, delete, or client virtualization workflow; the Review Queue changes a row's category.

The Views menu pins a saved view to the Dashboard Watchlist (`PUT` and `DELETE /api/saved-views/{view_id}/pin`, up to 8 pins). It reads the same tiles query the Dashboard uses (`components/transactions/useSavedViewPins.ts`).

A Smart search toggle (`aria-pressed`) sits in the search row. When it is on, a Smart search card under the sticky toolbar (`SmartSearchIndexCard`) shows the opt-in, progress (`ProgressBar`), coverage, the pending count, errors and Remove index (`ConfirmDialog`). Once the index has rows, the debounced search text goes to `GET /api/semantic-search` with the page filters, and the table shows up to 50 matches in relevance order (`SmartSearchResults`): pagination is hidden, the date and amount headers re-sort client-side, and Export is disabled with a title. When the server steps aside (a 400, 429 or 503), a notice with Try smart search again appears and the box matches words. Data: `GET /api/semantic-search/status` (`staleTime` 0, so turning the toggle on rechecks), `GET /api/semantic-search` (previous data kept, retry off), and `POST` and `DELETE /api/semantic-search/index` (session-guarded mutations). Demo route: `resolveDemoSemanticSearch`.

Related endpoints:

- `GET /api/transactions`
- `GET /api/transactions/facets`
- `GET /api/transactions/export`
- `PUT /api/transactions/{transaction_id}/tags`
- `/api/saved-views`
- `/api/semantic-search`

### Upload and Sync

**Route:** `/upload`

**Source:** `frontend/src/pages/upload-sync/UploadSyncPage.tsx`

Accepts `.xlsx`, `.xls`, and `.csv`, and Money Manager `.mmbak` backups (below).

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

A Money Manager `.mmbak` backup takes its own flow (`useMoneyManagerImport.ts`).
The browser gzips the file with `CompressionStream` (bodies over 4.5 MB are
refused before sending) and posts it to `/api/upload/money-manager` with
`dry_run=true`. `MoneyManagerReview` shows the backup's transactions,
transfers, accounts and date range with what the import would add, update and
remove, behind a complete-ledger checkbox. Confirming posts the same bytes with
`allow_large_delete=true`. An `unchanged` reply shows "Already up to date" with
a forced re-import, and errors show the backend's detail.

For a backup with repeat rules or budgets, `MoneyManagerReview` adds a Repeat
rules and budgets block (`components/BackupPlanningSummary.tsx`) with the dry
run's counts and skip reasons, and the saved import's summary and toast add what
changed (`describePlanningChanges` in `moneyManagerUtils.ts`). `MoneyManagerShortcutButton`,
above Import History, runs the `Ledger Sync Backup` iOS Shortcut through
`shortcuts://run-shortcut?name=Ledger%20Sync%20Backup` on an iPhone or iPad, then
invalidates the page's queries once when the page is visible again. Elsewhere it
expands the share-sheet steps. It sends no request of its own, so it needs no
demo resolver; in demo mode it shows the demo toast.

When the parsed spreadsheet has rows with a placeholder category, `UploadReview`
renders `UploadCategorySuggestions`. It reads `GET /api/category-suggestions/status`
for the 30-row gate and the placeholder labels, then posts those rows to
`POST /api/category-suggestions` (transfers excluded, at most 2,000 rows, notes
cut at 500 characters). Rows that got a suggestion are listed most confident
first, five at a time, with `CategorySuggestionChips`. The section is read-only,
never edits the rows the upload sends, and hides itself when the status request
fails. Demo mode answers the status GET from the demo ledger
(`lib/demo/demoCategorySuggestions.ts`); spreadsheet upload is blocked there.

### Settings

**Route:** `/settings`

**Source:** `frontend/src/pages/settings/SettingsPage.tsx`

Thirteen sections:

1. Financial Settings
2. Income and Salary Structure (each grant also holds the per-vest Tax value per vest (INR) panel: `GET`, `PUT` and `DELETE /api/rsu-tax/vest-fx`, applied immediately, outside Save)
3. Account Classifications
4. Expense Categories
5. Income Classification (reads `/api/calculations/income-facets` to audit the four `*_income_categories` lists against the ledger: unclassified buckets with their amount, plus saved keys matching no transactions)
6. Categorization Rules
7. Investment Mappings
8. Display Preferences
9. Notifications (alerts for budgets, anomalies and upcoming bills, with an Alerts on this device panel for phone and browser push)
10. Dashboard Widgets
11. AI Assistant
12. Advanced
13. Access Tokens (list, create and revoke the single-purpose `lsu_` tokens: Money Manager upload, Claude MCP read access and Bank alert inbox; up to five active per purpose; actions apply immediately, outside Save)

Only Financial Settings starts expanded. The other twelve sections start collapsed to keep the initial desktop and phone scan compact.

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

App-funded Bedrock chat defaults to Claude Haiku 5.5 (`us.anthropic.claude-haiku-5-5`). The BYOK Bedrock model list offers Claude Haiku 5.5, which is preselected, and Claude Sonnet 5.5, with a hint that `us.` model IDs work from US regions and other regions should paste the model's `global.` ID.

Notifications adds an Alerts on this device panel below the saved toggles (`PushAlertsPanel.tsx`, `PushDeviceList.tsx`, `PushStatus.tsx`). Its actions apply at once, outside Save. It reads `GET /api/push/config` and `GET /api/push/subscriptions` plus the browser's PushManager state (`services/api/pushDevice.ts`), and writes with `POST /api/push/subscriptions`, `DELETE /api/push/subscriptions/{id}` and `POST /api/push/test`; sign-out calls `POST /api/push/subscriptions/unsubscribe` first. The panel names the missing server variables when push is off, shows a support hint for the device (Add to Home Screen on an iPhone or iPad outside the Home Screen app, iOS 16.4 or later, an unsupported browser, blocked notifications, or no service worker in local development), then the tap-gated Turn on alerts on this device button, Send a test, and a Devices with alerts on list (N of 10: label, This device, Added, Last alert, Remove). `public/push-sw.js` is loaded into the generated Workbox worker for the `push` and `notificationclick` handlers. Demo mode shows a read-only note and answers the two GETs from `lib/demo/demoPush.ts`.

Access Tokens (`UploadTokensSection`) shows a purpose picker (radio cards, stacked until `lg` and three columns from there, each with its "N of 5 active" count), a usage note per purpose (the upload POST URL, the MCP URL with its data and OAuth notes, or the alert inbox header), the token name field, and the active token list with a purpose badge per row. The revoke confirmation and the one-time reveal dialog are worded per purpose; a Claude MCP read token also gets the copy-ready `claude mcp add` command. It reads `GET /api/upload-tokens` (disabled in demo mode, where the create controls are off) and writes with `POST` and `DELETE /api/upload-tokens`.

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
mutations are blocked and explain that sign-in is required. Goals and Review
Queue decisions have a page-local path that resets on remount. OAuth initiation still reaches
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

The same registry is served as read-only MCP tools at `POST /mcp`, plus an MCP-only `get_today` helper, to a client holding a Claude MCP read access token (Settings > Advanced > Access Tokens). `POST /mcp` sits outside `/api`; claude.ai web connectors are not supported because they need an OAuth sign-in.

### Currency

Display conversion uses the selected currency and cached exchange rates.
New imports accept INR source amounts only. Changing display currency does not
rewrite ledger rows or convert a foreign-currency source file into a supported
snapshot.

## Known Boundaries

- No direct bank account synchronization.
- No PDF bank statement parser. A mutual fund CAS PDF is parsed on the server for the Investment Analytics import.
- No persisted transaction edit, split, or delete UI beyond Review Queue category fixes.
- No invoice-level GST extraction.
- No continuous mutual-fund NAV feed. CAS holdings fetch AMFI's NAV on demand, at most once a day.
- Cost-basis statements do not establish live portfolio values or actual returns; only CAS holdings carry market value.
