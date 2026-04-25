# Calculations & Data Processing

This document is a reference for every metric, chart, and derived number shown in Ledger Sync -- how it is computed, from which data source, with what formula, and where the code lives.

Read this when:

- A chart displays unexpected values and you need to trace back to the source
- You're building a new page and want to reuse an existing calculation
- You're writing a test for a finance metric and need the formula
- You're adding a new metric and want to place it in the right layer

---

## Table of Contents

1. [Pipeline Overview](#pipeline-overview)
2. [Upload & Reconciliation](#upload--reconciliation)
3. [Aggregations (Pre-Computed Tables)](#aggregations-pre-computed-tables)
4. [Core Calculations](#core-calculations)
5. [Tax Calculations (India)](#tax-calculations-india)
6. [Salary & Multi-Year Projections](#salary--multi-year-projections)
7. [Investment & Net Worth](#investment--net-worth)
8. [Recurring Transaction Detection](#recurring-transaction-detection)
9. [Anomaly Detection](#anomaly-detection)
10. [FIRE Calculator](#fire-calculator)
11. [Financial Health Score](#financial-health-score)
12. [Currency Conversion](#currency-conversion)
13. [Chart-Specific Data Shapes](#chart-specific-data-shapes)

---

## Pipeline Overview

```
Excel/CSV upload
     |
     | (client-side: SheetJS, SHA-256 hashing, column mapping)
     v
POST /api/upload  ->  sync_engine.import_rows()
     |
     v
normalizer.normalize_from_dict()  (category canonicalization, transfer resolution)
     |
     v
reconciler.reconcile()  (SHA-256 of {date, amount, category, account} -> deterministic PK)
     |
     v
transactions table (soft-deleted on re-import if missing)
     |
     v
POST /api/analytics/v2/refresh  ->  AnalyticsEngine.run_full_analytics()
     |
     +-- daily_summaries (1 row per day per user)
     +-- monthly_summaries (1 row per YYYY-MM per user)
     +-- category_trends (1 row per category per month)
     +-- transfer_flows (aggregated transfers between accounts)
     +-- merchant_intelligence (extracted vendor names)
     +-- recurring_transactions (detected patterns)
     +-- net_worth_snapshots (time-series net worth)
     +-- investment_holdings (per-account invested/income/expense)
     +-- fy_summaries (fiscal year totals with YoY changes)
     +-- anomalies (flagged unusual transactions)
```

Frontend pages call either:

- `/api/analytics/*` -- **on-the-fly** computation over the transactions table (for arbitrary date ranges / filters)
- `/api/analytics/v2/*` -- **pre-aggregated** tables (fast, used for default views)
- `/api/calculations/*` -- medium-weight aggregations (totals, monthly breakdowns, category splits) with a fast path that reads from V2 tables when no date filter is active

---

## Upload & Reconciliation

### Transaction Hash (Primary Key)

**Code**: `backend/src/ledger_sync/ingest/hash_id.py`

Each transaction's primary key is a SHA-256 hex digest of the normalized tuple:

```
transaction_id = sha256(
    date_iso  |  "|"  |
    round(amount, 2)  |  "|"  |
    category.lower().strip()  |  "|"  |
    account.lower().strip()
)
```

**Why**: makes re-uploads idempotent. Uploading the same file twice produces the same IDs, so reconciliation is an upsert, not a duplicate.

**Edge case**: if two genuine transactions have the same `(date, amount, category, account)`, they collapse into one row. This is intentional -- in practice such collisions are rare in personal finance data.

### Reconciliation

**Code**: `backend/src/ledger_sync/core/reconciler.py`

```
for each row in uploaded_batch:
    compute hash -> txn_id
    if txn_id exists:
        update last_seen_at = now
        undelete (is_deleted = False)
    else:
        insert

# After upload:
mark transactions with last_seen_at < upload_start AND source_file = current_file  as  is_deleted=True
```

So deleting a row from your Excel file and re-uploading will soft-delete the corresponding row. The row is not hard-deleted -- it's preserved for audit.

---

## Aggregations (Pre-Computed Tables)

Computed by `AnalyticsEngine.run_full_analytics()` after each upload.

### Daily Summary

**Code**: `core/analytics_engine.py::_calculate_daily_summaries`  
**Table**: `daily_summaries`  
**Grain**: one row per (user_id, date)

```
for each day with at least one transaction:
    income = sum(amount where type=Income)
    expense = sum(amount where type=Expense)
    net = income - expense
    txn_count = count(*)
    top_category = argmax(sum(amount) group by category where type=Expense)
```

**Used by**: YearInReview heatmap (single query vs scanning 5000+ transactions).

### Monthly Summary

**Code**: `_calculate_monthly_summaries`  
**Table**: `monthly_summaries`  
**Grain**: one row per (user_id, YYYY-MM)

```
total_income = sum(amount where type=Income)
total_expenses = sum(amount where type=Expense)

salary_income = sum(amount where type=Income AND category::subcategory IN taxable_income_categories AND subcategory IN {Salary, Stipend})
investment_income = sum(amount where type=Income AND category::subcategory IN investment_returns_categories)
other_income = total_income - salary_income - investment_income

essential_expenses = sum(amount where type=Expense AND category IN essential_categories)
discretionary_expenses = total_expenses - essential_expenses

total_transfers_out = sum(amount where type=Transfer AND from_account NOT IN investment_accounts)
total_transfers_in = sum(amount where type=Transfer AND to_account NOT IN investment_accounts)
net_investment_flow = sum(amount where type=Transfer AND to_account IN investment_accounts)
                    - sum(amount where type=Transfer AND from_account IN investment_accounts)

net_savings = total_income - total_expenses
savings_rate = net_savings / total_income * 100  (0 if income = 0)
expense_ratio = total_expenses / total_income * 100

income_change_pct = (income_this_month - income_prev_month) / income_prev_month * 100
expense_change_pct = same formula for expenses
```

**Used by**: Dashboard KPIs, Trends & Forecasts page, Year in Review bars.

### Category Trend

**Code**: `_calculate_category_trends`  
**Table**: `category_trends`  
**Grain**: one row per (user_id, category, YYYY-MM)

```
for each (category, month):
    amount = sum(abs(amount) where category=cat AND type IN {Income, Expense})
    percentage_of_type = amount / type_total_for_month * 100
    rank_within_type = rank by amount desc
```

**Used by**: SpendingAnalysis top-category chart, category breakdown treemaps.

### Transfer Flows

**Code**: `_calculate_transfer_flows`  
**Table**: `transfer_flows`  
**Grain**: one row per (user_id, from_account, to_account, YYYY-MM)

Used by IncomeExpenseFlow (Sankey) page to map account-to-account money flow.

### FY Summary

**Code**: `_calculate_fy_summaries`  
**Table**: `fy_summaries`  
**Grain**: one row per (user_id, fy_label)

```
fy_label format: "FY{start_year}-{end_year_short}"  e.g. "FY2024-25"
fy_start_month = user_preference.fiscal_year_start_month  (default 4 = April, Indian FY)

For a transaction on date D:
    if D.month >= fy_start_month: fy_year = D.year
    else: fy_year = D.year - 1
    fy_start = datetime(fy_year, fy_start_month, 1)
    fy_end = datetime(fy_year+1, fy_start_month, 1) - 1 day  (or Dec 31 if fy_start_month = 1)

Per-FY totals:
    total_income, total_expenses, essential_expenses, discretionary_expenses
    taxable_income, investment_income, salary_income
    monthly_burn_rate = total_expenses / months_in_fy

YoY changes (computed by _calculate_yoy_changes):
    income_yoy_pct = (income_this_fy - income_prev_fy) / income_prev_fy * 100
    expense_yoy_pct = same formula
```

**Used by**: Tax Planning year selector, FY-grouped analytics pages.

---

## Core Calculations

### Totals (`/api/calculations/totals`)

**Code**: `core/calculator.py::calculate_totals` + `api/calculations.py::get_totals`

```
total_income = sum(amount where type=Income AND not deleted AND user_id=current)
total_expenses = sum(amount where type=Expense AND not deleted AND user_id=current)
net_savings = total_income - total_expenses
savings_rate = net_savings / total_income * 100  (0 if income = 0)
transaction_count = count(*)
```

**Fast path**: when no date range is specified, reads `sum(total_income), sum(total_expenses)` from `monthly_summaries` instead of scanning the transactions table.

### Savings Rate

**Code**: `core/calculator.py::calculate_savings_rate`

```
if total_income <= 0:
    return 0
return (total_income - total_expenses) / total_income * 100
```

Capped at 100% even if the number is absurd due to transfers-as-income misclassification.

### Monthly Aggregation

**Code**: `api/calculations.py::get_monthly_aggregation`

Groups transactions by `YYYY-MM` and returns:

```
for each month in range:
    income = sum(amount where type=Income AND month = M)
    expenses = sum(amount where type=Expense AND month = M)
    surplus = income - expenses
    savings_rate = surplus / income * 100 if income > 0 else 0
```

Used by dashboard income/expense line chart and trend forecasts.

### Category Breakdown

**Code**: `api/calculations.py::get_category_breakdown`

Two modes:

- `transaction_type=expense` -- top expense categories
- `transaction_type=income` -- top income categories

```
for each category:
    total = sum(abs(amount) where category=C AND type=transaction_type)
    count = count(*)
    percentage = total / grand_total * 100
sort desc by total
```

Returns at most `limit` results (default 10). Used by treemaps, pie charts, top-category tables.

### Spending Velocity

**Code**: `core/calculator.py::calculate_spending_velocity`

Compares current-month expenses against the user's typical pace:

```
days_elapsed = today.day  (or 30 if past month)
expected = (avg_monthly_expense / 30) * days_elapsed
actual = sum(expenses in current month, up to today)
velocity_pct = (actual / expected - 1) * 100

if velocity_pct > 15: status = "high"     (spending fast)
elif velocity_pct < -15: status = "low"   (spending slow)
else: status = "normal"
```

Shown on Dashboard as a gauge.

### Consistency Score

**Code**: `core/calculator.py::calculate_consistency_score`

```
cv = stddev(monthly_expenses) / mean(monthly_expenses)
score = max(0, min(100, 100 - cv * 100))
```

Higher = more consistent month-to-month spending. Used in Financial Health Score.

### Lifestyle Inflation

**Code**: `core/calculator.py::calculate_lifestyle_inflation`

```
recent_3_months_avg = mean(expenses in last 3 months)
prior_3_months_avg = mean(expenses in months 4-6 ago)
inflation_pct = (recent - prior) / prior * 100
```

Tracks whether you've been gradually spending more. Used in Insights page.

---

## Tax Calculations (India)

**Code**: `frontend/src/lib/taxCalculator.ts`

### Slab Rates

Ledger Sync ships with hardcoded tax slabs for:

- **Old Regime** -- FY2019-20 through FY2025-26 (with 80C, 80D, HRA, 24(b) deductions)
- **New Regime** -- FY2020-21 onward (lower rates, no deductions except standard + NPS 80CCD(2) + Agniveer 80CCH)

Slab lookup:

```typescript
getTaxSlabs(fyStartYear: number, regime: 'old' | 'new'): Slab[]
```

Each slab is `{ upto: number, rate: number }`, e.g. for New Regime FY2025-26:

```
[0, 0], [4L, 5%], [8L, 10%], [12L, 15%], [16L, 20%], [20L, 25%], [24L, 30%]
```

### Standard Deduction

```
FY2019-20 to FY2022-23:  50,000
FY2023-24 onward (Old):  50,000
FY2023-24 onward (New):  75,000 from FY2024-25, 50,000 before
```

### Tax Computation

```typescript
calculateTax(grossIncome, slabs, standardDeduction, hasEmploymentIncome, salaryMonthsCount, isNewRegime, fyStartYear)
```

**Steps:**

1. **Standard deduction**: `taxable = grossIncome - standardDeduction` (if employment income)
2. **Professional tax**: `taxable -= 200 * salaryMonthsCount` (capped at 2500/FY, Maharashtra rate; only if employment income)
3. **Slab tax**: walk slabs bottom-up, tax each slice at its rate
4. **Section 87A Rebate**:
   - Old regime, taxable <= 5L: tax = 0 (rebate = tax up to 12,500)
   - New regime FY2023-24, taxable <= 7L: rebate up to 25,000
   - New regime FY2025-26+, taxable <= 12L: rebate up to 60,000
5. **Surcharge** (on tax after rebate):
   - 50L-1Cr: 10%
   - 1Cr-2Cr: 15%
   - 2Cr-5Cr: 25% (old) / 25% (new before 2023-24) / capped at 25% after
   - >5Cr: 37% (old) / 25% (new, post-2023-24 cap)
6. **Cess**: `4% * (tax + surcharge)` -- Health & Education Cess
7. **Total** = tax + surcharge + cess + professional_tax

**Return shape**:

```typescript
{
  tax,             // base slab tax after rebate
  slabBreakdown,   // [{slab, amount_in_slab, tax}, ...] for display
  rebate87A,
  surcharge,
  cess,
  professionalTax,
  totalTax,
}
```

### Gross-from-Net Reversal

**Code**: `taxCalculator.ts::calculateGrossFromNet`

When computing tax from actual bank statements, the imported income amount is the **net** (post-tax) value. We need to reverse-engineer the gross.

```typescript
calculateGrossFromNet(netIncome, { slabs, standardDeduction, applyProfessionalTax, salaryMonthsCount, isNewRegime, fyStartYear })
```

Binary-searches for a gross such that `calculateTax(gross) == gross - netIncome`. Used by Tax Planning page to show gross taxable income from your actual deposited salary.

---

## Salary & Multi-Year Projections

**Code**: `frontend/src/lib/projectionCalculator.ts`

### Salary Components (per FY)

```typescript
interface SalaryComponents {
  basic: number               // annual
  hra: number                 // annual
  special_allowance: number   // annual
  variable_pay: number        // annual bonus
  epf_contribution: number    // annual, employer's share (taxable)
  nps_80ccd2: number          // annual, employer's 80CCD(2) contribution (deductible in both regimes)
  professional_tax: number    // annual, typically 2,500 in Maharashtra
  other_allowances: number    // catch-all
}

gross_annual = basic + hra + special_allowance + variable_pay + epf + nps + other
```

### RSU Vesting

```typescript
interface RsuGrant {
  stock_name: string
  stock_symbol: string
  stock_currency: 'USD' | 'INR' | etc
  stock_price: number        // current spot price
  vesting_schedule: { date: string, quantity: number }[]
}
```

```
for each vesting in a FY:
    stock_price_at_vest = stock_price * (1 + stock_appreciation_pct/100)^years_since_today
    vest_value_inr = quantity * stock_price_at_vest * fx_rate_to_inr
    rsu_income_total += vest_value_inr
```

### Growth Assumptions

```typescript
interface GrowthAssumptions {
  salary_hike_pct: number           // e.g. 10 = 10% hike annually
  variable_growth_pct: number       // bonus growth rate
  stock_appreciation_pct: number    // RSU stock price CAGR assumption
  projection_years: number          // how many future FYs to project
  include_rsu_in_projection: boolean
}
```

### `projectFiscalYear(fy, salaryStructure, rsuGrants, growth, fyStartMonth)`

Returns `ProjectedFYBreakdown`:

```
baseSalary    = actual salary_structure[fy] if entered, else latest * (1+hike)^years_since
bonus         = variable_pay * (1+var_growth)^years_since
rsuIncome     = sum of RSU vests during this FY (using stock_appreciation for future years)
epf           = employer EPF contribution
otherTaxable  = nps + other_allowances
grossTaxable  = baseSalary + bonus + rsuIncome + epf + otherTaxable
totalTax      = calculateTax(grossTaxable, ...)  using preferred regime for that FY
takeHome      = grossTaxable - totalTax - professional_tax
effectiveTaxRate = totalTax / grossTaxable * 100
```

### `projectMultipleYears(...)`

Iterates `projectFiscalYear` for each FY from the latest entered salary FY through `latest + projection_years`. Result is the table shown on the Tax Planning page's multi-year projection chart and summary.

---

## Investment & Net Worth

### Investment Account Classification

**Code**: `core/analytics_engine.py::_is_investment_account`

Reads `user_preferences.investment_account_mappings` (JSON dict of patterns like `"Groww Stocks": "stocks"`). Returns true if any configured pattern is a substring of the account name.

Default patterns (when no user config):

```
"Grow Stocks" / "IND money" / "RSUs"  -> stocks
"Grow Mutual Funds"                   -> mutual_funds
"FD/Bonds"                            -> fixed_deposits
"EPF" / "PPF"                         -> ppf_epf
```

### Investment Holdings

**Code**: `_populate_investment_holdings` + `_analytics_helpers.aggregate_holdings_data`

```
for each investment account:
    invested = sum(transfer amounts into this account) - sum(transfer amounts out)
    income = sum(Income amounts credited to this account)  (dividends, interest)
    expense = sum(Expense amounts deducted from this account)  (fees)
    net_position = invested + income - expense
```

Used by Investment Analytics, Returns Analysis, Net Worth pages.

### Net Worth Snapshot

**Code**: `_calculate_net_worth_snapshot` + `_compute_account_balances`

```
for each account:
    balance = sum(incoming transfers)
            + sum(income into account)
            - sum(expenses from account)
            - sum(outgoing transfers)

account_type = classify_account(name)  # from user account_classifications or default keyword match

For the snapshot:
    total_assets = sum(balance where account_type IN {bank, investment, cash})
    total_liabilities = sum(abs(balance) where account_type IN {credit_card, loan})
    net_worth = total_assets - total_liabilities

    liquid_cash = sum(balance where account_type IN {bank, cash})
    investments = sum(balance where account_type = investment)
    real_estate = sum(balance where account_type = real_estate)  # user-tagged
```

**Snapshot cadence**: one snapshot per day maximum (upserts by date). Used for the Net Worth time-series chart.

### Net Worth Milestones + Projections (unified)

**Code**: `frontend/src/pages/net-worth/netWorthProjection.ts`

All three views on the Net Worth page -- the Milestones table, the ETA rows inside it, and the chart projection overlay -- share ONE anchor point (the last observation on the filtered chart series) and ONE growth rate (trailing 12-month average monthly delta of that same series). This keeps every number self-consistent.

```
anchor = last point of the filtered chart series    # (date, netWorth)
avg_monthly_growth = mean(
    monthly_end_netWorth[i] - monthly_end_netWorth[i-1]
    for the last 12 months in the series
)

buildMilestoneRows(series, anchor, growth):
    # Scan the series once, record FIRST crossing of each threshold.
    # Defaults: ₹1L, ₹5L, ₹10L, ₹25L, ₹50L, ₹1Cr, ₹2.5Cr, ₹5Cr, ₹10Cr.
    for each default milestone:
        if ever crossed in series:
            status = "achieved"
            date = first_crossing_date
            stableSince = findStableSince(series, value, first_crossing_date)
        elif growth > 0 and value > anchor.netWorth:
            months_away = (value - anchor.netWorth) / growth
            status = "upcoming"
            date = anchor.date + months_away * 30.44 days
            stableSince = null
        else:
            status = "upcoming", date = null, stableSince = null
    sort rows by value ascending

findStableSince(series, target, firstCrossing):
    # Scan backward for the last index where value < target.
    # Never dipped below -> stable since firstCrossing.
    # Last index is the final point -> not stable (null).
    # Otherwise -> stable since the first point after that dip that is >= target.
```

**Three status tiers** (displayed in the Milestones table):

- **Stable** -- `stableSince !== null`: crossed and never dipped back below. Green.
- **Reached** -- `status === 'achieved' && stableSince === null`: crossed at least once but net worth is currently (or was recently) below the threshold. Yellow.
- **Upcoming** -- `status === 'upcoming'`: not yet crossed. Muted.

The "Reached but not Stable" tier exists because touching a milestone once is weaker evidence than holding it -- a user who crossed ₹10L on a bonus day and then dipped back should not be told "₹10L achieved" the same way as a user who crossed it on salary growth and held.

**Chart projection overlay** (toggle-gated):

```
if growth > 0:
    historical = downsampleToMonthly(filtered_series)   # one point per month-end
    projection = projectNetWorth(anchor, growth, horizon=60):
        for i in 1..60:
            date = anchor.date + i months
            netWorth = anchor.netWorth + growth * i
    chartData = [historical..., anchor, projection...]
```

The historical series is **downsampled to monthly** whenever the projection is on. This prevents ~1,400 daily points + 60 monthly points from sharing a categorical x-axis (which made the projected 5 years visually compress to ~4% of the chart).

The projection is **"if recent trend holds"** -- constant linear growth, not a forecast. A bad month, windfall, or market swing will shift the ETA dates. A "Now" reference line marks where the historical data ends.

### CAGR (Returns Analysis)

**Code**: `frontend/src/pages/ReturnsAnalysisPage.tsx`

```
for each investment category:
    invested_total = total transferred into category accounts
    current_value = current balance (including income, fees)
    years = (now - first_investment_date) / 365.25
    CAGR = (current_value / invested_total)^(1/years) - 1
```

Note: this is simplified CAGR, not XIRR. For accurate XIRR-style returns with irregular cash flows, the frontend would need timestamps of each contribution -- currently deferred.

---

## Recurring Transaction Detection

**Code**: `core/analytics_engine.py::_detect_recurring_transactions`

### Algorithm

1. Group transactions by `(normalized_note_or_category, type)`.
2. For each group with >= 3 transactions:
   - Sort by date
   - Compute gaps between consecutive dates in days
   - Compute mean amount, amount variance (std dev / mean)
3. Detect frequency via `_detect_frequency`:
   ```
   mean_gap in [6, 8]      -> WEEKLY (interval ~7)
   mean_gap in [13, 15]    -> FORTNIGHTLY
   mean_gap in [28, 32]    -> MONTHLY
   mean_gap in [88, 92]    -> QUARTERLY
   mean_gap in [178, 186]  -> SEMIANNUAL
   mean_gap in [360, 370]  -> YEARLY
   else                    -> not recurring
   ```
4. **Confidence score** (0-100):
   ```
   gap_consistency = 1 - (stddev(gaps) / mean(gap))      # penalize irregular intervals
   amount_consistency = 1 - min(1, amount_variance)       # penalize amount swings
   count_score = min(1, occurrences / 6)                  # need ~6 to be sure
   confidence = (gap_consistency * 0.4 + amount_consistency * 0.3 + count_score * 0.3) * 100
   ```
5. Only patterns with `confidence >= recurring_min_confidence` (default 50) are saved.
6. `expected_day = mode(txn.date.day)` for monthly patterns, else None.
7. `next_expected = last_date + interval_days`.

### User Confirmation

`is_confirmed` field starts False. Users can manually confirm in the Subscription Tracker page, which promotes the pattern to "Confirmed" status (shown with a green indicator in the calendar).

---

## Anomaly Detection

**Code**: `core/analytics_engine.py::_detect_anomalies`

### High-Expense Months

```
for each month in monthly_summaries:
    z_score = (expense - mean_expense_all_months) / stddev_expense_all_months
    if z_score > anomaly_expense_threshold (default 2.0):
        flag as "high_expense" anomaly
```

### Large Individual Transactions

```
for each expense in current month:
    if amount > mean_monthly_expense + 2 * stddev_monthly_expense:
        flag as "large_transfer" anomaly
```

### Budget Exceeded

```
for each budget in current month:
    actual_spend = sum(expense in budget.category in budget period)
    if actual_spend > budget.amount * (alert_threshold / 100):   # default 80%
        flag as "budget_exceeded" anomaly
```

### Unusual Category

Compares current-month category spend against rolling 3-month average:

```
for each category:
    if current > prior_3mo_avg * 2 AND current > 5000:
        flag as "unusual_category" anomaly
```

### Auto-Dismissal

If `auto_dismiss_recurring_anomalies` is True, anomalies matching detected recurring transactions are auto-dismissed (e.g., your yearly insurance premium of 50,000 won't flag as unusual).

---

## FIRE Calculator

**Code**: `frontend/src/lib/fireCalculator.ts`

### Core Formulas

```typescript
// FIRE number = required portfolio to live off SWR indefinitely
fireNumber = annualExpenses / (swr / 100)
// Default swr = 4 (4% safe withdrawal rate, Trinity study)

// Coast FIRE = portfolio you need now for compounding to hit FIRE at retirement
coastFIRE = fireNumber / (1 + realReturn)^yearsToRetire

// Lean FIRE = minimal-lifestyle version
leanFIRE = fireNumber * 0.6

// Fat FIRE = comfortable version
fatFIRE = fireNumber * 2

// Years to FIRE from current portfolio + annual savings
//   Solve: currentPortfolio * (1+r)^n + annualSavings * [((1+r)^n - 1) / r] = fireNumber
yearsToFIRE = log((fireNumber * r + annualSavings) / (currentPortfolio * r + annualSavings)) / log(1 + r)
```

Default inputs:
- `swr = 4` (4% safe withdrawal rate)
- `realReturn = 0.07` (7% real return after inflation)

### Savings Rate

```typescript
currentSavingsRate = (annualIncome - annualExpenses) / annualIncome * 100
```

---

## Financial Health Score

**Code**: `frontend/src/components/analytics/FinancialHealthScore.tsx`

Four pillars, each 0-100, then averaged:

### 1. Spend (0-100)

Composed of:

- **Budget Adherence** (weight 40%): `100 - (% of budgets exceeded)`
- **Savings Rate** (weight 30%): `min(100, current_savings_rate * 5)` (20% savings = 100 score)
- **Expense Growth Control** (weight 30%): `100 - max(0, min(100, expense_yoy_pct * 2))` (0% YoY = 100, 50% YoY = 0)

### 2. Save (0-100)

- **Emergency Fund Ratio** (weight 50%): `min(100, liquid_cash / (3 * monthly_expenses) * 100)` -- 3 months = 100
- **Savings Rate** (weight 30%): same as above
- **Consistency Score** (weight 20%): from `calculate_consistency_score` above

### 3. Borrow (0-100)

- **Debt-to-Income Ratio** (weight 60%): `100 - min(100, (total_liabilities / total_income) * 100)`
- **Credit Card Utilization** (weight 40%): `100 - avg(card.balance / card.limit) * 100` across all credit cards

### 4. Plan (0-100)

- **Investment Allocation** (weight 40%): `min(100, investments / net_worth * 100 * 2)` -- 50% invested = 100
- **Goal Progress** (weight 30%): mean of (current / target) for all active goals, capped at 100
- **Tax Efficiency** (weight 30%): computed from 80C/80D utilization in the selected regime

**Overall score** = mean of 4 pillars.

Grade:
- 90-100: Excellent
- 75-89: Good
- 60-74: Fair
- < 60: Needs attention

---

## Currency Conversion

**Code**: `frontend/src/lib/formatters.ts::convertAmount`, `/api/exchange-rates`

### Exchange Rate Fetch

Backend: `GET /api/exchange-rates?base=INR` returns rates keyed by currency code. Source: [frankfurter.app](https://www.frankfurter.app) (ECB data).

Cached server-side for 24 hours. Three-tier fallback:

1. Fresh cache (< 24h old) -- return immediately
2. Stale cache (24h-7d) -- return stale, async refresh
3. Hardcoded fallback rates -- used when upstream is down

### Conversion

```typescript
convertAmount(amount, fromCurrency='INR', toCurrency=displayCurrency) {
  if (from === to) return amount
  rate = exchangeRates[to] / exchangeRates[from]
  return amount * rate
}
```

All `formatCurrency`, `formatCurrencyCompact`, `formatCurrencyShort` call this automatically based on the user's `display_currency` preference.

### Short Unit Selection

```
if display_currency == 'INR':
    1 Cr  = 10,000,000
    1 L   = 100,000
    1 K   = 1,000
elif display_currency IN { USD, EUR, GBP, ... }:
    1 B   = 1,000,000,000
    1 M   = 1,000,000
    1 K   = 1,000
```

---

## Chart-Specific Data Shapes

### Year in Review Heatmap

```typescript
// frontend/src/pages/year-in-review/heatmapUtils.ts
buildDayCells(startDate, endDate, dayExpenses, dayIncomes) -> DayCell[]

interface DayCell {
  date: string            // "YYYY-MM-DD"
  expense: number
  income: number
  net: number             // income - expense
  dayOfWeek: number       // 0=Sun
  weekIndex: number       // weeks from start
  month: number           // 0=Jan
  isToday: boolean
  hasTx: boolean
}
```

Intensity level 0-4 chosen by `getIntensityLevel(value, max)`:

```
ratio = value / max
0 if value == 0 OR max == 0
1 if ratio < 0.15
2 if ratio < 0.35
3 if ratio < 0.60
4 otherwise
```

### Trends & Forecasts (3-month rolling average)

```typescript
// frontend/src/pages/trends-forecasts/useTrendsForecasts.ts
monthlyTrendWithAvg = monthlyTrendChartData.map((d, i) => ({
  ...d,
  incomeAvg:   mean(window_i-2_to_i)
  expensesAvg: mean(window_i-2_to_i)
  savingsAvg:  mean(window_i-2_to_i)
}))
```

### Cumulative Savings Rate (daily)

```typescript
dailySavingsData[k] = {
  date: sorted_days[k],
  savingsRate: max(0, (cumIncome - cumExpense) / cumIncome * 100),  // clamped for clean chart
  rawSavingsRate: (cumIncome - cumExpense) / cumIncome * 100        // actual, may be negative
}
```

The chart renders `savingsRate` but tooltip shows `rawSavingsRate` with a "(deficit)" label when negative.

### Bill Calendar (recurring frequency -> days in month)

```typescript
// frontend/src/pages/bill-calendar/billUtils.ts
getBillDaysForMonth(tx, year, month) -> number[]

Weekly:        walk from tx.next_expected at 7-day intervals, collect days in month
Fortnightly:   same, 14-day intervals
Monthly:       [clamp(tx.expected_day, daysInMonth)]
Quarterly:     [expected_day] if (month - next_expected.month) % 3 == 0 else []
Yearly:        [expected_day] if next_expected.month == month else []
```

### Sankey (Income -> Expense flow)

```typescript
// frontend/src/pages/income-expense-flow/
nodes = [ ...income_categories, ...expense_categories ]
links = [
  { source: income_cat, target: expense_cat, value: attributed_amount }
]

Attribution heuristic: for each month, allocate expense proportionally to income sources by percentage.
(This is an approximation -- true source-of-funds tracking would require bank-level lineage, not possible from aggregated statements.)
```

---

## Related Reading

- [architecture.md](architecture.md) -- high-level system design and layer responsibilities
- [DATABASE.md](DATABASE.md) -- schema details, columns, indexes
- [API.md](API.md) -- endpoint reference for all calculation/analytics routes
