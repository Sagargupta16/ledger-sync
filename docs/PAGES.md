# Pages Reference — Data Catalog

A functional tour of every page in Ledger Sync focused on **what data each one shows, where that data comes from, and what decisions it helps you make**. This is the document to read when you want to answer _"what can I actually learn from this app?"_ rather than _"how is it built?"_ For architecture, see [architecture.md](architecture.md); for API shapes, see [API.md](API.md).

Every value shown on every page is derived from:

1. Your **uploaded transactions** (Excel / CSV → parsed client-side → JSON to `/api/upload` → deduplicated by SHA-256 hash of `date+amount+category+account`).
2. Your **user preferences** — fiscal-year month, 50/30/20 targets, essential categories, salary structure, RSU grants, growth assumptions, credit-card limits, etc.
3. **Pre-aggregated analytics tables** refreshed synchronously after each upload (`monthly_summaries`, `category_trends`, `fy_summaries`, `net_worth_snapshots`, `recurring_transactions`, `goals`, `budgets`, `anomalies`, `merchant_intelligence`, `daily_summaries`). These exist because Neon free tier is slow on ad-hoc aggregation across the full transaction table.
4. **Live read endpoints** — exchange rates (frankfurter.dev, 24 h cache), stock prices (Yahoo Finance via backend proxy).

No third-party financial data feeds — everything you see is inferred from the transactions _you_ upload. That's the whole product.

---

## Page index

| Tab / Route | Page | What it answers |
|---|---|---|
| **Home** | [`/dashboard`](#dashboard) | "What happened this month at a glance?" |
| **Txns** | [`/transactions`](#transactions) | "Give me the raw ledger." |
| **Flow** | [`/income-expense-flow`](#cash-flow--sankey) | "Where did my income actually go?" |
| More → Analytics | [`/spending`](#expense-analysis) | "Am I overspending, and on what?" |
| More → Analytics | [`/income`](#income-analysis) | "Where does my money come from?" |
| More → Analytics | [`/comparison`](#comparison) | "How does this month / FY compare to last?" |
| More → Analytics | [`/year-in-review`](#year-in-review) | "Full-year retrospective." |
| More → Net Worth | [`/net-worth`](#net-worth) | "What am I actually worth today?" |
| More → Net Worth | [`/forecasts`](#trends--forecasts) | "Where is my wealth trending?" |
| More → Investments | [`/investments/analytics`](#investment-analytics) | "How is my portfolio doing?" |
| More → Investments | [`/investments/sip-projection`](#mutual-fund-sip-projections) | "What will my SIPs be worth later?" |
| More → Investments | [`/investments/returns`](#returns-analysis) | "Which holdings are winners?" |
| More → Tracking | [`/subscriptions`](#recurring--subscriptions) | "What's auto-draining my account?" |
| More → Tracking | [`/bill-calendar`](#bill-calendar) | "What's due when?" |
| More → Planning | [`/budgets`](#budgets) | "Am I staying within limits this month?" |
| More → Planning | [`/goals`](#goals) | "How close am I to my savings goals?" |
| More → Planning | [`/fire-calculator`](#fire-calculator) | "When can I retire?" |
| More → Planning | [`/anomalies`](#anomaly-review) | "Did anything weird happen?" |
| More → Tax | [`/tax`](#income-tax-planning) | "What will I owe this FY?" |
| More → Tax | [`/tax/gst`](#gst-analysis) | "What indirect tax did I pay?" |
| More → Data | [`/upload`](#upload--sync) | "How do I add more data?" |
| More → Data | [`/settings`](#settings) | "Configure the app." |

All pages share a top-right **Analytics Time Filter** (except Upload, Settings, More) — toggle between View modes: **All Time**, **Fiscal Year**, **Month**, **Custom Range**. The selected range drives every chart and KPI on that page.

---

## Dashboard

**Route:** `/dashboard` · **Tab:** Home · [DashboardPage.tsx](../frontend/src/pages/DashboardPage.tsx)

The at-a-glance summary for the selected time range (default: current month). Four blocks, top to bottom:

### 1. Quick Insights strip

Six small metrics driven by the transaction feed:

| Metric | How it's computed |
|---|---|
| **Age of Money** | Days of expenses the current cash balance could sustain at the trailing-90-day average burn rate |
| **Days of Buffering** | Consecutive days the cash pile survives monthly fixed commitments |
| **Fixed Commitments / month** | Sum of categories marked as **fixed** in Settings → Expense Categories (rent, EMIs, insurance, utilities, etc.) |
| **Fixed count** | Number of fixed expense rows this month |
| **MoM changes** | For each category, % change vs last month — flags the 3 biggest jumps (arrow + %) |

Configurable via the **Dashboard Widgets** section in Settings (hide/show any of 14 KPIs). All KPIs are derived on the fly from the filtered transaction list.

### 2. Financial Health Score

An 8-metric score across 4 pillars (Spend / Save / Borrow / Plan), each pillar scored 0–100 and averaged to a single headline. Metrics:

- **Spend**: savings rate, fixed commitments ratio
- **Save**: emergency fund months, net worth trajectory
- **Borrow**: credit-card utilization, DTI
- **Plan**: recurring predictability, goal progress

The score re-renders instantly when you change the time filter. See [CALCULATIONS.md](CALCULATIONS.md) for the per-metric formulas.

### 3. Income Sources / Expense Sources

Twin pie charts (treemap on wider screens) of the top categories feeding this period's totals. Hover tooltip shows `₹ amount (% of total)`. Click a slice to jump to the Spending/Income Analysis page pre-filtered to that category.

### 4. Recent trends block

Stacked area chart of Income vs Expense over the last 12 months (or the current FY when filter is set to FY). Pulls from `monthly_summaries` so it's a constant-time read regardless of how many transactions you have.

**Empty state:** when the user has no transactions yet, the whole page is replaced with a call-to-action card linking to [Upload & Sync](#upload--sync).

---

## Transactions

**Route:** `/transactions` · **Tab:** Txns · [TransactionsPage.tsx](../frontend/src/pages/TransactionsPage.tsx)

The raw ledger — one row per imported transaction. The most-visited page after Dashboard.

### Columns

Date · Description · Category · Subcategory · Account · Type (Income / Expense / Transfer / Investment) · Amount · Hash (for debugging duplicates)

### Filters

- **Search box** — full-text across description / category / account
- **Type** — show only Income / Expense / Transfer / Investment
- **Category / Subcategory** chips — multi-select
- **Account** multi-select
- **Amount range**
- **Date range** — inherits from Analytics Time Filter but can be overridden per page

All filters combine with AND. Count indicator at the top shows `N transactions` after filtering.

### What each row lets you do

- **Edit** — change category / subcategory / type inline (the backend updates just that row; dependent pre-aggregated tables are recomputed on next refresh)
- **Delete** — soft delete (sets `is_deleted = true`). Deleted transactions stay in the DB but are excluded from every aggregation
- **Split** — break one transaction into multiple child transactions (e.g., a generic "Amazon ₹5000" → "Amazon — Groceries ₹3000" + "Amazon — Home ₹2000")

### Sort

Click any column header. Default sort is date descending. Sort state is stored in the table's local state — no URL sync.

### Virtualization

The table uses row windowing via `@tanstack/react-table`, so loading 10 000+ transactions stays responsive.

---

## Cash Flow (Sankey)

**Route:** `/income-expense-flow` · **Tab:** Flow · [IncomeExpenseFlowPage.tsx](../frontend/src/pages/income-expense-flow/IncomeExpenseFlowPage.tsx)

The flagship visualisation — a Sankey diagram that shows income sources flowing into categories:

```
[Salary]     ──┐
[Dividends]  ──┤                   ┌── Rent
[RSUs]       ──┤                   ├── Food
                ▶ [Total Income] ──▶── Transport
[Interest]   ──┤                   ├── Investments
[Gifts]      ──┘                   └── Savings
```

### Desktop

Interactive Recharts Sankey with hover-to-highlight and a legend (Income / Middle / Expense colour families). Node labels read e.g. `Rent  ₹24 500 (18.2 %)`.

### Mobile

The Recharts Sankey doesn't scale down — phones get a dedicated **vertical flow view** (cards stacked top-to-bottom) showing:

1. Top 10 income sources
2. "↓" dividing band with net savings + savings rate
3. Top 10 expense categories

### Data source

Filtered transaction list grouped by `type = 'Income'` and `type = 'Expense'`, then top-10 by amount per side. Transfers and Investments are excluded.

---

## Expense Analysis

**Route:** `/spending` · [SpendingAnalysisPage.tsx](../frontend/src/pages/spending-analysis/SpendingAnalysisPage.tsx)

A deep dive on where your money is going. Four stacked sections:

1. **50/30/20 panel** — your Needs (fixed + essential), Wants (everything else), Savings as stacked bars vs your target percentages (50/30/20 default; configurable in Settings → Financial Settings)
2. **Category treemap** — rectangles sized by spend, colored by parent category. Click a rectangle to drill into its subcategories
3. **Monthly trend** — line chart of total expense month-over-month for the selected window
4. **Top 10 merchants** — ranked by `SUM(amount)` across the window, sourced from `merchant_intelligence` pre-aggregated table when all-time, from raw transactions when a date range is active

### Controls

- **"Needs / Wants / Savings" toggle** — filter the rest of the page to a single bucket
- **Include transfers toggle** — off by default; turn on to count internal movements as spend (rare)

---

## Income Analysis

**Route:** `/income` · [IncomeAnalysisPage.tsx](../frontend/src/pages/income-analysis/IncomeAnalysisPage.tsx)

The income counterpart to Expense Analysis. Breaks your income into four tax-relevant buckets (user-configurable in Settings → Income Classification):

- **Taxable** — salary, bonus, RSU vests, consulting
- **Investment returns** — dividends, interest, capital gains, F&O
- **Non-taxable** — cashback, refunds, reimbursements, deposit returns
- **Other** — gifts, prizes, EPF contributions, balancing entries

### Views

- **Pie of buckets** — proportion of gross income in each bucket
- **Monthly trend** — stacked area chart by bucket for the window
- **Source table** — every income subcategory, grouped by bucket, sorted by total

The taxable bucket feeds directly into [Tax Planning](#income-tax-planning); the investment bucket feeds [Returns Analysis](#returns-analysis).

---

## Comparison

**Route:** `/comparison` · [ComparisonPage.tsx](../frontend/src/pages/comparison/ComparisonPage.tsx)

Side-by-side view of two periods. Pick "This Month vs Last Month" / "This FY vs Last FY" / "Custom A vs Custom B" from the range picker. For each KPI (income, expense, savings, savings rate, net worth change), the page shows A, B, Δ, and %Δ with green/red colouring.

Three charts below:

1. **Category delta** — bar chart of `spend_A − spend_B` per category; positive (spent more) = red, negative = green
2. **Trend overlay** — A and B plotted on the same x-axis normalized to day-of-period, so a 31-day month and a 28-day month align
3. **Top movers table** — the 10 categories that changed most in absolute terms

---

## Year in Review

**Route:** `/year-in-review` · [YearInReviewPage.tsx](../frontend/src/pages/year-in-review/YearInReviewPage.tsx)

A Spotify-Wrapped-style retrospective for the selected calendar year (defaults to current FY).

Sections rendered top to bottom as a scroll narrative:

1. **Hero KPIs** — total income, total expense, savings rate, net worth change
2. **Spending heatmap** — 52×7 grid (one cell per day), coloured by spend intensity. Sourced from `daily_summaries` table
3. **Peak day / peak month / peak merchant** — highest single-day spend, highest-spend month, most-frequented merchant
4. **Category of the year** — the category that grew most and the category that shrank most
5. **Milestones** — achievements detected from your data: _"Crossed ₹10L savings"_, _"Paid off EMI"_, _"First investment month"_, etc.
6. **Fun facts** — weekend vs weekday spend, early-month vs late-month, biggest single transaction, longest streak without dining out, etc.

All data is derived from the transaction table + `fy_summaries` + `daily_summaries` for that year.

---

## Net Worth

**Route:** `/net-worth` · [NetWorthPage.tsx](../frontend/src/pages/net-worth/NetWorthPage.tsx)

Your balance sheet right now.

### Composition

Two donut charts side by side:

- **Assets** (green palette): Cash & Bank · Stocks · Mutual Funds · Fixed Deposits · PPF/EPF · Other Assets
- **Liabilities** (red palette): Credit Card Outstanding · Loans Payable

### KPIs

- **Net Worth** = Assets − Liabilities
- **Liquid Net Worth** = Cash/Bank + Stocks + MF (excludes locked PPF/EPF and FDs)
- **Debt-to-Asset ratio**
- **Emergency-fund months** = Cash balance ÷ monthly average fixed expenses

### Trend chart

Daily net-worth line over the last 3 / 6 / 12 / 24 months, reading from `net_worth_snapshots`. A snapshot is taken after every upload.

### Bucket logic

Accounts are placed into buckets using your **Account Classifications** (Settings → Account Classifications). The default classification is inferred from account name keywords + balance sign (negative balance without "loan" keyword → Credit Card) — you can drag-drop to reclassify at any time.

---

## Trends & Forecasts

**Route:** `/forecasts` · [TrendsForecastsPage.tsx](../frontend/src/pages/trends-forecasts/TrendsForecastsPage.tsx)

Looks backward (trends) and forward (projections).

### Backward

- **Net worth growth** — monthly snapshots from `net_worth_snapshots` + linear-regression trendline
- **Income / Expense / Savings** monthly stacks
- **Category drift** — 12-month slope per category, sorted by fastest-growing

### Forward

- **Net worth projection** — extrapolates the regression forward 6 / 12 / 24 months with confidence band
- **Savings target tracker** — at current burn rate + savings rate, when will you hit your next goal (fed by [Goals](#goals))

### Growth assumptions

Uses `growth_assumptions` from user preferences (expected salary growth %, investment return %, inflation %). Change them in Settings → Salary Structure → Growth Assumptions.

---

## Investment Analytics

**Route:** `/investments/analytics` · [InvestmentAnalyticsPage.tsx](../frontend/src/pages/investment-analytics/InvestmentAnalyticsPage.tsx)

Portfolio overview.

### Summary cards

- **Invested capital** — cumulative inflows to investment-classified accounts
- **Current value** — latest `current_value` from `investment_holdings` (computed as `invested + realized_gains` today; no live market prices yet)
- **Realized gains** — redemptions minus investments for each account, aggregated
- **Overall return** — `(current_value - invested) / invested`

### Breakdown

Grouped by investment type (MF / PPF-EPF / FD / Stocks / Gold / Crypto / Real Estate / Other). For each type: invested, current value, gain, gain %.

### Holdings table

Every investment account with: name, type, invested, current value, gain, gain %, last updated.

### Mapping

Investment accounts auto-map to types from their name (e.g. "Groww MF" → mutual_funds, "Zerodha Stocks" → stocks). Override any mapping in Settings → Investment Mappings.

---

## Mutual Fund / SIP Projections

**Route:** `/investments/sip-projection` · [MutualFundProjectionPage.tsx](../frontend/src/pages/mutual-fund-projection/MutualFundProjectionPage.tsx)

Future-value calculator for SIPs and lump sums.

### Inputs

- Monthly SIP amount
- Initial investment (lump sum, optional)
- Expected annual return %
- Years

### Outputs

- Maturity value, total invested, wealth gained
- Year-by-year table + line chart of corpus growth
- Real-return toggle (subtracts your configured inflation from the nominal return)

Pure client-side math in `projectionCalculator.ts`.

---

## Returns Analysis

**Route:** `/investments/returns` · [ReturnsAnalysisPage.tsx](../frontend/src/pages/returns-analysis/ReturnsAnalysisPage.tsx)

Which of your investment accounts has actually made money?

### Ranking table

Per investment account: invested · current value · realized gains · unrealized gains · total return · XIRR (if computable).

### Winners / losers

Top 5 and bottom 5 by absolute gain. Flagged accounts: "Underwater" (losing money), "Dormant" (no flows in 12+ months).

### XIRR

Computed using the Newton-Raphson method over the account's full cash-flow history. Falls back to annualized CAGR if XIRR fails to converge.

---

## Recurring / Subscriptions

**Route:** `/subscriptions` · [SubscriptionTrackerPage.tsx](../frontend/src/pages/subscription-tracker/SubscriptionTrackerPage.tsx)

Auto-detected recurring payments — subscriptions, EMIs, rent, utilities.

### Detection

Backend scans your transaction history for items that repeat within a tolerance band (same account + same category + amount within ±10 % of median + occurs ≥ 3× in ≥ 2 different months). Results cached in `recurring_transactions`.

### Columns

Name · Category · Account · Frequency (monthly / weekly / yearly) · Expected amount · Variance · Expected day-of-month · Confidence % · Occurrences · Last occurrence · Next expected · Times missed · Active

### What you can do

- **Confirm** — mark a detected recurring item as yours (boosts confidence)
- **Dismiss** — not a real recurring payment (removes it from the list)
- **Edit** — rename, adjust expected amount
- **Deactivate** — you've cancelled the subscription; stop counting it as expected

Confirmed + active items populate the **Bill Calendar** and the **Next expected** predictions on the Dashboard.

---

## Bill Calendar

**Route:** `/bill-calendar` · [BillCalendarPage.tsx](../frontend/src/pages/bill-calendar/BillCalendarPage.tsx)

Month-view calendar of upcoming bills and past recurring payments.

### Month grid

Each cell shows expected / paid bills for that date with:

- Past-due indicator (red dot) — expected but no payment seen
- Paid indicator (green check) — transaction matched the expected amount
- Amount variance (yellow pill) — paid but > 10 % different from expected

### Side panel

- **Today's bills**
- **This week**
- **Missed / Overdue** — bills that should've cleared but haven't
- **Total due this month**

---

## Budgets

**Route:** `/budgets` · [BudgetPage.tsx](../frontend/src/pages/budget/BudgetPage.tsx)

Monthly category budgets with live tracking.

### Rows

Per category: Budget amount · Spent · Remaining · % used · status badge (On track / Warning / Over)

### Bar

A stacked bar across all budgets showing total budget vs total spent vs projected-month-end.

### Settings

- **Auto-create budgets** (Settings → Financial Settings) — set a default budget for every category based on your trailing 3-month average
- **Alert threshold** — when Spent ÷ Budget crosses this (default 80 %), the budget is flagged on the Dashboard and in the budget list
- **Rollover** — if enabled, unused budget from month N rolls into month N+1 for that category

All budgets live in the `budgets` table and are month-scoped.

---

## Goals

**Route:** `/goals` · [GoalsPage.tsx](../frontend/src/pages/goals/GoalsPage.tsx)

Savings goals with progress tracking.

### Per goal

- **Name** (e.g. "Down payment", "Emergency fund", "Vacation 2027")
- **Target amount** and **Target date**
- **Linked account(s)** — balance in these accounts counts toward the goal
- **Progress bar** — current balance / target
- **On-track indicator** — at current monthly contribution, will you hit the target by the date? (Green / Yellow / Red)
- **Required monthly** — what you'd need to save from now to hit the target on time

Stored in the `goals` table. The "current balance" is recomputed on every net-worth snapshot.

---

## FIRE Calculator

**Route:** `/fire-calculator` · [FIRECalculatorPage.tsx](../frontend/src/pages/FIRECalculatorPage.tsx)

"When can I retire?" modelled on the FIRE (Financial Independence, Retire Early) framework.

### KPIs

- **FIRE number** = annual expenses × (1 / SWR) — default SWR 4 %
- **Coast FIRE** — corpus that if left alone (no further contributions) grows to your FIRE number by retirement age
- **Years to FIRE** — at current savings rate + real return, how long until your corpus ≥ FIRE number
- **Savings rate** — monthly net savings / monthly gross income

### Inputs

- Current age · Retirement age
- Current corpus (auto-filled from net worth)
- Monthly expenses (auto-filled from trailing 12-month average)
- Real return % · Inflation % (from growth assumptions)
- SWR % (default 4, adjustable)
- FIRE variant: Lean (1× expenses) / Standard (1.5×) / Fat (2×)

### Outputs

- Projection chart: corpus over years, with horizontal bands at Coast FIRE, FIRE number, Fat FIRE
- Year-by-year table: age, contributions, growth, corpus, passive income at SWR

Pure client-side calculation — no backend call.

---

## Anomaly Review

**Route:** `/anomalies` · [AnomalyReviewPage.tsx](../frontend/src/pages/AnomalyReviewPage.tsx)

Unusual transactions flagged by the backend, awaiting your review.

### Detection types

- **Duplicate** — same amount + category + account within 2 days (likely accidental re-upload)
- **Unusual amount** — transaction amount > 3× the category's trailing-90-day median
- **Unusual category** — a category that hasn't appeared in 6 months suddenly reappears
- **Missing recurring** — an expected recurring payment didn't occur

### Review actions

- **Confirm** — mark as legitimate, suppress future same-pattern anomalies
- **Delete** — soft-delete the underlying transaction
- **Edit** — change the category to something more fitting
- **Ignore** — dismiss without confirming or deleting

Anomalies live in `anomalies` table with `review_status` (`pending` / `confirmed` / `dismissed`).

---

## Income Tax Planning

**Route:** `/tax` · [TaxPlanningPage.tsx](../frontend/src/pages/tax-planning/TaxPlanningPage.tsx)

India-specific income tax estimator for the selected financial year (Apr–Mar).

### Sections

1. **Gross taxable income** — sum of subcategories classified as `taxable_income_categories` in Settings → Income Classification, broken into Salary / Perks / Other Taxable
2. **Deductions** — Standard deduction (₹50 000), 80C (PF contributions + ELSS + PPF detected from transactions, capped at ₹1.5L), HRA if rent category present, Section 80D (health insurance), 24(b) (home loan interest)
3. **Old vs New regime** — side-by-side slab breakdown. The "better regime" is highlighted
4. **Final tax** — tax after cess (4 %) and surcharge (if applicable), plus effective tax rate

### Salary projection

If you've filled **Settings → Salary Structure + RSU Grants + Growth Assumptions**, a second section projects tax for the current FY + next N FYs with RSU vesting schedule accounted for.

### Data sources

- Your `taxable_income_categories` classification
- `salary_structure` (Basic, HRA, Special, PF, Insurance, etc.)
- `rsu_grants` (grant date, vests, price, RSU-tax classification)
- `growth_assumptions.salary_growth_rate`

All math in [projectionCalculator.ts](../frontend/src/lib/projectionCalculator.ts) + [taxCalculator.ts](../frontend/src/lib/taxCalculator.ts).

---

## GST Analysis

**Route:** `/tax/gst` · [GSTAnalysisPage.tsx](../frontend/src/pages/gst-analysis/GSTAnalysisPage.tsx)

Estimates indirect tax (GST) you've paid on expenses this FY.

Assumes standard Indian GST rates per category (e.g. restaurants 5 %, electronics 18 %, alcohol 28 %) and applies them against your spend per category. The result is an approximation — GST isn't line-itemed in bank statements — but it gives you a ballpark of "taxes-within-taxes" paid.

---

## Upload & Sync

**Route:** `/upload` · [UploadSyncPage.tsx](../frontend/src/pages/upload-sync/UploadSyncPage.tsx)

Drag-and-drop interface for bringing in transaction data.

### Accepted formats

Excel (`.xlsx`, `.xls`) and CSV. Column mapping is flexible — the parser looks for common headers (date, amount, description, category, account) and synonyms. Unmapped columns are ignored.

### Four-phase UX

1. **Parsing** — SheetJS loads in-browser (lazy-imported from CDN to avoid npm supply-chain risk)
2. **Processing** — rows are validated, hashed, and sent to `/api/upload` as JSON
3. **Reconciling** — backend compares hashes with existing transactions (SHA-256 of date+amount+category+account); new rows are inserted, duplicates are skipped
4. **Refreshing analytics** — `POST /api/analytics/v2/refresh` recomputes all pre-aggregated tables

Safe to re-upload — duplicates are idempotent.

### Data preview

After parsing, before submitting, you see a preview table of the first 50 rows with any mapping conflicts highlighted. You can adjust column mapping there.

---

## Settings

**Route:** `/settings` · [SettingsPage.tsx](../frontend/src/pages/settings/SettingsPage.tsx)

Eleven collapsible sections. Since v2.7 every section starts collapsed so the page opens as a clean table of contents.

| Section | What it controls |
|---|---|
| **Account Classifications** | Which bucket each account belongs to (Bank / Credit Card / Investments / Cash / Loans / Other) — drives Net Worth bucketing. Auto-classified from name keywords + balance sign; drag-drop to override |
| **Investment Mappings** | Per-investment-account, which type it belongs to (stocks / MF / PPF-EPF / FD / gold / crypto / real estate / other) |
| **Expense Categories** | Which categories are "fixed" (rent, EMIs, etc.) vs "variable" — drives the Fixed Commitments metric and 50/30/20 split |
| **Income Classification** | Per income subcategory, which tax bucket (taxable / investment returns / non-taxable / other). Auto-classifies known subcategories by name |
| **Salary Structure** | CTC components (Basic, HRA, Special, PF, etc.) for tax projection; growth assumptions; RSU grants with vesting schedule |
| **AI Assistant** | Choose **App mode** (shared Bedrock key, 10 msgs/day free) or **BYOK** (paste your own OpenAI/Anthropic/Bedrock key for unlimited use); set per-user token limits when BYOK |
| **Financial Settings** | Fiscal year start month, 50/30/20 targets, auto-budget, budget alert threshold, preferred tax regime, savings goal %, earning start date |
| **Display Preferences** | Currency, currency symbol position, number format, default time range, theme |
| **Notifications** | Budget alerts · Anomalies · Upcoming bills — each on/off + days-ahead lead time |
| **Advanced** | Anomaly types enabled + threshold, credit card limits (per card), excluded accounts (won't appear in analytics) |
| **Dashboard Widgets** | Which of the 14 Quick Insight KPIs appear on the Dashboard (6 on by default) |

### Reset

A top-level "Reset to Defaults" button resets every preference but **preserves account classifications** — the latter are expensive to redo by hand.

---

## Home / Landing

**Route:** `/` · [HomePage.tsx](../frontend/src/pages/home/HomePage.tsx)

Pre-auth landing page (shown to logged-out visitors):

- Hero copy and CTA (**Get Started** / **Try Demo**)
- Feature highlights
- Mock dashboard preview
- **Try Demo** button — enters demo mode with ~500 seeded transactions, so you can explore every page without signing up

When already signed in, `/` redirects to `/dashboard`.

---

## More

**Route:** `/more` · [MorePage.tsx](../frontend/src/pages/MorePage.tsx)

Phone-only grid menu for every page that didn't earn a bottom-tab slot. Grouped by domain (Analytics / Net Worth / Investments / Tracking / Planning / Tax / Data) with a sign-out button at the bottom. Desktop users navigate via the sidebar instead.

---

## Cross-page mechanics

### Demo mode

`/demo` bootstraps a fully-populated in-memory dataset of ~500 Indian-household-model transactions, all 11 preference JSONs, recurring / net-worth / merchant / goal / budget / anomaly records. No backend calls are made — every API hook is short-circuited via a `demoStore` flag. Mutations (upload, save settings, add goal, etc.) are blocked with a toast that suggests signing up.

### AI chatbot (floating widget)

A sparkle-icon button bottom-right on every authenticated page. When open, a 70 dvh-tall chat panel slides in. Two modes:

- **App mode** — calls `/api/ai/bedrock/chat` using the server-configured Bedrock key. 10 messages/day cap per user.
- **BYOK mode** — browser-direct calls to OpenAI/Anthropic (or server-proxied for Bedrock). Per-user daily/monthly token caps configurable.

The bot has **15 read-only tools** it can invoke: `list_accounts`, `search_transactions`, `get_monthly_summary`, `list_categories`, `get_category_spending`, `get_net_worth`, `list_recurring`, `list_goals`, `list_recent_months`, `get_fy_summary`, `list_budgets`, `get_savings_rate`, `get_top_merchants`, `get_transfer_flows`, `get_investment_holdings`. It picks tools based on your question. Every tool is user-scoped — the LLM can't see another user's data.

### Analytics Time Filter

Shared component shown in the top-right of every analytics page. State lives in each page's `use<Page>.ts` hook; the filter itself is stateless. Options:

- **All Time** (default for Net Worth / Trends)
- **Fiscal Year** (default everywhere else) — uses your configured FY start month
- **Month** — pick year + month
- **Custom Range** — two date pickers

### Currency & Exchange Rates

Settings → Display Preferences → Currency sets the display currency (15 options). If not INR, every amount is converted using the latest exchange rate from frankfurter.dev (24 h cache). The underlying transaction amounts are always stored in the source currency — conversion is display-only.

---

## What this app _does not_ do

Deliberately outside scope:

- No automatic bank syncing (no Plaid / SaltEdge / account aggregator integration). You upload Excel statements, period.
- No receipt scanning / OCR.
- No debt payoff planners (avalanche / snowball) — yet.
- No multi-user households — every account is single-user.
- No live market prices for mutual funds / stocks. Investment "current value" is approximated as `invested + realized_gains` only.
- No budget alerts via email/push — the Budgets and Anomaly Review pages show breaches, but no push notifications yet.
