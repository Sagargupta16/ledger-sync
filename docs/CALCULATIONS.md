# Calculations and Data Processing

Calculation reference for Ledger Sync 2.22.0.

Verified against the backend analytics engine and frontend calculator modules
on 2026-07-14.

## Calculation Boundaries

Ledger Sync has three calculation layers:

1. **Reconciliation** converts browser-parsed rows into the canonical ledger.
2. **Backend analytics** computes user-scoped rollups and on-demand metrics.
3. **Frontend calculators** handle interactive tax, RSU, TDS, FIRE, projection,
   GST, and return scenarios.

Primary sources:

```text
backend/src/ledger_sync/
  ingest/hash_id.py
  core/reconciler.py
  core/calculator.py
  core/analytics/
  api/calculations.py
  api/analytics.py
  api/analytics_v2_impl/

frontend/src/lib/
  taxCalculator.ts
  tax-config/
  projectionCalculator.ts
  rsuVesting.ts
  tdsScheduleCalculator.ts
  fireCalculator.ts
  gstCalculator.ts
  instrumentCalculators.ts
  xirr.ts
```

All backend financial aggregation starts from active rows owned by the
authenticated user. `is_deleted=true` rows and configured excluded accounts
are removed where the calculation contract requires it.

## Time Filtering

Backend relative ranges anchor to the current UTC date, not to the newest
transaction:

- `all_time`
- `this_month`
- `last_month`
- `last_3_months`
- `last_6_months`
- `last_12_months`
- `this_year`
- `last_year`
- `last_decade`

Sliding month ranges are calendar aligned. For example, last three months means
the current calendar month plus the prior two calendar months.

The shared frontend analytics selector supports:

- All Time
- Fiscal Year
- Yearly
- Monthly

Historical range end dates are capped at today. Projection pages intentionally
build future ranges separately.

### Earning start date

The optional earning start date is a view filter only. It clamps chart and
query start dates but does not delete or rewrite earlier ledger rows.

## Upload and Reconciliation

### Transaction hash

For income and expense rows, the deterministic ID is:

```text
SHA-256(
  normalized user_id
  | date
  | amount
  | account
  | note
  | category
  | subcategory
  | type
  | occurrence when occurrence > 0
)
```

Normalization rules:

- Strings are trimmed and lowercased.
- Amounts use two decimal places.
- Dates use ISO 8601.
- Missing optional values become empty strings.

The occurrence counter is zero-based inside one import batch. The first
identical row keeps the legacy hash shape. Later identical rows append their
occurrence before hashing, so legitimate duplicate purchases are preserved.

Transfers use normalized source and destination accounts. Matching
Transfer-In and Transfer-Out source rows collapse into one canonical
`Transfer`.

### Reconciliation actions

For each normalized record:

| Condition | Action |
| --- | --- |
| ID does not exist for the user | Insert |
| ID exists and mutable fields changed | Update |
| ID exists with no mutable change | Skip and refresh `last_seen_at` |
| ID exists but was soft-deleted | Restore |
| Active user row was not seen in the current import | Soft-delete |

The unseen-row sweep is user-wide. It is not scoped to the latest source file.
That behavior makes an import a current ledger snapshot, not an additive file
append.

After reconciliation, the API runs the full analytics pipeline. A failed
analytics refresh does not undo persisted transaction changes; a manual refresh
can be run later.

## Persisted Analytics

`AnalyticsEngine` is composed from domain mixins under `core/analytics/`.
`core/analytics_engine.py` is only a compatibility import facade.

One full refresh:

1. Loads active user transactions once.
2. Updates daily summaries.
3. Updates monthly summaries.
4. Rebuilds category trends.
5. Rebuilds transfer flows.
6. Rebuilds merchant intelligence.
7. Re-detects recurring transactions while preserving confirmed rows.
8. Upserts today's net-worth snapshot.
9. Rebuilds derived investment holdings.
10. Rebuilds fiscal-year summaries.
11. Re-detects anomalies.
12. Updates budget tracking.
13. Rebuilds spending cohorts.
14. Writes an audit log and commits.

### Daily summaries

Grain:

```text
(user_id, YYYY-MM-DD)
```

Stored values:

- Total income
- Total expenses
- Net, `income - expenses`
- Counts by type
- Total transaction count
- Highest-spend expense category

### Monthly summaries

Grain:

```text
(user_id, YYYY-MM)
```

Core formulas:

```text
net_savings = total_income - total_expenses
savings_rate = net_savings / total_income * 100, when income > 0
expense_ratio = total_expenses / total_income * 100, when income > 0
```

Savings rate is not capped at 100 percent. Negative rates and values above 100
remain mathematically visible.

Income is split into salary, investment, and other income using user
preferences and classification helpers. Expenses are split into essential and
discretionary values using the configured essential-category set.

Transfer totals record both incoming and outgoing legs. Investment flow uses
this sign convention:

```text
transfer into investment account  -> subtract amount
transfer out of investment account -> add amount
investment-to-investment transfer  -> net zero
```

Therefore a negative `net_investment_flow` means net money was deployed into
investments.

Month-over-month percentages are zero when the prior value is absent or not
positive.

### Category trends

Grain:

```text
(user_id, period_key, category, subcategory, transaction_type)
```

Transfers are excluded. Each row stores total, count, average, maximum,
minimum, percent of that month's same-type total, and change from the previous
month at the same category, subcategory, and type grain.

### Transfer flows

Grain:

```text
(user_id, from_account, to_account)
```

These are all-time account-pair aggregates, not monthly rows. They include
total amount, count, average, last transfer date and amount, and current
account classifications.

### Spending cohorts

Expense cohorts use three dimensions:

| Dimension | Buckets | Average divisor |
| --- | --- | --- |
| Day of week | Monday 0 through Sunday 6 | Exact weekday occurrences in the inclusive data span |
| Day of month | 1 through 31 | Distinct observed months that contain that day |
| Month of year | 1 through 12 | Distinct years containing that month |

The divisor includes zero-spend calendar occurrences where applicable. It is
not simply the number of transactions in a bucket.

### Fiscal-year summaries

The user's configured fiscal-year start month determines each period.

```text
net_savings = total_income - total_expenses
savings_rate = net_savings / total_income * 100
```

Income is split into salary, bonus, investment, and other. Tax expenses are
identified by the Taxes category or tax vocabulary in the note, including TDS,
GST, cess, surcharge, advance tax, and self-assessment tax. Transfers into
known investment accounts count as investments made.

Year-over-year savings change divides by the absolute prior savings value, so
the direction does not invert when the prior year was negative.

## On-Demand Core Metrics

### Totals

```text
total_income = sum(Income amounts)
total_expenses = sum(Expense amounts)
net_change = total_income - total_expenses
savings_rate = net_change / total_income * 100, when income != 0
```

Transfers do not enter income or expense totals.

### Account balances

For each account:

```text
Income  -> add to account
Expense -> subtract from account
Transfer -> subtract from from_account and add to to_account
```

These are ledger-derived balances. They are not live balances fetched from a
bank.

### Daily spending and burn rate

```text
daily_spending_rate =
  total expense / inclusive day span from first to last expense

monthly_burn_rate =
  total expense / inclusive month span from first to last expense
```

### Spending velocity

The latest expense date anchors the split.

```text
recent_daily =
  expense in the inclusive latest 30-day window / 30

historical_daily =
  earlier expense / inclusive historical day span

velocity_ratio =
  recent_daily / historical_daily, when historical_daily > 0
```

A ratio above 1 means recent daily spending is faster than the historical
baseline.

### Consistency score

For monthly expense values:

```text
coefficient_of_variation = population_stddev / mean * 100
consistency_score = max(0, 100 - coefficient_of_variation)
```

Zero or one month returns 100.

### Lifestyle inflation

The metric compares average expense in the first three calendar months of
history with the last three.

It returns zero unless:

- At least six expense rows exist.
- Both windows cover three distinct months.
- The first-window monthly average is at least 1.

Otherwise:

```text
lifestyle_inflation =
  (latest_3_month_average - first_3_month_average)
  / first_3_month_average
  * 100
```

## 50/30/20 Spending Rule

`GET /api/analytics/v2/spending-rule` groups the selected period into:

- Needs
- Wants
- Savings

Targets default to 50, 30, and 20 percent but are user configurable.

Classification combines:

- Built-in category and account patterns
- User essential categories
- User investment account mappings
- Transfer destination
- Transaction category and subcategory

Transfers into a recognized investment account and expenses booked directly
on a recognized investment account count as Savings. Generic transfer labels
are relabeled where the destination identifies an instrument.

The response includes period totals, targets, amount and percent for each
bucket, signed target deltas, and category details.

## Investment Holdings

Investment account mappings default to an empty object. Users configure the
mapping in Settings; no hidden default account names are persisted.

For each mapped investment account:

```text
transfer_principal =
  transfers in - transfers out

account_flow =
  income booked on account - expenses booked on account

current_value =
  transfer_principal + account_flow

invested_amount =
  transfer_principal + max(account_flow, 0)
```

Without lot-level market data, positive account income is treated as
principal instead of being labeled as a gain. Both realized and unrealized
gains remain zero. A holding is active when `current_value > 0`.

## Net Worth

Account balances are classified with `account_classifications` and investment
mappings.

```text
total_investments =
  stocks + mutual_funds + fixed_deposits + ppf_epf

total_assets =
  cash_and_bank + total_investments + other_assets

total_liabilities =
  credit_card_outstanding + loans_payable

net_worth =
  total_assets - total_liabilities
```

One snapshot per user and UTC day is upserted. Change compares against the most
recent snapshot before today, not an earlier value from the same day.

Frontend milestone projections use a different, explicitly labeled model:

- Anchor on the latest filtered net-worth observation.
- Compute average monthly change from the latest 12 monthly-end points.
- Extend a constant linear monthly change for up to 60 months.

This is an "if recent trend holds" projection, not a market forecast.

## Recurring Detection

Income and expense rows are grouped by normalized note and type. Rows without a
note fall back to category and subcategory.

Requirements:

- At least three occurrences
- Mean day gap within a supported band
- Confidence at or above the user's threshold

Frequency bands:

| Mean gap | Frequency |
| --- | --- |
| 4 to under 11 days | Weekly |
| 11 to under 20 | Biweekly |
| 20 to under 50 | Monthly |
| 50 to under 80 | Bimonthly |
| 80 to under 130 | Quarterly |
| 130 to under 270 | Semiannual |
| 270 to under 400 | Yearly |

Confidence is:

```text
max(0, 100 - standard_deviation(day_gaps) * cadence_penalty)
```

Wider cadences use a smaller penalty. Expected amount and amount variance use
the sample mean and sample standard deviation. Monthly-like frequencies infer
an expected day from the modal day, with special handling for late-month
clamping.

User-confirmed rows are preserved during a refresh and have their observed
statistics updated.

## Anomaly Detection

The active detector creates two statistical finding types plus budget-overrun
findings from budget tracking.

### High-expense months

With at least four months:

```text
median = median(monthly expense totals)
MAD = median(abs(value - median))
modified_z = 0.6745 * (value - median) / MAD
```

The stored legacy threshold is mapped to a modified-Z cutoff:

```text
effective_cutoff = 3.5 * (stored_threshold / 2.0)
```

When MAD is zero, the detector uses Tukey's upper fence:

```text
Q3 + 1.5 * IQR
```

### Large individual expenses

Each expense is compared with the median of earlier transactions in the same
category from the preceding 365 days.

- At least five historical values are required.
- At least 3 times the median is flagged.
- At least 5 times the median is high severity.
- The transaction under review is excluded from its own baseline.

Reviewed anomalies remain stored. Unreviewed findings are replaced on refresh.
Findings are sorted by deviation and capped at 50 persisted rows.

### Budget exceeded

For each active budget, the current calendar month's category spending updates:

```text
remaining = monthly_limit - spent
percent = spent / monthly_limit * 100
```

A high-severity budget anomaly is created only after usage exceeds 100 percent.

There are no active unusual-category, duplicate, missing-recurring, or
auto-dismiss detectors in the current analytics run.

## Tax Calculation

Tax rules are versioned by fiscal year under
`frontend/src/lib/tax-config/`. The newest known fiscal-year configuration is
used as fallback for later years until a new rule file is added.

The frontend tax engine applies:

1. Employment standard deduction where eligible.
2. Professional tax where configured.
3. Progressive slab tax.
4. Section 87A rebate for the selected fiscal year and regime.
5. Surcharge and applicable caps.
6. Health and education cess.

Tax Planning can reverse a net salary value to an estimated gross value using
a bounded binary search through the same tax function.

Always update the versioned tax configuration and its tests when tax law
changes. Do not hardcode new slabs inside page components.

## Salary, RSU, and TDS Projections

### Salary projection

Fiscal-year salary data contains base salary, HRA, bonus, monthly EPF and NPS,
special allowance, and other taxable income. Growth assumptions independently
control base salary, bonus, NPS, and stock price, with EPF optionally scaling
with base.

### RSU valuation

Each vesting has a date, quantity, and optional `price_at_vest`.

- A completed vesting uses its locked vest-date price when available.
- An upcoming vesting uses the grant's current price and projection
  assumptions where applicable.
- Changing a completed vesting date clears the stale locked price in the UI so
  it can be fetched again.

### Forward TDS schedule

The page derives the recurring base by excluding annual bonus and RSU income
from projected gross taxable income:

```text
base_annual =
  max(0, gross_taxable - annual_bonus - rsu_income)

regular_monthly_income =
  base_annual / 12

bonus_monthly =
  annual_bonus / 12

extra_for_month =
  bonus_monthly + dated_rsu_vestings_for_month

baseline_monthly_tds =
  tax(base_annual) / 12
```

For each fiscal month:

```text
marginal_extra_tax =
  tax(base_annual + prior_extras + current_extra)
  - tax(base_annual + prior_extras)

monthly_tds =
  baseline_monthly_tds + marginal_extra_tax

projected_annual =
  base_annual + extras_seen_so_far

take_home =
  month_income - monthly_tds
```

The annual bonus is therefore represented as 12 equal monthly extras. RSU
income remains tied to each vesting month and produces a dated marginal-tax
spike. The progressive calculation stacks later extras on earlier ones, and
the 12 projected values sum to tax on the full known income.

For a live current fiscal year, rows for paid months replace projected TDS with
the average tax already deducted per paid month. Future rows retain the
projection.

## FIRE and Retirement

Defaults are India-oriented:

- Safe withdrawal rate: 3 percent
- Real return for FIRE timing: 6 percent
- Retirement inflation: 6.5 percent
- Nominal retirement return: 12 percent

Core formulas:

```text
FIRE number = annual expenses / safe withdrawal rate
Lean FIRE = essential annual expenses / safe withdrawal rate
Fat FIRE = FIRE number * 2
Barista FIRE =
  max(0, annual expenses - part-time annual income)
  / safe withdrawal rate
Coast FIRE =
  FIRE number / (1 + real return) ^ years to retirement
```

Years to FIRE solves the future-value equation for current portfolio plus
annual savings. Zero-return, zero-savings, already-reached, and impossible
cases have explicit branches.

Retirement SIP calculations convert the effective annual return to an
effective monthly return:

```text
monthly_rate = (1 + annual_return) ^ (1 / 12) - 1
```

The projection uses an annuity-due model, with contributions at the beginning
of each month.

## Investment Returns

The frontend includes:

- XIRR for irregular dated cash flows
- CAGR helpers where only start, end, and duration are available
- Mutual-fund SIP projection
- EPF, PPF, NPS, and other instrument projections

XIRR uses Newton iteration with bounded fallback behavior and a dated cash-flow
convention. Contribution and withdrawal signs must match the helper's
documented convention in `xirr.ts`.

## Currency Conversion

The backend fetches rates from frankfurter.dev and caches each base currency
for 24 hours.

Fallback order:

1. Fresh in-memory cache
2. Upstream fetch
3. Existing stale cache after a failed fetch
4. Dated hardcoded INR fallback when no INR cache exists

Responses expose Unix `fetched_at`. Hardcoded data exposes
`fallback_as_of`. There is no seven-day stale cutoff or background refresh.

Frontend conversion:

```text
converted =
  amount * rates[to_currency] / rates[from_currency]
```

INR compact formatting uses thousand, lakh, and crore units. Other currencies
use thousand, million, and billion units.

## Related Reading

- [API](API.md)
- [Database](DATABASE.md)
- [Architecture](architecture.md)
- [Page Catalog](PAGES.md)
