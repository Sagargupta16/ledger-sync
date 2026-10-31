# Calculations and Data Processing

Developer map and shared-finance contracts checked against source on 2026-10-27.
Examples below are synthetic; payroll and forecast values retain their stated
estimation limits.

The [analytics boundaries diagram](diagrams/README.md#analytics-boundaries)
shows where each number comes from (rollups, on-demand SQL, the full ledger,
browser calculations), and the [shared finance rules diagram](diagrams/README.md#shared-finance-rules)
shows which page hooks call which calculation modules.

## Developer Calculation Map

[Owners](#implementation-owners) |
[Units and dates](#units-currency-and-dates) |
[Rates](#rate-and-assumption-owners) |
[Trust and limitations](#trust-and-compatibility) |
[Call paths](#from-api-to-page) |
[Focused checks](#focused-calculation-checks) |
[Contribution rules](#changing-a-calculation)

### Implementation owners

Use the tables below as the **where-to-edit map**. Share arithmetic by financial
domain instead of growing one calculator monolith. The backend owns the imported
ledger, authorization, account exclusions, and persisted aggregates. Frontend
domain modules consume scoped data and explicit scenario inputs. Hooks compose
them with preferences; pages and chart adapters supply labels and presentation.

| Backend concern | Owner and boundary |
| --- | --- |
| Ledger normalization and reconciliation | [normalizer.py](../backend/src/ledger_sync/ingest/normalizer.py), [reconciler.py](../backend/src/ledger_sync/core/reconciler.py). Preserve positive amounts, transaction identity, transfer direction, and full-snapshot semantics. |
| Signed balances and investment transfers | [ledger_math.py](../backend/src/ledger_sync/core/ledger_math.py): `compute_account_balances` applies both transfer legs with `Decimal`; `investment_transfer_delta` computes signed external funding. Callers supply already-scoped rows and account membership. |
| Persisted summaries, holdings, net worth, FY totals | [analytics/engine.py](../backend/src/ledger_sync/core/analytics/engine.py) composes the [domain modules](../backend/src/ledger_sync/core/analytics/). [query_helpers.py](../backend/src/ledger_sync/core/query_helpers.py) centralizes active-row filters and income/consumption/loss expressions. |
| On-demand metrics | [core/calculator.py](../backend/src/ledger_sync/core/calculator.py) owns reusable in-memory calculations. The [api/calculations.py](../backend/src/ledger_sync/api/calculations.py) routes delegate to [calculations_impl/](../backend/src/ledger_sync/api/calculations_impl/__init__.py) (aggregates, categories, insights), which with [calculations_helpers.py](../backend/src/ledger_sync/api/calculations_helpers.py) owns endpoint-specific SQL aggregation and result shaping; not every metric routes through `calculator.py`. |
| Dashboard row-level metrics | [dashboard_metrics.py](../backend/src/ledger_sync/core/dashboard_metrics.py) serves `/api/dashboard-metrics/pulse` and `/health` from the ports in `dashboard_metrics_pulse.py`, `dashboard_metrics_inputs.py`, `dashboard_metrics_health.py` and `dashboard_metrics_analysis.py`, on the arithmetic of `dashboard_metrics_base.py`. They return the browser calculators' numbers on the same rows; change a TypeScript calculator and its twin together. |
| Safe to spend and balance projection | [safe_to_spend.py](../backend/src/ledger_sync/core/safe_to_spend.py) with `safe_to_spend_flows.py` (commitment and schedule flows), `safe_to_spend_ledger.py` (account roles, balances, spend history), `safe_to_spend_projection.py` and `safe_to_spend_report.py`. Read-only. See [Safe to spend](#safe-to-spend). |
| Weekly recap | [weekly_recap.py](../backend/src/ledger_sync/core/weekly_recap.py) with `weekly_recap_flows.py` and `weekly_recap_upcoming.py`. Deterministic book values; the optional AI Explain text is built in the browser from the same figures. See [Weekly recap](#weekly-recap). |
| Card statement cycles | [card_cycles.py](../backend/src/ledger_sync/core/card_cycles.py) holds the cycle rules, with `card_cycles_ledger.py` and `card_cycles_report.py`. See [Card statement cycles](#card-statement-cycles). |
| Balance checks | [balance_checks.py](../backend/src/ledger_sync/core/balance_checks.py) compares a typed bank balance with the ledger's running balance on every read. See [Balance checks](#balance-checks). |
| Category suggestions | [category_suggester.py](../backend/src/ledger_sync/core/category_suggester.py) with `category_suggester_model.py`, `category_suggester_features.py` and `category_suggester_store.py`. See [Category suggestions](#category-suggestions). |
| Anomaly detection | [analytics/anomalies.py](../backend/src/ledger_sync/core/analytics/anomalies.py) orchestrates `anomaly_rules.py`, `anomaly_detectors.py`, `anomaly_baselines.py`, `anomaly_ledger_checks.py`, `anomaly_recurring.py`, `anomaly_recurring_schedule.py`, `anomaly_recurring_index.py`, `anomaly_fee_patterns.py` and `anomaly_store.py`. See [Anomaly Detection](#anomaly-detection). |
| Mutual fund holdings from a CAS | [mf_valuation.py](../backend/src/ledger_sync/core/mf_valuation.py) values holdings at AMFI's NAV ([amfi_nav.py](../backend/src/ledger_sync/core/amfi_nav.py), `mf_nav_store.py`) with cost and gain, and [mf_xirr.py](../backend/src/ledger_sync/core/mf_xirr.py) owns XIRR on a 365-day year. See [Mutual funds from a CAS](#mutual-funds-from-a-cas). |
| Foreign assets (RSU lots, Schedule FA, FAST-DS) | [foreign_assets.py](../backend/src/ledger_sync/core/foreign_assets.py) holds the RSU rupee-value rules, with `foreign_assets_schedule.py` (Schedule FA rows) and `foreign_assets_fast_ds.py`. The browser mirror of the vest rule is [rsuTaxFx.ts](../frontend/src/lib/rsuTaxFx.ts); change both together. See [Foreign assets](#foreign-assets-schedule-fa-and-fast-ds). |

| Frontend concern | Canonical calculation owner | Caller or compatibility boundary |
| --- | --- | --- |
| Investment funding and account movements | [finance/investmentFlows.ts](../frontend/src/lib/finance/investmentFlows.ts): `investmentTransferDelta`, `investmentAccountDeltas`, `summarizeInvestmentTransfers` | Investment Analytics, Dashboard, health, and demo callers supply an account predicate. [investmentUtils.ts](../frontend/src/pages/investment-analytics/investmentUtils.ts) and [dailyAccountBalances.ts](../frontend/src/pages/investment-analytics/dailyAccountBalances.ts) retain chart/account adapters. Internal transfers move balances but add no external funding. |
| Recorded investment returns | [finance/investmentReturns.ts](../frontend/src/lib/finance/investmentReturns.ts): `classifyInvestmentReturn`, `computeInvestmentMetrics`, `groupInvestmentReturnsByMonth` | [returnsAnalysisUtils.ts](../frontend/src/pages/returns-analysis/returnsAnalysisUtils.ts) re-exports metrics and formats chart rows. Exactly one return category per row; contributions and book balances are not returns. |
| Net-worth balances, calendar growth, milestones, and cash-flow history | [finance/netWorth.ts](../frontend/src/lib/finance/netWorth.ts): `summarizeNetWorthAccounts`, `buildMonthlyNetWorthBalances`, `computeNetWorthMilestoneProgress`, growth/projection functions, `computeNetWorthTimeSeries` | [netWorthUtils.ts](../frontend/src/pages/net-worth/netWorthUtils.ts) and [netWorthProjection.ts](../frontend/src/pages/net-worth/netWorthProjection.ts) retain compatibility exports, classification, milestone labels/visible-row selection, and downsampling. [useNetWorth](../frontend/src/pages/net-worth/useNetWorth.ts) selects dates and the disclosed growth basis. The compound projection (savings-growth rate, band and milestone ETAs) lives in [netWorthCompound.ts](../frontend/src/pages/net-worth/netWorthCompound.ts); see [Net Worth](#net-worth). |
| Goal requirements, completion, and funding pace | [finance/goalProjection.ts](../frontend/src/lib/finance/goalProjection.ts): `computeGoalProjection`, `computeGoalPace` | [goals/helpers.ts](../frontend/src/pages/goals/helpers.ts) adds labels/colors; [GoalCard](../frontend/src/pages/goals/components/GoalCard.tsx) renders the shared pace. Goal and milestone ETAs reuse `dateUtils.addFractionalMonthsToKey`. |
| Cash-flow forecast | [finance/cashFlowForecast.ts](../frontend/src/lib/finance/cashFlowForecast.ts): `buildCashFlowForecast`, `CASH_FLOW_FORECAST_ASSUMPTIONS` | [cashFlowUtils.ts](../frontend/src/components/analytics/cashFlowUtils.ts) adapts series keys and labels for [CashFlowForecast](../frontend/src/components/analytics/CashFlowForecast.tsx). Historical `net_savings` is canonical; the forecast estimates consumption surplus before future capital losses. |
| Dashboard month comparisons | [finance/dashboardMetrics.ts](../frontend/src/lib/finance/dashboardMetrics.ts): `computeMonthlyChanges` | [useDashboardMetrics](../frontend/src/hooks/useDashboardMetrics.ts) fetches/selects inputs. Changes use complete periods and API net savings; savings-rate change is in percentage points. |
| Spending-rule targets and calendar-month statistics | [finance/spending.ts](../frontend/src/lib/finance/spending.ts): `spendingRuleSavings`, `computeBudgetRuleMetrics`, `spanMonthKeys`, `monthlySpendShape` | [spendingAnalysisUtils.ts](../frontend/src/pages/spending-analysis/spendingAnalysisUtils.ts) retains labels/chart adaptation. The hook selects comparable inputs; calendar zero months and the rule's five-percentage-point tolerance stay in the domain. |
| Spending pace and typical day/month | [finance/spendingStatistics.ts](../frontend/src/lib/finance/spendingStatistics.ts): `computeSpendingPace`, `monthsCovered`, `medianSpendingDay`, `medianSpendingMonth`, `computeWeekdaySpending` | [quickInsightsData.ts](../frontend/src/components/shared/quickInsightsData.ts) and [dayOfWeekUtils.ts](../frontend/src/pages/year-in-review/dayOfWeekUtils.ts) retain compatibility/presentation. Inclusive days, fractional months, active spending days, and completed calendar months have intentionally different denominators. |
| Tax basis, annual combined income, and regime comparison | [finance/taxPlanning.ts](../frontend/src/lib/finance/taxPlanning.ts): `computeTaxPlanning`, `computeAnnualTaxPlanning`, `compareTaxRegimes` | [taxPlanningUtils.ts](../frontend/src/pages/tax-planning/taxPlanningUtils.ts) provides compatibility exports only. The annual helper adds the selected FY's other taxable income once to the greater of recorded and projected employment gross. [taxCalculator.ts](../frontend/src/lib/taxCalculator.ts) remains the slab, rebate, surcharge, cess, and gross-up engine. |
| Tax history, FY grouping, and withholding reconciliation | [finance/taxHistory.ts](../frontend/src/lib/finance/taxHistory.ts): `groupTransactionsByFY`, `buildYearlyTaxData`, `computePrevFYDisplay`, `reconcileTaxWithholding` | `taxPlanningUtils.ts` re-exports the API. [useIncomeExpenseFlow](../frontend/src/pages/income-expense-flow/useIncomeExpenseFlow.ts) supplies explicit salary preferences and reuses withholding reconciliation. Recorded liability is not proof of payment. |
| Dated payroll and selected-regime orchestration | [finance/payrollPlanning.ts](../frontend/src/lib/finance/payrollPlanning.ts): `buildSalaryPayroll`, `summarizePayrollSchedule`, `buildPayrollPlanning`, `taxPlanningDisplay` | [projectionCalculator.ts](../frontend/src/lib/projectionCalculator.ts) and [useTaxPlanning](../frontend/src/pages/tax-planning/useTaxPlanning.ts) share the dated schedule. Annual cash sums monthly settlement; closing excess share credit stays separate. Combined annual tax and employment-only payroll cash have distinct scopes. |
| Effective tax-rate chart | [finance/taxRateCurve.ts](../frontend/src/lib/finance/taxRateCurve.ts): `effectiveTaxRate`, `buildTaxRateCurve` | [EffectiveTaxRateChart](../frontend/src/components/analytics/EffectiveTaxRateChart.tsx) uses the selected FY and employment eligibility. Before FY 2020-21 the chart has only the old-regime series; no unavailable new-regime line or comparison is synthesized. |
| RSU units, prices, and withholding | [rsuVesting.ts](../frontend/src/lib/rsuVesting.ts): `netVestingQuantity`, `valueRsuVestings`, `sumRsuCompensation`, `splitRsuTotals` | Settings, annual projections, and TDS use the same valued events and estimate flags. Taxable value uses gross units; received units can be actual or estimated. |
| Cash and share settlement primitive | [salaryCompensation.ts](../frontend/src/lib/salaryCompensation.ts): `salaryCashEarnings`, `settleSalaryCompensation` | Monthly settlement separates cash earnings, employee deductions, share withholding, cash take-home, retained shares, and excess credit. `buildSalaryPayroll` derives annual cash from those dated rows, not a second aggregate settlement. |
| Salary growth and bonus recurrence | [projectionCalculator.ts](../frontend/src/lib/projectionCalculator.ts): `projectFiscalYear`, `projectMultipleYears`, `projectAnnualBonus` | Saved salary/growth inputs determine scenarios, then `buildSalaryPayroll` supplies settlement. Derived `ProjectedFYBreakdown.fyStartMonth` carries the calendar basis. The selected regime is reapplied through the same payroll owner; pre-2020 FYs use old rules. |
| Monthly TDS and inferred withholding | [tdsScheduleCalculator.ts](../frontend/src/lib/tdsScheduleCalculator.ts): `buildTdsSchedule`, `computeTaxPaidTillDate` | `payrollPlanning.ts` passes annual valued RSU events and cash-only bonus extras once. Inference requires net employment receipts; gross receipts do not establish tax paid. |
| Recurring commitments, income baseline, and freshness | [recurringCalculations.ts](../frontend/src/lib/recurringCalculations.ts): `getRecurringFreshness`, `summarizeRecurringCommitments`, `typicalMonthlyIncome`, `recurringCoveragePercent` | Subscription Tracker and Dashboard supply the time basis. [recurrenceFrequency.ts](../frontend/src/lib/recurrenceFrequency.ts) owns annualization, aliases, and cadence. Review status never silently removes active commitments. |
| Consumption versus capital losses | [expenseClassification.ts](../frontend/src/lib/expenseClassification.ts) classifies type/category/subcategory with configured overrides | [useComparisonData](../frontend/src/pages/comparison/useComparisonData.ts) and [healthScoreAnalysis](../frontend/src/components/analytics/health/healthScoreAnalysis.ts) reuse `isSpending`. A realised loss remains a ledger outflow and negative return while being excluded from consumption. |
| Savings and allocation ratios | [savingsRate.ts](../frontend/src/lib/savingsRate.ts): `netSavings`, `savingsRatePercent`, pooled rates, investment allocation | [useDashboardMetrics](../frontend/src/hooks/useDashboardMetrics.ts), [useTrendsForecasts](../frontend/src/pages/trends-forecasts/useTrendsForecasts.ts). Pool flows before division; allocation into investments is a different numerator from savings. |
| SIP scenarios and modeled history | [finance/sipProjection.ts](../frontend/src/lib/finance/sipProjection.ts): `projectMonthlySIP`, `allocateHistoricalSIPValue`, `calculateSIPBenchmarkValue` | [projectionUtils.ts](../frontend/src/pages/mutual-fund-projection/projectionUtils.ts) retains compatibility exports, date labels, chart rounding, account selection, and XIRR delegation. [useMutualFundProjection](../frontend/src/pages/mutual-fund-projection/useMutualFundProjection.ts) supplies the scenario. |
| PPF, EPF, NPS | [instrumentCalculators.ts](../frontend/src/lib/instrumentCalculators.ts): projections, `epfMonthlyContributions`, `minimumEpfContribution`, `computeNpsWeightedReturn` | [instrumentProjectionUtils.ts](../frontend/src/components/analytics/instrumentProjectionUtils.ts) adapts display fields and re-exports weighted return. Display and NPS projection use one kernel; statutory splitting and minimum policy stay shared. |
| Dated rate of return | [xirr.ts](../frontend/src/lib/xirr.ts): `calculateXIRR` | Supply dated contributions/withdrawals and a valid ending valuation. The Returns Analysis page reports recorded P&L and book balances, not a market return derived from salary or balance movement. |
| FIRE and retirement | [fireCalculator.ts](../frontend/src/lib/fireCalculator.ts): `deriveFIREInputs` and FIRE/retirement solvers | [FIRECalculatorPage](../frontend/src/pages/fire-calculator/FIRECalculatorPage.tsx) supplies period totals and observed-month count. Annualization, the one-month fallback, and the existing 60% essentials assumption belong in the library. |
| Monte Carlo retirement simulation | [finance/monteCarlo.ts](../frontend/src/lib/finance/monteCarlo.ts): `runMonteCarlo`, with the seeded generator in [finance/seededRandom.ts](../frontend/src/lib/finance/seededRandom.ts) | [workers/monteCarlo.worker.ts](../frontend/src/workers/monteCarlo.worker.ts) runs it off the main thread, and `useMonteCarloRunner` falls back to the same function on the main thread. [monteCarloSeed.ts](../frontend/src/pages/fire-calculator/monteCarloSeed.ts) splits net worth into equity, debt and cash pots; [monteCarloPlan.ts](../frontend/src/pages/fire-calculator/monteCarloPlan.ts) holds the default assumptions. See [Monte Carlo simulation](#monte-carlo-simulation). |
| GST estimate | [gstCalculator.ts](../frontend/src/lib/gstCalculator.ts) | [useGSTAnalysis](../frontend/src/pages/gst-analysis/useGSTAnalysis.ts) supplies expense rows and rate overrides. Category-based GST is an estimate, not invoice tax. |
| Credit-card debt, utilization, and coverage | [finance/creditCardUtilization.ts](../frontend/src/lib/finance/creditCardUtilization.ts): `buildCreditCardAccount`, `getCreditCardUtilizationStatus`, `summarizeCreditCards` | [CreditCardHealth](../frontend/src/components/analytics/CreditCardHealth.tsx) retains classification, sorting, and UI. Signed positive balances are prepaid assets and contribute zero outstanding; missing/zero limits remain unmeasured. |
| Medians and concentration cutoff | [distribution.ts](../frontend/src/lib/distribution.ts): `medianOf`, `cumulativeShareCutoff` | [merchantUtils.ts](../frontend/src/pages/merchant-intelligence/merchantUtils.ts) and [ParetoChart](../frontend/src/components/analytics/ParetoChart.tsx) retain row filtering/order/identity and display caps. The threshold includes its crossing row before the chart's synthetic Other bucket. |
| Buffering and financial health | [ageOfMoneyCalculator.ts](../frontend/src/lib/ageOfMoneyCalculator.ts), [financialHealthCalculator.ts](../frontend/src/lib/financialHealthCalculator.ts): `computeCFPScore`, `liquidAssetsFromFlows` | [healthScoreAnalysis.ts](../frontend/src/components/analytics/health/healthScoreAnalysis.ts) supplies canonical `cfpInputsFromAnalysis` to both summary and detail. Observed balances, including zero, precede the shared flow proxy; FHN and CFP remain separate models. The Dashboard reads Age of Money, Days of Buffering, the investment-transfer split and the health analysis from the server twins in `core/dashboard_metrics_*.py`; demo mode and tests still run these TypeScript calculators. |
| Advance tax, filing dates and AIS | [tax/advanceTaxRules.ts](../frontend/src/lib/tax/advanceTaxRules.ts) (the INR 10,000 gate, instalments, `advanceTaxDueDates`), [tax/advanceTax.ts](../frontend/src/lib/tax/advanceTax.ts) (the plan and payment matching), [tax/advanceTaxInterest.ts](../frontend/src/lib/tax/advanceTaxInterest.ts), [tax/filingDeadlines.ts](../frontend/src/lib/tax/filingDeadlines.ts); AIS decryption, parsing, totals and reconciliation in [tax/ais*.ts](../frontend/src/lib/tax/) | [AdvanceTaxPlanner](../frontend/src/pages/tax-planning/components/AdvanceTaxPlanner.tsx), [FilingCalendar](../frontend/src/pages/tax-planning/components/FilingCalendar.tsx), the Bill Calendar's `taxBills.ts` and the AIS Import page consume them. Pure functions with explicit inputs and a stated Act and section; a computation aid, not tax advice. See [Advance tax and filing dates](#advance-tax-and-filing-dates). |

For the extracted domains above, fix arithmetic in `lib/finance` or the named
shared helper. Page utility exports preserve existing imports; they are not a
second mathematical implementation. Keep remaining feature-local presentation
and unrelated calculators in their existing owners.

### Units, currency, and dates

- **Money:** ledger amounts are INR major units: `125.50` means INR 125.50,
  not 12,550 paise. [Transaction storage](../backend/src/ledger_sync/db/_models/transactions.py)
  uses `Decimal` / `Numeric(15, 2)`; normalization rounds to two places with
  `ROUND_HALF_UP`. The wire/frontend representation is a JavaScript number.
  Preserve calculator precision and existing rounding boundaries; never
  calculate from formatted strings. Transaction amounts are positive; type and
  account direction determine signs. Derived balances and returns can be negative.
- **Investment signs:** domain `investmentTransferDelta` and
  `netContributions` are positive for money entering investments and negative for
  withdrawals. Monthly API `net_investment_flow` uses the opposite, cash-flow
  perspective. FY `investments_made` counts gross external funding, so it is not
  either signed net total. See [investment transfer semantics](#investment-transfer-semantics).
- **Compensation:** share counts are units, not money. Gross vest value, retained
  share value, cash take-home, and net compensation are separate fields.
  Employee EPF reduces cash; it does not reduce new-regime taxable earnings.
  Preserve `isNetQuantityEstimated`, `isPriceEstimated`, and
  `isWithholdingEstimated` when showing valued vestings.
- **Card balances:** the API is signed: negative means owed, positive means a
  prepaid asset. Card utilization uses `max(0, -signedBalance)` as outstanding.
  The domain's derived `balance` field is that debt amount, not the API balance.
  Prepaid credit neither adds to debt nor offsets another card's debt.
- **Display currency:** [formatters.ts](../frontend/src/lib/formatters.ts) accepts
  base INR amounts and converts once through [useExchangeRate](../frontend/src/hooks/api/useExchangeRate.ts).
  Missing usable rates fall back to INR for both value and symbol. An
  already-converted amount must not be passed through this conversion again.
  RSU helpers instead multiply the supplied share price: the current
  [salary contract](../frontend/src/types/salary.ts) and
  [price-loading hook](../frontend/src/pages/settings/sections/salary/useRsuGrants.ts)
  use display-currency prices. Keep that unit explicit before combining RSU
  values with INR ledger or tax inputs; valuation helpers perform no FX conversion.
  This legacy display-currency convention has not been migrated or made
  currency-tagged by the shared-math extraction.
- **Rates:** `_pct`, tax slab rates, SIP annual rates, and instrument `rate`
  arguments use percentage points (`8` means 8%). FIRE `swr` / `realReturn`,
  tax `cessRate`, and surcharge factors use fractions (`0.03` means 3%).
  `calculateXIRR` returns percentage points. Check each signature rather than
  applying `/ 100` uniformly.
- **Calendar:** use [dateUtils.ts](../frontend/src/lib/dateUtils.ts) for local
  `YYYY-MM-DD` keys, `YYYY-MM` buckets, and clamped calendar-month stepping.
  Do not combine UTC parsing of a date-only string with local date getters.
  Backend ledger-relative ranges use [ledger_clock.py](../backend/src/ledger_sync/core/ledger_clock.py)
  and naive IST transaction dates. The frontend partial-month helpers
  (`getMonthProgress`, `isPartialMonth`, `dropPartialMonth`,
  `resolvePartialPeriod`, `completeMonthKeys`) read the current month on the
  same IST ledger day through `getLedgerTodayKey`, whatever the viewer's
  timezone. `MS_PER_YEAR` uses 365.25 days for annualized
  return math; recurring money annualization uses its own 365-day convention.
  Carry inactive months for balance levels, not for income/expense flows.
  Goal and milestone ETAs share whole calendar months plus rounded fractional
  days through `addFractionalMonthsToKey`; they do not use fixed 30-day months.
- **Fiscal years:** the [preference](../frontend/src/store/preferencesStore.ts)
  is a one-based start month, default `4` (April). `getFYFromDate` in
  `taxCalculator.ts` resolves date keys using that month. UI labels include
  `FY 2025-26`; salary projection keys also use bare `2025-26`; rule lookup
  takes the numeric start year, `2025`. Pass the selected FY and start month
  explicitly, including for historical views.
- **Missing observations:** `savingsRatePercent` returns `null` for nonpositive
  income; its fallback variant requires a deliberate display choice. Preserve
  negative savings and returns. Insufficient data is not evidence of a perfect
  score, a zero-risk forecast, or a measured return.

### Rate and assumption owners

| Input | Source to change |
| --- | --- |
| Tax slabs, rebates, surcharge, cess, deductions | [tax-config/index.ts](../frontend/src/lib/tax-config/index.ts), versioned by FY with source/effective-date metadata. Add a new entry for a law change; preserve history. Future unknown FYs use the latest known rules and must retain that explanation in the UI. |
| EPF/PPF rates and NPS return/allocation assumptions | [instrument_rates.json](../backend/src/ledger_sync/config/instrument_rates.json), served by [api/rates.py](../backend/src/ledger_sync/api/rates.py). [useInstrumentRates](../frontend/src/hooks/api/useInstrumentRates.ts) has an explicit compiled fallback; update it when changing the source and preserve `isFallback`. NPS historical assumptions are not guaranteed returns. |
| Latest and historical FX | [api/exchange_rates.py](../backend/src/ledger_sync/api/exchange_rates.py); [useExchangeRate](../frontend/src/hooks/api/useExchangeRate.ts) handles display rates. Historical vest-date requests use `on_date`; do not substitute a latest-rate fallback for a historical rate. |
| Salary growth and RSU received-unit estimate | [types/salary.ts](../frontend/src/types/salary.ts) defines saved growth inputs/defaults. `rsuVesting.ts` owns the missing-actual estimate: 30% tax plus 4% cess on that tax. An entered `net_quantity`, including zero, wins; estimated received units are not persisted as actuals or deducted from gross taxable value. |
| GST and retirement scenarios | Date-aware GST tables/overrides live in `gstCalculator.ts`; retirement assumptions enter `fireCalculator.ts` as parameters. Keep policy defaults and user assumptions distinct. |

### Trust and compatibility

- **Observed versus estimated:** keep API historical `net_savings`, signed
  balances, actual received RSU units (including zero), and locked vest prices.
  A computed tax liability, net-receipt gross-up, or future series is a model.
  Missing actual units or a missing historical price keeps withholding estimated.
- **Freshness is a separate signal:** Data Health and the workspace stale-data
  alert describe ledger/analytics coverage. Recurring freshness describes the
  age and confirmation of an individual detection; it does not prove payment,
  cancellation, or that an import is complete. Active review/unassessed items
  remain included in commitment totals.
- **Legacy names retain explicit meanings:** projected `takeHome` aliases
  `cashTakeHome`; `YearlyTaxDatum.paidTax` is liability on recorded income, not
  a paid-tax receipt; `computeNetWorthTimeSeries().netWorth` is cumulative cash
  flow, not account net worth. The cash-flow adapter's `projectedSavings` alias
  means projected consumption surplus before future losses. Tax-side
  `netAfterTax` is gross less tax; `netAfterCashDeductions` also subtracts known
  employee deductions, but can include retained shares. Neither substitutes
  for dated employment payroll `cashTakeHome`.
- **Limits remain visible:** book balances do not establish market values;
  net-receipt tax inference can differ from payroll records; forecast ranges
  are illustrative rather than calibrated probabilities. RSU display-currency
  prices still require a deliberate currency contract before combining them
  with INR inputs. No stored-price migration is implied.

### From API to page

```text
backend user-scoped aggregation
  -> services/api/calculations.ts
  -> hooks/api/useAnalytics.ts (query keys and date parameters)
  -> feature hook (preferences and input selection)
  -> lib/finance domain + existing shared calculator
  -> page/chart props (presentation, labels, exact-value tables)
```

For example, `useMutualFundProjection` supplies raw data to the SIP calculator;
its chart renders the returned series. `useTaxPlanning` composes tax, salary,
RSU, and TDS owners instead of calculating slabs in chart callbacks. The
`taxPlanningUtils` facade re-exports `taxPlanning` and `taxHistory`; it no longer
owns their formulas. Page adapters can format a series, but must preserve what a value
means: cumulative net cash flow, account book value, gross tax basis, and
received proceeds are different quantities.

### Focused calculation checks

Run after installing dependencies with pnpm and uv. These focused suites use
synthetic inputs; no Docker or production database is needed. See [TESTING.md](TESTING.md) for
full checks and isolated native PostgreSQL coverage.

From the repository root:

```bash
pnpm --dir frontend exec vitest run src/lib/finance/__tests__
pnpm --dir frontend exec vitest run src/pages/tax-planning/__tests__ src/pages/tax-planning/components/__tests__/TaxYearChart.test.tsx src/components/analytics/__tests__/EffectiveTaxRateChart.test.tsx
pnpm --dir frontend exec vitest run src/lib/__tests__/rsuVesting.test.ts src/lib/__tests__/projectionCalculator.test.ts src/lib/__tests__/tdsScheduleCalculator.test.ts
pnpm --dir frontend exec vitest run src/pages/mutual-fund-projection/__tests__ src/pages/goals/__tests__ src/lib/__tests__/dateUtils.test.ts
pnpm --dir frontend exec vitest run src/lib/__tests__/instrumentCalculators.test.ts src/lib/__tests__/fireCalculator.test.ts src/components/analytics/__tests__/instrumentProjectionUtils.test.ts src/components/analytics/__tests__/CreditCardHealth.test.tsx
pnpm --dir frontend exec vitest run src/pages/spending-analysis/__tests__ src/components/shared/__tests__/quickInsightsDivisors.test.ts src/components/shared/__tests__/quickInsightsMedians.test.ts src/pages/year-in-review/__tests__/dayOfWeekUtils.test.ts
pnpm --dir frontend exec vitest run src/lib/__tests__/distribution.test.ts src/pages/merchant-intelligence/__tests__/merchantUtils.test.ts src/components/analytics/__tests__/ParetoChart.test.tsx src/components/analytics/health/__tests__/healthScore.test.ts src/components/analytics/__tests__/FinancialHealthScore.test.tsx
pnpm --dir frontend exec vitest run src/pages/investment-analytics/__tests__ src/pages/returns-analysis/__tests__ src/lib/demo/__tests__/demoInvestmentFlows.test.ts
pnpm --dir frontend exec vitest run src/pages/net-worth/__tests__ src/components/analytics/__tests__/cashFlowUtils.test.ts
pnpm --dir frontend exec vitest run src/lib/__tests__/recurringCalculations.test.ts src/lib/__tests__/recurrenceFrequency.test.ts src/pages/subscription-tracker/__tests__
pnpm --dir frontend exec vitest run src/lib/__tests__/savingsRate.test.ts src/lib/__tests__/savingsRateSourceOfTruth.test.ts src/lib/__tests__/expenseClassification.test.ts
pnpm --dir frontend exec vitest run src/lib/__tests__/taxCalculator.test.ts src/lib/tax-config/__tests__/taxConfig.test.ts
pnpm --dir frontend run type-check
```

`taxHistory` has direct domain tests as well as compatibility and hook coverage.
Goal and milestone domain cases also live in their existing page-helper suites.
Salary compensation settlement is covered by the projection, TDS, and payroll
domain suites. These commands describe verification scope, not current CI results.

For Python arithmetic and synthetic SQLite integration, from the repository root:

```bash
cd backend
uv run pytest tests/unit/test_ledger_math.py tests/unit/test_calculator.py
uv run pytest tests/unit/test_capital_loss_classification.py tests/integration/test_investment_transfer_summaries.py tests/integration/test_analytics_user_scoping.py
```

Use an isolated development/test configuration. PostgreSQL-specific migrations,
constraints, and concurrency need a disposable native PostgreSQL cluster; the
SQLite suites do not establish those results.

### Changing a calculation

Agree the math before writing code. For any change to tax, TDS, bonus, RSU, salary
or projection math, write the formulas in plain text with one worked example and get
the owner's sign-off first; only then change the owner function. Salaried income
actually received is an observed fact: never recompute, reduce or re-derive it from a
model. Both rules come from 2026-06-07, when two TDS schedules coded ahead of the
formulas were wrong and a requested revert went wrong too.

1. Find its owner above and search its imports before changing behavior. Keep
   formulas in pure functions with explicit inputs; hooks own fetching and
   preferences, and components own rendering.
2. State the monetary unit, time window, sign convention, zero/missing-data
   behavior, and observed-versus-projected basis. Reuse the domain owners,
   `savingsRate`, RSU/compensation helpers, dates, and versioned tax configuration
   instead of copying their formulas into a page.
3. Preserve API scoping and query keys. A SQL aggregate and a scenario
   calculator may intentionally answer different questions; do not force their
   results to match by altering financial meaning. Shared contracts and
   synthetic parity cases keep Python and TypeScript consistent without a
   runtime dependency between their implementations.
4. Verify the affected owner and a consuming path with synthetic data.
   Important boundaries include zero income, negative balances, month/FY
   rollover, missing rates, and gross versus actual/estimated RSU proceeds.
   Update this map when moving ownership; update the formula reference when
   changing semantics.

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
  core/ledger_math.py
  core/calculator.py
  core/analytics/
  core/dashboard_metrics*.py
  core/safe_to_spend*.py
  core/weekly_recap*.py
  core/card_cycles*.py
  core/balance_checks.py
  core/category_suggester*.py
  core/mf_valuation.py
  core/mf_xirr.py
  core/foreign_assets*.py
  api/calculations.py
  api/analytics.py
  api/analytics_v2_impl/

frontend/src/lib/
  finance/
    investmentFlows.ts
    investmentReturns.ts
    netWorth.ts
    goalProjection.ts
    sipProjection.ts
    cashFlowForecast.ts
    dashboardMetrics.ts
    spending.ts
    spendingStatistics.ts
    creditCardUtilization.ts
    taxPlanning.ts
    taxHistory.ts
    payrollPlanning.ts
    taxRateCurve.ts
    monteCarlo.ts
    seededRandom.ts
  taxCalculator.ts
  tax-config/
  tax/
  rsuTaxFx.ts
  projectionCalculator.ts
  rsuVesting.ts
  salaryCompensation.ts
  tdsScheduleCalculator.ts
  recurringCalculations.ts
  recurrenceFrequency.ts
  fireCalculator.ts
  gstCalculator.ts
  instrumentCalculators.ts
  distribution.ts
  financialHealthCalculator.ts
  dateUtils.ts
  xirr.ts
```

All backend financial aggregation starts from active rows owned by the
authenticated user. `is_deleted=true` rows and configured excluded accounts
are removed where the calculation contract requires it.

## Time Filtering

Backend relative ranges anchor to the current IST ledger date through
`ledger_clock.py`, not to the newest transaction:

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

`finance/analysisPeriod.ts` resolves a saved earning-start date first, otherwise
the earliest supported employment-income classification. Gifts, allowances,
refunds, scholarships, interest, and dividends do not establish employment.
The display crop remains independent: toggling chart history does not change
the earnings basis used by statistics or rewrite earlier ledger rows.

Income averages use complete calendar months after that boundary, including
zero-income gaps. Selected historical ranges remain historical. Current health
uses at most the latest 24 completed months, ending before the current month.

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
- Total consumption expenses
- Net, `income - consumption expenses - classified capital losses`
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
net_savings = total_income - total_expenses - capital_losses
savings_rate = net_savings / total_income * 100, when income > 0
expense_ratio = total_expenses / total_income * 100, when income > 0
```

Savings rate is not capped at 100 percent. Negative rates and values above 100
remain mathematically visible.

Income is split into salary, investment, and other income using user
preferences and classification helpers. Expenses are split into essential and
discretionary values using the configured essential-category set. Classified
capital losses have their own bucket and still reduce net savings. Clients
must not rebuild historical net savings from income and consumption alone.

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
net_savings = total_income - total_expenses - capital_losses
savings_rate = net_savings / total_income * 100
```

Income is split into salary, bonus, investment, and other. A taxable row is
salary or a bonus when its subcategory, else its category, carries the word
salary/stipend or bonus/bonuses/rsu/rsus (case-insensitive, word boundaries;
bonus wins inside one label), the same rule as the Tax page. Tax expenses are
identified by the Taxes category or income-tax vocabulary (income tax, TDS,
advance tax, self-assessment, taxes paid, professional tax) in the category or
subcategory; the note is not read, and GST, cess, and surcharge do not count. `investments_made`
counts gross external funding into investment accounts. Internal rebalancing
does not add funding, and withdrawals do not reduce this gross field. The
monthly signed measure is described under [investment transfer semantics](#investment-transfer-semantics).

Year-over-year savings change divides by the absolute prior savings value, so
the direction does not invert when the prior year was negative.

## On-Demand Core Metrics

### Totals

`core/calculator.py::calculate_totals` sums all expense rows for generic ledger totals.
The consumption-aware `/api/calculations/totals` response instead separates
classified capital losses:

```text
total_income = sum(Income amounts)
total_expenses = sum(consumption Expense amounts)
capital_losses = sum(classified capital-loss Expense amounts)
net_savings = total_income - total_expenses - capital_losses
savings_rate = net_savings / total_income * 100, when income > 0
```

Transfers do not enter income or expense totals. Read the endpoint's published
net value rather than substituting a different expense scope.

### Account balances

For each account:

```text
Income  -> add to account
Expense -> subtract from account
Transfer -> subtract from from_account and add to to_account
```

These are ledger-derived balances. They are not live balances fetched from a
bank.

### Credit-card utilization

`finance/creditCardUtilization.ts` converts each signed card balance to debt:

```text
outstanding = max(0, -signed_balance)
utilization = outstanding / configured_positive_limit * 100
available_credit = max(0, configured_positive_limit - outstanding)
```

A positive balance is prepaid credit, so it contributes zero outstanding and
zero utilization when a positive limit is known. It is not added to debt or
netted against another card's debt. Available credit describes headroom within
the configured limit, without adding prepaid assets above that limit.

Missing, negative, or nonfinite limits are unknown. A configured zero is retained
as zero but cannot support a ratio. Nonfinite balances are unavailable. Aggregate
utilization uses the same measurable cards for both debt and limits; known debt
on other cards remains in total outstanding. Status thresholds remain strictly
above 30%, 50%, and 75%; an aggregate warning begins strictly above 50%.

### Daily spending and burn rate

```text
daily_spending_rate =
  total expense / inclusive day span from first to last expense

monthly_burn_rate =
  total expense / inclusive month span from first to last expense
```

### Spending period policies

The core rates above describe expense spans. Workspace spending statistics use
explicit domain contracts; a single denominator must not replace all of them.

| Measure | Owner and denominator |
| --- | --- |
| Calendar-month mean and median | `finance/spending.ts`: zero-fill months inside the supplied selected/observed span, then use the same calendar-month spine for the headline and trend. |
| Daily and monthly burn | `finance/spendingStatistics.ts`: `computeSpendingPace` resolves the requested/data span and clamps its end to the supplied today. Days are inclusive; monthly coverage sums `covered_days / actual_days_in_that_month`. Missing spans retain the 30-day/one-month defaults. |
| Typical spending day | `medianSpendingDay`: median of positive spending days only. No spending observations, or a requested start before the available daily coverage, yields `null`. |
| Typical completed month | `medianSpendingMonth`: exclude the current month, fill interior zero months, and require at least two calendar months. The current month is excluded even on its last day. |
| Weekday spending/earning | `computeWeekdaySpending`: divide each weekday's total by elapsed occurrences, including zero-spend days; exclude future grid cells. Weekend comparison uses the mean of Saturday/Sunday daily averages versus the mean of the five weekday averages. |
| Current recurring coverage | `recurringCalculations.ts`: divide current monthly commitments by the median of the last twelve usable positive-income months strictly before the current month. Missing/nonpositive typical income yields `null`. |

Active-month category averages remain distinct from calendar-month averages.
Balance carry-forward does not apply to spending/income flows. Compatibility
files `quickInsightsData.ts` and `dayOfWeekUtils.ts` delegate their arithmetic
and retain only adaptation/labels.

### Days of Buffering and Age of Money

Both live in `frontend/src/lib/ageOfMoneyCalculator.ts` and its server twin
`backend/src/ledger_sync/core/dashboard_metrics_pulse.py`, which
`/api/dashboard-metrics/pulse` serves to the Dashboard Quick Insights band; demo
mode and tests still run the TypeScript. The burn uses the selected period's rows
in the 90 days to today, so a period that ended earlier reads `null`.

```text
net_liquid =
  balances of accounts classified Cash, Bank Accounts, or Other Wallets
  minus outstanding credit-card debt
  minus overdrawn wallet balances
  excluding parked deposits and accounts excluded in Settings

days_of_buffering =
  max(0, round(net_liquid / mean_daily_burn))
```

Two deliberate choices:

- The numerator is NET, not gross. A gross pool tells someone who has to clear a
  card this month that they hold money they do not have.
- The denominator is the MEAN daily burn over the trailing 90 days, not the
  median. "How long does my cash last" is a total-outflow question: rent, EMIs,
  and annual premiums still land if income stops, and on right-skewed ledger data
  a median denominator overstates the same pool several times over. The median is
  still reported as a burn rate and never published as a days figure.

`null` is returned when the window has no spending to rate against, and an
underwater pool reads 0 days rather than a negative number.

Age of Money is a FIFO match: each expense is drawn from the oldest unspent
income bucket first, and the result is the amount-weighted average gap in days
between when money arrived and when it left.

### Financial-health inputs

`health/currentHealthAnalysis.ts` separates recent cash flows from lifetime
balance proxies. The current score uses at most 24 completed calendar months,
clamped to the earning-start date; the stability inputs use the latest 12 of
those months. It requires at least three analysis months and ten historical
transactions. Missing months after earning starts remain zero-income months.
Dashboard chart filters do not redefine this current-health window.

The Financial Health summary and CFP detail both use
`healthScoreAnalysis.cfpInputsFromAnalysis`. It supplies pooled totals and the
actual average essential expense, without reconstructing either from display
averages or an essential-to-income ratio. FHN and CFP retain separate formulas
and weights.

`financialHealthCalculator.liquidAssetsFromFlows` owns the shared fallback:
`max(0, cumulativeNetSavings - max(0, netInvestments))`. Observed account balances,
including an observed zero liquid balance, take precedence. The fallback is a
flow proxy, not a reconstructed bank balance.

The Dashboard reads this analysis from `/api/dashboard-metrics/health`. Its twins
are `core/dashboard_metrics_health.py` (`computeCurrentHealth`),
`core/dashboard_metrics_analysis.py` (`computeAnalysis`) and
`core/dashboard_metrics_inputs.py` (`resolveEarningStart`, `resolveAnalysisPeriod`
and `computeBalancePosition` with `resolveAccountCategory`). The 0-100 scores stay
in the browser. Change a TypeScript calculator and its twin together: the twins
keep the browser's floating-point order (left-to-right sums, JavaScript object key
order, `Math.round` halves, in `dashboard_metrics_base.py`) so both return identical
numbers.

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

### Safe to spend

`GET /api/safe-to-spend` ([core/safe_to_spend.py](../backend/src/ledger_sync/core/safe_to_spend.py))
answers how much is free until the next payday. It is a computation aid, not
financial advice.

```text
safe_to_spend = net_liquid - bills_before_payday - reserve
per_day = max(0, safe_to_spend) / days_left
```

- **Cycle:** from the last payday to the next, using the saved `payday` (1 to 31;
  a day past a month's end clamps to its last day). With no preferences row, or
  payday 1, the cycle runs to the month end.
- **Net liquid:** positive balances of accounts classified Cash, Bank Accounts or
  Other Wallets (a security or rent deposit filed under one of those types is left
  out), minus what is owed: a negative balance on a classified spendable or Credit
  Cards account. A closed account's positive balance is not cash, but what it still
  owes stays owed. Unclassified accounts are left out and counted.
- **Bills before payday:** accepted commitments and active scheduled transactions
  (income and expense only) from the day after the newest imported row, or today
  if sooner, up to the next payday. A commitment is accepted by the Bill Calendar's
  rule: active, a commitment rather than a habit, and confirmed or seen within two
  cadence intervals plus seven days. A schedule and the commitment detected from
  the same bill count once, at the schedule's amount and dates;
  `safe_to_spend_labels.same_commitment` pairs them when they are linked, or have
  the same type and cadence and share a label on the same account, on any account
  for a hand-added commitment, or on any account when the amounts are within 15%,
  or, on one account, the same amount, day, category and subcategory. Transfers are
  never bills, and money expected in before payday is never counted.
- **Reserve:** over three cycles after payday, each cycle's recurring income pays
  that cycle's bills and a surplus carries forward; the deepest running shortfall is
  held back now. With no recurring income the reserve is zero and its status is
  `no_recurring_income`.
- **Typical day and pace:** `typical_daily_spend` is the median of daily spend over
  the last 90 days up to the newest imported row, with no-spend days counted as
  zero, bills left out and classified capital losses excluded. The pace compares the
  cycle's spend so far, bills left out, with
  `(spent + max(safe, 0)) * elapsed_days / total_days`, and `usual` is the 90-day
  average day times the days elapsed.
- **Balance projection:** `GET /api/safe-to-spend/projection` (7 to 90 days, 30 by
  default) starts each spendable account at today's balance. Each day adds that
  day's commitment and schedule flows and the account's usual net transfers (the
  median, over the three whole months before the newest row, of net transfers into
  the account per day), and subtracts its share of the average daily spend over the
  last 90 days. The average, not the median, because a balance falls by everything
  spent. Only accounts holding money today take a share, in proportion to their own
  spend. A flag is a crossing: an account must start at or above the level to be
  flagged for falling below it.

### Weekly recap

`GET /api/weekly-recap` ([core/weekly_recap.py](../backend/src/ledger_sync/core/weekly_recap.py))
is deterministic: the same ledger read on the same day gives the same recap, with
no model call. Every figure is a book value from the ledger, a computation aid, not
financial advice.

- **Week:** the last full Monday to Sunday week on the IST calendar, the week before
  the current one.
- **Spending:** expense rows in the week without classified capital losses, against
  the average of the up to four full weeks before it
  (`weekly_average = baseline_total / baseline_weeks`, `change = this_week - weekly_average`).
  Weeks before the first transaction are left out, so a young ledger has fewer
  baseline weeks or none.
- **Movers:** the same comparison per category, ranked by absolute change, at most
  five. A category with no spending in the week is left out, because a monthly bill
  would otherwise read as a fall in three weeks out of four.
- **Net-worth change:** the week's income minus every expense row (a realised loss
  still left the books), on top of the opening book value. The driver is the
  category with the largest absolute effect.
- **Bills due:** active recurring expense commitments due today through seven days
  ahead, at the effective amount (the user's own when set, else the detected one).
  A past due date rolls forward by cadence while the last payment is inside the
  review window. Card statement dues stay on the Bill Calendar.
- **Anomalies:** open findings about a transaction dated in the week, or month-level
  findings for the week's months; at most five, most severe first.
- **Completeness:** the week reads as complete once a row is dated from its Sunday up
  to today. A quiet Sunday and Monday read as a gap, so the card says the week may be
  incomplete.

### Card statement cycles

`GET /api/card-cycles` ([core/card_cycles.py](../backend/src/ledger_sync/core/card_cycles.py))
turns a card's Money Manager settlement day and payment day into statement cycles
on IST dates. A computation aid, not financial advice.

- The settlement day opens a statement period: with day 15 a period runs from the
  15th to the 14th of the next month, and the 14th is the statement date. The bill
  is due on the first payment day after the statement date, so day 5 falls in the
  next month and day 28 in the same one. A day past a month's end lands on its last
  day (31 is 28 February).
- A statement bills what the card owed when it closed, as Money Manager's payable
  balance does: an unpaid earlier balance is carried into it and a payment made
  before the close lowers it. Payments after a close pay the oldest bill first.
- Only the latest statement asks for money (`remaining = max(0, billed - paid)`). An
  older one is `paid` once later payments cover it and `rolled_over` until then,
  because what it still owes is inside the latest bill. Payments cover a statement
  when they come within INR 1 of it.
- The latest statement's status is `nothing_due` (billed at most INR 1), `paid`,
  `overdue` (past the due date and not covered), `partial` (some payment, before the
  due date) or `due`. The open period is `open`, and its spend is never shown below
  zero.
- Cash after dues for a paying account is its signed balance today minus the
  `remaining` of the latest statement of each card it pays.

### Balance checks

`core/balance_checks.py` compares a balance the user types with the ledger. For each
check, `difference = bank_balance - ledger_balance_at_end_of_check_day`, and the
check matches when `abs(difference) <= INR 1`. The ledger balance counts every live
row that touches the account (income credits and expenses debit it; a transfer
debits `from_account` and credits `to_account`), including transfers to accounts
excluded in Settings, through the end of the check's day. An account's status is
decided in this order: `mismatch` (the newest check is off), `idle` (no row or
check for more than 30 days), `unchecked` (no check), `changed` (rows dated after
the newest check), otherwise `matched`. Only the typed check is stored, so a later
import can change a status.

### Category suggestions

`core/category_suggester.py` is a per-user multinomial naive Bayes in plain Python,
trained on the user's own live income and expense rows that carry a real category.
A row is read as its distinct note words (a word holding a digit is dropped, which
removes UPI references and card digits; stopwords and one-letter words go too) plus
the account, a log2 amount bucket and the weekday. Income and expense rows train
separate models, so an expense is never offered an income category. Every feature
family uses add-one smoothing, and a row the model trained on is scored with its own
counts removed.

The model turns on at 30 categorized rows with at least 2 categories within income
or within expense. It abstains for a row with no note word it has seen, and when its
best label is under 50% likely; otherwise it returns that label plus the runner-up
when the runner-up is at least 5% likely. A placeholder category (Other,
Miscellaneous, Uncategorised, Unknown and similar) with no real subcategory is never
a training label. Nothing here writes: the upload review and the Review Queue show
the suggestions and the user decides.

## 50/30/20 Spending Rule

`GET /api/analytics/v2/spending-rule` groups the selected period into:

- Needs
- Wants
- Savings

The 50/30/20 endpoint's targets (shown on the Budgets page) default to 50, 30, and 20 percent via
`needs_target_percent`, `wants_target_percent`, and `savings_target_percent`.
Expense Analysis uses the separate consumption-savings policy below.

### Which savings target applies where

Two pages show a Savings card, on two different numerators, and each is scored
against its own preference. They are not interchangeable.

| Page | Savings numerator | Target preference |
| --- | --- | --- |
| Budgets, 50/30/20 rule (`/budgets`) | net change in the investment perimeter (allocations into SIP/PPF/EPF/NPS/stocks minus redemptions) | `savings_target_percent` |
| Expense Analysis (`/spending-analysis`) | `max(0, income - comparable consumption spending)` | `savings_goal_percent` |

The same `savings_goal_percent` also drives the Financial Health savings metric
and the Trends cumulative-savings-rate goal line, which score the same
income-minus-expenses quantity.

Both preferences default to 20.0. In a synthetic period with INR 100,000 income,
INR 15,000 allocated to investments, and INR 30,000 left after expenses, the
allocation rate is 15% while the savings rate is 30%. One is below its target
while the other is above. Keep the two numerators and their target preferences
separate -- see the "TWO RATES, TWO QUESTIONS" note in
`frontend/src/lib/savingsRate.ts`.

`finance/spending.ts` owns `spendingRuleSavings` and `computeBudgetRuleMetrics`.
Expense Analysis flags needs/wants only when their shares exceed target + 5
percentage points, and savings only when its share is below target - 5.
No breakdown or nonpositive income returns `null`. The rule's clamped
consumption surplus is not a replacement for signed ledger net savings.

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

## SIP and Instrument Projections

`finance/sipProjection.ts` owns the shared forward SIP loop:

```text
monthly_rate = annual_rate_percent / 12 / 100
invested += monthly_contribution
value = (value + monthly_contribution) * (1 + monthly_rate)
after each twelfth contribution, for a positive step-up:
  monthly_contribution *= 1 + step_up_percent / 100
```

`projectMonthlySIP` returns unrounded monthly points and a terminal summary.
The summary adapter starts both value and invested basis from the supplied
corpus; the chart adapter retains distinct historical value and invested basis.
Chart rounding stays in `projectionUtils.ts`, including its already-rounded
historical seed. Do not change cost basis to force the two views to match.

`allocateHistoricalSIPValue` distributes present gains/losses proportionally
over contributed principal. That history is an allocated estimate, not observed
market prices. `calculateSIPBenchmarkValue` compounds dated monthly contributions
over elapsed calendar months, excludes future contributions, and gives zero
interest in the contribution month. Its timing intentionally differs from the
forward contribution-before-interest loop. XIRR remains in `xirr.ts`.

`instrumentCalculators.ts` keeps the separate PPF, EPF, and NPS models.
`computeNpsWeightedReturn` owns `sum(allocation_percent / 100 * return_percent)`
for both display and NPS projection, without normalizing allocations. The
projection retains nominal annual/12 monthly compounding. `minimumEpfContribution`
owns the existing wage-ceiling floor/full-basic minimum policy, while
`epfMonthlyContributions` owns the employee/employer/EPS split. Different caps,
statutory rules, and rounding are not merged into the SIP engine.

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

### Investment transfer semantics

`investmentFlows.ts` and backend `ledger_math.py` share this boundary rule:

```text
investment_delta =
  amount * (destination_is_investment - source_is_investment)
```

| Measure | Funding into investments | Withdrawal to noninvestment account | Internal investment move |
| --- | --- | --- | --- |
| Domain `investmentTransferDelta` / net contributions | Positive | Negative | Zero |
| Domain `contributions` / FY `investments_made` | Positive gross funding | Zero | Zero |
| Domain `withdrawals` | Zero | Positive magnitude | Zero |
| Monthly API `net_investment_flow` | Negative cash outflow | Positive cash inflow | Zero |
| Individual account balances | Credit destination, debit source | Credit destination, debit source | Both legs remain visible |

For synthetic Bank -> Fund A 10,000, Fund A -> Fund B 10,000, and Fund B -> Bank
4,000, gross external funding is 10,000, withdrawals are 4,000, net contributions
are 6,000, and monthly API net investment flow is -6,000. Fund A closes at zero
and Fund B at 6,000. Adding the internal 10,000 transfer to FY funding would
count the same money twice.

Returns Analysis requests closing balances through the selected end date,
without a start-date bound. A period redemption must reduce earlier principal,
not become a positive holding after an absolute-value conversion. These remain
signed ledger book balances, without a live market valuation.

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

One snapshot per user and IST ledger day is upserted. Change compares against the most
recent snapshot before today, not an earlier value from the same day.

Frontend account totals use `summarizeNetWorthAccounts`: positive balances are
assets and negative balance magnitudes are liabilities. Allocation proportions
use only positive balances in included categories, divided by that same included
sum. Excluded positive categories remain in total assets. For synthetic bank
assets of 100,000 and an overdraft of 40,000, assets are 100,000, liabilities
40,000, net worth 60,000, and the bank asset allocation is 100%, not 140%.

### Calendar cadence (F11)

`buildMonthlyNetWorthBalances` selects each month's last balance and carries it
through inactive months inside the observed range. Interior points use calendar
month ends; the final point keeps its observed date. No history is invented
before the first or after the last observation.

Both `computeAvgMonthlyGrowth` and `computeLinearGrowthStats` use deltas from
that calendar series. A 12-month lookback counts 12 monthly intervals, not 12
observed rows. Synthetic January 100,000, April 130,000, and July 160,000 spans
six intervals and yields 10,000 per month. Carrying balance levels is valid;
carrying the same income or expense into missing months would invent flows.

`useNetWorth` fills months before excluding an incomplete current month. It
uses completed months for growth when at least two deltas exist; short-history
fallback can include the partial month and retains that disclosure. The latest
filtered observation remains the projection anchor. The straight line extends
the average monthly change for up to 60 months, with an illustrative
sample-deviation band. It does not predict compounded market returns.

The chart's projection compounds the saving itself, not the balance
(`netWorthCompound.ts`). `measureSavingsGrowth` takes the last (up to) three
complete 12-month blocks of net savings, oldest to newest. It needs at least two
blocks (24 complete months) with a positive first and last block:

```text
measured = (last_block / first_block) ^ (1 / (blocks - 1)) - 1
rate = clamp(measured, -15%, +15%)
```

Month `k` of the five-year horizon adds `monthly * q^k`, where
`q = (1 + rate) ^ (1 / 12)`. After 60 months every later month adds the 60th
month's saving, so a milestone ETA never stretches a short trend over decades. The
band is one standard deviation of the summed savings, each month's spread scaled
like its mean. With no measurable rate the projection is the straight line. Upcoming
milestone ETAs (`monthsToGainCompound`) are solved on the compounding stretch when
the gap closes inside the horizon, otherwise the remainder runs at the horizon
month's saving. When the projection compounds, the straight line stays on the chart
for comparison. Market returns are not included. A computation aid, not financial
advice.

The legacy `computeNetWorthTimeSeries().netWorth` field remains cumulative
income minus **all** expenses, excluding transfers from the total. Its category
bands allocate positive cumulative cash flow using present-day asset shares.
It is a cash-flow history model, distinct from point-in-time account net worth
or historical category valuations.

## Goal and Milestone Projections

`finance/goalProjection.ts` owns required savings, expected completion, deadline
state, and expected funding pace. Required monthly savings is remaining funding
divided by whole months to the deadline. Achieved goals and absent, current-day,
submonth, or past deadlines preserve their null required-savings behavior.
Unknown/nonpositive average savings produces no completion forecast.

Completion months are remaining funding divided by supplied monthly savings.
The status retains the three-whole-month behind-schedule boundary. Funding pace
uses elapsed whole months over the goal timeline, clamped to 0..100; missing
endpoints, achieved goals, or unusable timelines have no pace marker.

`finance/netWorth.ts` owns `computeNetWorthMilestoneProgress`: first-ever
attainment, recovery after the last dip, elapsed days, and the upcoming ETA
`(target - anchor_net_worth) / monthly_growth`. Nonpositive growth keeps the ETA
unknown. A current decline does not erase historical attainment.

Both domains use `dateUtils.addFractionalMonthsToKey`: step whole calendar months
with month-end clamping, then add `round(fraction * DAYS_PER_AVG_MONTH)` days.
Labels, colors, milestone ladders, chart sampling, and visible-row caps stay in
the page adapters. Extraction does not change the caller's savings/growth window.

## Cash-Flow Forecast

`buildCashFlowForecast` preserves the API's historical `net_savings` exactly:

```text
recorded_net = API net_savings
consumption_surplus = income - living_expense
recorded_capital_losses = consumption_surplus - recorded_net
```

The F10 synthetic case has income 100,000, living expenses 40,000, and capital
losses 20,000. Recorded net savings remain 40,000; consumption surplus is 60,000.
Neither the historical chart nor its average may relabel 60,000 as recorded
net savings.

The model keeps up to 12 historical observations and uses the latest six as
its growth/variability basis, with a minimum of three. Its explicit existing
completion policy excludes the current month before its last IST ledger
calendar day and includes it on that last day. Partial months are not extrapolated.
This helper removes the partial current month; callers must supply historical
data and must not interpret that rule as a filter for all future-dated input.
Dashboard comparisons separately use `completeMonthKeys`, which also rejects
future months.

The next 12 months project income and living expenses using half the recent
trend, and report **consumption surplus before future capital losses**. Future
losses are not projected or filled with observed zeros. The chart adapter joins
the projection to the last observed consumption surplus while preserving the
separate recorded-net series.

The shaded range uses historical consumption-surplus variability, with
`0.8 * standard_deviation * sqrt(horizon)` on either side of the projection.
It is an illustrative range, not a confidence probability or a guarantee of
future savings. The observation window, projected measure, completion policy,
and range basis live together in `CASH_FLOW_FORECAST_ASSUMPTIONS`.

## Recurring Detection

Income and expense rows are grouped by normalized note and type. Rows without a
note fall back to category and subcategory.

Requirements:

- At least three occurrences
- Median day gap within a supported band
- Confidence at or above the user's threshold

Frequency bands:

| Median gap | Frequency |
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
median_gap = median(day_gaps)
periods_for_gap = max(1, round(gap / median_gap))
residual_for_gap = abs(gap - periods_for_gap * median_gap)
skip_rate = sum(periods_for_gap - 1) / number_of_gaps
confidence = max(0, 100 - median(residuals) * cadence_penalty - 25 * skip_rate)
```

Wider cadences use a smaller penalty. Expected amount uses the median; amount
variance uses `1.4826 * median(abs(amount - median_amount))`. Monthly-like frequencies infer
an expected day from the modal day, with special handling for late-month
clamping.

User-confirmed rows are preserved during a refresh and have their observed
statistics updated. Manually entered amounts and due days remain user-owned. An
amount the user sets on a detected commitment is stored beside the detected one
(`user_expected_amount`), so a refresh keeps it: the list's `expected_amount` is the
effective amount, `detected_amount` is what detection derived from history, and
`amount_edited` is true while they differ. Totals, sorting, the Bill Calendar and
the weekly recap use the effective amount. An amount equal to the detected one clears
the override, and un-confirming a commitment clears it too.
Normalization removes explicit billing month/year suffixes while retaining
payee names and other identifying numbers.

Detection alone does not establish a bill. Automatic commitments also need
obligation wording, at least three occurrences, confidence of at least 70, and
supported periodic cadence. Refunds and security deposits are excluded from
obligation evidence. Weekly and fortnightly commitments require a consistent
calendar phase. The read API applies the conservative interpretation to legacy
rollups without changing stored choices; confirmed classifications take precedence.

### Commitment freshness and trust

`getRecurringFreshness(item, asOfDateKey)` and
`summarizeRecurringCommitments(items, asOfDateKey)` take an explicit local date
key and never change records. Confirmed active items stay confirmed. An
unconfirmed active item needs review when its calendar-day age is **strictly
greater than two conservative cadence intervals plus seven days**. The bound
uses fixed day strides, 31 days per month stride, and 366 days for a year.
Missing, invalid, or future observation dates and unknown cadences remain
unassessed. Inactive items are paused.

The headline monthly income, expense, net, and count include all active
commitments, including needs-review and unassessed detections. Their subtotals
explain how much of the headline needs attention; they do not subtract possible
obligations. Repeat-spending habits stay outside commitment totals. Paused
expenses are separate and are not labeled savings or cancellations.

Those full summary totals are distinct from scheduling. Recurring and Bill
Calendar use `isAcceptedRecurringCommitment`: active confirmed commitments, or
recent unconfirmed rows already classified as commitments by the API. They exclude habits
and stale automatic detections. A confirmed bill without a usable schedule is
shown as unscheduled rather than assigned an invented date.

`recurrenceFrequency.ts` keeps money annualization separate from calendar
stepping: daily uses 365 occurrences/year, weekly 52, biweekly 26, monthly 12,
bimonthly 6, quarterly 4, semiannual 2, and yearly 1. Monthly cost is
`abs(amount) * occurrences_per_year / 12`. Frequency casing and aliases resolve
once; unknown money frequencies retain the legacy monthly fallback while
freshness stays unassessed. Calendar cadences use 1/7/14-day or
1/2/3/6/12-month strides. The conservative freshness bound does not change
amounts or due-date cadence.

Neither a stale detection nor an import gap proves that an obligation ended.
Confirmation, edits, and pausing remain explicit user actions.

`recurringCalculations.ts` also owns `typicalMonthlyIncome`,
`RECENT_INCOME_MONTHS`, `MonthlyIncomeRow`, and `recurringCoveragePercent`.
The baseline is the median of the latest twelve usable positive-income months
before the current month; zero-income months are excluded, not filled in as
spending months are. Current recurring costs are compared with this recent baseline, not an all-time
income mean.

## Anomaly Detection

Each analytics refresh runs the checks enabled in `anomaly_types_enabled` (all of
them by default) over live rows outside excluded accounts. Classified capital
losses stay out of every spending baseline. The setting is read this way: unset,
unreadable, or exactly the four types the old grid offered (High Expense, Unusual
Category, Large Transfer and Budget Exceeded, which is also the default and reset
value) runs every detector; a list naming none of the newer types is honoured for
those four and leaves the newer ones on; any other list is the complete set, and
elements that are not known type names are ignored. A typical month below means
the median monthly expense total over the 12 months ending at that month.

### High-expense months

Each month is judged against the up to twelve months before it, and at least five
of them are required:

```text
median = median(trailing monthly expense totals)
MAD = median(abs(value - median))
modified_z = 0.6745 * (value - median) / MAD
```

The stored legacy threshold is mapped to a modified-Z cutoff:

```text
effective_cutoff = 3.5 * (stored_threshold / 2.0)
```

The same cutoff grades high-expense and unusual-category months.

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
- The amount must be at least 1 percent of the median monthly expense total.
- A log-space modified-Z gate against the category's own amounts must pass; it is
  skipped when those amounts are near-constant.

### Unusual category months

A category's monthly expense total is compared with that category's totals in the
preceding twelve months in which it had spending: median, MAD and
`modified_z = 0.6745 * (value - median) / MAD` against the cutoff above, with
Tukey's upper fence when MAD is zero. At least five such earlier months are
required, and the month must beat the median by at least 2 percent of a typical
month. A month that repeats the previous month's total exactly is a new level and
is skipped, so a rent raised for good is flagged in its first month only. A month
that one already-flagged single expense explains is skipped too.

### Large transfers

Each transfer is compared with the median of what the same source account sent in
the preceding 365 days: at least five earlier transfers, an amount of at least 10
percent of a typical month, at least 3 times the median, and an outlier of that
account's log-space amounts. 5 times the median is high severity.

### Possible duplicates

Rows group by type, ledger account (both ends for a transfer), amount and cleaned
note (the first 300 characters); empty or placeholder notes, and amounts under 0.5
percent of a typical month, are skipped. Two neighbouring rows of a group within 3
days are flagged when:

- they fall on the same day and the payee's other repeats are usually 8 or more
  days apart (or there are none), which is high severity; or
- they are 1 to 3 days apart, the amount is at least 5 percent of a typical month,
  and the other repeats are usually 12 or more days apart (or there are none); or
- they are 1 to 3 days apart and the payee repeats on a regular cadence: two or
  more other repeats, a median gap of 20 days or more and a spread within 25
  percent.

### Fee or interest

An expense whose category, subcategory or note (whitespace collapsed, first 300
characters) names:

- a late or overdue fee, charge or penalty (high);
- a finance charge, card, cc, revolving or overdue interest, or interest on a card,
  outstanding balance or dues (high);
- a forex, FX, DCC, cross-currency, currency conversion, foreign currency or
  international transaction markup, fee or charge (medium);
- a card annual, renewal or joining fee with the card as the subject (medium).

The patterns are in `core/analytics/anomaly_fee_patterns.py`. Loan interest, a card
used to pay for something else, and a waived, reversed or refunded charge are not
flagged, and no pattern names a bank.

### Missing recurring entries

Only commitments the user confirmed, on open accounts, are checked. The walk starts
after the due date the last occurrence paid and follows the schedule; a commitment
on a fixed day of the month keeps its dates. The grace period grows with the
cadence: 2, 3, 4, 7, 10, 15, 20 and 30 days for daily, weekly, biweekly, monthly,
bimonthly, quarterly, semiannual and yearly. An entry (under the commitment's labels,
or its category and subcategory, within 15 percent or two spreads of the detected
or the user's amount) pays a due from the grace before it until the next cycle's
window opens. A due is judged only once its grace has passed and the account holds
rows that late; older data is stale, not missing. The finding stands for the latest
run of consecutive misses, high severity for income or for two or more. Because the
walk starts at the last occurrence, a skipped entry followed by a normal one is found
only while the last occurrence lags the entries.

### Closed-account activity

Rows dated after an account's recorded close, up to 5 per account. This check is
always on in the Anomaly Detection panel.

### Budget exceeded

For each active budget, the current IST month's category spending (live expense
rows, with classified capital losses and excluded accounts left out, as the budget
pages count it) updates:

```text
remaining = monthly_limit - spent
percent = spent / monthly_limit * 100
```

Spend is tracked even when the type is switched off. Past 100 percent a
high-severity finding is added, unless that month's overrun for the category was
reviewed. The alert follows the `budget_exceeded` switch.

### Auto-dismiss

With `auto_dismiss_recurring_anomalies` on (the default), a large-expense flag on an
entry of a recurring pattern (same label and type, a fitting amount), and a
category month that drops below the cutoff once bills on a longer-than-monthly
schedule are removed, are stored dismissed with an `Auto-dismissed:` note and no
`reviewed_at`, and rebuilt on every refresh. Large transfers are never
auto-dismissed. Turning the setting off brings the findings back as open ones.

### Storage and caps

Each refresh replaces the open rows and the engine's own auto-dismissed rows, and
keeps the rows a user reviewed. A transaction finding is identified by its type and
transaction; a month finding by its type, month and subject (a category or a
commitment). Reviewed findings suppress the same finding on later refreshes. Caps
per refresh, newest first: Unusual Category 20, Large Transfer 15, Possible
Duplicate 20, Missing Recurring 15, other types 25. High Expense keeps up to 25
months and fills up to 50 rows with single expenses by deviation. Auto-dismissed
rows: 25.

## Tax Calculation

Tax rules are versioned by fiscal year under
[`tax-config/`](../frontend/src/lib/tax-config/). The newest known fiscal-year
configuration is used as fallback for later years until a new rule file is
added. Keep that fallback visible.

Tax Year 2026-27 has its own entry under the Income-tax Act 2025 (s.202 and
Finance Act 2026). Its slabs, standard deduction and rebate equal FY 2025-26, so no
estimate moves. From 2026-27 a year is labelled "Tax Year", and `tax-config/sections.ts`
shows the 2025 Act reference beside the 1961 one (s.123 for old 80C, s.124(3) for
80CCD(1B), s.126 for 80D, s.22 for 24(b)). Old-regime deduction inputs are saved per
tax year and keep the 1961 Act names (`80C`, `80CCD(1B)`, `80D`, `HRA`, `24(b)`) as
keys.

The frontend tax engine applies:

1. Employment standard deduction where eligible.
2. Professional tax where configured.
3. Progressive slab tax.
4. Section 87A rebate for the selected fiscal year and regime.
5. Surcharge and applicable caps.
6. Health and education cess.

`taxPlanning.ts` determines the income basis before calling this engine.
**Business-only income gets no salary standard deduction or salary professional
tax.** Employment eligibility is explicit, not inferred from all taxable
receipts or a selected regime. Where employment is separately known, its
standard deduction is capped at the employment gross amount. Old-regime salary
standard deduction is INR 50,000; new-regime deduction is INR 75,000 from
FY 2024-25, with older values retained in the versioned configuration.

Gross mode taxes recorded taxable receipts directly and does not infer tax
paid. Net-of-TDS mode reconstructs gross only for separately classified
employment receipts using the same bounded inverse tax engine; other taxable
receipts remain gross. Before inversion, explicit known employee cash deductions
are restored to net employment receipts. `taxHistory.ts` derives those deductions
from the selected FY's saved `epf_monthly` and distinct salary/stipend months.
Multiple salary receipts in one month count once; bonus/RSU-only months do not
create EPF deductions. Missing historical salary settings are not backfilled
from today's salary.

Restoring known EPF does not create a tax deduction or reduce taxable gross.
Missing employment scope falls back to gross mode with
`incomeScopeComplete: false`, rather than guessing a net basis for the whole ledger. `estimatedTaxPaid`
remains an inference, not a payroll receipt.

With an explicit salary configuration for the selected FY, net receipts can
instead use the annual payroll model to estimate withholding on income received
so far. A partial-year annual-slab calculation must not stand in for payroll
withholding. Tax Planning defaults to the full-year view when the current FY
has salary inputs, with a separate received-income view. The withholding panel
separates estimated cash payroll TDS, share withholding, and actual tax paid;
unknown actual TDS is `null`, displayed as a blank value rather than zero.

The payroll override is accepted only when it covers the recorded receipts.
Unmatched RSU receipts retain the complete-receipt fallback and an incomplete
coverage warning, so missing vesting entries cannot silently lower taxable income.

`taxHistory.ts` groups transactions into FYs and retains employment, other
taxable, and non-taxable classifications. The yearly chart's legacy `paidTax`
key represents calculated liability on recorded income. It must be labeled
accordingly; it is distinct from both inferred withholding and the remaining
full-year projection. `taxPlanningUtils.ts` only re-exports the shared APIs.

`computeAnnualTaxPlanning` in `taxPlanning.ts` combines scopes explicitly:

```text
annual_employment_gross =
  max(recorded_employment_gross, projected_full_year_employment_gross)
combined_annual_gross =
  annual_employment_gross + selected_fy_other_recorded_taxable_income
annual_tax = selected_fy_and_regime_tax(combined_annual_gross)
```

The employment projection already includes recorded employment; do not add it
again. Recorded employment above the forecast remains a floor, and business or
other taxable income is added exactly once in its own FY. An incomplete legacy
employment/other-income split returns no combined projection. Current/future
chart rows can extend recorded liability; completed FYs with recorded data keep
their recorded liability. Other income is not carried into a different FY.

Tax Planning's cards, slab values, regime comparison, and annual chart consume
that combined tax result. The dated salary schedule remains **employment-only**:
its `cashTakeHome` is not cash after the combined annual business/employment tax.
`netAfterTax` means gross less tax; `netAfterCashDeductions` also subtracts known
employee deductions. If employment receipts include RSUs, neither tax-side net
field promises that all compensation reached a bank account.

`payrollPlanning.ts` aligns projected salary tax with the selected regime.
`taxRateCurve.ts` uses the same FY-aware engine for hypothetical full-year
incomes and employment eligibility. Before FY 2020-21, the new regime is
unavailable: effective-rate data omits that series, and the chart displays
only the old regime rather than relabeling old rates as a comparison.
Employee EPF reduces cash take-home, **not new-regime taxable income**. The
unqualified legacy NPS field remains separately tracked; these helpers do not
invent an employee/employer NPS deduction.

IncomeExpenseFlow supplies explicit salary preferences to the same FY grouping.
It delegates residual withholding to `taxHistory.reconcileTaxWithholding`:
`tdsAtSource = max(0, computedTax - recordedTax)`, then
`taxTotal = recordedTax + tdsAtSource`. This retains the recorded-tax boundary
and avoids a separate page-owned tax or net-salary reconstruction.

Always update the versioned tax configuration and its tests when tax law
changes. Do not hardcode new slabs inside page components.

### Advance tax and filing dates

These are pure functions in `frontend/src/lib/tax/`, ported from community/itr-agent
(MIT, same author), with explicit inputs and a stated Act and section. A
computation aid, not tax advice.

```text
net_liability = max(0, round(projected_tax - tds_and_tcs))
applies = net_liability >= INR 10,000
required_by_date = round(net_liability * cumulative_pct / 100)
```

- **Projected tax** is the Tax page's income tax for the year with surcharge and cess,
  without professional tax. `tds_and_tcs` starts as the tax on employment income
  alone (salary TDS, RSU perquisites included); the user can replace it with the
  Form 26AS or AIS total.
- **Instalments:** 15% by 15 June, 45% by 15 September, 75% by 15 December and 100%
  by 15 March (1961 Act s.211; 2025 Act s.408), for the year starting 1 April. The
  planner covers FY 2020-21 onward and needs an April fiscal year.
- **Payments** are expense rows whose category or subcategory names Advance Tax,
  summed in whole paise. A payment counts at the first due date on or after its date
  (after the previous date, up to and including this one); 16 to 31 March counts for
  the year, after the last instalment.
- **Deferment interest** (1961 Act s.234C; 2025 Act s.425): 1% a month on the
  shortfall at each date, 3 months at each of the first three dates and 1 month at
  15 March; nil in June when 12% was paid and in September when 36% was. Rule 119A:
  the principal is floored to a multiple of INR 100 and a part month counts as a full
  month.
- **Default interest** (1961 Act s.234B): 1% a month from 1 April after the year
  while advance tax paid is under 90% of the tax after TDS and TCS. The clock stops
  at a self-assessment payment that clears the balance (the s.234B(2) segments), at
  the 31 July return date while that is still ahead, or today after it. After the
  assessment year ends the ledger cannot say when the balance was paid, so the
  estimate runs to 31 July, or to the last self-assessment payment when that came
  later.
- **Not modelled:** the proviso excusing a shortfall caused by capital gains or
  dividends received after an instalment date, the single 15 March instalment for
  presumptive income, and the exemption for resident seniors with no business income.

Filing dates (`filingDeadlines.ts`) are statutory dates for an individual with no
audit, which CBDT can extend. AY 2026-27 (FY 2025-26) falls under the 1961 Act as
amended by Finance Act 2026: return due 31 July 2026, belated up to 31 December 2026,
revised up to 31 March 2027 (a 12-month window, with the s.234I fee for a revision
after 31 December). From Tax Year 2026-27 the Income-tax Act 2025 applies: the return
is due 31 July after the year (s.263(1)), a belated return up to 9 months after it
(s.263(4)), a revised one up to 12 months after it (s.263(5)), with a fee after 9
months (s.428(b)). Business or professional income moves the AY 2026-27 due date or
adds a caveat, because that return can be due later.

### AIS reconciliation

`lib/tax/aisReconcile.ts` (with `aisMatch.ts`) matches the AIS income lines of a tax
year against the ledger's income, in both directions. A computation aid, not tax
advice.

- Salary matches by date only (within 12 days), because the ledger holds take-home
  pay and the AIS the gross.
- Any other line matches one ledger row whose amount equals its gross, or its gross
  less TDS, within 1% (at least INR 1), and whose date is within 10 days when the
  line has one. An interest or dividend line with no tax column also accepts the
  gross less 10%.
- An interest or dividend line still unmatched then matches one account's rows of
  that kind whose sum agrees within 2% (at least INR 10): quarterly credits against
  an annual SFT figure.
- Totals count each payer's interest and dividends once: the larger of its SFT report
  and its TDS lines. Sums are kept in paise.
- AIS lines with no ledger match, and reportable ledger rows (salary, interest,
  dividend, rent, gains, or income classified as taxable or investment) with no AIS
  line, are listed for review.

### Foreign assets (Schedule FA and FAST-DS)

`core/foreign_assets*.py` values the RSU shares of a foreign employer for an Indian
return. A computation aid, not tax advice.

- **Rupee value of a vest** (`foreign_assets.py`, mirrored in `lib/rsuTaxFx.ts`): the
  employer's perquisite figure when entered; otherwise the SBI TT buying rate (INR
  per unit of the quote currency) the user looked up for the specified date, times
  the vest-date price per share. The specified date is the last day of the month
  before the vest month (r.115 of the Income-tax Rules 1962 for vests up to
  2026-03-31, r.206/207 of the Income-tax Rules 2026 after), and a rate card up to 7
  days before it still counts. Otherwise the saved vest price, which the app converted
  at the ECB reference rate: an approximation. `fx_source` is `employer`, `sbi_ttbr`
  or `ecb`, derived on every write.
- **Received units** use the entered net quantity; until then they are estimated as
  `1 - 0.30 - 0.30 * 0.04` of the gross quantity, like `netVestingQuantity`.
- **Schedule FA** (Table A3, foreign equity interest) covers a calendar year, 1
  January to 31 December, not the financial year (AY 2026-27 under the 1961 Act is
  calendar 2025). The initial value is the lot's tax value for the shares held when
  the period, or the holding, began. Peak and closing values come from the stock's
  daily closes and the ECB reference rate of the day, an approximation of the SBI rate
  the form asks for. Closes are split-adjusted, so a value is the lot's shares on
  today's count times the close. A sale or dividend converts at the TTBR the user
  entered for it, else at the ECB rate of its day.
- **FAST-DS 2026** (Finance Act 2026) values a lot held on 2026-03-31 at the higher of
  its cost and the average of that day's highest and lowest quote, converted at the
  reference rate (the ECB rate here, an approximation). Declarations close on
  2026-12-31. Whether a holding needs declaring, and in which category, depends on past
  returns and is for a CA to confirm.

## Salary, RSU, and TDS Projections

### Salary projection

Fiscal-year salary data contains base salary, HRA, bonus, monthly EPF and NPS,
special allowance, and other taxable income. Growth assumptions independently
control base salary, bonus, NPS, and stock price, with EPF optionally scaling
with base.

`projectAnnualBonus` preserves the saved legacy choice when `bonus_mode` is
missing or null: zero bonus growth means a one-time bonus; nonzero growth repeats
it. Explicit `recurring` with zero growth repeats the same annual bonus;
`one_time` does not. An explicitly saved salary FY still uses its own bonus.
Do not reinterpret old zero-growth preferences as recurring.

`buildSalaryPayroll` in `finance/payrollPlanning.ts` is the shared dated owner
for annual projections and monthly payroll. `projectionCalculator.ts` prepares
salary/growth inputs and calls it; `ProjectedFYBreakdown.fyStartMonth` retains
the calendar basis. Each month uses the `salaryCompensation.ts` primitive:

```text
gross_taxable = cash_earnings + gross_rsu_value
share_withholding = max(0, gross_rsu_value - retained_share_value)
cash_payroll_tax = max(0, total_tax - share_withholding - prior_share_credit)
cash_take_home = cash_earnings - employee_cash_deductions - cash_payroll_tax
net_compensation = cash_take_home + retained_share_value
```

Annual payroll values are derived from the monthly rows:

```text
annual_payroll_tax = sum(month.cashTds)
annual_cash_take_home = sum(month.cashTakeHome)
annual_net_share_value = sum(month.netShareValue)
annual_net_compensation = annual_cash_take_home + annual_net_share_value
closing_excess_share_credit = final_month.excessShareWithholding
```

Employee cash deductions currently include employee EPF. Retained shares are
compensation, not cash available in the bank. `takeHome` is a compatibility alias
for `cashTakeHome`. Excess share withholding remains a credit; it is never
added to cash as an assumed refund. A late vest cannot retroactively refund
cash payroll tax paid in earlier months. Do not replace this schedule sum with
a second annual aggregate settlement. Annual totals distinguish recorded and
estimated share withholding.

### RSU valuation

Each vesting has a date, gross `quantity`, optional `price_at_vest`, and optional
`net_quantity` received after sell-to-cover withholding.

- When actual received units are absent, the default is 30% tax plus 4% cess
  **on that tax**. For 25 gross shares: tax is 7.5 shares, cess is 0.3 shares,
  and **25 - 7.5 - 0.3 = 17.2 estimated received shares**. Units are not rounded
  to whole shares. This is a planning assumption, not an assertion of actual
  employer withholding.
- An entered `net_quantity`, including zero, overrides the estimate without
  changing gross taxable units. The helper never saves an estimate as an actual.
- A completed vesting uses a positive locked vest-date price when available.
  The price-loading flow requests the historical stock price and exchange
  rate for that date; a weekend or holiday uses the upstream's preceding
  publication date. Stored prices retain the legacy display-currency convention.
- Historical FX failures do not use the present-day fallback table. The locked
  price remains unset, so the UI honestly falls back to the grant's current
  price as an estimate. Past vestings never receive projected appreciation.
- Received-income reconciliation can infer an estimated historical price from
  exactly one RSU receipt and one matching vesting on the same date, using the
  receipt divided by received units. Ambiguous same-day matches do not establish
  a price. This does not change a saved price or turn estimated withholding into
  an actual.
- An upcoming vesting uses the grant's current price and projection assumptions
  where applicable.
- `valueRsuVestings` returns one canonical event with gross/net units and values,
  withholding, FY/month, and estimate flags. Actual units plus a locked past
  price support recorded withholding; missing either keeps it estimated.
- Perquisite value and projected taxable income continue to use gross
  `quantity`. Net units determine retained shares and withholding credit, so
  they affect cash/share settlement without reducing the taxable vest.
- Changing a completed vesting date clears the stale locked price in the UI so
  it can be fetched again.
- The rupee tax value recorded per vest (employer figure, SBI TT buying rate or the
  ECB approximation) feeds the Foreign Assets worksheet. It does not change these
  projections; see [Foreign assets](#foreign-assets-schedule-fa-and-fast-ds).

These helpers multiply the supplied price. They do not migrate stored prices,
attach a new base-currency contract, or reinterpret saved prices when display
currency changes. Combining legacy RSU values with INR ledger/tax inputs remains
a currency-contract limitation.

### Forward TDS schedule

`buildSalaryPayroll` passes the annual projection's valued RSU events directly
to `buildTdsSchedule`. With events supplied, `extraByMonth` contains cash extras
only, currently the annual cash bonus spread across 12 months. Do not add RSU
gross value to both the events and the cash extras.

```text
base_annual =
  max(0, cash_earnings - annual_bonus)

regular_monthly_income =
  base_annual / 12

bonus_monthly =
  annual_bonus / 12

taxable_extra_for_month =
  bonus_monthly + gross_value_of_dated_rsu_events

baseline_monthly_tds =
  tax(base_annual) / 12
```

For each fiscal month:

```text
marginal_extra_tax =
  tax(base_annual + prior_extras + taxable_extra_for_month)
  - tax(base_annual + prior_extras)

monthly_tds =
  max(0, baseline_monthly_tds + marginal_extra_tax)

projected_annual =
  base_annual + extras_seen_so_far

cash_income =
  regular_monthly_income + bonus_monthly

cash_tds =
  max(0, monthly_tds - share_withholding - prior_share_credit)

cash_take_home =
  cash_income - monthly_employee_epf - cash_tds

net_compensation =
  cash_take_home + retained_share_value
```

`monthIncome` is gross taxable cash plus shares; `monthlyTds` is planned tax
liability; `cashTds` is its cash-payroll portion after available share withholding.
The progressive calculation stacks later extras on earlier ones. Withholding
credit carries forward through the monthly schedule; any unused credit remains
separate from cash.

`computeTaxPaidTillDate` is only an estimate from **net employment receipts**,
configured salary, payroll deductions, and known vested events in the selected
FY. It uses the inverse tax engine rather than a fixed marginal rate.
`buildPayrollPlanning` excludes all classified RSU ledger receipts in that FY
from cash inference, regardless of settlement month. It does not require a
receipt's month to match a vesting month, nor does it perform broker/payroll
event reconciliation. Missing or misclassified receipts can still change the
estimate. Gross-mode records do not support paid-tax inference, and the modeled
paid-tax result stays separate from projected schedule rows.

## FIRE and Retirement

Defaults are India-oriented:

- Safe withdrawal rate: 3 percent
- Real return for FIRE timing: 6 percent
- Retirement inflation: 6.5 percent
- Nominal retirement return: 12 percent

`fireCalculator.deriveFIREInputs` annualizes period income and absolute expenses
over observed monthly rollup keys, retaining a one-month fallback when none
exist. Savings is annual income minus annual expenses, including deficits.
The existing essentials assumption is 60% of annual expenses; its arithmetic
belongs in the library, while the page supplies totals/count and slider inputs.

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

### Monte Carlo simulation

`lib/finance/monteCarlo.ts` (`runMonteCarlo`) asks whether the money lasts to the
end age. It is deterministic for a given input: run `r` draws from its own generator
seeded by `(seed, r)`, in the same order every year, so the same inputs give the same
fan, more runs extend the same set, and moving an age leaves every other year's draws
alone. A computation aid built on the user's assumptions, not a forecast or financial
advice.

- **Pots:** equity, debt and cash, each with a starting balance in today's rupees, a
  median annual return (a CAGR) and a volatility. The tab seeds balances from net
  worth: investment accounts are equity unless mapped as PPF/EPF or fixed deposits
  (debt); everything else, net of cards and loans, is cash. A pot left negative is
  taken from the others pro rata, so the pots add up to net worth, or to zero when
  net worth is not positive. Defaults: equity 12% return and 18% volatility, debt 7.5%
  and 3%, cash 3.5% and 1%.
- **Each year:** every pot draws a lognormal return whose median is its expected
  return, and inflation draws from a normal around its average (default 6% with 1.5%
  volatility). The portfolio is rebalanced to the starting mix every year, and pots
  and inflation move independently. Nothing resamples market history.
- **Cash flows:** savings and spending are in today's rupees and grow with that run's
  inflation. Before retirement the year's savings land at its end; from retirement the
  year's spending leaves at its start, and a run fails in the first year the portfolio
  cannot fund it. Every reported balance is deflated back to today's rupees.
- **Stress test:** an optional one-time fall in the equity pot (10% to 60%) lands as
  retirement starts, so the balance at the retirement age already includes it. The
  result also reports the success rate without the fall.
- **Outputs:** `success_rate = 1 - failed_runs / runs`; the median balance at
  retirement and at the end age (failed runs count as 0); the median and
  earliest-tenth ages at which failed runs ran out; and a fan of the 10th, 25th, 50th,
  75th and 90th percentile balances by age, with the share of runs already depleted.
- **Runs:** 1,000, 5,000 or 10,000 (at most 20,000), in a Web Worker with a
  main-thread fallback.

## Investment Returns

`investmentReturns.ts` assigns at most one recorded-return bucket to each row:
dividends, interest, booked profit, broker fees, or investment loss. Explicit
subcategory/category classification takes priority over note fallback. A
synthetic Income row of 100 classified as Interest with note "realized interest"
remains interest 100, profit zero, P&L 100, and one event.

Transfers, principal, redemptions, salary/bonus, RSU receipts, sale proceeds, and
unrealized gains do not become realised returns just because a note contains a
return keyword. Summary totals and monthly grouping share this classifier.
`returnsAnalysisUtils.ts` preserves compatibility exports and chart formatting;
new return rules belong in the domain module.

The frontend also includes:

- XIRR for irregular dated cash flows
- CAGR helpers where only start, end, and duration are available
- Mutual-fund SIP projection
- EPF, PPF, NPS, and other instrument projections

XIRR uses Newton iteration with bounded fallback behavior and dated cash flows.
Its convention is positive contributions into the investment and negative
withdrawals/ending valuation, returning percentage points. Its legacy zero
fallback for insufficient or unsolvable flows is not evidence of a measured
zero return. Do not derive a portfolio return from salary trends or book-balance
movement without the required valuation inputs.

### Mutual funds from a CAS

`core/mf_valuation.py` values holdings imported from a CAS, which carry real market
values unlike the ledger's cost-basis figures. A computation aid, not financial
advice.

- **NAV:** each held scheme is valued at AMFI's latest NAV (`core/amfi_nav.py`, the
  `NAVAll.txt` file parsed by header name), looked up by `isin:` or `code:` key, else
  at the statement's own NAV when AMFI has none. A cached NAV is fresh if it was
  checked after the most recent 10:30 IST (SEBI's latest publish deadline is 10:00
  IST on T+1), so there is at most one download a day per new set of schemes. After a
  failed download, retries on that server instance wait 15 minutes.
- **Value, cost and gain:** `value = units * nav`. `cost` is the statement's cost,
  else worked out first-in-first-out from the transactions (a reversal comes off the
  newest lot). `gain = value - cost` and `gain_pct = gain / cost * 100` when both are
  known. Schemes without a NAV or a cost are skipped by the totals that need them,
  and the summary says how many.
- **XIRR** (`core/mf_xirr.py`) follows Excel: the annual rate at which the dated
  flows' NPV is zero, with days divided by 365 (not 365.25), by Newton's method from
  10% and then bisection. Flows are from the investor's side: money paid in is
  negative; redemptions, IDCW payouts and today's value are positive; stamp duty, STT
  and TDS count as money paid; a switch is a flow for each scheme and nets out across
  the portfolio; IDCW reinvestment moves no money and is skipped. The result is a
  percentage.
- **When XIRR is shown:** a holding gets one only when its statement starts from zero
  units; otherwise the note is `opening_balance`. A summary or depository CAS lists no
  dated rows (`no_transactions`), no NAV gives `no_nav`, and flows with no rate (all in
  or all out) give `no_solution`. The portfolio XIRR pools every holding with a
  complete history, redeemed ones included.

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
