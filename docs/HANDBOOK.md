# Ledger Sync Handbook

User guide for the current Ledger Sync workspace.

Checked against the frontend source on 2026-09-09. For exact routes and data sources, see [PAGES.md](PAGES.md). For formulas, see [CALCULATIONS.md](CALCULATIONS.md). For request contracts, see [API.md](API.md).

## Start Here

Open the public Home page and choose one of these paths:

- **Sign in** or **Get started free** opens the OAuth dialog.
- **Explore demo** opens a seeded sample workspace without an account.
- **Open workspace** or **Open dashboard** appears when already authenticated.
- **See capabilities** moves to the product capabilities section.

Google and GitHub buttons appear only when the backend reports those providers as configured.

Finish sign-in in the same browser tab where you started it. Attempts expire
after ten minutes and work once. If the callback says the attempt expired or
does not match, choose **Sign in again** to start a fresh attempt. **Return
home** leaves the recovery screen without signing in.

After a sign-in update, an older open tab may ask you to refresh and choose
Sign in again. The restart path begins a fresh attempt in the current app;
the previous code and state cannot be reused. A cached PWA shell may need
that refresh after its update.

If the dialog says it could not reach the sign-in service, use Try again once. If it keeps failing, check the backend and database health endpoints described in [DEPLOYMENT.md](DEPLOYMENT.md#sign-in-incident-runbook).

## Workspace Layout

### Desktop

The left sidebar contains:

- Dashboard, Overview, and Transactions at the top.
- Analytics, Wealth, Commitments, Planning, and Tax groups.
- A utility area with currency, theme, and motion controls, followed by Upload and Sync, Settings, and sign out.
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

Settings and the sidebar theme control switch between Light and Dark. Before you choose, the app follows your operating system setting. Switching themes keeps the current page, filters, tabs, searches, and form values in place while charts redraw with the resolved palette.

### Motion

The sidebar motion control and Display Preferences switch between Full and Reduced motion. The choice is stored on this device and applies immediately without resetting the current page, filters, or form values.

### Data errors and recovery

Financial pages distinguish loading, empty, and failed requests. A failed request keeps the page title visible and shows Try again; it does not replace missing data with zero balances or an empty ledger. Settings uses the same recovery behavior for initial preference loading. Upload and Sync keeps file-specific parsing and upload failures beside the selected file so the exact operation can be retried.

## Recommended Workflow

1. Sign in with Google or GitHub.
2. Open Upload and Sync.
3. Review and confirm an Excel or CSV export containing your complete ledger.
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
- Currency, optional and defaults to INR; other source currencies are rejected

Supported transaction types are Income, Expense, Transfer-In, and Transfer-Out.

After selection:

1. The page parses and validates the complete file.
2. Review the source row counts, date range, currency, and accounts.
3. Confirm that this export contains your complete ledger, including all dates and accounts you want to retain.
4. The backend validates every row and saves reconciliation and import history together.
5. Analytics refresh separately, and the workspace reloads affected data.

This is a full snapshot replacement. Existing rows missing from the selected
file are soft-deleted, even if they belong to another account or an earlier
date. Use a complete export instead of a statement containing only a new month.
An invalid row rejects the batch before ledger changes.

An already imported file produces a conflict prompt. Force Reupload returns
to review and still requires confirmation of the complete snapshot.

If the ledger is saved but analytics fail, use **Retry insights refresh** to refresh
insights without uploading again. If the upload times out, check Import History
before retrying because the save may already have completed.

Import history below the upload area lists the most recent runs with local-time
timestamps and processed, new, updated, and already-present row counts. It is
account-scoped and is hidden in demo mode, where no server-side imports occur.

The review summarizes the selected snapshot; it is not a row editor or
column-remapping screen. The table below the drop zone remains an
expected-format example, not imported data.

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

A grouped bar panel compares income and spending for each complete month in the
selected period. The current in-progress month is excluded and named below the
chart so partial income is not compared with near-complete fixed costs.

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

The Savings card here is income minus expenses, scored against your Savings Goal
in Settings. The Budget Rule page shows a Savings card too, but it counts only
money you moved into investment accounts and scores it against the Spending
Rule's Savings percentage. The two numbers answer different questions and will
not match; each card names its own definition and target.

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

The page shows book-value contributions, portfolio asset count, recorded
investment P and L, the largest holding, an optional monthly target,
allocation, growth, and an account table. These are cost-basis figures. The page explains why portfolio
return and XIRR require market valuations that the imported statements do not
contain.

### Projections

**Route:** `/investments/sip-projection`

Adjust:

- Current portfolio value
- Monthly SIP
- Annual SIP step-up
- Expected return
- Projection period

The page combines detected contribution history with projected invested value
and growth. Enter a current market value to compute the historical Total
Return and XIRR tiles; without it, those tiles ask for a valuation. It also
includes PPF, EPF, and NPS calculators using configured instrument rates.

### Returns Analysis

**Route:** `/investments/returns`

Review realised investment income, booked costs, net investment P and L, event
counts, monthly cash flows, and book-value holdings. Dividends, interest, booked
profit or loss, and broker costs come from the ledger. CAGR and monthly ROI are
not inferred from salary or contributions; actual returns require market
valuations.

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

Savings on this page means the net change in your investment perimeter: money
moved into SIP, PPF, EPF, NPS, or stock accounts, minus what came back out.
Income that merely stayed in your bank appears as Unallocated, not as Savings.
The floor it is scored against is the Spending Rule's Savings percentage. The
Expense Analysis page scores income minus expenses against your Savings Goal
instead, so expect the two Savings figures to differ.

### Financial Goals

**Route:** `/goals`

Create Goal expands an inline form below the summary area. Each goal shows target, current progress, deadline, feasibility, and a savings projection based on average monthly savings.

Signed-in goal creation, editing, progress, allocation, and deletion are saved
to your account. Progress and allocations use the stored current amount.
Deletion requires confirmation, and a failed save keeps the form available
for retry.

In demo mode, these actions change only the current Goals page visit. Leaving
and reopening the page restores the sample goals.

If older browser-saved goal values are found, signed-in users can review them
beside the current account's saved values. Select the fields to recover and
confirm that they belong to this account before saving. The review warns when
values might belong to demo goals. Recovered progress replaces the current
amount with the selected browser value. You can keep the account's current
values instead. A goal previously hidden only in this browser stays visible
until you choose what to do; permanent deletion requires a separate
confirmation.

Recovery never applies older values automatically or changes the original
browser data. The app checks the current goal and browser values again before
saving. If they changed, review the updated comparison. A failed save keeps
the original data and your selections available for retry. Confirmed choices
are remembered for this account. If browser storage cannot remember a
successful choice, the app reports that separately from the saved change.

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

Vested RSUs use their stored vest-date stock price converted at the exchange
rate published for the vest date when available. Gross quantity remains the tax
basis; an optional net quantity reports shares actually received after
sell-to-cover withholding. Upcoming vestings use the configured appreciation
assumption.

The estimate identifies its recorded-income or salary-projection basis,
deductions, and fiscal-year rules. The old-regime standard deduction is INR
50,000; the new-regime standard deduction is INR 75,000 from FY 2024-25.
Comparisons apply each regime's own deduction. If an exact year has no
configuration, the page identifies its latest-known-rules fallback.

Tax rules are versioned by fiscal year, but results remain estimates. Verify final filing values against official records.

### Indirect Tax (GST)

**Route:** `/tax/gst`

The GST page estimates indirect tax from categorized expenses and date-aware slab assumptions. Bank statements do not expose invoice tax components, so this is an approximation.

## Settings

**Route:** `/settings`

Settings has 12 sections in four workflow groups.

### Money Setup

1. **Financial Settings** - fiscal year, budget targets, fixed expenses, tax preferences, TDS schedule, EPF treatment, savings and payday settings.
2. **Income and Salary Structure** - fiscal-year salary components, RSU grants and vestings, vest-date prices, net shares received, and growth assumptions.

Financial Settings starts expanded; Income and Salary Structure starts collapsed.

### Categories and Classification

3. **Account Classifications** - assign accounts to Cash, Bank Accounts, Credit Cards, Investments, Loans/Lended, or Other Wallets.
4. **Expense Categories** - essential and fixed-expense classification.
5. **Income Classification** - taxable, investment return, non-taxable, and other income buckets. The section opens with an audit: any income category your transactions carry that sits in none of the four buckets is listed with its transaction count and amount, so the money never silently drops out of your taxable-income and cashback totals. Pick a bucket per row, or apply every keyword suggestion at once. Saved categories that match no transactions (usually a spelling left behind after a rename) are listed below and can be removed.
6. **Categorization Rules** - ordered note/account matching rules with optional retroactive application.
7. **Investment Mappings** - map investment accounts to the four analytics categories.

All five sections in this group start collapsed.

### Profile and Display

8. **Display Preferences** - number format, display currency, default range, earning start date, Light/Dark theme, and Full/Reduced motion.
9. **Notifications** - budget, anomaly, and upcoming-bill preferences.
10. **Dashboard Widgets** - choose visible Quick Insights.
11. **AI Assistant** - app Bedrock or BYOK mode, provider/model/key, and token limits.

These sections start collapsed.

### Advanced

12. **Advanced** - excluded accounts, credit-card limits, and other power-user controls.

This section starts collapsed.

The Save button is a solid blue action with a Save icon and activates only when staged settings changed. Reset restores preference defaults but preserves account classifications.

Save waits for the affected sections before reloading settings. If a section
fails, the draft stays available for retry; another section may already have
saved successfully. Changing accounts or signing out clears the previous
account's data and page drafts. Theme and motion remain device preferences.

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

OpenAI and Anthropic BYOK calls go directly from the browser to the selected
provider with your key. Bedrock calls pass through the backend. A usable
personal Bedrock bearer key uses your funding and selected model; app mode
uses the app's model and shared allowance. Incomplete Bedrock BYOK settings
stop the request. Add a personal key or explicitly select App Bedrock mode.

When the provider stays the same, leave the key field blank to save only a
model or region change using the stored key. Changing provider requires a new
key. A conflicting save offers **Reload saved configuration** and keeps your
draft. App mode preserves your personal configuration for a later switch back.

The shared allowance counts model requests, including follow-up tool rounds,
so one question can use more than one unit. Bedrock reserves token budget
before a request and settles recorded usage afterward. An uncertain provider
failure can continue to count against the budget. Browser-direct usage
tracking does not replace spending limits at your provider.

Token budgets are available in both app and BYOK modes. Zero blocks Bedrock
calls; a blank field removes that personal cap. Pending reserved tokens are
shown separately and still count against the budget.

Tool results sent back to the model can contain your financial data. The tools
are read-only and scoped to your account.

## Demo Mode

Demo mode seeds deterministic sample transactions and analytics in the browser.

- Supported analysis reads use generated data.
- Server mutations are blocked with a sign-in explanation.
- Goals can be edited locally for the current page visit.
- Demo state lasts for the browser session.
- Exiting demo cancels pending work and clears the seeded query cache and user stores.
- Sign-in can contact the authentication service while demo mode is active.

## Time and Currency

The shared analytics filter provides All Time, FY, Yearly, and Monthly modes on supported pages. Year in Review provides only FY and Yearly.

Changing display currency changes formatting and converted display values. It does not rewrite imported ledger rows.

New imports require INR source amounts. Display conversion does not make a
foreign-currency statement a valid INR ledger snapshot.

## Current Limitations

- No direct bank synchronization.
- No PDF statement import.
- No transaction split/edit/delete UI.
- No invoice-level GST extraction.
- No live mutual-fund NAV feed.
- Imported cost-basis data does not provide a live portfolio valuation.
