# Ledger Sync — Complete Handbook

> A page-by-page reference for everything in Ledger Sync: what each screen shows, what every card / chart / metric means, how each number is computed, and what every setting controls.
>
> Generated from the live source (`frontend/src/pages/**`) — accurate as of **v2.17.0** (2026-06-27). For the terse developer data-catalog see [PAGES.md](PAGES.md); for the API see [API.md](API.md); for the schema see [DATABASE.md](DATABASE.md).

## How to read this

Each page section has:

- **Route** — the URL, and **Reads from** — the backend endpoints / hooks that feed it.
- **What's on the page** — every card, chart, table, toggle, and form, with *Computed:* showing the formula and the inputs (including any Settings that feed it).
- **Controls & notes** — the time filter, toggles, deep-links, empty states, and preference coupling.

**A note on data consistency.** As of v2.17, most analytics pages read pre-aggregated values from the backend (`/api/calculations/*`, `/api/analytics/v2/*`) rather than recomputing over the full transaction ledger in the browser. Each section's **Reads from** line names its source, so the same metric (e.g. total income, a category total) is computed once on the server and shown identically across pages. A handful of pages that mix user-preference or projection math (Tax, GST, net-worth/XIRR projections, the CFP health score) still compute client-side — these are flagged in their **Controls & notes**.

## Contents

**Getting started**

- [Home](#home)
- [Upload & Sync](#upload--sync)
- [Transactions](#transactions)

**Overview**

- [Dashboard](#dashboard)

**Spending & income**

- [Spending Analysis](#spending-analysis)
- [Income Analysis](#income-analysis)
- [Income/Expense Flow (Sankey)](#incomeexpense-flow-sankey)
- [Budgets](#budgets)

**Trends & comparison**

- [Trends & Forecasts](#trends--forecasts)
- [Period Comparison](#period-comparison)
- [Year in Review](#year-in-review)

**Net worth & investments**

- [Net Worth](#net-worth)
- [Investment Analytics](#investment-analytics)
- [Mutual Fund / SIP Projection](#mutual-fund--sip-projection)
- [Returns Analysis](#returns-analysis)

**Tax**

- [Tax Planning](#tax-planning)
- [GST Analysis](#gst-analysis)

**Planning**

- [FIRE Calculator](#fire-calculator)
- [Goals](#goals)

**Recurring & alerts**

- [Subscription Tracker](#subscription-tracker)
- [Bill Calendar](#bill-calendar)
- [Anomaly Review](#anomaly-review)

**Configuration**

- [Settings](#settings)

---

## Home
**Route:** `/`  ·  **Reads from:** OAuth provider configuration (no persisted data endpoints)

Public landing page introducing Ledger Sync to authenticated and unauthenticated users with clear CTAs for account creation, demo access, or dashboard navigation.

### What's on the page

**Header** (navigation) — Fixed top bar with:
  - **Ledger Sync logo + app name** — Link back to home (`/`)
  - **Sign In / Dashboard button** — Conditional: shows "Sign In" for unauthenticated users (opens AuthModal); shows "Hi, [firstname]!" for authenticated users, linking to `/dashboard`

**Hero section** — Primary banner with:
  - **"Personal Finance Made Simple"** (label) — Decorative badge with Sparkles icon
  - **"Take Control of Your Finances"** (headline) — Primary call-to-action messaging
  - **Body copy** — "Ledger Sync is your all-in-one financial dashboard..." describing the product value proposition
  - **Get Started Free / Go to Dashboard button** — Conditional: "Get Started Free" for unauthenticated users (opens AuthModal); "Go to Dashboard" for authenticated users (navigates to `/dashboard`)
  - **Try Demo button** — Unauthenticated only; invokes `enterDemoMode()` which seeds demo data into TanStack Query cache, sets fake auth tokens, hydrates preferences store with demo preferences (fiscal year April-March, demo user profile), and navigates to `/dashboard`
  - **Learn More button** — Anchor link to `#features` section (FeaturesSection below)
  - **Highlight badges** (6 cards) — Static feature callouts: "Works with Money Manager Pro exports," "Smart duplicate detection," "Secure, private data storage," "India-focused tax calculations," "Light and dark themes," "Multi-account support" — each with green CheckCircle2 icon

**"What is Ledger Sync?" section** — Two-column layout:
  - Left side: feature descriptions (3 cards):
    - **"Excel Import"** — Describes Money Manager Pro export import + duplicate detection
    - **"Smart Analytics"** — Describes 50/30/20 budget analysis, spending trends, income patterns, investment returns
    - **"India-Focused"** — Describes fiscal year (April-March) support, INR formatting, tax planning tools
  - Right side: **mockup card** displaying sample financial metrics (not live data; for illustration):
    - **Net Worth** — Example value "₹24,85,000" with change badge "+12.4%" (green)
    - **Income** — Example "₹1,25,000"
    - **Expenses** — Example "₹68,500"
    - **Savings** — Example "₹56,500"
    - **Investments** — Example "₹12,40,000"

**"Everything You Need" (Features) section** — 4-card grid (`id="features"` anchor target):
  - **Smart Analytics** (BarChart3 icon, blue) — "50/30/20 budget tracking, spending patterns, and income analysis with beautiful visualizations"
  - **Investment Tracking** (TrendingUp icon, green) — "Track FD/Bonds, Mutual Funds, PPF/EPF, and Stocks with returns analysis"
  - **Tax Planning** (Shield icon, orange) — "India FY-based tax insights, deduction tracking, and regime comparison"
  - **Instant Sync** (Zap icon, purple) — "Upload Excel files with automatic duplicate detection and smart reconciliation"

**"Ready to Take Control?" CTA section** — Repeats primary calls-to-action:
  - **Create Free Account / Upload Your Data button** — Conditional: "Create Free Account" for unauthenticated users (opens AuthModal); "Upload Your Data" for authenticated users (navigates to `/dashboard`)
  - **Try Demo button** — Unauthenticated only (repeats hero behavior)

**Footer** — Static: "Made with ❤️ for better financial management"

### Controls & notes

**Authentication flow:**
  - Unauthenticated users see Sign In button and Try Demo option
  - Authenticated users (detected via `useAuthStore().isAuthenticated`) see user's first name and direct Dashboard link
  - AuthModal fetches available OAuth providers (Google, GitHub) via `authApi.getOAuthProviders()` when opened; supports configurable OAuth with dynamic provider loading
  - Redirects to OAuth authorize URL, then expects callback to `/auth/callback/:provider`

**Demo mode:**
  - Clicking "Try Demo" calls `enterDemoMode(queryClient, navigate)` which:
    - Sets demo flag in `useDemoStore`
    - Logs in fake demo user (`id: -1, email: demo@ledger-sync.app`)
    - Seeds React Query cache with sample transactions and analytics data
    - Hydrates `usePreferencesStore` with generated demo preferences (fiscal year April-March)
    - Navigates to `/dashboard`
  - Demo mode is ephemeral—local store state only, no backend persistence

**Navigation routing:**
  - "Get Started" / "Create Free Account" → Opens AuthModal; post-login navigates to `/dashboard`
  - "Go to Dashboard" / "Upload Your Data" → Direct link to `/dashboard` (protected route via ProtectedRoute wrapper)
  - "Try Demo" → Enters demo mode, navigates to `/dashboard`
  - Authenticated users in header can click first name + arrow → `/dashboard`

**No deep-links or URL parameters:**
  - Home page is purely informational; no query string filters, category parameters, or time selection
  - All configuration is set server-side via OAuth provider config or via preferences store on authenticated routes

**Empty state:**
  - No empty state; page is always fully populated with marketing content
  - Conditional rendering based on `isAuthenticated` flag only

**Preferences / Settings coupling:**
  - Home page reads only `useAuthStore().isAuthenticated` and `user.full_name`
  - Demo mode auto-generates preferences (no user interaction)
  - No preference toggles or settings controls on this page; those live in `/settings`

**No server analytics endpoints called:**
  - HomePage is static marketing; makes zero calls to `/api/analytics/*`, `/api/calculations/*`, or `/api/transactions/*`
  - Only fetches OAuth provider config on AuthModal open
  - Demo mode seeds local cache via `seedDemoCache()` utility (client-side generation)

---

## Upload & Sync
**Route:** `/upload` · **Reads from:** `/api/upload`, `/api/analytics/v2/refresh`

Import Excel or CSV transaction files with automatic duplicate detection and smart sync. The page parses data client-side, uploads to the backend, then rebuilds analytics on the server.

### What's on the page

**Smart Sync badge** (label) — Top-left indicator showing "Smart Sync" feature positioning.

**Upload & Sync heading** (page title) — Main heading: "Upload & Sync".

**Import description** (text) — One-line value prop: "Import your Excel or CSV transactions. We'll automatically detect changes and sync your data."

**Feature bullets** (list) — Three feature claims:
- *Auto-detect duplicates* — Shown with CheckCircle2 icon
- *Smart sync* — Shown with RefreshCw icon
- *.xlsx, .xls & .csv* — Shown with FileSpreadsheet icon; *supported:* file formats accepted by the dropzone (multipart/spreadsheetml, application/vnd.ms-excel, text/csv only)

**Dropzone** (form input) — Large drag-and-drop area accepting `.xlsx`, `.xls`, or `.csv` files. Displays upload icon with text "Drop Excel or CSV file here" or "Drop your file here" on drag. Shows file name and upload progress during phases. States:
- *idle:* border-white/20, hover-primary
- *dragging:* border-primary, bg-primary/20, scale-[1.02]
- *busy:* opacity-50, cursor-not-allowed; displays animated spinner and PHASE_LABELS text
- *computed:* disables when `isBusy === true` (any phase running)

**Upload phases spinner and label** (progress indicator) — Displays during upload; animates through four phases:
- *Parsing file...* — Client-side SheetJS parsing of .xlsx/.xls/.csv
- *Uploading data...* — POST to `/api/upload` with `file_name`, `file_hash` (SHA-256), `rows` array, `force` flag
- *Processing transactions...* — Server-side transaction insertion/update/deletion
- *Computing analytics...* — POST to `/api/analytics/v2/refresh` to rebuild all derived metrics; *timeout:* 120 seconds per request

**File name display** (text, monospace) — Shows currently selected/uploading file name during upload.

**File conflict error** (alert box, yellow) — Appears when server returns "already imported" error. Shows filename and message "was imported before. Re-upload to sync changes."
- *conditional display:* only shows when `conflictError !== null`
- *computed:* set when `getApiErrorMessage(error).includes('already imported') || rawMessage.includes('Use --force')`

**Force Reupload button** (primary control) — Yellow button in conflict error state; re-uploads same file with `force: true` flag, bypassing duplicate check. Disabled during upload phase (`isBusy === true`).

**Expected Format section** (documentation) — Shows sample Excel/CSV table structure with seven required/recommended columns:

**Sample data table** (visual reference) — Rows demonstrate realistic transactions:
- **Date** (text, monospace, required) — Parsed as YYYY-MM-DD; accepts Excel serial dates, ISO 8601, DD/MM/YYYY, or text dates like "15-Mar-2024"
- **Account** (text, required) — Account name (e.g., "HDFC Bank", "ICICI Card"); flexible column names accept "Accounts" or "Account"
- **Category** (text, required) — Category name (e.g., "Salary", "Food", "Shopping"); flexible names accept "Category" only
- **Subcategory** (text, optional) — Hierarchical category (e.g., "Monthly", "Groceries", "Electronics"); flexible names accept "Subcategory", "Sub Category"
- **Type** (badge, required) — One of `Income`, `Expense`, `Transfer-In`, `Transfer-Out`; case-insensitive; flexible column names accept "Income/Expense", "Type", "Transaction Type"; *validation:* must match VALID_TYPES set (income, expense, exp., expenses, transfer, transfer-in, transfer in, transfer-out, transfer out)
- **Amount** (number, right-aligned, monospace, required) — Numeric amount; accepts comma-separated thousands (e.g., "3,500" or 3500); parsed as absolute value and rounded to 2 decimals
- **Note** (text, optional, tertiary) — Optional description; flexible column names accept "Note", "Notes", "Description"

Type badges render with semantic color styles from `TYPE_STYLES` (getSemanticBadgeClass lookup).

**Format tip footer** (informational) — Text: "Column names are flexible — 'Period' or 'Date' both work. Export from Money Manager Pro for best results."

### Controls & notes

**Column name flexibility** — Parser uses `COLUMN_MAPPINGS` to match flexible headers:
- `date`: accepts Period, Date, date, period
- `account`: accepts Accounts, Account, account, accounts
- `category`: accepts Category, category
- `amount`: accepts Amount / INR, Amount, amount, Amount/INR
- `type`: accepts Income/Expense, Type, type, Transaction Type
- `note`: accepts Note, note, Notes, notes, Description
- `subcategory`: accepts Subcategory, subcategory, Sub Category
- `currency`: accepts Currency, currency (optional; defaults to INR if missing)

Required columns: date, account, category, amount, type. Missing required columns trigger FileParseError.

**File parsing** — Client-side using SheetJS (lazy-loaded):
1. Reads first sheet only
2. Extracts headers and rows
3. Validates required columns
4. Parses each field with type coercion
5. Computes SHA-256 file hash for duplicate detection
6. Returns structured `ParsedTransaction[]` array

**Date parsing** (timezone-stable):
- Excel serial date numbers → UTC components (via EXCEL_EPOCH = 1899-12-30)
- ISO date (YYYY-MM-DD) → taken verbatim
- Numeric DD/MM/YYYY → India-first parsing (not MM/DD)
- Text dates (e.g., "15-Mar-2024") → parsed as LOCAL midnight, components extracted (avoids timezone shift for +UTC offset regions like India)
- Invalid dates → FileParseError

**Amount parsing**:
- Numeric values passed through; string values have commas stripped
- Result rounded to 2 decimals (Math.round(value * 100) / 100)
- Always absolute value (Math.abs)

**Upload payload** — POST `/api/upload`:
```
{
  file_name: string,
  file_hash: string (SHA-256 hex),
  rows: ParsedTransaction[],
  force?: boolean
}
```
*Timeout:* 120 seconds (UPLOAD_TIMEOUT_MS)

**Upload response** — Returns `UploadResponse`:
```
{
  success: boolean,
  message: string,
  stats: {
    processed?: number,
    inserted: number,
    updated: number,
    deleted: number,
    unchanged: number
  },
  file_name: string
}
```

**Success toast** — Shows: "{rows.length} rows parsed. {inserted} inserted, {updated} updated, {deleted} deleted, {unchanged} skipped (duplicates)."

**Conflict handling** — When file already imported:
1. Error message includes "already imported" or "Use --force"
2. `setConflictError({ parsed, message })` stores parsed data + error
3. User sees yellow alert with "Force Reupload" button
4. Re-upload with `force: true` bypasses duplicate check

**Duplicate detection** — File hash (SHA-256) compared server-side; if file previously imported, returns conflict error unless `force: true`.

**Analytics rebuild** — After successful upload, calls `/api/analytics/v2/refresh` (separate request for serverless reliability):
- If analytics refresh fails, shows warning toast: "Analytics refresh failed — dashboard may show stale data until next upload."
- Page still considers upload successful; analytics rebuild is asynchronous best-effort

**Post-upload cleanup** — On success:
1. Clears all React Query cache (`queryClient.clear()`)
2. Prefetches core data (`prefetchCoreData()`)
3. Clears local state: `setPhase(null)`, `setSelectedFile(null)`, `setConflictError(null)`

**Empty state** — If file contains zero data rows → FileParseError: "File contains no data rows"

**Error states**:
- *Parse errors* — Client-side validation (missing columns, invalid types, empty values) → toast with 6s duration
- *Network errors* (ECONNABORTED, ERR_NETWORK) → custom timeout/connectivity messages
- *Server timeout* (FUNCTION_INVOCATION_TIMEOUT) → "Server took too long to process. Please try again in a moment."
- *Other upload errors* → generic error toast with server message

**Demo guard** — Page respects demo mode; `useDemoGuard()` prevents file uploads in demo accounts; toast warning shown if attempted

**Maximum files** — Dropzone accepts `maxFiles: 1` only

---

## Transactions
**Route:** `/transactions` · **Reads from:** `/api/transactions/facets` (categories, accounts, type counts), `/api/transactions/search` (paginated transactions with filters)

Browse and search your transaction history with server-side filtering, sorting, and pagination. All analytics are computed on the backend; the page displays dropdown facets and per-type counts without fetching the full ledger.

### What's on the page

- **Total Transactions** (metric) — count of all transactions in the ledger; *computed:* `facets.total_count` from `/api/transactions/facets`
- **Income** (metric) — count of income-type transactions; *computed:* `facets.income_count`
- **Expense** (metric) — count of expense-type transactions; *computed:* `facets.expense_count`
- **Transfer** (metric) — count of transfer-type transactions; *computed:* `facets.transfer_count`
- **Search box** (form) — full-text search across note, category, and account; *debounced:* 300ms, updates `filters.query` and triggers new `/api/transactions/search` request with `?query=<value>`
- **Filters button** (toggle) — expands/collapses the advanced filter panel via `showAdvanced` state
- **Clear button** (control) — appears only when `hasActiveFilters` is true (any filter set or search query present); resets all filters to `{}` and query to empty string
- **Type filter** (dropdown) — options: "All Types", "Income", "Expense", "Transfer"; *sets:* `filters.type` (maps to `?type=<value>` in request)
- **Category filter** (dropdown) — populated from `facets.categories`; *sets:* `filters.category` (maps to `?category=<value>`)
- **Account filter** (dropdown) — populated from `facets.accounts`; *sets:* `filters.account` (maps to `?account=<value>`)
- **Start Date** (input, date) — ISO date format; *sets:* `filters.start_date` (maps to `?start_date=<YYYY-MM-DD>` in request)
- **End Date** (input, date) — ISO date format; *sets:* `filters.end_date` (maps to `?end_date=<YYYY-MM-DD>`)
- **Min Amount** (input, number) — displayed in user's preferred currency symbol (from `usePreferencesStore().displayPreferences.currencySymbol`); *sets:* `filters.min_amount` (maps to `?min_amount=<value>`)
- **Max Amount** (input, number) — displayed in user's preferred currency symbol; *sets:* `filters.max_amount` (maps to `?max_amount=<value>`)
- **Export CSV button** (action) — calls `/api/transactions/export` with current filters; *state:* `isExporting` controls button disabled state and "Exporting..." label; downloads file named `transactions-<YYYY-MM-DD>.csv`
- **Transaction Table** (desktop view, table) — displays paginated rows with columns:
  - **Date** — sortable, displays `formatDate(row.date, { month: 'short', day: '2-digit', year: 'numeric' })`; *computed:* derived from `row.original.date`
  - **Type** — icon + label (TrendingUp for Income / green, TrendingDown for Expense / red, arrow for Transfer / blue); *computed:* `row.original.type`
  - **Category** — main category with optional subcategory below in smaller text; *computed:* `row.original.category` and `row.original.subcategory`
  - **Account** — account name; *computed:* `row.original.account`
  - **Amount** — sortable, formatted currency with prefix (+/- for Income/Expense, none for Transfer); color-coded (green for Income, red for Expense, teal for Transfer); *computed:* `prefix + formatCurrency(Math.abs(row.original.amount))` where prefix is '+' for Income, '-' for Expense, '' for Transfer
  - **Note** — truncated to 120px on base/tablet, 200px on lg+; shows '-' if empty; *computed:* `row.original.note || '-'`
- **Transaction Cards** (mobile view, card list) — grouped by date with day header showing formatted date and daily total (sum of all transactions that day, accounting for +/- per type); each card shows category, subcategory, amount with color/prefix, account, and note
- **Pagination controls** — shows "Showing X to Y of Z transactions" and:
  - Items per page dropdown: options 10, 25, 50, 100; *default:* 10; *sets:* `itemsPerPage` and resets `currentPage` to 1
  - Page number buttons: displays up to 5 page numbers, always centered around current page or edges; *computed:* if `totalPages <= 5` show 1–5, else if `currentPage <= 3` show 1–5, else if `currentPage >= totalPages - 2` show `totalPages - 4` to `totalPages`, else show `currentPage - 2` to `currentPage + 2`
  - Previous/Next arrows: disabled when on first or last page respectively
- **Sorting state** — TanStack Table's `sorting` state; *default:* `[{ id: 'date', desc: true }]` (newest first); clicking **Date** or **Amount** headers toggles sort order; *server-side:* mapped to `?sort=<field>&sort_order=<asc|desc>` in `/api/transactions/search` request

### Controls & notes

- **Time filter coupling** — Start Date and End Date are optional; leaving both empty includes all transactions. Dates are passed as ISO strings (`YYYY-MM-DD`) to the backend.
- **Amount range** — Min Amount and Max Amount define an inclusive range; leaving both empty accepts all amounts. Non-numeric input is rejected (HTML5 `type="number"`).
- **Empty state** — when no transactions match filters, displays "No transactions found" with icon and hint to adjust filters; when loading, skeleton shimmer rows appear (6 rows on desktop, or 6 cards on mobile).
- **Pagination reset** — whenever filters, sorting, or items-per-page change, `currentPage` resets to 1.
- **Page scroll** — when user clicks a page number, `window.scrollTo({ top: 0, behavior: 'smooth' })` runs to scroll page header into view.
- **Server-side aggregation** — `/api/transactions/facets` endpoint returns pre-aggregated category/account lists and type counts (no full-ledger fetch into browser). Page uses `useTransactionFacets()` hook which caches indefinitely (`staleTime: Infinity`) until data is invalidated on upload.
- **Paginated results** — `/api/transactions/search` returns `{ data: Transaction[], total: number, limit: number, offset: number, has_more: boolean }`; `total` is the filtered count (not just the current page), so pagination bounds are correct even with filters applied.
- **Query param mapping** — filter state → URL params:
  - `filters.query` → `?query=<text>`
  - `filters.type` → `?type=<Income|Expense|Transfer>`
  - `filters.category` → `?category=<name>`
  - `filters.account` → `?account=<name>`
  - `filters.start_date` → `?start_date=<YYYY-MM-DD>`
  - `filters.end_date` → `?end_date=<YYYY-MM-DD>`
  - `filters.min_amount` → `?min_amount=<number>`
  - `filters.max_amount` → `?max_amount=<number>`
  - `sorting[0].id` → `?sort_by=<field>` (default 'date')
  - `sorting[0].desc` → `?sort_order=<desc|asc>` (default desc)
  - `currentPage` + `itemsPerPage` → `?offset=<(page-1)*itemsPerPage>&limit=<itemsPerPage>`
- **Currency symbol** — all amount inputs and labels are labeled with user's currency symbol from `usePreferencesStore().displayPreferences.currencySymbol` (e.g., "$", "₹", "€").
- **CSV export** — on success, displays toast "Export successful!" and auto-downloads; on failure, displays toast "Export failed" with retry prompt. Button remains disabled while `isExporting` is true (prevents double-click).
- **Mobile grouping** — card view groups transactions by date (first 10 characters of ISO timestamp), calculates daily net total accounting for type (+Income, -Expense, ±Transfer), and displays as sticky day header above that day's transactions.
- **Search debounce** — search input uses custom `useDebounce(value, 300)` hook; debounced query updates filter only after 300ms of inactivity. First render skips emitting empty query (via `isFirstRender` ref).
- **Advanced filters animation** — expand/collapse panel uses Framer Motion `AnimatePresence` with fade + height transition; `showAdvanced` state controls visibility.
- **TanStack Table configuration** — `manualSorting: true` so sorting is handled by page state, not in-memory; `getCoreRowModel()` and `getSortedRowModel()` enable column rendering and client-side sort-icon toggling (actual data sort is server-side).

---

## Dashboard
**Route:** `/dashboard`  ·  **Reads from:** `/api/calculations/totals`, `/api/calculations/monthly-aggregation`, `/api/calculations/quick-insights`, `/api/calculations/category-breakdown` + `/api/analytics/v2/recurring-transactions`

Real-time financial overview showing income, expenses, net savings, cash-based financial health, and emerging behavioral insights filtered by time period.

### What's on the page

**Page Header** (static) — "Dashboard" title with subtitle "Your financial overview at a glance". Includes AnalyticsTimeFilter in the action slot for time-range selection.

**AnalyticsTimeFilter** (time-range selector) — Four view modes: *All Time*, *Yearly*, *Monthly*, *FY* (fiscal year). When *Yearly* is selected, prev/next buttons navigate year by year. When *Monthly*, navigate by month (YYYY-MM). When *FY*, navigate by fiscal year (e.g., "FY 2024-25"); fiscal year start month is read from `preferences.fiscal_year_start_month` (defaults to April/month 4). Navigation is bounded by `dataDateRange.minDate` and `.maxDate` (earliest/latest transaction dates). Current selections: `viewMode`, `currentYear`, `currentMonth`, `currentFY` — stored in component state and derived into an `analyticsDateRange` using `getAnalyticsDateRange()`, which feeds all downstream queries via `start_date` and `end_date` parameters.

**Quick Insights** (metric cards section, full width) — Container labeled "Quick Insights". Calls `useTotals()`, `useQuickInsights()`, `useCategoryBreakdown()`, `useRecurringTransactions({ active_only: true, min_confidence: 0 })` for data. Renders two grids of insight cards (computed metrics, then behavioral "Fun Facts"). Widget visibility is user-customizable via localStorage key `'ledger-sync-visible-widgets'` (maps title strings to widget keys; defaults to all visible if 14+ are enabled).

**Quick Insights — KPI row:**
- **Total Income** (metric card) — *computed:* sum of all Income transactions in filtered date range, from `totalsData.total_income`; *subtitle:* percent change vs. previous month's income, formatted via `fmtChange(momChanges.income, label)`.
- **Total Expenses** (metric card) — *computed:* absolute value of `totalsData.total_expenses`; *subtitle:* percent change vs. previous month's expenses.
- **Net Savings** (metric card) — *computed:* `totalsData.net_savings` (income minus expenses); *subtitle:* percent change vs. previous month's net savings, using `savingsPct()` which divides by `Math.abs(prev)` to handle sign flips correctly.
- **Savings Rate** (metric card) — *computed:* `(net_savings / total_income) * 100` clamped to 1 decimal place; *subtitle:* formatted as "X saved of Y" using `formatCurrency()` on numerator and denominator, or "No income recorded" if income is zero.
- **Age of Money** (metric card, conditional) — *computed:* `computeAgeOfMoney(filteredTransactions)` returns days; derived from all transaction dates in the filtered range, calculating the weighted average age; *subtitle:* health label ("Healthy buffer" ≥30 days, "Building runway" ≥15 days, else "Living paycheck to paycheck").
- **Days of Buffering** (metric card, conditional) — *computed:* `computeDaysOfBuffering(liquidBalance, filteredTransactions)` where `liquidBalance = income - |expenses|`; returns how many days of spending the liquid balance covers at current burn rate; *subtitle:* "At current spending rate"; requires both transactions and finite totals.
- **Fixed Commitments** (metric card, conditional; only if `fixedCommitmentsMonthly > 0`) — *computed:* sum of confirmed active recurring expense amounts converted to monthly basis using `toMonthlyAmount(expected_amount, frequency)` for each item in `recurringItems` where `is_confirmed && type === 'Expense'`; *subtitle:* count of active recurring expenses.
- **Recurring Coverage** (metric card, conditional) — *computed:* `(fixedCommitmentsMonthly / monthlyIncome) * 100` where `monthlyIncome = totalIncome / monthsInRange`; *subtitle:* health label ("High fixed cost load" >50%, "Moderate" >30%, else "Low fixed costs").

**Quick Insights — Fun Facts row (behavioral metrics):**
- **Top Spending Category** (fact card) — *computed:* from `categoryData.categories`, sorted descending by total; returns category name and amount; *subtitle:* formatted amount; hides if no expense data.
- **Top Income Source** (fact card) — *computed:* from `insights.top_income_source` API response; name and amount; *subtitle:* formatted amount; hides if null.
- **Net Cashback Earned** (fact card) — *computed:* `insights.net_cashback` (from API) minus shared cashback; *subtitle:* "From X cashback transactions" using `insights.cashback_count`.
- **Biggest Transaction** (fact card) — *computed:* `insights.biggest_expense` (API); *value:* absolute amount; *subtitle:* category name.
- **Median Transaction** (fact card) — *computed:* `insights.median_expense` (API, server-side calculation); *subtitle:* "Few large purchases skew average up" if mean > median, else "Spending is fairly even".
- **Average Daily Spending** (fact card) — *computed:* `totalSpending / daysInRange` where `totalSpending = insights.total_spending` and `daysInRange` is computed from explicit filter dates or min/max dates returned by API; *subtitle:* "Over X days".
- **Weekend Spending** (fact card) — *computed:* `(weekendSpending / totalSpending) * 100`; *subtitle:* "X% weekends vs Y% weekdays" with absolute amounts for each; values from API (`insights.weekend_spending`, `.weekday_spending`).
- **Peak Spending Day** (fact card) — *computed:* day name from `insights.peak_day` (0=Sunday); *subtitle:* total amount on that day of week.
- **Monthly Burn Rate** (fact card) — *computed:* `totalSpending / monthsInRange` (avg monthly spend); *subtitle:* "Avg over X months" (X calculated from date range).
- **Spending Diversity** (fact card) — *computed:* count of unique categories and subcategories from expense breakdown; *value:* "X categories"; *subtitle:* "Across Y subcategories".
- **Avg Transaction Amount** (fact card) — *computed:* `insights.avg_expense` (server-side); *subtitle:* "Per transaction".
- **Internal Transfers** (fact card) — *computed:* `insights.total_transfers` and `insights.transfer_count`; *value:* formatted total; *subtitle:* "X transfers".
- **Income vs Expense Ratio** (fact card) — *computed:* `totalExpenseAbs / totalIncome` (ratio of expenses to income); *value:* formatted as "X.XXx"; *subtitle:* health label ("Great! Spending well below income" <0.7, "Spending close to income" <0.9, else "Spending nearly all income").
- **Most Expensive Month** (fact card, conditional) — *computed:* from `insights.most_expensive_month` (API returns period as "YYYY-MM" and amount); *value:* formatted month label (e.g., "Dec 2024"); *subtitle:* formatted amount; only rendered if data exists.

**Financial Health Score** (two-column grid or single full width on mobile) — Calls `useTransactions()` (all transactions) and `usePreferences()` to read `savings_goal_percent`, `fixed_expense_categories`. Displays two cards side by side:

- **FinHealth Score card** — *computed:* weighted average of 8 health metrics (Spend Less Than Income, Essential Expense Ratio, Emergency Fund, Investment Regularity, Debt-to-Income, Debt Trend, Savings Consistency, Income Stability) using 3+ months of transaction history; *value:* single numeric score (0–100); *subtitle:* "Last X months" where X is `monthsAnalyzed`; includes radar chart showing each metric's score and grid of metric cards below, each with 0–100 bar and target description; overall status color (green/orange/red) based on score tier; note says "Financial Health Network framework".

- **CFP Ratios card** — *computed:* Certified Financial Planner ratio composite score derived from income, expenses, essential expenses, debt, and net savings; *value:* numeric score; *subtitle:* "Last X months"; displays sub-ratios (Emergency Fund Ratio, Debt-to-Income Ratio, Investment Ratio, Savings Rate, Debt Payoff Plan, Essential Expense Ratio) in hierarchical view.

**Income Sources** (left pie chart card, two-column grid on desktop) — Labeled "Income Sources" with wallet icon. If data exists:
- **Pie chart** (center label, clickable slices) — *computed:* `incomeChartData` from `calculateIncomeByCategoryBreakdown(filteredTransactions)` aggregated by category, filtered to include only positive values, sorted descending by amount; center shows `incomeTotal` formatted short (e.g., "$50K") with label "Total"; *interaction:* clicking a slice navigates to `/income?category=<encodeURIComponent(name)>`.
- **Legend below chart** (list of category rows) — Each row shows colored dot, category name, and formatted amount; includes separator and final "Total" row with bold green amount plus optional "Cashbacks Earned" row (teal text) if `cashbacksTotal > 0`.

If no data: empty state with wallet icon, title "No income data available", description "Configure income categories in Settings.", action link to `/settings`.

**Expense Sources** (right pie chart card) — Labeled "Expense Sources" with credit-card icon. If data exists:
- **Pie chart** (identical structure to Income) — *computed:* `expenseChartData` from `calculateExpenseByCategoryBreakdown(filteredTransactions)` aggregated by category, filtered and sorted like income; center shows `expenseTotal` formatted short with label "Total"; *interaction:* clicking a slice navigates to `/spending?category=<encodeURIComponent(name)>`.
- **Legend** (category list) — Same structure as income, ending with "Total" row showing bold red amount.

If no data: empty state with credit-card icon, title "No expense data available", description "Upload transactions to see your expense breakdown.", action link to `/upload`.

### Controls & notes

**Time Filter State Management** — `viewMode`, `currentYear`, `currentMonth`, `currentFY` are stored in `DashboardPage` component state via `useDashboardMetrics()` hook. Setters wrap a `markInteracted()` function to track whether the user has manually adjusted the filter (preventing auto-reset to fiscal year start month when preferences load). Initial defaults: `viewMode` from `displayPreferences.defaultTimeRange` or 'all_time'; `currentYear` and `currentMonth` set to current calendar date; `currentFY` derived from `getCurrentFY(fiscalYearStartMonth)`, then synced if preferences arrive and user hasn't interacted.

**Date Range Derivation** — The `analyticsDateRange` (start_date/end_date) is computed from `viewMode` + time selectors via `getAnalyticsDateRange()` and passed to all data-fetching hooks as `dateRange` param. Example: if `viewMode='monthly'` and `currentMonth='2025-01'`, the range is Jan 1 to Jan 31, 2025; if `viewMode='fy'` and `currentFY='FY 2024-25'` with `fiscalYearStartMonth=4`, the range is Apr 1, 2024 to Mar 31, 2025.

**Data Flow** — Totals, monthly aggregation, and quick insights are fetched server-side via `/api/calculations/*` endpoints and return pre-computed sums; transactions are fetched via `useTransactions()` and filtered client-side using `filterTransactionsByDateRange()` for Age of Money and Days of Buffering calculations. Recurring transactions for Fixed Commitments are fetched via `/api/analytics/v2/recurring-transactions` (separate hook).

**Empty States** — Income Sources and Expense Sources cards each have a compact empty state (icon + title + message + action link); Quick Insights shows skeleton loaders during fetch; FinancialHealthScore shows "Need more transaction data..." if no transactions; no empty state for the entire Dashboard (header and time filter always visible).

**Deep Links** — Income and Expense pie chart slices support click-through to category detail pages: `/income?category=<name>` and `/spending?category=<name>` respectively (category name is URL-encoded).

**Preferences Coupling** — Dashboard respects `preferences.fiscal_year_start_month` (used to seed FY selector and constrain navigation), `preferences.savings_goal_percent` (passed to FinancialHealthScore for goal thresholds), `preferences.fixed_expense_categories` (used by FinancialHealthScore to classify essential expenses), and `displayPreferences.defaultTimeRange` (initial view mode). Widget visibility in Quick Insights is stored client-side in localStorage (`'ledger-sync-visible-widgets'` key) mapping widget title strings to legacy widget keys (e.g., "Savings Rate" → "savings_rate"); users can toggle in Settings → Dashboard Widgets (though new insights like Age of Money are always visible because they lack legacy keys).

**MoM (Month-over-Month) Changes** — Computed server-side from monthly aggregation by comparing the two most recent complete months; only included in KPI subtitles if monthlyData exists; income/expense use `(current - prev) / prev * 100`; savings/net_savings use `(current - prev) / |prev| * 100` to handle sign flips; savings rate shows raw percentage-point delta (not ratio); label shows short month names (e.g., "Jan vs Dec").

**Financial Health Calculation** — FinancialHealthScore accepts `transactions` prop (from DashboardPage's filtered set); if not provided, falls back to `useTransactions()` (all transactions, unfiltered). Score is based on the last N months where N is computed from transaction date span. Investment account flag is checked via `useInvestmentAccountStore`, affecting whether investment flows are included in analysis. Radar chart abbreviates metric names (e.g., "Spend Less Than Income" → "Savings Rate").

---

## Spending Analysis
**Route:** `/spending`  ·  **Reads from:** `/api/calculations/category-breakdown`, `/api/calculations/category-daily-series`, `/api/analytics/v2/cohort-spending`, client-side `useTransactions` hook

One sentence purpose: Track, visualize, and analyze spending patterns across categories and time periods using the 50/30/20 budget rule framework.

### What's on the page

- **Total Spending** (metric card) — Sum of all expenses in the selected date range; *computed:* filter transactions by `type === 'Expense'` and selected date range, sum absolute amounts.

- **Monthly Avg** (metric card) — Average spending per month across all months in the filtered range; *computed:* group expenses by `YYYY-MM`, divide total expense sum by distinct month count. Respects both date-range and category filters.

- **Top Category** (metric card) — Category with the highest total spending; *computed:* from `categoryBreakdown`, sort by amount descending and take first entry. If no expenses exist, shows "N/A".

- **Categories / Subcategories** (metric card) — Count of distinct categories and distinct `category::subcategory` pairs in filtered expenses; *computed:* count unique category names and unique (category, subcategory) tuples where `type === 'Expense' && subcategory` is defined.

- **50/30/20 Budget Rule Analysis** (nested donut visualization) — Shows actual spending allocation vs. budget targets. Inner ring (muted, 40% opacity) displays target percentages (Needs/Wants/Savings from preferences); outer ring (full opacity) displays actual breakdown.
  - Inner ring segments: **Needs (target %)**, **Wants (target %)**, **Savings (target %)** with target label inside rings
  - Outer ring segments: actual categories mapped by spending type (**Needs**, **Wants**, **Savings**); *computed:*
    - Needs amount: sum of transactions in `essential_categories` (from Settings → Essential Categories)
    - Wants amount: sum of all other expense transactions
    - Savings amount: `max(0, total_income - total_spending)`
    - Percentages: `(category_amount / total_income) × 100`
  - Target percentages from preferences: `needs_target_percent` (default 50), `wants_target_percent` (default 30), `savings_target_percent` (default 20)
  - Ring legend below chart: "Inner = Target" and "Outer = Actual"

- **Needs (target %)** (budget rule card) — Essential expenses (Housing, Healthcare, Food, etc.)
  - Title: "Needs (N%)" where N is the needs_target_percent
  - Subtitle: "Housing, Healthcare, Food, etc."
  - Icon: ShieldCheck (blue)
  - Value: absolute amount spent on essential categories
  - Current: percentage of income spent on needs (red if overspending)
  - Target: "≤N%" (from needs_target_percent)
  - Status indicator: green checkmark if under target OR within +5pp tolerance, red warning if over by >5pp
  - Bar color: blue (green if "on track", red if `isOverspendingEssential`)
  - *Computed:* `(essential_amount / total_income) × 100`; overspend flag: `essentialPercent > needsTarget + 5`

- **Wants (target %)** (budget rule card) — Discretionary expenses (Entertainment, Shopping, etc.)
  - Title: "Wants (N%)" where N is the wants_target_percent
  - Subtitle: "Entertainment, Shopping, etc."
  - Icon: Sparkles (orange)
  - Value: absolute amount spent on discretionary categories
  - Current: percentage of income spent on wants
  - Target: "≤N%"
  - Bar color: orange (green if "on track", red if `isOverspendingDiscretionary`)
  - *Computed:* `(discretionary_amount / total_income) × 100`; overspend flag: `discretionaryPercent > wantsTarget + 5`

- **Savings (target %)** (budget rule card) — Remaining income after all expenses
  - Title: "Savings (N%)" where N is the savings_target_percent
  - Subtitle: "Income minus Expenses"
  - Icon: PiggyBank (green)
  - Value: `max(0, total_income - total_spending)`
  - Current: percentage of income saved
  - Target: "≥N%" (inverted inequality — must EXCEED target, not stay under)
  - Bar color: green (red if `isUnderSaving`)
  - *Computed:* `(savings / total_income) × 100`; undersave flag: `savingsPercent < savingsTarget - 5`

- **Expense Trend** (area + line chart) — Monthly spending over time with 3-month rolling average overlay.
  - X-axis: Formatted month labels (e.g., "Jan '25", "Feb '25")
  - Y-axis: Currency amounts (formatted short, e.g., "$5K", "$10K")
  - Area series: individual monthly expense total (red line with gradient fill)
  - Line series (dashed): 3-month trailing rolling average (red dashed line)
  - Reference line: horizontal dashed line at peak month expense with label (e.g., "Peak: $8.5K")
  - *Computed:*
    - Group expenses by `YYYY-MM`, sum per month
    - For each month, rolling average = sum of (current month + prior 2 months) / 3 (trailing window, not centered)
    - Peak expense = max monthly value
  - Empty state: not rendered if no expense data

- **Expense Breakdown** (expandable category table with stacked bar + sparklines)
  - Header: Icon (BarChart3, purple), title "Expense Breakdown" or "**Category Name** Breakdown" if category-filtered, subtitle "N categories · **Total** total"
  - Stacked overview bar: horizontal bar showing relative width of each category as percentage of total
  - Per-category row (expandable):
    - Color dot
    - Category name (truncated if long)
    - Percentage of total spend (right-aligned)
    - Amount in currency (right-aligned, monospace font)
    - Expand chevron (rotates 180° on expand) if subcategories exist
    - Proportional bar: shows category's width as percentage with animation
    - Sparkline (if ≥2 data points): 12-month trailing history regardless of selected date filter; *computed:* via `/api/calculations/category-monthly-history` server endpoint, client-side month-key calculation, mapped to category
  - Sub-category rows (indented, appear on expand):
    - Indent marker (small circle, lighter color)
    - Subcategory name (truncated)
    - Compact proportional bar (of category total, not grand total)
    - Percentage of category (right-aligned)
    - Amount (right-aligned)
  - Read from: `/api/calculations/category-breakdown` (expense, date-scoped); `/api/calculations/category-monthly-history` (12-month trailing, independent of date filter)
  - Empty state: if no categories, shows "No expense data available" with link to upload

- **Pareto Analysis** (composed bar + line chart) — Which categories comprise 80% of spend (80/20 rule visualization).
  - Left Y-axis: Spend amount in currency (bars)
  - Right Y-axis: Cumulative percentage (line)
  - X-axis: Category names (angled -30°), truncated if >14 chars
  - Bars: individual category spending, orange for "vital few" (up to 80% threshold), muted gray for "trivial many" (beyond threshold)
  - Blue line: cumulative percentage, dots at each bar
  - Reference line: horizontal dashed gray line at 80% (or configurable threshold) with label
  - Header: Icon (TrendingDown, orange), title "Pareto Analysis", subtitle "N categories make up 80% of your spend -- the rest are the long tail"
  - Long tail handling: if >12 categories, roll tail into single "Other" bucket
  - *Computed:*
    - Sort categories by amount descending
    - Running cumulative = sum of amounts up to current
    - Cumulative % = (running_sum / total) × 100
    - Threshold index = first category where cumulative % ≥ 80
    - Color split: bars 0..threshold_index are orange ("vital few"), rest are muted ("trivial many")
  - Read from: local client-side `categoryBreakdown` state (already computed from transactions)
  - Not rendered if no data

- **Top Merchants** (pie chart + scrollable list with toggle)
  - Header: Icon (Store, orange), title "Top Merchants", subtitle "Where your money goes", toggle buttons: "By Amount" and "By Frequency"
  - Pie chart (top 8 merchants): colored slices, no legend (uses list legend below)
  - Merchant list (top 10, scrollable):
    - Numbered badge (1-10, colored)
    - Merchant name (truncated)
    - "N visits · Avg **amount**" (subtitle)
    - Total spent (right-aligned, bold)
  - Summary row (below chart):
    - "N Top Merchants" count
    - "**Total** Total at Top 10" (sum of top 10)
    - "M Total Visits" (transaction count across top 10)
  - Filtering:
    - Extracts merchant from transaction note (split by `-–—|,/`, remove long digit sequences, title-case)
    - Filters by: `type === 'Expense'`, `note` exists, within date range, optionally filtered by category
    - Minimum 2 transactions per merchant to include
  - View modes:
    - "By Amount": sort by `totalSpent` descending
    - "By Frequency": sort by `transactionCount` descending
  - *Computed per merchant:* total spent, transaction count, avg transaction, categories touched, first/last transaction date
  - Empty state: "No merchant data available. Transaction notes help identify merchants."

- **Multi-Category Time Analysis** (multi-line time series chart with controls)
  - Header: Title "Multi-Category Time Analysis", transaction count "N expense transactions · bucketed **granularly**" (e.g., "daily", "weekly")
  - Controls:
    - "Granularity" dropdown: Auto, Daily, Weekly, Monthly (auto picks based on date-range span to keep legible)
    - "Cumulative" / "Regular" toggle: switches between cumulative sum line and period amounts
    - Export CSV button
  - Chart: multi-line for top 6 categories by total spending; each line a different color
  - *Computed:*
    - Fetch daily per-category sums server-side: `/api/calculations/category-daily-series` (respects date-range + category filter in SQL)
    - Client buckets into day/week/month based on auto-pick or user override
    - For each bucket, sum amounts per category
    - Cumulative mode: running total of category amounts over time
    - Regular mode: per-period amounts
    - Top 6 categories: sort by total across all periods, take top 6
  - Read from: `/api/calculations/category-daily-series` server endpoint
  - Empty state: if no transactions, chart shows empty message

- **Enhanced Subcategory Analysis** (multi-line time series chart with category dropdown)
  - Header: Title "Enhanced Subcategory Analysis", export button
  - Controls:
    - Category dropdown (auto-populated from expense categories in date range), default "Food & Dining" or overridden by URL param `?category=`
    - Granularity dropdown (Auto, Daily, Weekly, Monthly)
    - Cumulative / Regular toggle
    - Transaction count "N transactions · bucketed **granularly**"
  - Chart: multi-line for all subcategories of selected category
  - *Computed:*
    - Fetch daily per-subcategory sums for selected category: `/api/calculations/category-daily-series?category=Food&Dining`
    - Client buckets as above
    - Subcategories from each row's `subcategory` field (or "Uncategorized")
    - All subcategories rendered (no top-N limit like Multi-Category)
  - Read from: `/api/calculations/category-daily-series` server endpoint with category filter
  - Re-mounts when `categoryFilter` URL param changes (via `key={categoryFilter ?? 'all'}` prop), so no sync hook needed
  - Empty state: "No data available for **selected category**"

- **Spending Patterns** (bar chart with three toggle modes: By Day / By Date / Seasonal)
  - Header: Icon (Calendar, teal), title "Spending Patterns", mode toggle buttons: "By Day", "By Date", "Seasonal"
  - Subtitle (description changes per mode):
    - "By Day": "Average spending by day of the week"
    - "By Date": "Average spending by day of the month (highlights payday spending spikes)"
    - "Seasonal": "Average monthly spending across years (highlights festival season Oct-Dec)"
  - Bar chart: x-axis labels change per mode; bars show average spending
    - "By Day": Sun–Sat (JS 0–6 order)
    - "By Date": 1–31 (day of month)
    - "Seasonal": Jan–Dec (month of year)
  - Peak/Dip insight strip (below chart):
    - Left box (teal): "Peak **Day/Date/Month**" with amount and delta from average (if >5% above)
    - Right box (muted): "Quietest **Day/Date/Month**" name
  - Bar sizing: "By Date" uses barSize 14 (narrow), others use 30
  - Bar color: teal with 0.7 fill opacity
  - *Computed server-side (backend pre-computes):*
    - Total spending per bucket (day-of-week 0–6, day-of-month 1–31, month-of-year 1–12)
    - Count occurrences (e.g., how many Mondays in dataset)
    - Average = total / occurrence-count
    - Backend returns: `{ bucket, avg }` for each cohort
  - Read from: `/api/analytics/v2/cohort-spending` server endpoint (no date range applied; uses all data)
  - Empty state: if no expense data, shows "No expense data available"

### Controls & notes

- **Time Filter** (top-right of page header): `AnalyticsTimeFilter` component
  - Options: Last 30 days, Last 3 months, Last 6 months, Last year, All time, Custom date range
  - Applies to: Total Spending, Monthly Avg, Top Category, Expense Trend, Category Breakdown (including sparklines which ignore this and always show 12-month trailing), Multi-Category Time Analysis, Enhanced Subcategory Analysis
  - Does NOT apply to: Spending Patterns (always uses full dataset)
  - Stores in React Router `useAnalyticsTimeFilter` hook; syncs with URL params if present

- **Category Filter** (banner below page header):
  - Appears only when `?category=CategoryName` is in URL (deep-link from clicking a chart element)
  - Click "X" to clear and remove URL param
  - When active:
    - Filters Top Merchants to only merchants in that category
    - Filters Multi-Category Time Analysis is NOT affected (shows all top 6 categories)
    - Auto-expands selected category row in Expense Breakdown
    - Overrides Enhanced Subcategory Analysis dropdown initial value to the linked category
  - Link source: clicking a pie slice, bar, or category row on other analytics pages

- **Settings Coupling**:
  - `essential_categories` (Settings → Essential Categories): determines which categories are "Needs" vs. "Wants"
  - `needs_target_percent`, `wants_target_percent`, `savings_target_percent` (Settings → Budget Rule Targets): numeric targets for 50/30/20 budget rule display and overspend/undersave detection
  - Any change to Settings clears React Query cache (`staleTime: Infinity` + invalidation on save)

- **Empty States**:
  - 50/30/20 Budget Rule section: if no spending breakdown possible (no income or no expenses matched), shows "No spending data available. Configure essential categories in Settings to see your spending analysis." with link to /settings
  - Category Breakdown: if no expense transactions, shows "No expense data available. Upload your transaction data to see your expense breakdown." with link to /upload
  - Top Merchants: if <2 transactions per merchant or no notes, shows "No merchant data available. Transaction notes help identify merchants."
  - Multi-Category / Subcategory charts: if no data for selected range/category, shows empty message
  - Spending Patterns: if no expense data, shows "No expense data available"

- **Client-side vs. Server-side Computation**:
  - **Server-side** (via `/api/calculations/*` and `/api/analytics/v2/*`):
    - `/api/calculations/category-breakdown` — category-level totals (transaction_type, date-range scoped)
    - `/api/calculations/category-monthly-history` — 12-month per-category history (pre-aggregated server, client computes month keys)
    - `/api/calculations/category-daily-series` — daily per-category/subcategory sums (date range + category filter in SQL)
    - `/api/analytics/v2/cohort-spending` — pre-computed day-of-week, day-of-month, month-of-year average spending (no date filter applied)
  - **Client-side** (from `useTransactions` full ledger fetch):
    - Total Spending, Monthly Avg, Top Category, Categories count, Savings
    - Monthly Trend (group, rolling average, peak detection)
    - 50/30/20 budget rule metrics (essentialPercent, discretionaryPercent, savingsPercent, overspend/undersave flags)
    - Top Merchants (extract from notes, aggregate, filter, sort)
  - **Rationale**: App recently migrated analytics from full-ledger client computation to server-side aggregation; legacy components (Expense Breakdown, Pareto, Top Merchants, Monthly Trend) still use client-side state, while newer sections (Spending Patterns, Subcategory Time Analysis) use server endpoints to avoid full fetch.

- **Date Filter Behavior**:
  - Monthly Trend (Expense Trend chart): shows only months within selected range, rolls up to 3-month average for that subset
  - Category Breakdown sparklines: ALWAYS show 12-month trailing (last 12 calendar months from today), independent of selected date filter (to answer "is category spending up or down long-term?" separately from "how much this quarter?")
  - Spending Patterns: ALWAYS uses all data, no date filtering (to answer "are Mondays always higher spend?" across full history)

- **Animations**:
  - Page animates in with scroll-fade-up (SCROLL_FADE_UP constant)
  - Metric cards fade and slide
  - Donut rings animate on load (target ring first at 0.3s delay, actual rings staggered)
  - Budget Rule cards cascade in with 0.3–0.5s delays
  - Charts animate with Recharts `isAnimationActive` based on `shouldAnimate(data.length)` (skips animation for very large datasets to avoid jank)
  - Category rows and proportional bars animate with spring easings
  - Expand/collapse uses `AnimatePresence` with height transition

- **Accessibility**:
  - Category breakdown bars are clickable (role="button", keyboard navigable with Enter/Space)
  - Sparklines have `ariaLabel` describing 12-month trend
  - Charts have `aria-label` and tooltips on hover
  - Category dropdown, granularity selects, view toggles all have labels

---

## Income Analysis
**Route:** `/income-analysis`  ·  **Reads from:** `/api/calculations/income-analysis`, `/api/calculations/data-date-range`, `/api/calculations/category-breakdown`, `/api/calculations/category-monthly-history`

Track and analyze income sources, trends, and cashback earnings across time periods with category-level detail.

### What's on the page

**Total Income** (metric card, green) — Sum of all income transactions within the selected date range. *Computed:* server-side sum of all `income` type transactions; includes all income categories unless category filter is applied. Key input: `total_income` from `GET /api/calculations/income-analysis`.

**Primary Income Type** (metric card, blue) — The highest-earning income category by absolute amount within the date range. *Computed:* derived from `category_breakdown` response, sorted descending by value; returns the first (max) category name or "N/A" if no income. Key input: the category with `max(value)` from category breakdown.

**Growth Rate** (metric card, adaptive color: green if positive, red if negative, blue if zero) — Percentage change in income trend over the selected period. *Computed:* server-side calculation comparing income trajectory; rendered green, red, or blue depending on sign. Key input: `growth_rate` from income analysis response.

**Cashbacks Earned** (metric card, teal) — Total non-taxable income (cashbacks and refunds) recognized as such via user preferences. *Computed:* server-side sum of transactions matching categories listed in `preferences.non_taxable_income_categories`; sum is passed as `cashback_categories` array parameter to the API. Key input: `cashbacks_total` from income analysis.

**Income by Category** (pie chart + breakdown cards) — Proportional breakdown of all income by category with color-coded cards showing icon, category name, percentage of total, and absolute amount. *Computed:* `category_breakdown` from API response, filtered to only categories with value > 0, sorted descending by amount; each entry is rendered as a donut slice (inner radius 50px, outer radius 90px) and a corresponding detail card. Clicking a slice navigates to `/transactions?type=Income&category={encoded_name}`. Category icons are hardcoded per name (Employment Income → Briefcase, Investment Income → TrendingUp, Refund & Cashbacks → Wallet, One-time Income → PiggyBank, Business/Self Employment Income → Activity, Other Income → DollarSign). Category colors come from `INCOME_CATEGORY_COLORS` map in `lib/preferencesUtils.ts` (Employment Income: green, Investment Income: orange, Refund & Cashbacks: teal, One-time Income: purple, Other Income: tertiary gray, Business/Self Employment Income: pink).

**Empty state (Income by Category)** — If no categories with income > 0, displays "No income type data available" with a link to Settings where users can configure income categories.

**Income Trend** (area chart with line overlay) — Monthly income with a dashed-line 3-month rolling average overlay, plus a horizontal reference line marking the peak income within the range. *Computed:* `monthly_data` array from API response; each month has `income` (solid green area), `income_avg_3m` (dashed green line), and a `month` key formatted via `formatMonthKey(month, { month: 'short', year: '2-digit' })` for x-axis labels. Tooltip displays full month name (long format) and labels the average as "Income (3m avg)" vs. "Income". A reference line at `peak_income` is labeled "Peak: ${formatCurrencyShort(peak_income)}" and is always drawn (regardless of date filter). Chart animates on load if length > 1; single data point shows a dot instead. Key inputs: `monthly_data[]`, `peak_income` from API.

**Empty state (Income Trend)** — If no monthly data, displays "No income data available" prompting user to upload transaction data.

**Income Sources** (expandable category breakdown table; from `CategoryBreakdown` component) — Bar-style breakdown of income sources by category with:
  - **Header** — Icon (DollarSign, green) and title "Income Sources" with category count and total amount.
  - **Stacked overview bar** — Visual representation showing each category's proportion of total income as a colored segment; clicking any segment expands that category's row.
  - **Category rows** — Each row shows:
    - Color dot
    - Category name (clickable to expand/collapse subcategories if present)
    - Percentage of total income (e.g., "42.5%")
    - Absolute amount formatted as currency
    - Expand chevron (if subcategories exist)
    - **Proportional bar** — Horizontal bar showing the category's share of total (respects the active date filter)
    - **12-month sparkline** — Tiny 12-month trend chart showing that category's spending pattern over the **trailing 12 months from today** (independent of the selected date range); appears only if 2+ months of history exist
  - **Subcategory rows** (expanded view) — Indented rows under each category, showing subcategory name, bar, percentage of category, and amount
  - *Computed:* Server-side aggregation via `GET /api/calculations/category-breakdown?transaction_type=income&start_date=...&end_date=...`; monthly history for sparklines via `GET /api/calculations/category-monthly-history?months=...&transaction_type=income`; categories colored via `INCOME_CATEGORY_COLORS` map (with deterministic hash-based fallback for unknown categories); sparkline is always trailing 12 months regardless of date range selected.

**Empty state (Income Sources)** — If no income categories, displays "No income data available" with link to upload.

### Controls & notes

**Time filter** — Dropdown at top-right of page header (component `AnalyticsTimeFilter`) with options: "Year" (calendar year), "Month" (current calendar month), "Fiscal Year" (user-configured start month, default April). Date range bounds are fetched lightweight via `/api/calculations/data-date-range` (no full-ledger fetch); bounds are clamped to user's "Earning Start Date" preference if enabled. Changing the time filter updates the `dateRange` and refetches all metrics and breakdowns server-side.

**Category filter (deep-link)** — Query parameter `?category={encoded_name}` (e.g., `/income-analysis?category=Employment%20Income`) filters all stats to a single category; the filter label shows in the `FilterBanner` component at top of page. Clicking a pie slice in "Income by Category" navigates to the category filter. Clicking the banner's clear button removes the filter and restores the full breakdown. The category filter is passed to the API as the `category` parameter and affects all card metrics and charts.

**Preference coupling** — The `non_taxable_income_categories` list from user preferences (set in Settings) is passed to the API as `cashback_categories` and controls which transactions are summed into the "Cashbacks Earned" metric. The `fiscal_year_start_month` preference controls the "Fiscal Year" time filter option. The `useEarningStartDate` and `earningStartDate` preferences clamp the start of all time ranges so charts visually begin at the user's earning date (underlying data untouched).

**Loading state** — While data loads, a `PageSkeleton` component displays; individual sections show "Loading chart..." or similar spinners.

**API query keys** — React Query caches are keyed on `['income-analysis', dateRange.start_date, dateRange.end_date, categoryFilter, cashbackCategories]` for the main metrics; `['category-breakdown', ...]` for the Income Sources section; `['category-monthly-history', transactionType, monthKeys]` for the sparklines. Stale time is `Infinity` (data does not auto-refetch until manually invalidated).

---

## Income/Expense Flow (Sankey)
**Route:** `/income-expense-flow`  ·  **Reads from:** `useTransactions()` hook (fetches full transaction ledger; server applies account-level exclusions)

Visualize how income flows from source categories into savings and expense categories through an interactive Sankey diagram.

### What's on the page

**Total Income** (metric card) — Sum of all Income transactions in the selected period. Displayed in green with a TrendingUp icon. *Computed:* Sum of `transaction.amount` for all transactions where `type === 'Income'` within the selected date range, excluding transfers.

**Total Expense** (metric card) — Sum of all Expense transactions in the selected period. Displayed in red with a TrendingDown icon. *Computed:* Sum of `transaction.amount` for all transactions where `type === 'Expense'` within the selected date range, excluding transfers.

**Net Savings** (metric card) — Total Income minus Total Expense. Displayed in primary color if non-negative, red if negative. Icon color reflects the sign. *Computed:* `totalIncome - totalExpense`. Shows absolute value formatted as currency.

**Savings Rate** (metric card) — Percentage of income saved. Displayed in green if >= 20%, yellow otherwise. *Computed:* `(netSavings / totalIncome) × 100` if totalIncome > 0, else 0.

**Cash Flow Sankey** (chart, desktop only) — Interactive flow diagram showing income sources (left) → Total Income (center) → Savings & Expenses (center) → Expense categories (right). Chart height is 700px; width adapts to container. Rendered via Recharts `<Sankey>` with `nodeWidth={20}` and `nodePadding={60}`.
  - Top 10 income categories by amount flow from left into "Total Income" node.
  - "Total Income" node splits into "Savings" and "Expenses" nodes.
  - "Expenses" node splits into top 10 expense categories.
  - Only the top 10 categories (by amount, descending) are shown per section; categories beyond the top 10 are aggregated into the totals but not visually rendered.
  - *Node colors:* Income categories are green/teal, "Total Income" is indigo-vibrant, "Savings" is purple, "Expenses" is pink, expense categories are red/orange/yellow.
  - *Link colors:* Purple with 25% opacity.
  - *Node labels:* Each node shows category name, currency amount, and percentage of total income.
  - *Tooltips:* On hover, shows currency amount.

**Cash Flow (mobile view) — Vertical stacked flow** (mobile only, when not loading and links exist). Alternative to Sankey for small screens:
  - **Income sources** section: Lists top 10 income categories as animated horizontal bars. Bar width proportional to category's share of highest income category.
  - **Total Income** pill: Displays sum of all income.
  - **Savings / Expenses** split cards: Two-column layout showing savings amount/percent and expenses amount/percent.
  - **Where expenses went** section: Lists top 10 expense categories as animated horizontal bars, width proportional to category's share of highest expense category.
  - Each row displays: category name, percentage of section total, animated bar, and amount.

**Legend** (desktop Sankey only) — Three color-coded rows below the chart:
  - Green gradient: "Income Sources"
  - Indigo-to-purple gradient: "Total Income / Savings / Expenses"
  - Red-to-orange gradient: "Expense Categories"

### Controls & notes

**Time Filter** (top right):
  - View Mode selector: "All Time", "FY" (Financial Year), "Yearly", "Monthly"
  - Navigation arrows (disabled at boundaries): Previous/Next period buttons
  - Default mode: User's preference from Display Settings; falls back to "FY"
  - Period label: Updates based on selection (e.g., "FY 2024-25", "2024", "January 2024", "All Time")
  - Fiscal year start month: Defaults to April; respects user preference from `/api/preferences`
  - **Earning-start-date preference**: If enabled in Display Settings, the chart's date range start is clamped to the earning start date (view-layer only; underlying transaction data is untouched)

**Empty state**: If no links exist in the Sankey (i.e., no transaction data for the selected FY), the chart displays a message: "No transaction data available for FY [currentFY]" with a subtitle prompting to select a different FY or upload data.

**Loading state**: Spinner with "Loading flow diagram..." text while `useTransactions()` is fetching.

**Data derivation**:
  - All computation is **client-side** within the hook `useIncomeExpenseFlow()` and derived from the full transactions ledger.
  - Transactions are fetched once via `useTransactions()` with `staleTime: Infinity` (cached indefinitely; only invalidated on upload).
  - Transactions are filtered to exclude `is_transfer` transactions.
  - Transactions are then windowed by the selected date range (`dateRange.start_date` and `dateRange.end_date`).
  - Categories default to "Other Income" / "Other Expense" if `transaction.category` is null.
  - **No server analytics endpoints are called** — the page relies entirely on client-side aggregation of the full ledger.

**Responsive behavior**:
  - Desktop (≥768px): Recharts Sankey diagram (700px height) with legend.
  - Mobile (<768px): Vertical flow view with stacked sections and animated bars; Sankey is hidden.
  - Summary cards: 4-column grid on desktop (lg), 2-column on tablets (sm), 1-column on mobile.

**Device detection**: `useIsMobile()` hook determines layout. Font size in Sankey node labels adjusts: 13px desktop, 11px mobile.

---

## Budgets
**Route:** `/budgets`  ·  **Reads from:** `/api/calculations/category-breakdown` (via `useCategoryBreakdown`), `/api/transactions`, `/api/preferences`

Set spending limits by category or subcategory, track actual vs. budgeted amounts with monthly or yearly periods, and monitor budget health across your expense categories.

### What's on the page

**Category / Subcategory toggle** (view mode selector) — Switch between category-level budgets and subcategory-level budgets. Changes which budgets display and which categories are available in the form. Default: Category.

**Add Budget button** (action button) — Opens the "New Budget" form to create a new budget.

**Total Budget** (stat card) — Formatted currency; *computed:* sum of all `limit` values for budgets in the current view (filtered by viewMode). Displays only if at least one budget exists.

**Total Spent** (stat card) — Formatted currency with color coding (green if under budget, red if over); *computed:* sum of all `spent` values across filtered budget rows. Reads from transaction ledger filtered by current month (`YYYY-MM`) or fiscal year (for yearly budgets). Displays only if at least one budget exists.

**On Track** (stat card) — Count of budgets with `status === 'safe'`. Displays only if at least one budget exists.

**Exceeded** (stat card) — Count of budgets with `status === 'exceeded'`. Displays only if at least one budget exists.

**New Budget form** (collapsible form section) — Opens when "Add Budget" button is clicked. Contains:
- **Category dropdown** (category mode): Lists all categories from `availableCategories` (categories without existing budgets). If in subcategory mode, shows only categories that have subcategories and resets subcategory selection when category changes.
- **Subcategory dropdown** (subcategory mode): Lists subcategories for the selected category. Disabled if no category is selected.
- **Limit (₹) input**: Numeric field; must be > 0 to submit.
- **Period dropdown**: Defaults to "Monthly"; options are "Monthly" or "Yearly".
- **Add button**: Disabled if category is empty or limit is empty. On submit, calls `setBudget(key, limit, period)` where key is `category` or `category::subcategory` (depending on mode), then closes the form. Toast error if limit ≤ 0 or non-finite.

**Budget Tracker rows** (list of budget items, one per budget) — Each row displays a single budget with the following elements:
- **Status icon & category name** (header row): Green check circle if "safe", yellow/orange warning icon if "warning"/"danger", red alert triangle if "exceeded". Shows category name, and if subcategory exists, appends " / subcategory". Includes a badge showing period ("monthly" or "yearly").
- **Fixed expense badge** (optional): Displays if the category (lowercased) is in `fixedExpenseCategories` (from preferences `fixed_expense_categories`).
- **Momentum sparkline + slope** (optional): Appears if `categoryMomentum[category]` exists and has ≥3 sparkline data points. Shows a small area chart of spending trend + slope percentage (color: red=accelerating/increasing, green=decelerating/decreasing, yellow=stable).
- **Percentage display** (right side): Large, bold percentage of spent/limit; colored by status (green=safe, yellow=warning, orange=danger, red=exceeded).
- **Edit button**: Inline icon; click to open number input for new limit.
- **Delete button**: Trash icon; requires confirmation; removes budget from store.
- **Limit input** (edit mode): Appears when edit button is clicked; number input with focus-on-load. On blur or Enter, saves new limit; on Escape, cancels.
- **Progress bar** (visual): Animated bar showing `min(100, percentage)%` fill. Background has three zones: 0–75% of alert threshold (5% opacity), 75–100% of alert threshold (10% opacity), and 100%+ of alert threshold (10% opacity). A yellow vertical line marks the alert threshold position.
- **Remaining/Over budget text** (status line): Green "X remaining to spend" if positive; red "X over budget" if negative. Uses `limit - spent`.
- **Spent and limit footer**: "X spent · of Y" in small, muted text.

**Budget vs Actual chart** (bar chart) — Shows top 8 budgets (sorted by percentage descending) with two bars per category: Budget (semi-transparent blue) and Spent (colored by status). X-axis rotates labels at -20° if many categories. Clicking a Spent bar deep-links to `/transactions?category=<category>`. Tooltip displays formatted currency.

**Budget Burn-down chart** (area chart, monthly only) — Appears if any monthly budgets exist and `burndownData.length > 0`. Shows remaining budget remaining over the month (day 1–last day). Two lines: dashed gray "Ideal Pace" (budget / daysInMonth for each day) and solid green "Actual Remaining" (cumulative spent subtracted from total budget, undefined after today). Only computed for budgets with `period === 'monthly'`. Displays current month name and year. Tooltip shows "Day N" label.

**Category Usage Radar** (radar chart) — Appears if ≥3 subcategory budgets exist (after `radarData.slice(0, 8)`). Shows budget utilization (%) on a 0–100 scale (or max utilization if > 100). Each spoke is a category name (truncated to 10 chars + "…" if longer). Title: "Budget utilization (%) across all categories".

**Suggested Budgets** (pill buttons section, optional) — Appears if:
- At least one budget exists AND there are categories without budgets AND some available categories have > ₹500 spending in the current month.
- Shows up to 8 suggestions, filtered to those with monthly spending > ₹500.
- Each pill: "+ Category Name (₹X/mo)". On click, calls `handleQuickAdd(category, spent)`, which suggests `ceil(spent * 1.2 / 1000) * 1000` (20% buffer, rounded to nearest ₹1000). Period is always "monthly".

**Empty state** (when no budgets exist) — Displays a piggy-bank icon, heading "No budgets set yet", description "Set spending limits for your categories to start tracking…", and a "Create Your First Budget" button that opens the form.

### Controls & notes

**Time filtering:** Budgets are always tracked against the current calendar month for monthly periods, and the current fiscal year (based on `fiscal_year_start_month` from preferences, default April) for yearly periods. No user-facing time filter on the page; period is set per-budget at creation and displayed on each row.

**View mode toggle (Category / Subcategory):** Instantly filters displayed budgets and updates available categories in the form. Does not persist across sessions (resets to "Category" on reload).

**Period selection:** Can be set at budget creation time in the form. Existing budgets can be edited inline to change period. Monthly budgets compare against current month spending; yearly budgets compare against fiscal-year spending.

**Alert threshold:** Read from preferences `default_budget_alert_threshold` (default 80%). Determines status transitions:
- `0–74.99%`: "safe" (green)
- `75–<threshold%`: "warning" (yellow)
- `threshold–99.99%`: "danger" (orange)
- `≥100%`: "exceeded" (red)

Progress bar shows three background zones based on alert threshold: light zone (0–75% of threshold), medium zone (75%–threshold), and alert zone (threshold+). A yellow vertical marker shows the threshold line position.

**Inline editing:** Click the edit icon on any row to modify the limit in place. Blur or Enter saves; Escape cancels. Period cannot be edited inline; delete and re-add to change period.

**Deletion:** Requires confirmation popup. Removes budget from `useBudgetStore` (Zustand, persisted to localStorage as "ledger-sync-budgets").

**Category/Subcategory behavior:**
- In Category mode, budgets group by top-level category (e.g., "Groceries").
- In Subcategory mode, budgets group by full key "Category::Subcategory" (e.g., "Groceries::Dairy").
- A category without a budget is "available" in the form dropdown.
- Switching modes changes which budgets appear (e.g., toggling to Subcategory mode hides category-level budgets and only shows those with a "::" in the key).

**Deep-linking:** The "Spent" bar in the Budget vs Actual chart links to `/transactions?category=<category>`, filtering the transaction list by that category.

**Data sources:**
- **Current month spending:** Computed client-side from transactions ledger, filtered by `tx.date.startsWith(currentMonthKey)` where currentMonthKey = "YYYY-MM" (local date).
- **Fiscal year spending:** Computed from transactions filtered by fiscal-year start/end dates (derived from `getCurrentFY()` and `fiscal_year_start_month` preference).
- **Spending data:** All transactions with `type === 'Expense'` are summed by category (or `category::subcategory` for subcategories). Amounts are absolute value.
- **Category list (for form):** Combines categories from `/api/calculations/category-breakdown` (all-time, via `useCategoryBreakdown`) and categories from the live transaction ledger.
- **Preferences:** Reads `fiscal_year_start_month`, `default_budget_alert_threshold`, and `fixed_expense_categories` from `/api/preferences`.
- **Momentum:** Computed per category from recent transaction trends using `computeCategoryMomentum(transactions)`, which generates sparkline data and slope classification.

**Budget storage:** Budgets are stored in Zustand (`useBudgetStore`) with localStorage persistence (key: "ledger-sync-budgets"). Each budget object has `{ category: string, limit: number, period: 'monthly' | 'yearly' }`.

**Empty chart states:** Budget vs Actual, Burn-down, and Radar charts each show a placeholder if no data is available (e.g., no budgets, or Burn-down if no monthly budgets exist).

---

## Trends & Forecasts
**Route:** `/forecasts`  ·  **Reads from:** `/api/analytics/trends via useTrends(timeRange) - returns monthly_trends array with fields: month (YYYY-MM), income, expenses, surplus`, `/api/calculations/monthly-aggregation via useMonthlyAggregation() - server-side monthly aggregation with income, expense, net_savings`, `useTransactions hook - full transaction ledger (date, type, amount) for computing daily cumulative savings rate`, `usePreferences hook - reads savings_goal_percent (default 20), fiscal_year_start_month, useEarningStartDate flag`

Analyze multi-month income, expense, and savings patterns with 12-month projections and confidence bands.

### What's on the page

- **Spending Trend** (metric card) — Current month's total expenses (currency format), percentage change from previous month with trend icon (up=bad, stable, or down=good), plus two stats: average expense across all filtered months and peak (highest) month's expenses. *Computed:* Current = latest month expenses from /api/analytics/trends. Previous = prior month. ChangePercent = (latest - previous) / previous * 100. Direction: up if > 2%, down if < -2%, else stable. Average = sum(expenses) / count. Highest = max(expenses). Data filtered by selected time range (all_time, fiscal year, or yearly).
- **Income Trend** (metric card) — Current month's total income (currency format), percentage change from previous month with trend icon (up=good, stable, or down=bad), plus average and peak income across filtered months. *Computed:* Current = latest month income from /api/analytics/trends. Previous = prior month. ChangePercent = (latest - previous) / previous * 100. Direction: up if > 2%, down if < -2%, else stable. Average = sum(income) / count. Highest = max(income).
- **Savings Trend** (metric card) — Current month's savings (income minus expenses; displayed in green if positive, red if deficit), percentage change from previous month, average savings across filtered months, and best month (highest savings value, shown in green). *Computed:* Current = latest.income - latest.expenses (API field: surplus). Previous = prior month surplus. ChangePercent = (latest - previous) / previous * 100. Direction: up if > 2%, down if < -2%, else stable. Average = sum(surplus) / count. Highest = max(surplus). For all-deficit users, peak is the least-negative month (not clamped to zero).
- **Income & Expense Trends** (line chart) — Three synchronized sub-charts (Income, Expenses, Savings), each displaying monthly actual value as filled area chart (green for income, red for expenses, purple for savings) with a dashed 3-month rolling average overlay line. Horizontal reference line marks the peak value for each category. Hovering a month highlights a vertical sync line across all three charts. *Computed:* Data from filtered monthly_trends via useTrends (filtered by time range). For each month: rolling_avg = sum(current month + 2 prior months) / 3 window. Peak values: peakIncome = max(all income months), peakExpenses = max(all expense months), peakSavings = max(all surplus months, unfloor for all-deficit users). Charts animate with 600ms easing; animation disabled if <= 1 data point.
- **Savings Rate Trend** (area chart) — Cumulative daily savings rate (%) starting from 0% and building as user's cumulative net (income - expenses) grows relative to cumulative income. Green horizontal reference line shows the user's savings goal target percentage (default 20% from preferences). Negative savings rates display as 'percent (deficit)' in tooltips; the area chart clamps negative to 0% for visualization but preserves true negative in hover data. *Computed:* Built from filteredTransactions (filtered by time range via dateRange). For each calendar day: cumIncome = sum of all income transactions up to that day, cumExpense = sum of all expense transactions to that day. savingsRate = (cumIncome - cumExpense) / cumIncome * 100. Display value = max(0, savingsRate) to keep area above zero. rawSavingsRate (true value, possibly negative) stored in data payload for tooltip. savingsGoalPercent from usePreferences (field: savings_goal_percent, default 20).
- **Month-on-Month Breakdown** (table) — Last 8 months of summary data in a sortable table with five columns: Month (YYYY-MM), Income (green text), Spending (red text), Savings (purple text if positive, red if negative/deficit), Savings Rate (%). All numeric columns are right-aligned and sortable by clicking headers. *Computed:* Rows = chartData.slice(-8) from useTrendsForecasts hook, representing the last 8 filtered months. Income and Spending sourced from /api/analytics/trends monthly_trends. Savings = income - expenses (surplus field). Savings Rate = (surplus / income) * 100 if income > 0, else 0. Data filtered by selected time range.
- **Future Cash Flow Forecast** (area chart) — Complex multi-layer visualization combining historical and forecast periods: (1) historical income line (solid green, 50% opacity), (2) historical expenses line (solid red, 50% opacity), (3) historical net savings (solid blue area with gradient fill), (4) forecast income line (dashed green, 35% opacity), (5) forecast expenses line (dashed red, 35% opacity), (6) forecast net savings (dashed purple), and (7) widening confidence band (blue gradient cone) representing optimistic-to-conservative range around forecast. Header displays 'Deficit in Xmo' warning badge if forecast turns negative. *Computed:* Uses useMonthlyAggregation() to fetch /api/calculations/monthly-aggregation (server-side aggregated monthly data). buildForecast() function requires >= 3 complete months; excludes incomplete current month if today's date < 25th. Trend calculation: last 6 complete months' income and expense growth rates. Forecast generation: 12-month projection where each month's projection *= 1 + (growth * 0.5 damping). Confidence band: upper/lower = net +/- (stdDev * 0.8 * sqrt(months_from_start)). Months until negative = index of first forecast month with net < 0 (null if never turns negative).
- **Avg Monthly Income (Forecast Insight Card)** (metric card) — Average monthly income from the last 6 complete months (shortened currency format, e.g., $5.2K), with a growth trend indicator showing arrow (↑ or ↓) and percentage monthly growth. *Computed:* avgIncome = sum(last 6 complete months income) / 6. incomeGrowth = ((last_month_income - first_month_income) / first_month_income) / 5_periods * 100 (converted to percentage display). Trend arrow: ↑ if growth >= 0, ↓ if < 0.
- **Avg Monthly Expenses (Forecast Insight Card)** (metric card) — Average monthly expenses from the last 6 complete months (shortened currency format), with a growth trend indicator showing arrow (↑ or ↓) and percentage monthly growth. *Computed:* avgExpense = sum(last 6 complete months expenses) / 6. expenseGrowth = ((last_month_expense - first_month_expense) / first_month_expense) / 5_periods * 100. Trend arrow: ↑ if growth >= 0, ↓ if < 0.
- **1-Year Projected Savings (Forecast Insight Card)** (metric card) — Sum of all net savings (income minus expenses) across the entire 12-month forecast window (shortened currency format). Colored blue if positive/surplus, red if total projected deficit. Label states 'Based on current trends'. *Computed:* projectedSavings = sum of (forecast_income - forecast_expense) for all 12 forecast months. Each month applies the damped growth trend: current_forecast *= (1 + growth * 0.5). Returns positive (blue) or negative (red) based on value.

### Controls & notes

Page-level controls: AnalyticsTimeFilter component (top-right header) with dropdown selector for view modes (all_time, fy [fiscal year], yearly) and secondary year/month/FY picker. Time range selection filters all metrics, charts, and forecast base data (last 6 months used for trend). Empty state handling: displays 'Upload your transaction data to see spending trends and forecasts' with link to /upload if no monthly_trends exist. Forecast empty state: 'Need at least 3 months of data for forecasting' if fewer than 3 complete months. Current month exclusion logic: if today's date < 25th, the current month is excluded from trend calculations to avoid skewed rolling averages. Savings Rate trend clamps negative values to 0% for chart area rendering but preserves true negative values (rawSavingsRate) in tooltip payload for transparency. Trend direction determination: change is marked 'stable' if percent change is within +/- 2% threshold; 'up' or 'down' otherwise. Confidence band behavior: widens with forecast horizon using sqrt(months_out) to reflect increasing uncertainty over time. No query parameter deep-links (e.g., ?category=) are used on this page. Preference coupling: fiscal_year_start_month affects FY-mode range; earningStartDate clamps view range start if useEarningStartDate is enabled; savingsGoalPercent sets the reference line on Savings Rate chart."

---

## Period Comparison
**Route:** `/comparison`  ·  **Reads from:** `useTransactions() - fetches all user transactions from /api/transactions (account filters applied server-side)`, `usePreferences() - fetches user preferences from /api/preferences (specifically fiscal_year_start_month for FY calculations)`

Compare financial metrics (income, expenses, savings, rates, and categories) across two time periods by selecting month, calendar year, or fiscal year.

### What's on the page

- **Period Selector** (toggle + form) — A tab-like toggle at the top of the page with three comparison modes (Month, Year, FY) and below it two sets of dropdown selectors labeled 'Period A' and 'Period B' with a 'vs' separator. Users click the mode tab to switch the selector dropdowns, then choose specific periods to compare. Defaults to fiscal year comparison with Period A as the prior year and Period B as the current fiscal year. *Computed:* Mode toggles between 'month', 'year', or 'fy' (CompareMode state). Available options are derived from transactions: months are extracted from transaction dates (YYYY-MM format sorted descending), years are unique years from transaction dates, and fiscal years are computed from transactions using the user's fiscal_year_start_month preference. Month defaults fall back to the two most recent complete months (before current month). Year defaults are prior year and current year. FY defaults are prior FY and current FY.
- **Income (KPI Card)** (metric card) — Large colored text showing Period B's total income with the label and amount. Below shows Period A's label and amount in smaller text. A colored badge shows the percentage change with an up/down/neutral arrow icon and the sign-prefixed change percentage. *Computed:* Summed from all transactions where type='Income' within the selected period. Percentage change = (periodB - periodA) / periodA * 100, or 100 if periodA is zero. Displays in formatted currency. Arrow color: green for positive (income growth is good), red for negative. Card color from SEMANTIC_COLORS.income.
- **Expenses (KPI Card)** (metric card) — Large colored text showing Period B's total expenses with the label and amount. Below shows Period A's label and amount. A change badge shows percentage change with arrow icon (red for increase, green for decrease since invertChange=true). *Computed:* Summed from all transactions where type='Expense' within the selected period. Percentage change = (periodB - periodA) / periodA * 100. For expenses, arrow color is inverted: green for decrease (good cost control), red for increase. Card color from SEMANTIC_COLORS.expense.
- **Savings (KPI Card)** (metric card) — Large colored text showing Period B's total savings (income minus expenses) with label and amount. Below shows Period A's savings. A change badge shows percentage change with arrow icon (green for increase, red for decrease). *Computed:* Savings = income - expense for each period. Percentage change = (periodB.savings - periodA.savings) / periodA.savings * 100. Positive change is good. Card color from SEMANTIC_COLORS.savings.
- **Savings Rate (KPI Card)** (metric card) — Large text showing Period B's savings rate as a percentage (e.g., '42.5%') with label and amount. Below shows Period A's rate. A change badge shows the percentage point change with arrow icon (green for increase, red for decrease). *Computed:* Savings rate = (savings / income) * 100 if income > 0, else 0. Change is displayed in percentage points (delta, not percentage): periodB.savingsRate - periodA.savingsRate. Card color is app.purple.
- **Financial Overview - Income** (bar chart) — Horizontal metric row titled 'Income' with a bar chart showing two overlaid bars (Period A faded at 35% opacity, Period B solid) extending from the same left edge. Values are labeled on the left (Period A) and right (Period B) with formatted currency. A change badge with percentage and arrow displays in the top right. The bar is color-coded (SEMANTIC_COLORS.income). Height is normalized to the largest value across all four metrics. *Computed:* Bar width for each period = (value / maxValue) * 100, where maxValue = max(all period income/expense values for this session, minimum 1). Both bars anchored at left edge so delta reads as visual gap. Percentage change = (periodB - periodA) / periodA * 100.
- **Financial Overview - Expenses** (bar chart) — Horizontal metric row titled 'Expenses' with overlaid bars (same layout as Income). Change badge color is inverted: green for expense decrease, red for increase. *Computed:* Same bar layout as Income. invertChange=true so positive change shows red (expense growth is bad), negative change shows green. Percentage change = (periodB - periodA) / periodA * 100.
- **Financial Overview - Savings** (bar chart) — Horizontal metric row titled 'Savings' with overlaid bars (same layout). Change badge is green for increase, red for decrease. *Computed:* Same bar layout. Savings = income - expense for each period. Percentage change = (periodB.savings - periodA.savings) / periodA.savings * 100.
- **Financial Overview - Savings Rate** (bar chart) — Horizontal metric row titled 'Savings Rate' with overlaid bars showing percentages. Bar width is normalized to maxValue=100 (percentage scale). Values display with '%' suffix. Change badge shows percentage points, not percentage. *Computed:* Savings rate = (savings / income) * 100 if income > 0, else 0. Bar width = (rate / 100) * 100. Percentage point change = periodB.savingsRate - periodA.savingsRate (e.g., '+5.2 pts').
- **Spending Distribution** (bar chart) — A butterfly chart with categories on the Y-axis (max 15 categories by total spend) and spend amount on the X-axis. Period A bars extend left (blue, 35% opacity if Period B won that category, 95% opacity if Period A won). Period B bars extend right (indigo, 95% opacity if Period B won, 45% opacity if Period A won). Categories are sorted by total spend (A+B) descending. Legend at top shows Period A (left, blue) and Period B (right, indigo). Labels show formatted short currency on bar ends. *Computed:* For each period, extract top 8 expense categories by value (value > 0), merge both lists into union of categories, sort by max(periodA, periodB) descending, truncate to top 15. For each category: periodA displayed as negative (forces left extension in stacked bar), periodB as positive (right). Color opacity: entry.aWins (periodA >= periodB) ? 95% for A, 45% for B; else 45% for A, 95% for B. Chart domain is [-maxVal, maxVal] symmetric. Hover shows exact formatted currency.
- **Expense Categories** (table) — Left-side card (on lg+ screens) with icon (red down arrow), title 'Expense Categories', and row count badge. Each row shows category name, percentage change in a colored badge (green for decrease, red for increase), and overlaid bars showing Period A (faded) and Period B (solid). Left and right values display formatted currency. Max height is scrollable (300px on mobile, 400px tablet, 520px desktop). Empty state message if no expenses. *Computed:* Collects all expense CategoryDelta records (periodA and periodB values, change = pctChange(periodB, periodA), changeAbs = periodB - periodA). Sorted by max(periodA, periodB) descending. For each row: bar width = (value / maxValue) * 100 where maxValue = first row's max(periodA, periodB). invertChange=true so positive change = red (bad), negative = green (good). Each row animates in with staggered delay (index * 0.03s). Rows are colored indigo (colorB). Change badge shows formatted percentage. Values show formatted currency.
- **Income Categories** (table) — Right-side card (on lg+ screens) with icon (green up arrow), title 'Income Categories', and row count badge. Layout identical to Expense Categories but change colors are not inverted (green for increase = good, red for decrease = bad). Shows income categories with overlaid bars and percentage changes. *Computed:* Same as Expense Categories but filtered to income CategoryDelta records (type='income') and invertChange=false. Positive change = green (income growth is good), negative = red (bad).
- **Quick Stats - Transactions** (metric card) — Small card showing label 'Transactions' with two columns: left shows Period A label and transaction count, right shows Period B label and count. Numbers are right-aligned and bold. *Computed:* Count of all transactions within each period (transaction.count field from PeriodSummary). Formatted as rounded integer.
- **Quick Stats - Avg Daily Spend** (metric card) — Small card showing label 'Avg Daily Spend' with two columns showing Period A and B values in formatted short currency. Divides period expense by period's day count. *Computed:* Average daily spend = period.expense / period.days. Days computed as inclusive calendar day span: Math.round((endDate - startDate) / 86400000) + 1, where dates are in local midnight. Formatted as short currency.
- **Quick Stats - Categories Used** (metric card) — Small card showing label 'Categories Used' with Period A and B column counts (number of distinct categories with any transaction in that period). *Computed:* Count of Object.keys(period.categories).length (categories with at least one transaction, income or expense). Formatted as rounded integer.
- **Quick Stats - Top Expense** (metric card) — Small card showing label 'Top Expense' with Period A and B values showing the single highest expense amount in that period across all categories. *Computed:* Math.max(...Object.values(period.categories).map(c => c.expense), 0). Formatted as currency.
- **Key Insights** (list) — Section titled 'Key Insights' with a lightbulb icon, containing a vertical list of auto-generated insight strings. Each insight is displayed in a rounded box with a small orange dot bullet. Insights appear only if the list is non-empty. Each insight animates in with a staggered delay. *Computed:* Generated by generateAllInsights(periodA, periodB, expenseDeltas). Returns array of strings from seven generators: (1) Income growth/drop if >= 5% change, (2) Expense increase/decrease if >= 5% change, (3) Savings rate shift if >= 3 percentage points, (4) Top category swing if largest absolute change > 0, (5) New categories appearing in B but not A (displayed up to 3), (6) Categories gone from A to B (up to 3), (7) Transaction volume if >= 15% change. Each generator returns null if threshold not met; only non-null strings are included.

### Controls & notes

CONTROLS: Three-tab toggle (Month/Year/FY) at page top switches comparison mode; dropdowns for each period change based on mode. No URL query parameters for deep linking (comparison state is ephemeral). EMPTY STATE: Shows 'No transactions yet' with Upload Data action if transactions array is empty. LOADING: Shows skeleton placeholders while useTransactions and usePreferences queries resolve. FY SPECIAL BEHAVIOR: When Period B is the current (in-progress) fiscal year, both periods are truncated to the same elapsed-day count so comparison is apples-to-apples (e.g., 2 months of last FY vs 2 months YTD, not 12 months vs 2 months). COMPUTATION: All metrics computed client-side from full transaction ledger (useTransactions returns all transactions), NOT from backend /api/calculations/* or /api/analytics/v2/* endpoints. Page uses plain percentage-change formula (pctChange = (curr - prev) / prev * 100 or 100 if prev=0). PREFERENCE COUPLING: fiscal_year_start_month determines available FY options and which FY is treated as 'current'; changes via useUpdateFiscalYear trigger page refresh via query invalidation. Day counts are always inclusive (inclusive of both start and end dates) to ensure fair daily averages. formatCurrency and formatCurrencyShort use the user's display currency preference.

---

## Year in Review
**Route:** `/year-in-review`  ·  **Reads from:** `useTransactions()`, `useDailySummaries()` (server-side pre-computed daily summaries from `/api/analytics/v2/daily-summaries`), `usePreferences()` for `fiscal_year_start_month`

Displays an interactive annual financial review with spending/earning heatmaps by day, monthly breakdown charts, and key metrics to highlight spending patterns and savings performance over a full calendar year or fiscal year.

### What's on the page

**Top Stat Cards (4-column grid on desktop, 2x2 on mobile):**

- **Total Spending** (KPI metric) — Sum of all expenses across the selected period, formatted compact; *computed:* `sum(grid[].expense)` aggregated from daily cells
- **Total Earning** (KPI metric) — Sum of all income across the selected period, formatted compact; *computed:* `sum(grid[].income)` aggregated from daily cells
- **Savings Rate** (KPI metric) — Percentage of income saved; *computed:* `((totalIncome - totalExpense) / totalIncome) * 100`, color-coded green (≥20%) or orange (<20%), shows up/down arrow based on sign
- **Daily Average** (KPI metric) — Average spending per day with transactions; *computed:* `totalExpense / daysWithExpense` (only days with expenses in denominator), formatted compact

**Mode Toggle (above stats):**
Three exclusive tabs toggle between Spending (expenses, red), Earning (income, green), and Savings (net cash flow, blue). The active tab switches which values are displayed on the heatmap and controls the color scheme across all downstream visualizations.

**Spending/Earning/Net Heatmap (desktop & responsive mobile fallback):**

- **Heatmap Grid (desktop-only):** 52 weeks × 7 days matrix showing a year at a glance; each day is a clickable 13×13px cell
  - **Each Cell (HeatmapCell):** Shows a single day's expense, income, or net (depending on mode); *computed:* intensity level determined by `getIntensityLevel(value / modeMax)` which buckets into 5 intensity levels (0–4) using thresholds [15%, 35%, 60%, 100%]; background color drawn from `heatmapColors[mode][intensityLevel]` (red/green/blue opacity progression); today's date outlined with mode accent color; cell is focusable, screen-reader labeled as `"YYYY-MM-DD: $X.XX spent/earned/net"` or `"YYYY-MM-DD: no activity"`
  - **Max Value (modeMax):** The highest daily value in the period for the active mode; used as the denominator for intensity scaling so the heatmap's color range adapts to data spread (e.g., if max expense is $500, a $75 day hits intensity 2)
  - **Month Labels:** Positioned at the first Sunday of each month above the grid (derived from `deriveMonthLabels()` scanning for month boundaries on Sundays)
  - **Day-of-Week Labels:** Left sidebar shows alternating day abbreviations (Sun, Tue, Thu, Sat) for row context

- **Mobile Monthly Summary (hidden on `md:` breakpoint):** 3×4 grid of month boxes instead of full-week heatmap; each box shows month abbreviation and `formatCurrencyCompact(abs(monthlyValue))` with background intensity matching the heatmap's colorscale

- **Day Detail Strip (below heatmap):** On hover/focus, displays: date (formatted `"Fri, 15 Jun 2025"`), Spending (red text), Earning (green text), Savings (blue text if positive, orange if negative), each showing `formatCurrency(amount)`. Empty state on desktop: `"Hover over a day to see details"`, on mobile: `"Tap a month to see details"`.

**Monthly Breakdown Chart (ComposedChart, 2/3 width on desktop, full width on tablet/mobile):**

- **Chart Type:** Stacked bar + overlay line combo; X-axis shows month abbreviations (Jan–Dec or FY months), Y-axis stacked values
- **Spending Bar** (red, top): `monthlyBarData[].Spending` = total expenses for that month; labeled with `formatCurrencyShort()` if room
- **Earning Bar** (green, below): `monthlyBarData[].Earning` = total income for that month; labeled with `formatCurrencyShort()`
- **Net Cash Flow Line** (blue dashed overlay): `monthlyBarData[].Net = Earning - Spending`; peaks above bars indicate saving months, troughs between bars indicate overspending months; animates with dots
- *Computed:* `monthlyBarData[i] = { name: MONTHS_SHORT[i], Spending: stats.monthlyExpense[i], Earning: stats.monthlyIncome[i], Net: earning - spending }`
- **Empty State:** If all months have `Spending === 0 && Earning === 0`, shows generic "No data" placeholder

**Quick Insights Panel (1/3 width on desktop, stacked below chart on mobile, 6 rows + 2 footer sections):**

- **Best Month (lowest spend)** (sun icon, green) — Month abbreviation where spending was lowest (excluding zero months); *computed:* `MONTHS_SHORT[monthlyExpense.indexOf(Math.min(...monthlyExpense.filter(e => e > 0)))]`, displays "N/A" if no spending months
- **Worst Month (highest spend)** (moon icon, red) — Month abbreviation with max spending; *computed:* `MONTHS_SHORT[monthlyExpense.indexOf(Math.max(...monthlyExpense))]`
- **Longest no-spend streak** (flame icon, orange) — Days with zero expense but ≥1 non-expense transaction (e.g., income-only days); *computed:* `maxStreak` from `accumulateStats()` which walks grid counting consecutive days where `expense === 0 && hasTx === true`; formatted `"${maxStreak} days"`, appears even if zero (shows `"0 days"`)
- **Biggest spending day** (down-arrow icon, red) — Largest single-day expense amount and its date; *computed:* `biggestExpenseDay = { date, amount }` tracked during stats accumulation, formatted `"$X.XXK"` and `"Mon, 15"` (or "N/A" if no spending)
- **Biggest earning day** (up-arrow icon, green) — Largest single-day income and its date; *computed:* `biggestIncomeDay = { date, amount }` similarly accumulated, formatted compact with date subtitle
- **Days with expenses** (bar chart icon, blue) — Count of days where `expense > 0`; *computed:* `"${daysWithExpense} of ${grid.length}"` (denominator is total days in the period)

**No-Spend Streak Record (footer section, visible if `maxStreak > 0`):**

- **Dot visualization:** Up to 30 small colored dots (full width) representing the streak; each dot's color transitions through green→blue→purple as position advances; opacity increases from 0.5 to 1.0 across the streak to show intensity buildup
- **Streak count badge** (large bold text, right-aligned) — `${stats.maxStreak} days` in color determined by `getStreakColor()`: green <7d, blue 7–13d, purple ≥14d

**Total Savings (footer section):**

- Large bold display: `formatCurrencyCompact(stats.totalSavings)`
- *Computed:* `totalIncome - totalExpense`; color-coded green if positive (prefixed `"+"`), red if negative (prefixed `"-"`)
- Divider above to separate from insights rows

**Spending by Day of Week (full-width section below monthly chart):**

- **Chart Type:** Radial/polar radar chart (7-point polygon, one per day Sun–Sat)
- **Spending Overlay** (red, semi-transparent fill): Average daily spending per day-of-week; *computed:* `spending[dayOfWeek] = sum(expense on that day) / count(occurrences of that day)`
- **Earning Overlay** (green, lighter semi-transparent): Average daily earning per day-of-week; same computation with income
- **Insights below chart (2-column grid, if data exists):**
  - **Biggest Day** (left, red-tinted): `"${insights.topDay} · $X.XXK/day"` showing the highest-spending day; *computed:* day with max spending value in the series, formatted compact
  - **Weekend vs Weekday** (right, neutral): `"+X%"` or `"-X%"` indicating weekend differential; *computed:* `weekendDelta = (weekendAvg - weekdayAvg) / weekdayAvg * 100` where `weekendAvg = (Sun + Sat) / 2` and `weekdayAvg = (Mon..Fri) / 5`, percentage displayed with "on weekends" suffix

### Controls & notes

**Time Filter (top-right dropdown):**

- **View Mode Toggle:** Switches between `'yearly'` (calendar year Jan–Dec) and `'fy'` (fiscal year Apr–Mar or as configured)
- **Year Selector:** Dropdown or spinner to pick calendar year (e.g., 2024, 2025)
- **Fiscal Year Selector:** If FY mode active, shows `"FY YYYY-YY"` label; calendar year extracted from FY label for internal date range calculations
- **Date Range Bounds:** Min/max dates constrain selectable periods based on uploaded transaction data; if no transactions exist in a period, returns "No data" state
- *Controlled by:* `viewMode`, `currentYear`, `currentFY`, `setViewMode`, `setCurrentYear`, `setCurrentFY`

**Data Range Selection Logic:**

- If `viewMode === 'fy'`: range starts at `new Date(selectedYear, fiscalYearStartMonth - 1, 1)` and ends at `new Date(selectedYear + 1, fiscalYearStartMonth - 1, 0)` (last day of fiscal year)
- If `viewMode === 'yearly'`: range is `Jan 1 – Dec 31` of selected year
- Range filters applied using `toLocalDateKey()` to preserve timezone-aware comparisons (avoids IST rollback bug with `toISOString()`)

**Server vs. Client Computation:**

- **With Daily Summaries (faster path):** If `dailySummaries` array has coverage spanning the selected date range (`summaryDates[0] <= startStr && summaryDates[-1] >= endStr`), uses `aggregateFromDailySummaries()` to build daily totals from pre-computed server endpoint (endpoint: `GET /api/analytics/v2/daily-summaries`)
- **Fallback to Transactions:** If daily summaries unavailable or have gaps, falls back to `aggregateDayTotals()` which walks all transactions and filters by date range, computing per-day sums client-side
- **Decision point in hook:** `const hasCoverage = summaryDates.length > 0 && summaryDates[0] <= startStr && summaryDates[summaryDates.length - 1] >= endStr`

**Fiscal Year Preference Coupling:**

- `fiscalYearStartMonth` reads from user preferences (`preferences?.fiscal_year_start_month || default 4` = April)
- Passed to date range calculations so heatmap respects custom FY boundaries
- If preferences unavailable, defaults to April as fiscal year start

**Empty States:**

- **No Transactions:** Large card with icon + message `"No transaction data yet"` + `"Upload Data"` button linking to `/upload`
- **No Data for Period:** Individual charts (Monthly Breakdown, Day-of-Week Radar) show `ChartEmptyState` placeholder if all values are zero

**Hover/Focus Interactions:**

- Heatmap cells delegate focus/hover events up via `onMouseOver`, `onFocus` to find `data-cell-date` and update `hoveredDay` state
- Day detail strip reactively displays hovered cell's data; on blur/mouse-leave, clears detail
- Keyboard navigation: cells are native `<button>` elements, so Tab moves focus; Enter/Space trigger focus events

**Accessibility:**

- Each heatmap cell has `aria-label` describing the day and value: `"YYYY-MM-DD: $X spent/earned/net"` or `"no activity"`
- Monthly bar chart includes Recharts `<Tooltip>` on hover showing formatted currency
- Day-of-week radar chart shows tooltip with `"Avg Spending"` / `"Avg Earning"` labels
- Color blindness consideration: heatmap uses opacity progression in addition to color, so intensity visible without color alone

**Responsive Breakpoints:**

- **Mobile (< `md:` breakpoint):** Heatmap hidden, Mobile Monthly Summary shown instead (3×4 grid), detail strip shows `"Tap a month"` prompt instead of hover instruction
- **Desktop (`md:` and up):** Full week-by-week heatmap visible with day labels, hover instructions

**Animation & Performance:**

- Charts animate in on mount: stat cards slide in with `y: 10→0` fade, heatmap/charts use `isAnimationActive={shouldAnimate(dataLength)}` (throttles animation if >20 data points to preserve performance)
- Streaks below quick insights animate with staggered dot appearances and opacity transitions
- No-Spend Streak visualizer only renders if `maxStreak > 0`, reducing DOM bloat when streak is zero

**Deep-linking / Query Parameters:**

- Currently no URL query parameters for deep-linking (e.g., no `?year=2024&mode=expense`)
- All state lives in React component state, so browser back/forward does not preserve selections across navigation
- Future enhancement: could add URL params to `AnalyticsTimeFilter` for permanent link sharing

**Ledger Synchronization:**

- Page data updates automatically when `useDailySummaries()` or `useTransactions()` refetch after upload
- React Query cache key is `['analyticsV2', 'daily-summaries', startDate, endDate, limit]` so changing year/FY triggers fresh API call
- Stale time is `Infinity` (data only changes on new uploads), so user navigating away and back sees instant cached render

---

## Net Worth
**Route:** `/net-worth`  ·  **Reads from:** `/api/calculations/account-balances`, `/api/calculations/monthly-aggregation`

Comprehensive net worth tracking page displaying current financial position, trend projections, milestones, categorized assets/liabilities, and credit card utilization.

### What's on the page

- **Total Assets (metric card)** (metric card) — A single number showing the user's total positive account balances in green. This is the sum of all accounts with balance > 0. *Computed:* Sum of all positive balances from the /api/calculations/account-balances endpoint. Balance > 0 filter applied during aggregation.
- **Total Liabilities (metric card)** (metric card) — A single number showing the user's total negative account balances as an absolute value in red. This is the sum of all accounts with balance < 0, displayed as a positive number. *Computed:* Absolute value of the sum of all negative balances from /api/calculations/account-balances. Balance < 0 filter; result is negated and displayed as magnitude.
- **Net Worth (metric card)** (metric card) — A single number in blue showing the net financial position: total assets minus total liabilities. *Computed:* totalAssets - totalLiabilities (both derived from current account balances).
- **Net Worth Trend (area chart)** (area chart) — Time-series visualization of net worth over days/months, with optional stacked breakdown by asset category (Cash & Wallets, Bank Accounts, Investments) or a single line showing total net worth. When projection is enabled, displays historical data plus a forward-projected median line (blue dashed) surrounded by a confidence band (±1σ). Upcoming milestones appear as faint horizontal reference lines. Interactive brush control at bottom allows zooming to a specific date range without affecting the global time filter. *Computed:* Daily cumulative net worth derived from income/expense transactions (income - expense flow, cumulative sum per day). Historical series sourced from client-side computation: transactions are bucketed by date, cumulative net worth calculated day-by-day. For stacked view, each day's net worth is proportionally split among categories using categoryProportions = (category balance / total positive net worth). Projection (when enabled): anchor = last historical point; mean = anchor * (1 + monthlyRate)^n; band = ±logSigma * sqrt(n) under geometric Brownian motion model. monthlyRate computed from last 12 months of month-end net worth using geometric mean: r = (end/start)^(1/n) - 1. logSigma = stddev of log-returns over the same window.
- **Time Filter** (toggle) — Dropdown selector at top-right showing current view mode (e.g., 'All Time', 'Last 30 days', 'Last 90 days', 'Last Year', or custom range). Selected range is displayed and applied to the trend chart and milestones table. *Computed:* Managed by useAnalyticsTimeFilter hook; pulls min/max dates from transaction set and offers preset windows or custom date pickers. Applied to filter filteredNetWorthData = netWorthData.filter(d => d.date >= start && d.date <= end).
- **Stacked View Toggle** (toggle) — Button labeled '📊 Stacked View' (when active) or '📈 Total View' (when inactive). Disabled and grayed out if any data point in the current chart window has negative net worth (stacked proportions are undefined for negative totals). *Computed:* showStacked state toggle. Disabled when hasNegativeNetWorth = chartData.some(d => d.netWorth < 0). When active, renders multiple Area components (one per category) with stackId='1'. When inactive, renders single Area for total netWorth.
- **Projection Toggle** (toggle) — Button labeled '🔮 Projecting' (when active) or '🔮 Project' (when inactive). Disabled if monthlyGrowthRate <= 0. Tooltip shows current annualized rate and monthly %. *Computed:* showProjection state. Disabled when monthlyGrowthRate <= 0. When toggled on, chart renders projectionBand and projected series (blue dashed line + shaded band) extending 60 months forward from the anchor.
- **Net Worth Milestones (table)** (table) — A 5-column table with rows for each milestone (₹1L, ₹5L, ₹10L, ₹25L, ₹50L, ₹1Cr, ₹2.5Cr, ₹5Cr, ₹10Cr): Target (amount + label), Status (Stable green checkmark, Reached yellow circle, or Upcoming target icon), First Reached (date when net worth crossed threshold), Stable Since (date from which it never dipped below), and Expected to Reach (ETA + months away). Summary row shows current net worth, growth rate (annualized %), and counts of stable + reached milestones. Empty state if no milestones achieved yet. *Computed:* buildMilestoneRowsCompound scans the full historical series for when each milestone value was first crossed (achieved date). For achieved milestones, stableSince = last date before final crossing where value < target + 1 = first crossing after that dip (or null if currently below). For upcoming milestones, date/distance computed from anchor using compound formula: n = ln(target / anchor) / ln(1 + monthlyRate); ETA = anchor.date + (n * 30.44) days. monthlyRate from last 12 months geometric mean. Milestones use DEFAULT_MILESTONES constants (₹1L through ₹10Cr). Annualized = ((1 + monthlyRate)^12 - 1) * 100. Monthly rupee gain = currentNetWorth * monthlyRate.
- **Assets (Positive Balances) Table** (table) — Hierarchical table grouped by account type (Cash & Wallets, Bank Accounts, Investments, Other). Each group has a collapsible header showing category name, count, total balance (green), % of total assets, and transaction count. When expanded, lists individual accounts with balance (bold green), % of total, account type, and transaction count. Accounts are sorted by type, then within type by balance (descending). Column header 'Balance' is clickable to sort by balance magnitude; current sort direction shown with up/down arrow. *Computed:* Filtered from useAccountBalances by balance > 0. getAccountType resolves via: (1) explicit classification from account-classifications API, (2) investment_account_mappings from preferences, or (3) name heuristics (includes 'credit' → Credit Cards, 'bank' → Bank Accounts, 'cash'/'wallet' → Cash & Wallets). Accounts grouped by type via reduce; categories toggled for expansion via expandedAssetCategories state. Category total = sum of abs(balance) for all accounts in that type. % allocated = (category balance / total assets) * 100. Sort key defaults to type (ascending), then by balance (descending).
- **Liabilities (Negative Balances) Table** (table) — Identical structure to Assets table but filters balance < 0, displays in red, and shows negative account balances as absolute values. Empty state: 'Great news! You don't have any liability accounts with negative balances.' *Computed:* Filtered by balance < 0, absolute value taken for display. Same grouping/sorting logic as Assets table. Uses expandedLiabilityCategories state for collapse/expand. Account type resolution same as Assets.
- **Credit Card Health (card component)** (metric card) — Shows number of detected credit cards and overall utilization %. Displays a bar for total credit utilization (color-coded: green <30%, blue 30-50%, yellow >50%, red >75%). Lists individual cards with their balances, limits, utilization %, and a small status icon. Includes utilization thresholds legend at bottom and a warning box if any card is >50% utilized recommending balance paydowns. Empty state if no credit cards found. *Computed:* Accounts classified as 'Credit Cards' (from account-classifications API or name-hinting via 'credit' in name). utilization = (balance / creditLimit) * 100. creditLimit sourced from preferences (selectCreditCardLimits); defaults to ₹1L if not set. Status thresholds: <30% low (green), 30-50% medium (blue), 50-75% high (yellow), >75% critical (red). Overall utilization = (totalBalance / totalLimit) * 100. Cards sorted by utilization descending. totalBalance and totalLimit summed across all detected cards.
- **Account Type Classification Helper** (form) — Not a visible form on this page, but the underlying logic: accounts are assigned types based on Settings > Accounts classifications (where users explicitly categorize each account), or via preference-stored investment_account_mappings, or via fallback name heuristics. This determines the grouping in both Assets and Liabilities tables and is used for Credit Card detection. *Computed:* resolveAccountType and resolveAccountCategory functions in netWorthUtils.ts. Priority: (1) classifications[accountName] from account-classifications service, (2) investmentMappings[accountName], (3) name pattern matching. Categories: Cash & Wallets, Bank Accounts, Investments, Credit Cards, Loans/Lended, Other.

### Controls & notes

Page-level time filter allows switching between all_time, last_30_days, last_90_days, last_year, or custom date range; this filters the net-worth trend chart and milestones table but NOT the asset/liability tables (those show current balances). Stacked view toggle is disabled when any historical net worth is negative (compound-growth model for categorized assets breaks). Projection toggle requires positive monthly growth rate; uses geometric Brownian motion to model uncertainty, displaying a median line + 1-sigma confidence band. Milestones are pre-defined thresholds (₹1L, ₹5L, ₹10L, etc.); status automatically marks 'Stable' when net worth never dipped below a threshold post-crossing. Asset/Liability tables support click-to-expand categories and balance-column sorting. Empty states: no assets → \"Add transactions for accounts with positive balances\"; no liabilities → \"Great news! You don't have any liability accounts.\"; no transactions → \"Upload your transaction data to track net worth over time.\" Credit Card Health renders only when credit cards are detected via explicit account classification (Settings > Accounts) or name-hinting; utilization thresholds are <30% (excellent), 30-50% (good), >50% (reduce). Default credit card limit is ₹1L; users set individual limits in Preferences."

---

## Investment Analytics
**Route:** `/investments/analytics`  ·  **Reads from:** `/api/calculations/account-balances`, `useTransactions (full ledger fetch, client-side filtering)`, `usePreferences (investment_account_mappings, monthly_investment_target)`

Monitor your investment portfolio performance, asset allocation, growth trends, and track individual accounts with metrics like XIRR and monthly investment targets.

### What's on the page

- **Total Investment Value** (metric card) — The total current value of all assets held across all investment accounts. Displays the sum in currency format with a green trending-up icon. *Computed:* Sum of all account balances where the account is classified as an investment type (via investment_account_mappings in preferences). Transaction types counted: (1) Transfer incoming to investment account, (2) Transfer outgoing from investment account, (3) Income into investment account, (4) Expense from investment account. All are aggregated per account then summed across all investment accounts.
- **Portfolio Assets** (metric card) — The count of unique investment accounts classified in the user's preferences. Displayed as a single number with a pie-chart icon. *Computed:* Count of keys in the investment_account_mappings dictionary from preferences (i.e., number of accounts the user has classified as investment accounts in Settings).
- **Net Investment P&L** (metric card) — The total profit/loss from investment activities, displayed in currency format with a subtitle showing the percentage of portfolio value. Color is green if positive, red if negative. *Computed:* Sum of realized profits (Income transactions with 'profit', 'gain', 'realized' in category/note/subcategory) + Dividend Income (Income with 'dividend' or 'divid') + Interest Income (Income with 'interest', 'int.', or 'int cr') minus Investment Loss (Expense with 'loss' or 'write' in category/note/subcategory, marked as investment-related) minus Broker/Trading Fees (Expense with 'broker'/'charge'/'fee' or 'brokerage' or 'demat'/'charge' or 'trading'/'charge'/'fee'). Note: calculated from transaction text patterns, not from tagged transaction types. Percentage is (Net P&L / Total Investment Value) * 100, clamped to portfolio value for display.
- **Portfolio XIRR** (metric card) — The annualized internal rate of return (XIRR) for the portfolio. Displayed as a percentage with one decimal place. Shows '-' if insufficient data; shows green if positive, red if negative. Subtitle indicates 'Annualized, all flows' when computed, or 'Needs dated flows' when zero. *Computed:* Internal rate of return calculated using the XIRR algorithm on cash flows: (1) Extract all Transfer transactions; (2) If to_account is investment AND from_account is NOT investment, record as positive cash flow on transaction date; (3) If from_account is investment AND to_account is NOT investment, record as negative cash flow on transaction date; (4) Add final negative cash flow at today's date equal to the negative of current total investment value; (5) Calculate XIRR on sorted cash flows. Returns 0 if fewer than 1 dated flow or total investment value <= 0.
- **Monthly Investment Target** (metric card) — The user's monthly investment savings goal in currency format, displayed only if monthly_investment_target > 0 in preferences. Includes a progress bar showing current month progress and percentage achieved (capped at 100%, green bar if >= 100%, orange if < 100%). *Computed:* Read directly from preferences.monthly_investment_target. Progress bar filled as (currentMonthInvestment / monthlyInvestmentTarget) * 100. Current month investment is calculated from Transfer transactions where to_account is an investment account, filtered to transactions starting with YYYY-MM matching the current month (e.g., '2026-06' for June 2026). Conditionally displayed — the entire card only renders if monthly_investment_target > 0.
- **Asset Allocation** (pie chart) — Breakdown of portfolio value by investment type (Stocks, Mutual Funds, FD/Bonds, PPF/EPF). Pie chart shows each asset class as a color-coded slice with percentage labels. Center displays 'Total' label with the total portfolio value in currency-short format (e.g., '2.5M'). *Computed:* For each investment account, determine its category by mapping the investment_type from preferences.investment_account_mappings through the mapToCategory function: keywords 'stock'/'equity'/'share'/'demat'/'rsu' -> Stocks (green); 'fd'/'fixeddeposits'/'bond'/'deposit' -> FD/Bonds (pink); 'ppf'/'epf'/'provident'/'nps'/'pension' -> PPF/EPF (orange); 'mf'/'mutualfunds'/'fund'/'mutual' -> Mutual Funds (purple). Sum account balances per category. Filter to categories with value > 0, calculate percentage = (categoryValue / totalInvestmentValue) * 100. Sort by descending value.
- **Investment Growth Over Time** (area chart) — Stacked area chart showing portfolio value growth by asset class (Stocks, Mutual Funds, FD/Bonds, PPF/EPF) across all days from earliest to latest transaction. X-axis shows dates; Y-axis shows cumulative value. Each asset class is color-coded. Chart includes a brush (range selector) at the bottom for zooming into recent data (defaults to most recent third of timeline). *Computed:* Process all transactions (Transfers in/out, Income, Expense) across investment accounts. For each day with a transaction, create a snapshot of running account balances. Fill gaps with forward-fill (carry forward last known balance for each account). For each day, aggregate account balances by their investment category (Stocks, Mutual Funds, FD/Bonds, PPF/EPF). Generate daily data points with date and category totals (capped at 0 minimum per category). Chart is then filtered to the date range selected by the time filter (see below). Stacking is additive (stackId='1'), showing cumulative portfolio value.
- **Investment Accounts** (table) — List of investment accounts ranked by balance. Columns: Account name, Value (currency), Allocation (percentage of total portfolio). Table has up to 8 rows (top 8 by balance). Columns are clickable for sorting; current sort column and direction (↑/↓) are indicated. *Computed:* From filteredInvestmentTotals.byAccount, filter to accounts with value > 0, sort descending by value, take top 8. For each account, calculate percentage = (accountValue / totalInvestmentValue) * 100 to one decimal place. Default sort is descending by balance. User can click 'Value' or 'Allocation' headers to toggle sort (asc/desc). Sorting state is managed by investSortKey and investSortDir; clicking the same header again reverses direction.

### Controls & notes

Empty state: If no investment accounts are classified in Settings (investment_account_mappings is empty or all accounts have value 0), page displays a full-screen empty state card with message 'No investment accounts classified' and a button linking to Settings. Time filter control at top right: user can select view mode (all_time, year, month, fiscal_year), date range bounds are computed from min/max transaction dates clamped to the earning-start-date preference if enabled. Monthly Investment Target card (5th metric) is conditionally rendered only if the preference value > 0; without it, grid is 4 columns wide instead of 5. Growth Over Time chart includes a brush (drag-to-zoom) only if data has > 6 points. Growth chart respects the selected time filter date range (dateRange.start_date and dateRange.end_date) for filtering dailyGrowthData. Chart animation is disabled if data has > 100 points to avoid performance degradation. Profit/Loss computation is heuristic, based on transaction text patterns (category, note, subcategory), not strict transaction tagging — users should ensure transaction notes/categories follow naming conventions (e.g., 'Dividend Income', 'Investment Loss', 'Broker Fee') for accurate P&L. XIRR requires dated cash flows and a positive ending balance; it returns 0 if these conditions are not met, so pages with no transfer history or only transfers within the investment account (no external deposits/withdrawals) will show '-' for XIRR.

---

## Mutual Fund / SIP Projection
**Route:** `/investments/sip-projection`  ·  **Reads from:** `/api/calculations/account-balances`, `useAccountBalances() hook`, `/api/transactions`, `useTransactions() hook`, `useInstrumentRates() hook for PPF, EPF, NPS rates`

Visualize historical SIP contributions, analyze realized returns, and project future portfolio growth based on user-defined return rates and contribution schedules.

### What's on the page

- **Current Balance** (metric card) — Displays the current balance of the primary mutual fund account. The account name is shown below the balance. This represents the actual portfolio value right now, pulled from account balances data. *Computed:* Fetched from useAccountBalances() hook via /api/calculations/account-balances endpoint. Filters accounts that are classified as 'Investments', then matches those containing 'mutual' or 'fund' in the name. Sorts by balance (descending) and prioritizes a 'Grow Mutual Funds' account if present; otherwise uses the first account. The balance shown is the absolute value from the account data.
- **Monthly SIP** (metric card) — Shows the detected monthly SIP amount based on recent transaction history, plus a count of the total number of SIP transactions. When the user manually changes the SIP amount in the Projection Parameters form, this card updates to reflect the override. *Computed:* Auto-detected from sipTransfers using detectMonthlySIPAmount(). Filters for transactions where the note contains 'monthly' OR 'sip' (but not 'lumpsum'), then returns the amount of the most recent matching transaction. Returns 0 if no transactions match. User can override this by entering a custom amount in the Monthly SIP input field; when overridden, the input value becomes the active SIP used in all projections. The transaction count equals the length of all SIP transfers to the primary account.
- **Total Invested** (metric card) — Sum of all historical SIP contributions (actual amount of cash invested). This is a static measure of cumulative outflows, not including gains. Labeled 'Actual contributions'. *Computed:* Calculated as sipTransfers.reduce((sum, tx) => sum + tx.amount, 0). SIP transfers are filtered from all transactions where type === 'Transfer' AND to_account matches the primary account name (case-insensitive). The entire dataset (all transactions) is used; no time filtering is applied.
- **Realized Gain** (metric card) — The profit or loss on the portfolio: current balance minus total historical invested. Colored green for gains, red for losses. Shows the gain amount and a percentage return (e.g., '+12.34% returns'). Uses the current balance from the account, not any manual override. *Computed:* realizedGains = currentBalance - totalHistoricalInvested. realizedGainsPercent = (realizedGains / totalHistoricalInvested) * 100 if totalHistoricalInvested > 0, else 0. Card background and text color determined by computeGainsDisplay(realizedGains, ...), which assigns 'text-app-green' and 'bg-app-green/20' for gains >= 0, and 'text-app-red' and 'bg-app-red/20' for losses.
- **Monthly SIP Input** (form) — A text input field where users can manually override the auto-detected monthly SIP amount. Shows an auto-detected hint ('Auto-detected from last SIP') if an amount was automatically detected and the user hasn't yet modified it. Min value 0, step 1000. Input is in rupees. *Computed:* Displayed value is sipInputValue, which equals userModifiedSIP ? monthlySIP : (detectedMonthlySIP || monthlySIP). When user changes this input, it calls setMonthlySIP() and setUserModifiedSIP(true). The hint appears only when showAutoDetectedHint is true, i.e., detectedMonthlySIP > 0 AND !userModifiedSIP.
- **Expected Return (% p.a.)** (form) — Input field for the annual return rate (per annum) expected on the portfolio. This is used to calculate future value projections. Min 0, max 50, step 0.5. Entered as a percentage (e.g., 12 for 12% p.a.). *Computed:* State managed by expectedReturn; default 12. User changes trigger setExpectedReturn(). This value is passed to calculateSIPProjection() as annualRate and converted internally to a monthly rate (annualRate / 12 / 100) for month-by-month compounding. Also used in buildProjectionChartData() and buildCombinedChartData().
- **Projection Period (Years)** (form) — Input field for how many years into the future to project. Min 1, max 40. Defaults to 10 years. Controls both the projection calculations and the growth chart display. *Computed:* State managed by projectionYears; default 10. User changes trigger setProjectionYears(). Converted to months internally (years * 12) in calculateSIPProjection(). The growth chart has preset buttons (1Y, 3Y, 5Y, 10Y, 20Y, 30Y) that set this value via onProjectionYearsChange callback.
- **SIP Growth (% p.a.)** (form) — Annual percentage growth rate applied to the SIP amount itself. Allows modeling scenarios where the monthly SIP increases each year. Min 0, max 20, step 1. For example, if SIP is 10000 and growth is 5%, the SIP becomes 10500 in year 2. A label below the input shows the selected growth rate (e.g., 'No annual increase' if 0, or 'SIP increases 5% yearly' if 5). *Computed:* State managed by sipGrowthRate; default 0. User changes trigger setSipGrowthRate(). Within calculateSIPProjection() and buildProjectionChartData(), at the end of each 12-month period, if sipGrowthRate > 0, the currentMonthlySIP is multiplied by (1 + sipGrowthRate / 100). The label is derived from sipGrowthLabel computed in the hook.
- **Current Value (Manual Override)** (form) — Optional input field under 'Returns Analysis' section. Allows user to manually override the 'effective current value' used in calculations. Placeholder shows the current portfolio balance. Empty input means 'use the actual account balance'. Min 0, step 1000. Labeled 'Using your entered value' when filled, or 'Using portfolio balance' when empty. *Computed:* State managed by currentValueInput; default 0. When user enters a value, onCurrentValueChange() updates it. effectiveCurrentValue = currentValueInput > 0 ? currentValueInput : currentBalance. This effective value is used in all projection calculations (calculateSIPProjection, XIRR computation, chart data). The label reflects whether the override is active via currentValueLabel state.
- **Total Return (Percentage)** (metric card) — Displays the total return percentage based on the effective current value. Shows +/- prefix and 'x% on Rs y' breakdown. Colored green for positive, red for negative. Part of the Returns Analysis section. *Computed:* overrideGainsPercent = (overrideGains / totalHistoricalInvested) * 100 if totalHistoricalInvested > 0, else 0. overrideGains = effectiveCurrentValue - totalHistoricalInvested. Color determined by computeGainsDisplay(realizedGains, realizedGainsPercent, overrideGainsPercent, xirrPercent). If overrideGainsPercent >= 0, color is 'text-app-green', else 'text-app-red'. totalReturnSignPrefix is '+' if >= 0, else ''.
- **Annualized Return (XIRR)** (metric card) — Annualized internal rate of return (XIRR) based on the actual cash flow history. Shows '% p.a.' and the investment duration in years below. Colored green for positive, red for negative. Part of the Returns Analysis section. *Computed:* xirrPercent computed via computeXirrPercent(sipTransfers, effectiveCurrentValue). Builds a cashflows array: each SIP transfer as a negative outflow (date, -amount), then adds a final entry for today with +effectiveCurrentValue. Calls calculateXIRR(cashFlows) from @/lib/xirr. Returns 0 if sipTransfers.length === 0 or effectiveCurrentValue <= 0. investmentDurationYears = (now - firstSIPDate) / MS_PER_YEAR. Color determined by xirrColorClass from computeGainsDisplay().
- **Effective Value** (metric card) — Shows the effective portfolio value used in all calculations. Orange-colored. Below it, a label indicates the source: 'Manual override' if user entered a custom value, or 'From portfolio' if using the actual account balance. *Computed:* effectiveCurrentValue = currentValueInput > 0 ? currentValueInput : currentBalance. This is a computed value (not state). The label is set via effectiveValueLabel in the hook, determined by whether currentValueInput > 0.
- **Total Investment** (metric card) — Projected cumulative amount invested over the projection period, starting from the current corpus and adding the monthly SIP for the next N years. Shown as a currency value and includes details about the number of months and monthly SIP amount. Part of Projection Results section. *Computed:* projection.invested from calculateSIPProjection(activeMonthlySIP, expectedReturn, projectionYears, sipGrowthRate, effectiveCurrentValue). Starting from startingCorpus (effectiveCurrentValue), the function adds currentMonthlySIP each month for (years * 12) months, applying sipGrowthRate growth annually. Formula: totalInvested = startingCorpus + (sum of monthly SIPs with annual growth applied).
- **Projected Value** (metric card) — The portfolio value at the end of the projection period, after returns. Colored green. Shows 'After N years' below the value. Part of Projection Results section. *Computed:* projection.value from calculateSIPProjection(). Month-by-month loop: portfolioValue = (portfolioValue + currentMonthlySIP) * (1 + monthlyRate), where monthlyRate = annualRate / 12 / 100. Runs for projectionYears * 12 months. SIP grows annually by sipGrowthRate if > 0.
- **Projected Returns** (metric card) — The profit (value of gains) projected at end of period: Projected Value - Total Invested. Colored blue. Also shows the overall gain percentage (e.g., '25.5% overall gain') below the amount. Part of Projection Results section. *Computed:* projection.returns = projection.value - projection.invested. Percentage gain shown as ((returns / invested) * 100).toFixed(1)%.
- **Investment Growth Path Chart** (area chart) — Dual-area chart showing historical invested amount (blue) and portfolio value (green) over time, from the first SIP transaction to the end of the projection period. Blue area represents cumulative invested capital. Green area represents portfolio value (invested + gains). Chart is divided visually into historical (past) and projected (future) portions. X-axis shows months (e.g., 'Jan 23', 'Feb 23', ...), Y-axis shows currency values. Includes preset projection-period buttons (1Y, 3Y, 5Y, 10Y, 20Y, 30Y). *Computed:* chartData from buildCombinedChartData(sipTransfers, effectiveCurrentValue, activeMonthlySIP, expectedReturn, projectionYears, sipGrowthRate). This combines historical and projected data. Historical: buildHistoricalChartData groups transactions by month, calculates cumulative invested, and derives proportional value using (invested / totalInvested) * totalGains. Projected: buildProjectionChartData starts from the last historical point, then projects forward month-by-month using the same formula as calculateSIPProjection. Each point has month label, invested amount, value, and isHistorical flag.
- **Chart Statistics Footer** (metric card) — Below the chart, a four-column summary displaying: Current Invested (sum of all past SIPs), Current Value (current portfolio balance), Future Invested (projected total invested at end of period), and Future Value (projected portfolio value). Formatted in currency with muted text labels above each value. *Computed:* currentInvestedDisplay = totalHistoricalInvested. currentValueDisplay = currentBalance. futureInvestedDisplay = projection.invested. futureValueDisplay = projection.value. All formatted via formatCurrency(). If isLoading, all display '...'.
- **Instrument Projections (PPF, EPF, NPS)** (tabbed section) — A tabbed interface allowing users to model future values of individual retirement instruments (PPF, EPF, NPS). Each tab has input sliders and projection results. Located at the bottom of the page after the SIP growth chart. PPF tab shows maturity value, total invested, interest earned, and interest rate. EPF tab shows maturity, contributions, interest, and monthly total. NPS tab shows projected value, contributions, and returns. *Computed:* Uses separate hooks useAccountBalances() and useInstrumentRates() to fetch initial balances and current/historical rates. PPF calculated via projectPPF(balance, annual, years, rate). EPF via projectEPF(salary, contribPct, rate, years, balance). NPS via projectNPS(monthly, allocation %, years, balance). Each tab has independent state (balance, contribution rate, years, etc.) and recalculates on any input change. No connection to the main SIP projection parameters; purely for comparison/planning.

### Controls & notes

Page-level controls: Users can adjust projection years via preset buttons (1Y, 3Y, 5Y, 10Y, 20Y, 30Y) on the growth chart, or manually in the Projection Period input. All SIP-related computations are client-side, using the full sipTransfers array with no date filtering. The 'Current Value' manual override field in the Returns Analysis section decouples the portfolio valuation from the actual account balance, useful for modeling 'what-if' scenarios or when the account balance may not reflect the true current holdings. The page loads account data and calculates everything based on the transactions fetched. Empty state shown on the growth chart if no SIP transactions exist: 'No SIP transactions found. Transfer data to a mutual fund account to see projections.' The primary account is detected once at page load and used consistently across all computations. No deep-linking parameters are visible in this version. The projection is entirely forward-looking from today; historical data is aggregated but uses proportional value distribution (gains spread proportionally across historical months based on contribution timing). The primary Mutual Fund account is selected by name priority: 'Grow Mutual Funds' first, else first by highest balance. The Instrument Projections section (PPF, EPF, NPS) at the bottom is a separate tool that does not interact with SIP projection settings.

---

## Returns Analysis
**Route:** `/investments/returns`  ·  **Reads from:** `/api/transactions` (full ledger), `/api/calculations/account-balances` (balances by account), `/api/calculations/monthly-aggregation` (monthly income/expense aggregates)

Comprehensive view of investment portfolio performance including monthly P&L trends, cumulative returns, income/expense breakdown, and per-account holdings composition. Analyzes investment-related transactions (dividends, interest, profits, losses, broker fees) classified from transaction category, note, and subcategory text.

### What's on the page

**Net Investment P&L** (large hero metric) — Big number showing cumulative profit/loss across all investment transactions (investment profit + dividends + interest income minus investment losses and broker fees). Coloring: green if >= 0, red if < 0; icon and background match.

**CAGR** (metric) — *computed:* Compound Annual Growth Rate derived from monthly aggregation data using the formula `(endingValue / beginningValue) ^ (1 / years) - 1` where years = count of months / 12. Returns 0 if beginning value <= 0 or years <= 0.

**Monthly ROI** (metric) — *computed:* Monthly equivalent of CAGR using `(1 + CAGR/100)^(1/12) - 1` × 100, converting annual compound rate to monthly (not simple division by 12, which would overstate the rate).

**Total Income** (metric) — *computed:* Sum of Investment Profit + Dividend Income + Interest Income.

**Total Costs** (metric) — *computed:* Sum of Investment Loss + Broker Fees.

**Monthly Investment P&L chart** (area/line combo) — Visualizes monthly net P&L as stacked positive/negative areas (green above zero, red below) with a blue dashed cumulative line overlay. X-axis shows months, Y-axis shows currency. Reference line at y=0. Split by transaction classification: income includes transactions with type "Income" and text matching keyword patterns (dividend, divid, interest, int., int cr, int credit, profit, gain, realized); expenses include type "Expense" with investment account category (Investment, Stock, Trading) and text matching broker fee patterns (broker+charge/fee, brokerage, demat+charge, trading+charge/fee, transaction+charge) or investment loss patterns (loss, write — but excluding broker/brokerage). Cumulative P&L is rolling sum month-over-month from oldest to newest.

*Controls:* Brush slider at bottom (appears if > 6 months of data) defaults to showing the most recent third of the timeline for full-fidelity reading; drag to zoom across time.

**Monthly Performance heatmap strip** (tiles) — Horizontal scrolling strip of colored tiles, one per month. Each tile shows the month (short format + 2-digit year, e.g., "Jan 24") and the net monthly return formatted short (e.g., "+$2.3K"). Tile background intensity scales from 8% (baseline) to 58% (max absolute monthly value) using the formula `intensity = min(abs(month.net) / maxAbs, 1) × 0.5 + 0.08`. Green for positive, red for negative months. Tooltip on hover shows full month and amount.

**Income Sources card** (breakdown with bars) — Green-themed section listing three income line items, each with value and proportional bar:
- **Investment Profit** — transactions type "Income" with text matching "profit", "gain", or "realized"
- **Dividend Income** — transactions type "Income" with text matching "dividend" or "divid"
- **Interest Income** — transactions type "Income" with text matching "interest", "int.", or "int cr"

Each shows the value in currency and a proportional bar (width = item.value / totalIncome × 100%). Total row at bottom shows Total Income in large green text.

**Costs & Losses card** (breakdown with bars) — Red-themed section listing two expense line items, each with value and proportional bar:
- **Investment Loss** — transactions type "Expense" with category containing "investment", "stock", or "trading", and text matching "loss" or "write" (but excluding broker/brokerage patterns)
- **Broker Fees** — transactions type "Expense" with category containing "investment", "stock", or "trading", and text matching broker fee patterns: (broker + charge/fee), brokerage, (demat + charge), (trading + charge/fee), (transaction + charge)

Each shows the value in currency and a proportional bar. Total row at bottom shows Total Costs in large red text.

**Net Profit/Loss footer** (metric) — Summary row showing Net P&L = Total Income - Total Expenses, in large bold text (green if >= 0, red if < 0).

**Holdings by Value** (horizontal bar chart) — Displays up to 12 investment accounts ranked by current balance (descending). Bars are purple with decreasing opacity (first bar opaque, each subsequent bar -5% opacity). Y-axis shows account names (left-aligned, width 140px); X-axis shows balance formatted as currency short (e.g., "$250K"). Tooltip on hover shows full account name, balance in currency, and transaction count. Chart height auto-scales: `max(280px, accountCount × 36px)`. If > 12 accounts, footer notes "Showing top 12 of N accounts."

Data source: `balanceData` from `/api/calculations/account-balances` endpoint filtered to investment accounts only (determined by `isInvestmentAccount(name)` — checks if account name includes "Investment", "Stock", or "Trading"). Values are absolute balance amounts; transactions count is included per account.

*Note:* Subtitle mentions "Top holding: [Account Name] ([Balance formatted short])."

### Controls & notes

**Time Filter** (header-right dropdown) — Selector for view mode with options: Year, Month, Fiscal Year, or All Time. Defaults to user's `displayPreferences.defaultTimeRange` (preference-driven). When changed, re-filters underlying transaction date range and re-fetches server aggregations with `start_date` and `end_date` query parameters.

**Earning Start Date coupling** — If user has enabled `useEarningStartDate` preference, the view-layer start date is clamped to `earningStartDate` (no backend impact; data fetching is unchanged). This affects only which transactions are included in calculations.

**Empty states** — If no investment accounts exist after filtering, the "Detailed Breakdown" and "Holdings by Value" sections do not render. If no monthly combo data exists, the Monthly P&L chart shows a ChartEmptyState placeholder (height 360px).

**Date range parameters** — All server queries (`/api/calculations/account-balances`, `/api/calculations/monthly-aggregation`) receive `start_date` and `end_date` in ISO format (YYYY-MM-DD). If no end_date is selected, it is omitted from query params.

**Loading state** — `isLoading` is true while any of the three data sources are fetching: `useTransactions`, `useAccountBalances`, or `useMonthlyAggregation`. CAGR and Monthly ROI display "..." during load.

**No deep-link parameters** — The page does not read query string parameters for filters; time filter state is managed entirely in component state and user preferences.

**Investment account classification** — Hardcoded patterns applied to account names: account is considered an investment account if name (case-insensitive) contains "investment", "stock", or "trading". This determines which transactions are included in broker fee and investment loss categorization.

**Transaction classification keywords** — All keyword matching is performed against lowercase concatenation of `category + note + subcategory`. Income patterns: "dividend", "divid", "interest", "int.", "int cr", "int credit", "profit", "gain", "realized". Broker fee patterns: "broker" + ("charge" or "fee"), "brokerage", "demat" + "charge", "trading" + ("charge" or "fee"), "transaction" + "charge". Loss patterns: "loss" or "write" (excluding broker-related). These patterns are applied in `computeInvestmentMetrics()` and `groupTransactionsByMonth()` (returnsAnalysisUtils.ts).

---

## Tax Planning
**Route:** `/tax`  ·  **Reads from:** `useTransactions hook (full ledger client-side)`, `usePreferences hook (settings, salary structure, RSU grants, growth assumptions)`, `taxCalculator.ts, tdsScheduleCalculator.ts, projectionCalculator.ts (client-side)`

Estimate personal income tax liability, compare Old vs New tax regimes, and explore deduction strategies for tax-efficient planning.

### What's on the page

- **Salaried Income** (metric card) — Net salary received after TDS deduction. Live mode shows actual received; projection mode shows projected take-home. Includes YoY change badge. *Computed:* When salaryIsNetOfTds=true (default): net of TDS from transactions. When projecting: gross from salary structure minus computed taxes (base tax, cess, professional tax). YoY: ((current - previous) / previous) * 100.
- **Taxable Income** (metric card) — Gross taxable income before standard deduction. Starting point for tax calculation. Shows YoY comparison. *Computed:* If salaryIsNetOfTds=true: backed out from recorded net using calculateGrossFromNet() with tax slabs, std deduction, employment flag. If false: equals recorded amount. Includes all classified taxable sources.
- **Tax Already Paid** (metric card) — Total tax liability paid to date (live) or estimated full-year (projection). Label toggles 'Tax Already Paid' vs 'Estimated Tax'. YoY comparison. *Computed:* Via calculateTax(grossTaxableIncome, slabs, standardDeduction, ...) for regime/FY. Includes base tax per slab, surcharge (if income threshold exceeded), 4% Health & Education Cess, professional tax (state-specific 0-2500 if employment income).
- **Tax Slabs Breakdown** (table) — Tax slab structure for selected regime (New/Old) with ranges, rates, and tax per slab. Standard deduction shown. Applicable rows highlighted. Itemizes base tax, Section 87A rebate (if eligible), surcharge, cess, professional tax, total. *Computed:* Slabs from getTaxSlabs(fyYear, regime). Tax per slab = (income in range) * rate. Section 87A rebate (New Regime): full rebate if income <= 12.75L (FY25+) or <= 7.75L (before). Surcharge at income thresholds. Cess 4%. Professional tax 0-2500 by state.
- **Tax Summary Grid** (metric card) — Four summary cards: Effective Tax Rate (%), Gross Taxable Income, Net Received After Tax, and (live only) Net Savings (income - expense). *Computed:* Effective Rate = (totalTax / grossTaxableIncome) * 100. Gross/Net from tax result. Net Savings = income - expense from transaction FY data.
- **Tax Deducted (TDS Schedule)** (bar chart) — Monthly TDS breakdown. Solid blue = past (deducted); faded blue = future (expected). Bonus/RSU months spike. Legend: total deducted, expected remainder, full-year total. *Computed:* Base monthly = (base annual / 12). Bonus spread across 12 months. RSU in vesting month. Past months reconciled via computeTaxPaidTillDate() using actual net. Future via projected TDS schedule.
- **Effective Tax Rate — New vs Old Regime** (area chart) — Dual-regime rate curves (orange=new solid, blue=old dashed) across selectable range (50L to 10Cr). Crossover where Old cheaper. Green dot marks user's current income/rate. *Computed:* 100 points across range. Each: calculateTax() both regimes, rate=(tax/income)*100. Crossover at first point where oldRate < newRate. User interpolated if in range.
- **Salaried Taxable Income Table** (table) — Collapsible groups (Salary & Stipend, Bonus, EPF, Other Taxable) with totals, percentages, drill-down to individual transactions (date, amount, type, note). EPF shows 50% if applicable. Hidden during projection. *Computed:* Classified via classifyAndAccumulateIncome(). EPF detected by note/category. Amount respects epfTaxableFraction (default 0, user-configurable). Only shown when useSalaryProjection=false.
- **Tax Saving Suggestions** (list) — Six regime-specific tips. New: Standard Deduction, NPS employer (80CCD(2)), Home Loan Interest let-out (24b), Agniveer Fund, Section 87A limits, comparison prompt. Old: 80C (1.5L), 80CCD(1B) (50K), 80D (75K), 24b (2L), HRA, 80E, 80G, 80TTA (10K). *Computed:* Hard-coded per regime. Section 87A: 60K if fyYear>=2025, else 25K.
- **Tax Per Year** (bar chart with line) — Stacked bars (paid=red, projected=orange) + blue dashed cumulative line across all FYs. Empty state if no liability. *Computed:* Via buildYearlyTaxData(). Paid = computePaidTax() from transactions. Projected = (salary projection tax) - (paid if current FY partial). Cumulative = running sum.
- **Which Regime Saves You More?** (form) — Two cards (New vs Old) with tax and effective rate. One marked 'Better'. Expandable deduction form (80C, 80CCD(1B), 80D, HRA, 24b with maxes). Verdict: savings amount and context (break-even deductions). *Computed:* New = calculateTax(gross, newSlabs, stdDed, ...). Old = calculateTax(max(0, gross-deductions), oldSlabs, ...). Break-even via calculateBreakEvenDeduction().
- **Multi-Year Projection Table** (table) — 5-year projection: Base Salary, Bonus, RSU, EPF, Other, Gross, Tax, Take-Home, Effective Tax Rate (%). Projected FYs marked with *. Shown if salary data exists and multiple projections. *Computed:* From projectMultipleYears() using salary structure, RSU grants, growth assumptions. Growth applied year-over-year. Effective Tax Rate = (Tax / Gross) * 100.

### Controls & notes

Controls: Regime toggle (New/Old if FY>=2020), 'Project from Salary' button (current FY only if salary data), FY navigation arrows. Empty state if no transactions. Preferences coupled: preferred_tax_regime, salary_is_net_of_tds (default true), show_tds_schedule (default false, controls TDS chart), fiscal_year_start_month, epf_withdrawal_taxable, taxable_income_categories, salary_structure, rsu_grants, growth_assumptions. All tax computations client-side; no backend API calls. Transaction classification respects user's income preferences. TDS Schedule reconciliation: when show_tds_schedule=true and isCurrentFY, past month TDS derived from cardOverride (computeTaxPaidTillDate), ensuring 'Tax Already Paid' card matches. YoY badges only if prior FY comparable. Projection mode overrides transaction display when enabled.

---

## GST Analysis
**Route:** `/tax/gst`  ·  **Reads from:** `useTransactions()` (all expense transactions) and `usePreferences()` (fiscal year start month)

Estimates the Goods & Services Tax (GST) paid on your expenses by applying category-based GST rates to back-calculate the tax component from inclusive prices. All figures are lifestyle-scale approximations only—bank statements don't line-item GST, so without uploaded receipts, exact accuracy is not achievable.

### What's on the page

**Disclaimer banner** (info alert) — Prominent orange callout explaining that GST figures are approximate. Bank statements show all-in prices; the app applies typical slab rates per category (restaurants 5%, electronics 18%, etc.) to derive GST. Intended for lifestyle awareness only, not for tax filing.

**Estimated GST Paid** (metric card, Receipt icon) — Total GST extracted across all expense transactions in the selected fiscal year; *computed:* `sum(transaction amount × GST rate / (100 + GST rate))` for all expense categories. GST rate per category matched via fuzzy keyword lookup (e.g., "Food & Dining" → 5%, "Electronics" → 18%) with fallback to 18% for unmapped categories. Date-aware: transactions before 2025-09-22 use legacy slab rates (12%, 28% present); on/after that date use GST 2.0 rates (12% and 28% removed, 40% luxury de-merit rate added).

**Effective GST Rate** (metric card, Percent icon) — Weighted average GST rate across all spending; *computed:* `(total GST / total spending) × 100`. Reflects the blended rate from all expense categories.

**Top GST Category** (metric card, BarChart icon) — The expense category that contributed the most GST amount; shows the category name and total GST paid in that category, sorted descending.

**GST by Slab** (donut pie chart) — Visualizes total GST amount across all GST slab rates (0%, 3%, 5%, 12%, 18%, 28%, 40% where applicable). Each slice represents one slab's total GST. Slices for 0% slab (exempt/non-taxed categories like rent, fuel, insurance) are filtered out to avoid empty legend entries. Legend below chart shows slab percentages with color coding. *Computed:* group all expense transactions by their GST rate, sum the GST amount per slab, then bucket into nearest slab (since FY may straddle GST 2.0 cutover on 2025-09-22, categories may legitimately fall on both legacy and current slab sets).

**Monthly GST Trend** (bar chart) — Shows GST amount by month (labels like "Apr '25") throughout the selected fiscal year, sorted chronologically. Y-axis shows GST in currency format (compact, e.g., "₹5K"). *Computed:* group expense transactions by month (YYYY-MM), calculate GST for each transaction, sum by month.

**GST by Category** (table, sortable by GST amount descending) — Rows show:
- **Category** (left-aligned) — Expense category or subcategory name (e.g., "Restaurants", "Electronics"). Displays subcategory when available; parent category shown as gray subtitle below if different.
- **Spending** (right-aligned, compact format) — Total amount spent in this category (inclusive of GST) for the fiscal year.
- **GST Rate** (right-aligned, colored badge) — Applied GST rate (0%, 3%, 5%, 12%, 18%, 28%, 40%) with background and text color matched to slab identity.
- **Est. GST** (right-aligned, indigo text) — Calculated GST component in this category; *computed:* `category total spending × rate / (100 + rate)`.
- **Txns** (right-aligned, hidden on mobile) — Count of transactions in this category.
- **Total row** (footer, subtly highlighted) — Shows aggregate spending, effective rate, and total GST across all categories. Effective rate rounded to 1 decimal place.

### Controls & notes

**Fiscal Year Navigator** (header, chevron buttons) — Switches between available fiscal years. Left/right chevrons step backward/forward through FYs. Disabled at boundaries. Display shows selected FY (e.g., "2025-26"). FY calculation respects `fiscal_year_start_month` preference (default April / month 4 in India); custom start months set in Settings override the default.

**Empty state** — Shown when no expense data exists for the selected fiscal year: "No expense data found for this fiscal year". Also shown during initial data load (spinner displayed).

**Rate table selection** — Automatically date-aware. Transactions dated before 2025-09-22 apply `DEFAULT_GST_RATES_LEGACY` (insurance 18%, electricity 5%, apparel/household 18%, luxury/sin goods 28%). On or after 2025-09-22, apply `DEFAULT_GST_RATES` (insurance 0%, electricity 0%, apparel/household 5%, luxury/sin goods 40%). When an FY straddles the cutover, both rate tables are in use; slab bucketing merges both legacy and current slab sets so rates land correctly.

**Category matching** — Uses fuzzy keyword matching on transaction category and subcategory labels. Tries exact match (case-insensitive) first, then partial contains-match. Examples: "Food & Dining" matches rate 5%; "Restaurants" matches 5%; "Jewelry" matches 3%; "Electronics" matches 18%. Unmapped categories default to 18%.

**Exempt & 0% categories** — Included in the category table (rent, fuel, insurance, transfers show 0% rate and ₹0 GST) because spend is meaningful for user context. Excluded from the GST-by-Slab pie chart to avoid dead legend entries.

**All calculations client-side** — No API calls; the page computes `computeGSTAnalysis()` from the full transaction list and selected FY in memory (memoized to avoid re-compute on every render).

---

## FIRE Calculator
**Route:** `/fire-calculator`  ·  **Reads from:** `/api/calculations/monthly-aggregation`, `/api/calculations/totals`

Plan your financial independence and retirement timeline using your actual spending and income data with dual calculators (FIRE and Retirement), adjustable assumptions, and multiple retirement scenarios.

### What's on the page

**FIRE & Retirement Calculator** (page title) — Toggles between two independent analysis modes: FIRE (Financial Independence, Retire Early) and Retirement (corpus-based planning).

**FIRE Tab** (active state: "FIRE"):

- **FIRE Number** (metric card) — The investment corpus needed at the Safe Withdrawal Rate (SWR) to fund annual expenses indefinitely. *Computed:* `annualExpenses / SWR`. Subtitle displays the active SWR (e.g., "At 3% SWR"). Default SWR is 3% (adjusted for India's higher inflation vs. US 4% rule).

- **Years to FIRE** (metric card) — How many years until you accumulate the FIRE Number at your current savings rate and assumed real return. Displays "N/A" if calculation yields infinity (zero savings or negative returns). *Computed:* Solving the future-value equation `P(1+r)^n + S * [((1+r)^n - 1) / r] = F`, where P = current portfolio (0 assumed), S = annual savings, r = real return, F = FIRE number; rearranged as `n = ln((F + S/r) / (P + S/r)) / ln(1 + r)`. Handles edge cases: already at FIRE, zero savings, zero return. Subtitle shows the active real return (e.g., "At 6% real return").

- **Coast FIRE** (metric card) — The amount you need TODAY such that it grows to your FIRE Number by your target retirement year, assuming zero additional contributions. *Computed:* `fireNumber / (1 + realReturn)^yearsToRetire`. Subtitle: "Amount needed today". Demonstrates the power of compounding without active saving.

- **Savings Rate** (metric card) — Your current annual savings as a percentage of annual income. *Computed:* `(annualSavings / annualIncome) * 100`. Subtitle dynamically changes: "FIRE-ready pace" (≥50%), "Good, increase for FIRE" (20–49%), or "Needs improvement" (<20%). Inputs are auto-calculated from your ledger's total income and expenses.

**FIRE Variants** (section card):

- **Lean FIRE** (colored box, green) — The corpus required to fund only 60% of your current annual expenses (essentials only). *Computed:* `(annualExpenses * 0.6) / SWR`. Subtitle: "Essential expenses only (60%)". Represents a minimalist retirement scenario.

- **Barista FIRE** (colored box, teal) — The corpus required when you plan part-time or passion-work income in retirement. The portfolio only needs to fund the gap between expenses and that part-time income. *Computed:* `max(0, annualExpenses - baristaAnnualIncome) / SWR`. Clamped to zero when part-time income fully covers expenses. Subtitle: Shows either "With [amount]/mo part-time" (when non-zero barista income is set) or "Set part-time income below" (when zero). Enables a "soft landing" retirement strategy.

- **Standard FIRE** (colored box, blue) — Your primary FIRE Number, maintaining current lifestyle. *Computed:* `annualExpenses / SWR`. Subtitle: "Current lifestyle maintained".

- **Fat FIRE** (colored box, purple) — 2x the FIRE Number, providing a comfortable lifestyle with buffer. *Computed:* `fireNumber * 2`. Subtitle: "2x lifestyle with buffer". Represents a high-comfort retirement.

**Adjust Assumptions** (slider section for FIRE tab):

- **Safe Withdrawal Rate** (slider) — Range 2%–5%, step 0.5%. Default 3%. *Derivation:* Adjusted from the Trinity Study's 4% rule; 3% used as default for India due to higher inflation volatility. Controls the corpus denominator for all FIRE calculations.

- **Real Return (post-inflation)** (slider) — Range 2%–12%, step 0.5%. Default 6%. *Derivation:* Nominal return minus inflation. Assumption for long-term portfolio real growth. Used in "Years to FIRE" and "Coast FIRE" calculations.

- **Years to Retirement** (slider) — Range 5–40 years, step 1. Default 25. *Input to:* "Coast FIRE" and "Years to FIRE" calculations. Affects how much your current savings needs to grow.

- **Barista / Part-time income** (slider) — Range $0–$200,000/month, step $5,000. Default 0. *Input to:* "Barista FIRE" corpus. When set to non-zero, "Barista FIRE" displays the reduced corpus needed, and its subtitle updates to show the assumed monthly income.

**Retirement Tab** (active state: "Retirement"):

- **Required Corpus** (metric card) — The investment corpus needed at retirement to sustain your inflation-adjusted expenses for the specified retirement duration. *Computed:* `(monthlyExpenses * (1 + inflationRate)^yearsToRetirement * 12) / SWR`. First calculates monthly expenses at retirement after inflation, then applies the SWR. Subtitle: "In [yearsToRetirement] years".

- **Monthly SIP Needed** (metric card) — The monthly systematic investment plan contribution required to accumulate the Required Corpus by retirement. *Computed:* Annuity-due formula using the effective monthly return: `monthlyReturn = (1 + expectedReturn)^(1/12) - 1`; then `SIP = requiredCorpus / [((1 + monthlyReturn)^totalMonths - 1) / monthlyReturn * (1 + monthlyReturn)]`. Assumes beginning-of-month contributions (annuity-due). Uses effective annual compounding, not naive `r/12`, to match the stated annual return. Subtitle: "At [expectedReturn]% return".

- **Future Monthly Expense** (metric card) — Your monthly expenses adjusted to retirement year accounting for cumulative inflation. *Computed:* `monthlyExpenses * (1 + inflationRate)^yearsToRetirement`. Shows the purchasing-power-adjusted amount needed per month at retirement. Subtitle: "At [inflation]% inflation".

- **Lump Sum Today** (metric card) — A one-time investment alternative: the amount you invest today that grows to the Required Corpus without monthly contributions. *Computed:* `requiredCorpus / (1 + expectedReturn)^yearsToRetirement`. Subtitle: "One-time investment alternative".

**Corpus Growth Projection** (area chart, conditionally shown if projection data exists):

- **Total Corpus** (blue area) — Year-by-year growth of your invested portfolio using the calculated monthly SIP. *Modeled:* Month-by-month SIP contributions compounded at the effective monthly return, then aggregated annually. Represents the actual portfolio value at each year-end.

- **Contributed** (green dashed line) — Cumulative amount you have directly contributed via SIP. *Modeled:* Sum of all monthly SIP payments up to each year. Shows your out-of-pocket investment separate from gains.

X-axis: "Yr 1", "Yr 2", … up to the retirement year. Y-axis: currency-formatted values. Tooltip on hover shows both series with currency formatting.

**Adjust Assumptions** (slider section for Retirement tab):

- **Inflation Rate** (slider) — Range 3%–10%, step 0.5%. Default 6.5%. *Derivation:* Indian CPI historical average; adjusts future monthly expenses and thus Required Corpus. Higher inflation = higher corpus needed.

- **Expected Return** (slider) — Range 6%–18%, step 0.5%. Default 12%. *Derivation:* Nifty 50 long-term CAGR (~12% long-term for Indian equities). Controls both the monthly SIP calculation and lump-sum discounting.

- **Years to Retirement** (slider) — Range 5–40 years, step 1. Default 25. Shared with FIRE tab (same slider ID). Controls how long you accumulate, inflation adjustment horizon, and projection chart duration.

### Controls & notes

**Tab Toggle** — Two buttons in the page header toggle between "FIRE" and "Retirement" modes. State persists during the page session but does not deep-link (no `?tab=` param). Each tab has independent slider states and calculations.

**Auto-Population from Ledger** — All inputs auto-calculate from your uploaded transaction data:
- `annualIncome` = (total_income from all time) / (distinct month count) * 12
- `annualExpenses` = (abs(total_expenses from all time)) / (distinct month count) * 12
- `monthlyExpenses` = annualExpenses / 12
- The calculator does NOT time-filter the ledger; it uses **all-time totals** and month count. No `start_date`/`end_date` parameters are passed to the API.

**API Endpoints**:
- `/api/calculations/monthly-aggregation` — Returns `{ YYYY-MM: { ... }, ... }` to count distinct months.
- `/api/calculations/totals` — Returns `{ total_income, total_expenses, ... }` summed across all time.

**Loading State** — Page shows `<PageSkeleton />` while data is being fetched. Rendered via `PageSkeleton` component with standard skeleton placeholder.

**Empty State** — If monthly data returns no months or totals are zero, defaults gracefully: `months = 1` to avoid division by zero, annualized values flatten. Calculations proceed (e.g., "Years to FIRE" becomes Infinity if savings = 0).

**Formula Notes & Defaults**:
- Defaults are India-specific: 3% SWR (vs. 4% US rule), 6% real return (12% nominal minus 6% assumed inflation), 6.5% inflation (CPI avg), 12% equity return (Nifty 50 historical CAGR).
- Essential expenses (Lean FIRE) are hardcoded as 60% of annual expenses (not user-configurable).
- Fat FIRE is exactly 2x the FIRE Number.
- Barista FIRE is clamped at 0 corpus (i.e., if part-time income exceeds expenses, no portfolio is needed).
- Retirement corpus assumes withdrawals begin year 1 and last for `yearsToRetirement` years; no end-of-life lump sum is modeled.
- SIP is annuity-due (contributions at beginning of month), matching real-world Systematic Investment Plan behavior.

**No Persistence** — All slider values reset on page reload. Not tied to user preferences or settings storage.

**Motion & UX**:
- Page content animates in via `staggerContainer` and `fadeUpItem` Framer Motion variants.
- Slider inputs are controlled React components with real-time state updates; no debounce.
- All formatters use `formatCurrency()` (e.g., USD or INR based on locale).

---

## Goals
**Route:** `/goals`  ·  **Reads from:** `/api/analytics/v2/goals`, `/api/analytics/v2/monthly-summaries`, `/api/calculations/totals`

Set financial targets and track progress toward savings goals, debt payoff, investments, and custom milestones. Goals are categorized by type and project completion dates based on average monthly savings.

### What's on the page

**Total Goals** (metric card) — Displays total count of all active goals (including achieved). *computed:* length of `goals` array after filtering deleted goal IDs.

**Achieved** (metric card) — Displays count of completed goals. *computed:* goals where `is_achieved: true` OR `effectiveAmount >= target_amount`. Goal is marked achieved when current allocated amount meets or exceeds the target.

**In Progress** (metric card) — Displays count of incomplete goals. *computed:* `total - achieved`.

**Savings Pool** (summary card) — Appears when at least one goal exists and net savings > 0. Shows total monthly savings allocation across all goals:
  - **Total Net Savings** — sum of all monthly net savings. *computed:* `totals.net_savings` from `/api/calculations/totals` endpoint.
  - **Total Allocated** — sum of all goal current amounts (either backend `current_amount` or locally overridden via form). *computed:* `sum(effectiveAmounts[goal.id])` where `effectiveAmount = max(goal.current_amount, localStorage allocation)`.
  - **Unallocated** — remaining savings not assigned to goals. *computed:* `netSavings - totalAllocated`. Color is green if >= 0, red if negative (over-allocation).
  - **Allocation bar** — Horizontal stacked progress bar with one colored segment per goal (in goal type color), labeled with goal name and percentage of total savings. Shows unallocated amount as a gray segment if positive.

**Feasibility Warning** — Appears only if `totalAllocated > netSavings` (goal allocations exceed available savings). Orange alert banner with message and amounts.

**Create Goal button** (top-right action) — Opens/closes the "Create New Goal" form (modal overlay).

**Goal Cards** (2-column grid on lg+, 1 column on smaller screens) — One card per active goal, sorted by status (achieved last) then by target date (earliest first). Each card contains:
  - **Goal name** (header text) — from `goal.name` or locally overridden via edit form.
  - **Goal type badge** — colored pill with type label (e.g., "Savings", "Debt Payoff"). Color from `GOAL_TYPE_COLORS` map (savings=green, debt_payoff=red, investment=blue, expense_reduction=orange, income_increase=purple, custom=teal).
  - **Circular progress ring** (right side) — Shows `(effectiveAmount / target_amount) * 100%` progress. Color matches goal type. Inner text displays percentage rounded.
  - **Target** (metric sub-section) — Displays target amount. Label "Target".
  - **Allocated** (metric sub-section) — Displays effective amount (max of backend current or local allocation override). Colored in goal type color. Label "Allocated".
  - **Remaining** (metric sub-section) — Displays `max(0, target - effective)`. Label "Remaining".
  - **Progress bar** (horizontal fill bar) — Animated bar from 0 to `min(percentage, 100)` using goal type color.
  - **Projections section** — Dynamic rows showing:
    - **"At X/mo savings → [Month Year]"** — If average monthly savings > 0 and a projected date exists, shows formatted savings rate and projected completion month. If goal already achieved, shows "Goal achieved!" in green.
    - **"Target: [Month Year] ([N] months left)"** — Always shown. Displays target date or "No deadline" if null. Shows months remaining if target_date is in future.
    - **"Needs X/mo to reach target on time"** — If a required monthly savings amount exists and is > 0, shows threshold needed to meet deadline. *computed:* `(target - current) / monthsRemaining`.
    - **Status badge** — Colored icon + label + optional delta. Status determined by projection formula:
      - **Achieved** (green checkmark) — if `current >= target`.
      - **On Track** (green clock) — if `projectedDate <= targetDate`.
      - **Slightly Behind** (yellow clock) — if projected date is 1–3 months past target.
      - **Behind** (red clock) — if projected date is >3 months past target.
      - **No savings data** (yellow clock) — if average monthly savings is null or <= 0.
      - Delta shown as "+ N months ahead" (green) or "- N months behind" (gray text) if not achieved/no_data.
  - **Update Progress button** (footer, left) — Opens inline "Allocated Amount" form to update current amount.
  - **Remaining amount** (footer, right, compact text) — Displays remaining in compact currency format.
  - **Notes** (optional italic text) — If goal has notes, displays below in small tertiary text.
  - **Edit button** (header, pencil icon) — Opens inline edit form for goal name, target amount, target date.
  - **Delete button** (header, trash icon) — Shows confirmation dialog; marks goal as deleted (soft delete via localStorage).

### Controls & notes

**Create Goal Form** — Modal overlay with fields:
  - **Goal name** (required text input) — User-entered goal name.
  - **Goal type** (dropdown) — Options: Savings, Debt Payoff, Investment, Expense Reduction, Income Increase, Custom. Defaults to "Savings".
  - **Target amount** (required number input) — Positive currency amount.
  - **Target date** (date picker) — Deadline for goal completion. Optional in UI but required to submit.
  - **Notes** (optional text input) — Additional user notes.
  - Submit sends POST to `/api/analytics/v2/goals` via `useCreateGoal()` mutation.

**Update Progress Form** — Inline form (appears within goal card on "Update Progress" click):
  - **Allocated Amount** (number input, auto-focused) — Can enter any value from 0 to target_amount. Values exceeding target are rejected with toast error.
  - On Save: stores allocation in `localStorage['ledger-sync-goal-allocations']` (keyed by goal ID); persists across sessions. Immediate UI update; no backend mutation.

**Edit Goal Form** — Inline form (appears within goal card on Edit icon click):
  - **Goal Name** (required text input).
  - **Target Amount** (required positive number).
  - **Target Date** (required date picker).
  - On Save: stores override in `localStorage['ledger-sync-goal-overrides']` (keyed by goal ID); overrides backend name/target_amount/target_date for display purposes. Persists across sessions.

**Delete Goal** — Soft-delete via localStorage. Deleted goal IDs stored in `localStorage['ledger-sync-deleted-goals']` and filtered out of display. Can be recovered by clearing localStorage key. Shows confirmation dialog before removal.

**Empty state** — If no goals exist, shows "No financial goals yet" message with target icon and prompt to create first goal.

**Loading state** — While fetching goals, shows "Loading goals..." placeholder.

**Projection formula** — For each goal (if `average_monthly_savings > 0` and goal not achieved):
  - `monthsRemaining = max(0, daysUntilTarget / 30.4)`
  - `amountRemaining = target - current`
  - `monthsToComplete = amountRemaining / avgMonthlySavings`
  - `projectedDate = today + monthsToComplete`
  - `monthsDelta = monthsRemaining - monthsProjected` (positive = ahead of schedule)

**Data sources & caching**:
  - **Goals list**: `useGoals({ include_achieved: true })` hits `/api/analytics/v2/goals?include_achieved=true`. Cached with `staleTime: Infinity` (never auto-refetches; cleared only on upload/create). Filters by `include_achieved` parameter.
  - **Monthly summaries**: `useMonthlySummaries()` hits `/api/analytics/v2/monthly-summaries`. Used to compute average monthly savings across all months available.
  - **Totals**: `useTotals()` hits `/api/calculations/totals`. Provides `net_savings` for pool summary.
  - **Local overrides**: Goal allocations, deletions, and detail overrides live in browser localStorage (keys: `ledger-sync-goal-allocations`, `ledger-sync-deleted-goals`, `ledger-sync-goal-overrides`). No server-side persistence for user-entered progress or edits—they are client-side until server implements goal sync endpoint.

**No time filter**: Goals page does not support date range filters; it displays all-time goals and all-time average monthly savings.

---

## Subscription Tracker
**Route:** `/subscriptions`  ·  **Reads from:** `/api/analytics/v2/recurring-transactions`

Track recurring income and expenses to project monthly cash flow and identify subscription costs that can be cancelled.

### What's on the page

**Monthly Expense** (summary card) — Total monthly cost of all active expense-type recurring transactions. *Computed:* sum of `toMonthlyAmount(expected_amount, frequency)` across all active expenses, where `toMonthlyAmount = (Math.abs(amount) × annualFactor) / 12` and `annualFactor` is derived from frequency: weekly=52, biweekly=26, monthly=12, bimonthly=6, quarterly=4, semi-annual=2, yearly=1.

**Monthly Income** (summary card) — Total monthly revenue from all active income-type recurring transactions. *Computed:* sum of `toMonthlyAmount(expected_amount, frequency)` across all active incomes using same frequency conversion.

**Net Monthly** (summary card) — Monthly income minus monthly expense. *Computed:* `monthlyIncome - monthlyExpense`; displays in green if ≥0, red if negative.

**Active Recurring** (summary card) — Count of confirmed, active recurring transactions (both income and expense). *Computed:* `active.length` where active items have `is_confirmed=true` and `is_active=true`.

**Saved / mo (N cancelled)** (summary card, conditional) — Only appears if at least one expense-type recurring item is deactivated. Monthly cost that would be charging if user hadn't cancelled (e.g., gym, subscription). *Computed:* sum of `toMonthlyAmount(expected_amount, frequency)` across all inactive expense items; label shows count of deactivated expense items.

**Quick Add suggestions** (button row) — Pre-populated common recurring transactions: Salary, Freelance Income, Rental Income (incomes); Family Support, House Rent, Utilities (Electricity, WiFi, Water, Gas), Maid, Cook, Society Maintenance, Netflix/OTT, Gym, Insurance Premium, SIP/Investment, EMI, Mobile Recharge (expenses). Clicking any suggestion opens the add form with that item's defaults (name, type, frequency, category).

**Add Recurring Transaction form** (form, conditional) — Appears when "Add Recurring" button pressed or suggestion clicked:
  - **Name** (text input) — Transaction label (e.g., "House Rent", "Salary"). Required, trimmed. Autofocuses.
  - **Type** (select) — "Expense" or "Income". Defaults to Expense.
  - **Frequency** (select) — One of: Weekly, Biweekly, Monthly, Bimonthly, Quarterly, Semi-annual, Yearly. Defaults to Monthly.
  - **Amount** (number input) — Positive amount per cycle (e.g., 500 for $500/month rent). Required, must be > 0. Step="any" allows decimals.
  - **Category (optional)** (text input) — User-entered category tag (e.g., "Housing", "Utilities"). Optional; if blank, omitted from request.
  - Buttons: **Add** (submits, shows success toast, closes form), **Cancel** (closes without saving).

**Active recurring transactions list** (card list) — Shows all confirmed items with `is_active=true`, grouped under "Active (N)" heading.

**Inactive recurring transactions list** (card list) — Shows all confirmed items with `is_active=false`, grouped under "Inactive (N)" heading; cards appear semi-transparent (opacity-50).

For each recurring transaction card:
  - **Color bar** (left edge, 2px wide) — Green if `type='Income'`, red if `type='Expense'`.
  - **Name** (text) — Transaction name, truncated if long.
  - **Type badge** (small label) — "Income" or "Expense"; green bg/text for income, red for expense.
  - **Frequency badge** (small label) — Capitalized frequency (e.g., "Monthly", "Semi-annual"), blue bg/text.
  - **Category** (text, conditional) — Shown if `category` populated; grey text, small font.
  - **Last: [date]** (text, conditional) — Shown if `last_occurrence` populated; formatted short date (e.g., "Jan 15, 2024").
  - **Next: [date]** (text, conditional) — Shown if `next_expected` populated; formatted short date.
  - **Amount** (primary value) — `Math.abs(expected_amount)` in currency; green text if income, red if expense; bold.
  - **Monthly equivalent** (secondary value) — `toMonthlyAmount(expected_amount, frequency)` in currency with "/mo" suffix; smaller, muted text.
  - **Edit button** (icon) — Pencil icon; opens inline edit mode (Name, Frequency, Amount fields + Save/Cancel).
  - **Active/Pause button** (icon) — Power icon (green, enabled state) or PowerOff icon (grey, disabled state). Click toggles `is_active` flag.
  - **Delete button** (icon) — Trash icon; removes transaction from database.

### Controls & notes

**Form validation** — Name required (shows error toast if blank). Amount must be positive number (shows error toast if NaN or ≤ 0).

**Demo mode** — All mutations (create, update, delete) guarded by `useDemoGuard()` and blocked with toast message in demo accounts.

**Data source** — Fetched via `useRecurringTransactions({ active_only: false, min_confidence: 0 })`, which calls `/api/analytics/v2/recurring-transactions`. Returns all recurring transactions including both auto-detected (with confidence scores) and user-confirmed items; page filters to only `is_confirmed=true` items for display.

**Server mutations** — Calls to `/api/analytics/v2/recurring-transactions` (POST to create, PATCH to update, DELETE to delete) invalidate all `analyticsV2Keys` on success, triggering full refetch.

**Empty state** — When no confirmed transactions exist and form is hidden, displays centered message: "No recurring transactions yet. Add your first one above."

**Loading state** — Displays 4 placeholder shimmer cards while `isLoading=true`.

**Suggestions visibility** — Compact row of 8 quick-add buttons shown only if items exist. Full suggestion panel (all 18 items in grid) shown only when list is empty, prompting first entry.

**Frequency computation** — All amounts normalized to monthly for display using `getAnnualFactor()` helper matching frequency string to annual multiplier. Handles alternate spellings (e.g., "fortnightly" → 26).

**Savings calculation** — Deactivated expenses represent cancellations; card appears only if `deactivatedCount > 0`. Label shows "(N cancelled)" count to reinforce meaning.

**Edit mode** — Inline; clicking pencil enters edit state, showing text/number inputs for Name, Frequency, Amount only (not Type or Category). Save commits or Cancel discards changes.

**Active/Inactive toggle** — Clicking power icon toggles boolean `is_active` flag without deleting data; useful for temporarily pausing subscriptions or marking "paid off" loans. Inactive cards fade and reorder below active.

**Demo guard** — Blocks create, update, delete mutations in demo mode with toast: "Creating/Editing/Deleting recurring items [blocked in demo]".

**Stale-time** — Data cached indefinitely (`staleTime: Infinity`) since recurring transactions only change on user action, not on background data sync.

/c/Code/GitHub/apps/ledger-sync/frontend/src/pages/subscription-tracker/SubscriptionTrackerPage.tsx

/c/Code/GitHub/apps/ledger-sync/frontend/src/pages/subscription-tracker/helpers.ts

/c/Code/GitHub/apps/ledger-sync/frontend/src/hooks/api/useAnalyticsV2.ts

/c/Code/GitHub/apps/ledger-sync/frontend/src/services/api/analyticsV2.ts

---

## Bill Calendar
**Route:** `/bill-calendar`  ·  **Reads from:** `/api/analytics/v2/recurring-transactions?active_only=true`, `useRecurringTransactions hook from @/hooks/api/useAnalyticsV2`

Monthly calendar view of recurring payments with bills placed on expected due dates, sourced from detected or confirmed recurring transaction patterns.

### What's on the page

- **Total Due This Month** (metric card) — The user sees a single currency value (formatted with $ or appropriate locale) representing the sum of all bills expected in the currently viewed month. When data is loading, displays '...' placeholder. *Computed:* Sum of the amount field across all bills placed in the calendar for the current month. The amount is the absolute value of expected_amount from each active recurring transaction. Only bills in the viewed month contribute; navigating to a different month updates the total. Calculation occurs on-client via the billMap.
- **Bills This Month** (metric card) — A numeric count displayed as a plain integer (e.g., '12') of the total number of bills (occurrences, not unique recurring patterns) expected in the currently viewed month. Shows '...' while loading. *Computed:* Count of all bill entries in the calendar grid for the viewed month. If a single recurring transaction occurs three times in the month (e.g., weekly bill), it counts as 3. Recalculated each time the user navigates months or data refreshes.
- **Next Upcoming Bill** (metric card) — Displays the name and amount of the next bill due, formatted as '{name} - {amount}' (e.g., 'Netflix - $12.99'). If no bills remain in the month, shows 'None upcoming'. Shows '...' during data load. *Computed:* Logic: When the viewed month is the current month, scan from today's date forward to end-of-month and return the first bill found. When the viewed month is in the future, return the first bill on day 1 of that month. When the viewed month is in the past, return null ('None upcoming'). The function findNextUpcomingBill drives this logic using findFirstBillFromDay helper.
- **Calendar Grid** (other) — A 7-column (Sun–Sat) calendar layout showing all dates of the viewed month plus leading/trailing dates from adjacent months (in reduced opacity). Each day cell displays the day number (1–31) and colored dots (max 3 visible) representing bills on that day. Today is highlighted with a blue circular background. Selected days show a blue background tint. Days outside the current month appear at 30% opacity. *Computed:* The calendarGrid is built in useMemo from the viewed year/month. It generates a full 6-row × 7-column matrix (42 cells total). Using getFirstDayOfWeek (which returns 0=Sun through 6=Sat) and getDaysInMonth, it backfills the first row with trailing days from the previous month, fills the full days of the current month (1 to max), and pads the remainder with leading days of the next month. Each cell stores { day, month, year, isCurrentMonth }. Bills are mapped onto these cells via billMap.
- **Day Cell — Bill Dots** (other) — Each day cell shows up to 3 colored dots (1.5px diameter) representing bills due on that day. If more than 3 bills exist, a '+N' label appears (e.g., '+2'). Colors encode the bill status: green dot = confirmed recurring pattern, category-specific color (blue, orange, etc.) = detected pattern. Each dot is titled with the bill name (on hover). *Computed:* For each day, the component retrieves the PlacedBill[] array from billMap.get(day). It then slices to the first 3 bills for visual display. The color of each dot is computed by getBillDotColor(bill), which returns rawColors.app.green if bill.source === 'confirmed', otherwise returns the category's designated color via getCategoryColor(bill.category). The +N overflow indicator appears if bills.length > 3.
- **Calendar Header Navigation** (other) — Top of the calendar card shows left/right chevron buttons, the month/year label (e.g., 'June 2026') in the center, and a blue 'Today' button that appears only when viewing a non-current month. *Computed:* Month and year are formatted via formatMonthYear(viewYear, viewMonth) using the JavaScript toLocaleDateString with 'long' month and 'numeric' year. The 'Today' button visibility is driven by isCurrentViewToday = viewYear === now.getFullYear() && viewMonth === now.getMonth(). Clicking left/right arrows calls goToPrevMonth() and goToNextMonth(), which decrement/increment the month and year (with rollover at month boundaries), reset the selected day, and clear any detail view. Clicking 'Today' calls goToToday(), which re-reads the current date and jumps to the present month.
- **Calendar Legend** (other) — Below the calendar grid, two small labeled dot indicators explain the color scheme: a green dot labeled 'Confirmed' (for bills marked as confirmed recurring patterns) and a blue dot labeled 'Detected' (for algorithmically detected patterns, using the category's color as an example). *Computed:* Static legend rendered whenever the calendar grid is visible. The green dot color is rawColors.app.green, and the detected dot uses rawColors.app.blue as a representative example of category colors. The legend is purely informational and does not filter or select bills.
- **Day Detail Panel** (other) — When a day is clicked, a collapsible panel animates in below the calendar. It shows the heading 'Bills for {date}' (e.g., 'Bills for Jun 15'), a badge showing the bill count, then a stacked list of all bills due on that day. Each bill shows a colored dot, name, category, frequency (if available), type badge (Income/Expense), and formatted amount. If no bills exist for the selected day, a message reads 'No bills expected on this day.' At the bottom, a 'Total for this day' line sums all amounts. *Computed:* selectedDay is set to a day number (1–31) when a day cell is clicked, or null when deselected. The detail panel derives its content from selectedDayBills, which is billMap.get(selectedDay) ?? []. Each bill renders via the BillDetailItem component, which formats the amount (income shown in green with '+', expense in red with '−') and displays the category and frequency. The total is computed as selectedDayBills.reduce((sum, b) => sum + b.amount, 0). The date label is formatted via formatShortDate(viewYear, viewMonth, selectedDay).
- **Bill Detail Item — Row** (other) — Within the day detail panel, each bill appears as a horizontal row with: a colored dot (left), bill name and category/frequency metadata (middle-left), and a formatted amount with a +/- sign and color coding (right). The row has a subtle hover effect (background lightens). A 'Confirmed' badge appears next to the bill name if the bill is confirmed. *Computed:* Component receives a PlacedBill object. The dot color is getBillDotColor(bill). The amount is formatted using formatCurrency(bill.amount) and prefixed with '+' if type='Income' or '−' if type='Expense'. Amount color is green for income, red for expense. Category and frequency are sourced from bill.category and bill.frequency; frequency is capitalized via the capitalize helper. The 'Confirmed' badge is rendered only if bill.source === 'confirmed'.
- **Empty State** (other) — When no recurring transactions exist or all are inactive, the calendar area displays a card-style empty state with an icon, title 'No recurring transactions found', and description text: 'Once recurring payment patterns are detected from your transactions, they will appear on the calendar. You can also add manual subscriptions from the Subscription Tracker page.' *Computed:* Rendered when isLoading === false && hasAnyData === false, where hasAnyData = Boolean(recurringTransactions && recurringTransactions.length > 0). The recurringTransactions array comes from the API query with filter { active_only: true }. If that array is empty or null after loading completes, the empty state displays.
- **Loading State** (other) — While data is being fetched, the page shows a skeleton layout: day-of-week headers (Sun–Sat) and 5 rows of placeholder cells, each a rectangular bar with a subtle pulse animation. The summary cards at the top also show '...' placeholders. *Computed:* Rendered when isLoading === true (from the useRecurringTransactions hook). A grid of 35 cells (5 rows × 7 columns) is generated with CSS class animate-pulse and bg-white/5 to simulate skeleton loading.

### Controls & notes

Page-Level Controls: Month Navigation uses left/right chevron buttons to navigate month-by-month, setting viewMonth and viewYear state and clearing any selected day detail view. Today Button appears only when viewing a non-current month; clicking re-reads the system date and jumps to the present month, handling long-lived tabs correctly. Day Selection: Clicking any day in the current month toggles its detail panel open/closed. Navigating months automatically closes any open detail panel. Empty States & Coupling: The page requires at least one active, non-deleted recurring transaction to display the calendar. If all are inactive or archived, the empty state prompts the user to create subscriptions in the Subscription Tracker page. Bill confirmation status ('Confirmed' vs. 'Detected') is derived from the is_confirmed flag on the backend RecurringTransaction object. Confirmed bills render with a green dot and a badge; detected bills use their category color. Frequency & Day Resolution: Supported frequencies are Weekly, Monthly, Quarterly, Yearly, Fortnightly (Biweekly). Quarterly and Yearly logic checks the next_expected date to determine if the pattern falls in the viewed month. For weekly/fortnightly bills, the next_expected date is used as an anchor, and the interval is stepped backward to the month start, then forward to capture all occurrences in the month. Monthly bills use the expected_day field; if the month has fewer days (e.g., February 31st), the day is clamped to the month's max day. Days outside the viewed month are shown with 30% opacity and are not interactive. Preferences & Customization: The category-to-color mapping is centralized in /constants/categoryColors.ts (EXPENSE_CATEGORY_COLORS). All category dots on the calendar use this canonical map, ensuring consistent colors across the app. The today reference is captured on component mount and re-read on each 'Today' button click to handle long-lived browser tabs. Data Recency & Caching: The useRecurringTransactions hook uses React Query with staleTime: Infinity, meaning data is cached indefinitely once loaded. New data only arrives if the query is manually invalidated (e.g., after user confirms or updates a recurring pattern elsewhere in the app). The on-client bill map (via buildBillMap) is recalculated whenever recurringTransactions, viewYear, or viewMonth change.

---

## Anomaly Review
**Route:** `/anomalies`  ·  **Reads from:** `/api/analytics/v2/anomalies` (GET) and `/api/analytics/v2/anomalies/{anomalyId}/review` (POST)

Review and manage detected financial anomalies across four types: high expenses, unusual categories, large transfers, and budget overages—each with low, medium, or high severity severity ratings.

### What's on the page

- **High Severity** (stat card) — Count of anomalies filtered to severity level `high` only; *computed:* filtering `anomalies.severity === 'high'`
- **Medium Severity** (stat card) — Count of anomalies filtered to severity level `medium` only; *computed:* filtering `anomalies.severity === 'medium'`
- **Low Severity** (stat card) — Count of anomalies filtered to severity level `low` only; *computed:* filtering `anomalies.severity === 'low'`
- **Anomaly cards** (list) — One card per detected anomaly with:
  - **Type badge** (e.g. "High Expense") and **Severity badge** (e.g. "high", "medium", "low") — anomaly category and severity color-coded (high=red, medium=orange, low=yellow); *computed:* from `anomaly.anomaly_type` and `anomaly.severity`
  - **Reviewed/Dismissed tag** (green badge) — appears if `anomaly.is_reviewed === true` and displays either "Reviewed" or "Dismissed" based on `anomaly.is_dismissed`
  - **Description** — plain text explanation of why the anomaly was flagged; from `anomaly.description`
  - **Detection date** — formatted as "MMM D, YYYY"; *computed:* parsing `anomaly.detected_at`
  - **Expected vs Actual** (comparison row, if values exist) — shows `Expected: {formatted expected_value}` and `Actual: {formatted actual_value}` with a deviation percentage badge; *computed:* displaying `anomaly.expected_value` and `anomaly.actual_value`, and deriving deviation color (red if positive overage, green if under); percentage from `anomaly.deviation_pct` formatted as `+/-X.XX%`
  - **Review notes** (if present) — italicized text from `anomaly.review_notes` displayed as "Note: {review_notes}"
  - **Review button** — green button with checkmark icon, enabled only if `anomaly.is_reviewed === false`; clicking posts to review endpoint with `dismiss: false`
  - **Dismiss button** — red button with X icon, enabled only if `anomaly.is_reviewed === false`; clicking posts to review endpoint with `dismiss: true`
  - **Add Note toggle button** — toggles a collapsible text input field; label includes chevron icon (ChevronDown when collapsed, ChevronUp when expanded)
  - **Review notes input** (collapsible, conditional) — text field with placeholder "Add review notes..."; appears when "Add Note" is toggled; allows free-text notes to be attached to the review; notes are captured in `noteText` state and sent with the Review or Dismiss action

### Controls & notes

- **Type filter dropdown** (options: "All Types", "High Expense", "Unusual Category", "Large Transfer", "Budget Exceeded") — filters the anomalies list by `anomaly_type` parameter sent to `/api/analytics/v2/anomalies?type=...`; maps to state `typeFilter` and submitted as query param `type`
- **Severity filter dropdown** (options: "All Severities", "High", "Medium", "Low") — filters the anomalies list by `severity` parameter sent to endpoint; maps to state `severityFilter` and submitted as query param `severity`
- **Include Reviewed checkbox** — when checked, includes reviewed/dismissed anomalies in the list (normally hidden by default); controls query param `include_reviewed: boolean`; checkbox state stored in `includeReviewed`
- **"Tune detection" settings link** — button in page header that navigates to `/settings` where anomaly detection sensitivity, thresholds, and active types can be configured
- **Empty state** — displays "No anomalies detected" message with description "Your financial data looks normal. Anomalies will appear here when unusual patterns are detected." when anomalies list is empty and not loading
- **Loading state** — displays "Loading anomalies..." centered text while data is being fetched
- **Review action** — clicking "Review" or "Dismiss" button triggers `reviewMutation.mutate({ anomalyId, data: { dismiss: boolean, notes?: string } })` to `/api/analytics/v2/anomalies/{anomalyId}/review`; notes are only included if "Add Note" was expanded at the time; on success, clears note text and collapses input, and invalidates anomalies query cache; demo mode guarded by `useDemoGuard()`
- **Reviewed anomaly styling** — cards with `is_reviewed === true` fade to 60% opacity and show a green "Reviewed" or "Dismissed" status badge, and action buttons (Review, Dismiss, Add Note) are hidden
- **No time filter** — route does not include a date range picker; all anomalies are presented as detected

C:\Code\GitHub\apps\ledger-sync\frontend\src\pages\AnomalyReviewPage.tsx

---

## Settings
**Route:** `/settings`  ·  **Reads from:** `GET /api/preferences` (fetches user preferences), `GET /api/accounts/balances` (account balances for classification), AI config endpoints (`GET /api/ai/config`, `POST /api/ai/config`, `DELETE /api/ai/config`, `GET /api/ai/usage`), stock price and exchange rate endpoints

Centralized configuration page for financial preferences, account classifications, tax planning, budget controls, and AI assistant settings. All changes are staged locally and saved together via a single "Save" button; unsaved changes are indicated with a yellow dot indicator.

### What's on the page

**Account Classifications** (drag-and-drop section) — Organize linked accounts into six predefined categories: Cash, Bank Accounts, Credit Cards, Investments, Loans/Lended, Other Wallets. Displays unclassified accounts in a highlighted yellow warning zone. Balance data fetched from `/api/accounts/balances`. Drag-and-drop targets show a dashed border and highlight when active. Each zone displays the category name, account count, and a list of accounts in that category (draggable chips). *computed:* Accounts auto-classified via two-pass keyword-matching heuristic: first by account name keywords (e.g., "HDFC", "EPF", "credit card"), then for unclassified accounts using balance sign heuristic (negative = likely credit card; positive with 3+ transactions = likely bank account). Balance data populates account chips with formatted currency amounts.

**Investment Account Mappings** (dropdown grid) — For each investment account, assign a type: Stocks, Mutual Funds, Fixed Deposits, PPF/EPF, Real Estate, Gold, Crypto, or Other. Conditional display: only renders if investment accounts exist. *computed:* Account list derived from accounts classified as "Investments" above; mappings stored as `investment_account_mappings` (account name → investment type string).

**Expense Categories** (toggle grid) — For each category detected in transaction data, toggle two flags: **E** (Essential) and **F** (Fixed). Grid shows category names with two side-by-side toggle buttons. Toggles are color-coded (green for Essential, orange for Fixed). Shows summary counts at bottom. Conditional: renders only if expense categories exist; displays "No expense categories found" if no transactions imported. *computed:* `essential_categories` array tracks which categories are marked essential; `fixed_expense_categories` array tracks fixed ones. Both can include the same category.

**Income Classification** (multi-select dropdown grid) — Organized by income parent category (e.g., "Salary", "Investments"). For each subcategory (displayed as "Subcategory" chips), a dropdown classifies it into: **Taxable Income** (salary, bonus, freelance), **Investment Returns** (dividends, interest, capital gains), **Cashbacks** (refunds, cashback, rewards), or **Others** (gifts, prizes). Conditional: renders if income categories exist; shows "No income categories found" otherwise. *computed:* Subcategories auto-classified via keyword rules on first load (`getDefaultIncomeClassifications`), then user-remapped via dropdowns. Four separate preference arrays store the result: `taxable_income_categories`, `investment_returns_categories`, `non_taxable_income_categories`, `other_income_categories`. Item format is "ParentCategory::Subcategory".

**Income & Salary Structure** (tabbed form with multiple subsections) — Organize salary data across fiscal years and track RSUs and growth assumptions.

   - *Salary Fields Grid:* Fiscal year navigation (previous/next buttons, "Add FY" button to create a new FY). For the selected FY, editable fields: Base Salary (annual), HRA (annual, optional), Bonus (annual), EPF (monthly), NPS (monthly, optional), Special Allowance (annual), Other Taxable (annual). All numeric inputs. Displays a highlighted box showing Annual CTC (sum of base + HRA + bonus + EPF*12 + NPS*12 + special allowance + other) and monthly pre-tax equivalent. *computed:* `localSalaryStructure` is a `Record<FYLabel, SalaryComponents>` where FYLabel is a bare year string (e.g., "2023", "2024"). Navigating the FY list sorts by year. Adding a FY clones the previous year's values if any, otherwise uses `DEFAULT_SALARY_COMPONENTS` defaults.

   - *RSU Grants:* Add/remove RSU grant records. Each grant has: Stock Name (text), Price/Share (numeric with live-fetch button), Notes (text), and a table of Vesting events grouped into **Vested** (date <= today, dimmed) and **Upcoming** sections, each sorted chronologically (rows re-sort on date-input blur; grants saved pre-sort are normalized on load). Vesting table has columns: Date, Quantity, Est. Value, FY (auto-computed from date). Est. Value for vested rows uses the locked vest-date price (`price_at_vest`, auto-fetched once via `getStockPrice(symbol, on_date)` when a vesting passes; falls back to current price if unavailable); upcoming rows use Qty × current Stock Price. Editing a vested row's date clears the locked price so it re-fetches. Bottom shows split totals: Vested shares/value (green) and Upcoming shares/value. *computed:* `localRsuGrants` is an array of `RsuGrant` objects (id, stock_name, stock_price, grant_date, notes, vestings[] with optional price_at_vest). Vested/upcoming logic lives in `lib/rsuVesting.ts` (shared with projection + TDS calculators). Price fetch converts to display currency using exchange rates if needed.

   - *Growth Assumptions:* Inputs for financial projections. Fields: Base Salary Growth (%/yr), Stock Appreciation (%/yr), Projection Horizon (years, 1–30), Bonus Growth (%/yr), NPS Growth (%/yr), and a toggle "EPF Scales With Base". *computed:* Stored in `localGrowthAssumptions` (GrowthAssumptions type).

**Display & Preferences** (settings grid) — Visual and temporal configuration.

   - **Display Currency** (dropdown) — Select from CURRENCIES metadata map (e.g., INR, USD, EUR). *computed:* Auto-derives and updates `number_format` (Indian vs. International), `currency_symbol`, `currency_symbol_position` via `getCurrencyMeta()`. "All amounts will be converted using live exchange rates" hint shown below.

   - **Format (auto)** (read-only display) — Shows selected number format (e.g., "Indian (1,00,000)" or "International (100,000)") and symbol + position (read-only derived from currency).

   - **Default Time Range** (dropdown) — Options: All Time, Financial Year, Calendar Year, Monthly. Sets default analytics view. Stored as `default_time_range`.

   - **Earning Start Date** (date input + checkbox) — Date picker with a checkbox "Use as analytics start". If enabled and a date is set, analytics are filtered to start from that date. Shows confirmation text in green: "Analytics from [formatted date]". *computed:* `earning_start_date` (ISO date string or null), `use_earning_start_date` (boolean). Checkbox disabled if no date entered.

   - **Appearance** (radio group) — Three options: Light, Dark, System (Auto). The selected mode is saved to `localStorage['ledger-sync-theme']`; Light is the default for new users.

**Financial Settings** (multi-field section with subsections) — Savings, tax, budget, and spending rule configuration.

   - **Fiscal Year Starts In** (dropdown) — Select month (January–December). Default: April (India). Stored as `fiscal_year_start_month` (number 1–12).

   - **Savings Goal** (range slider + number input) — Dual input for percentage (0–100%). Slider on left, number field on right. Updates `savings_goal_percent`.

   - **Investment Target / mo** (currency number input) — Monthly target amount. Prefix shows currency symbol. If > 0, green hint shows formatted target. Stored as `monthly_investment_target`.

   - **Payday** (dropdown) — Select day of month (1–31). Shows "Nth of month" (e.g., "1st of month"). Stored as `payday`.

   - **Tax Regime** (radio group) — New or Old regime. Differentiating hint below: "New = Lower rates, fewer deductions" vs. "Old = Higher rates, allows HRA/80C/80D deductions". Stored as `preferred_tax_regime`.

   - **Show TDS schedule** (toggle) — Adds a per-month tax-deducted chart to Tax Planning page (requires salary structure configured). Hint: "needs a salary structure configured". Stored as `show_tds_schedule`.

   - **Salary recorded net of TDS** (toggle) — On (default): recorded salary is what hit your bank (after TDS), so Tax Planning backs out the gross and shows TDS already deducted. Off: recorded amount is pre-tax gross. Stored as `salary_is_net_of_tds`.

   - **Tax EPF withdrawals** (toggle) — EPF withdrawals are tax-free after 5 years of continuous service (Section 10(12)). Leave off if withdrawals qualify; turn on to count them as taxable income. Stored as `epf_withdrawal_taxable`.

   - **Taxable portion of EPF** (number input, conditional) — Only shows if "Tax EPF withdrawals" is on. Percentage (0–100). Hint: "Share of each EPF inflow treated as taxable. 100% if the whole withdrawal is taxable (e.g. before 5 years of service)." Stored as `epf_taxable_percent`.

   - *Spending Rule* (three number inputs) — Needs %, Wants %, Savings %. Stored as `needs_target_percent`, `wants_target_percent`, `savings_target_percent`. Displays validation: green hint "Default: 50 / 30 / 20" if sum = 100%; yellow warning "Totals Xz% (should be 100%)" otherwise.

   - *Budget Defaults* (subsection with icon + label):
      - **Alert Threshold (%)** (number input) — Percentage at which budgets trigger alerts. Stored as `default_budget_alert_threshold`.
      - **Auto-create budgets** (checkbox) — Automatically create budgets for detected expense categories. Stored as `auto_create_budgets`.
      - **Budget rollover** (checkbox) — Carry over unused budget to next period. Stored as `budget_rollover_enabled`.

**Notifications** (toggle grid + dropdown) — Alert configuration.

   - **Budget Alerts** (toggle) — Notify when spending approaches budget thresholds. Icon: Receipt. Stored as `notify_budget_alerts` (default true).

   - **Anomaly Alerts** (toggle) — Notify when unusual spending patterns detected. Icon: AlertTriangle. Stored as `notify_anomalies` (default true).

   - **Upcoming Bills** (toggle) — Notify before recurring bills due. Icon: Clock. Stored as `notify_upcoming_bills` (default true).

   - **Remind me** (dropdown) — Days ahead to notify before due date. Options: 3, 5, 7, 14 days. Stored as `notify_days_ahead`.

**AI Assistant** (conditional section based on AI mode) — Two modes: App-Bedrock (hosted) or BYOK (bring-your-own-key).

   - *Mode Toggle:* Shows three options/panels:
      - **App Bedrock** (default) — Uses app-hosted Bedrock. Displays daily message limit (fetched from `usage.limits.app_daily_messages`, default 10). No config needed.
      - **BYOK** (Bring Your Own Key) — User supplies API key and model. Only shows config form in this mode.

   - *BYOK Config Form* (conditional, only in BYOK mode):
      - **Provider** (dropdown) — OpenAI, Anthropic, or Bedrock.
      - **Model** (dropdown) — Model selection, varies by provider.
      - **Region** (dropdown, Bedrock only) — AWS region for Bedrock.
      - **API Key** (password input with show/hide toggle) — API key for provider (hidden by default; "Bedrock uses server-side AWS credentials" message if Bedrock selected).

   - *Control Buttons* (visible when provider set):
      - **Test Connection** (button, non-Bedrock only) — Sends minimal test request to provider API. Shows success (green checkmark + "Connection successful") or error (red icon + error message).
      - **Save** (button) — Saves config. Disabled if no provider/model or (non-Bedrock and no API key). Shows "Saving..." state.
      - **Remove** (button, if config exists) — Deletes saved key. Red trash icon + label.

   - *Token Limits Panel* (conditional, shows in BYOK if provider set or if usage history exists):
      - **Daily Limit** (text input, optional) — Daily token limit (can be empty for unlimited).
      - **Monthly Limit** (text input, optional) — Monthly token limit (can be empty for unlimited).
      - **Save** (button) — Saves limits via `aiUsageService.updateLimits()`. Shows pending state.

   - *Usage Display:* Reads from `useQuery('ai-usage')` polled every 60s with 30s stale time. Displays current usage and limits in AppModePanel or TokenLimitsPanel based on mode.

**Advanced** (collapsible section with three subsections) — Anomaly detection, credit card limits, account exclusion.

   - *Anomaly Detection* (subsection with icon + label):
      - **Expense Threshold (Std Devs)** (number input) — Standard deviation threshold for expense anomalies. Min 1, max 10, step 0.5. Stored as `anomaly_expense_threshold`.
      - **Enabled Types** (checkboxes) — Multi-select from ANOMALY_TYPES: "High Expense Months", "Unusual Category Spending", "Large Transfers", "Budget Exceeded". Stored as `anomaly_types_enabled` (array).
      - **Auto-dismiss recurring anomalies** (checkbox) — Auto-dismiss anomalies that repeat. Stored as `auto_dismiss_recurring_anomalies`.

   - *Credit Card Limits* (subsection with icon + label):
      - Grid of credit card accounts (only accounts classified as "Credit Cards"). Each row shows: account name (truncated with title), input field for limit. Defaults to 100,000 if not set. Stored as `credit_card_limits` (object: card name → limit number).
      - Hint: "Default: ₹100,000 per card".

   - *Excluded Accounts* (subsection with icon + label):
      - Checkbox grid of all linked accounts. Checked accounts are excluded from analytics and reporting. Checked items are struck-through and muted. Badge shows count if any excluded. Stored as `excluded_accounts` (array). Hint: "Excluded accounts are hidden from analytics and reporting."

**Dashboard Widgets** (toggle grid) — Choose which Quick Insight cards display on the Dashboard.

   - Grid of 14 widget options (grid-cols-1 sm:grid-cols-2): Savings Rate, Top Spending Category, Top Income Source, Burn Rate, Daily Spending, Biggest Transaction, Net Cashback Earned, Total Transactions, Median Transaction, Weekend Spending, Peak Spending Day, Spending Diversity, Avg Transaction Amount, Total Internal Transfers.

   - Each is a checkbox with label. Toggled widgets persist to `localStorage['ledger-sync-visible-widgets']` as JSON array of keys.

   - "Show all widgets" link at bottom enables all 14 at once.

   - *computed:* Default visible (first visit) = 6 widgets: Savings Rate, Top Spending, Top Income, Burn Rate, Daily Spending, Biggest Transaction. Full list fetched from `DASHBOARD_WIDGETS` constant.

### Controls & notes

**Page-level controls:**

- **Save button** (top-right, gradient) — Enabled only if `hasChanges` is true. Shows "Saving..." state while request in flight. Saves all staged local preferences via `PATCH /api/preferences`.

- **Reset button** (top-right, outline) — Opens confirm dialog. Resets all preferences to defaults (account classifications NOT affected, only preferences). Dialog confirms before executing.

- **Unsaved indicator** (top-right, yellow dot + "Unsaved" text) — Shows only if `hasChanges` is true. Disappears after successful save.

- **Loading skeleton** — On initial page load, shows 4 animated skeleton cards while data fetches. Only skeleton, no partial content.

**Preference coupling & state management:**

- All preferences read from `useSettingsState()` hook which fetches via `GET /api/preferences` on mount.

- Currency selection auto-updates dependent fields (number format, symbol, position) via `getCurrencyMeta()` lookup.

- Income classification auto-applies keyword-based defaults on first load (`getDefaultIncomeClassifications`).

- Account classifications auto-apply two-pass heuristic (keyword + balance sign) on first load; can be overridden by drag-and-drop.

- Investment mappings auto-apply keyword defaults (`getDefaultInvestmentMappings`) on first load; can be overridden via dropdown.

- Anomaly types enable/disable do not require save; stored locally in preferences and applied to anomaly detection endpoints (`GET /api/calculations/anomalies/*`) on next fetch.

- Spending rule validation (Needs + Wants + Savings should = 100%) is UI-only (yellow warning if not 100%); backend does not enforce.

- Dashboard widgets saved to `localStorage` immediately on toggle (not staged with other preferences).

- Theme saved to `localStorage` immediately; not staged with other preferences.

- Earning start date, when enabled, filters analytics across all pages to only show data from that date forward (e.g., on Dashboard, Income Analysis, etc.).

**Empty states & error handling:**

- If no accounts linked: Account Classifications shows "Unclassified Accounts" zone but no drop zones (ACCOUNT_TYPES still render, just empty).

- If no expense categories detected: "No expense categories found. Import some transactions first." message replaces toggle grid.

- If no income categories detected: "No income categories found. Import some transactions first." message replaces dropdown grid.

- If no investment accounts: Investment Mappings section does not render (returns null).

- If no credit card accounts: Credit Card Limits shows "No credit card accounts. Classify accounts as 'Credit Cards' above." message.

- If no accounts to exclude: Excluded Accounts shows "No accounts found." message.

- AI Assistant: If loading config, section returns null. Once loaded, switches between App-Bedrock panel or BYOK config form based on mode.

**Deep-links & URL parameters:**

- No URL parameters supported; `/settings` is the single entry point.

- All subsections are visually grouped but not independently linkable (no #hash anchors).

**Persistence & sync:**

- All LocalPrefs staged in React state until "Save" button clicked.

- "Reset" button clears staged state and re-fetches from server, losing unsaved changes.

- Dashboard widgets and theme persist immediately to `localStorage`, bypassing the staged save flow.

- AI config (BYOK provider/model/key, limits) saved separately via `aiConfigService.updateConfig()` and `aiUsageService.updateLimits()`, not part of the unified Settings save.
