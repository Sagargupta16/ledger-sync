# Calculation Verification vs Real Data — 2026-06-27

## TL;DR

Verified ledger-sync's calculations against the **real local DB**
(`backend/ledger_sync.db`, user_id=1, 6,768 active transactions, 2019-2026)
using **independent SQL/Python oracles** (computed a different way than the app,
not by calling the app's own functions). Method beats an external connector
because we run the actual code AND an independent check over the same real data.

- **Core aggregates: CORRECT.** All 90 monthly summaries + 9 FY summaries
  (income/expense/savings/savings-rate/counts) match raw SQL exactly. All-time
  income Rs 61,77,956.60 ties to the sum of months.
- **Tax engine, instruments, category/Pareto, currency/FX: CORRECT** (hand-verified).
- **Found & fixed several real bugs** (below), all driven by real-data evidence.

## How to re-run

```python
import sqlite3
con = sqlite3.connect("backend/ledger_sync.db")  # READ ONLY; gitignored
# income/expense by type:
con.execute("SELECT type,COUNT(*),ROUND(SUM(amount),2) FROM transactions "
            "WHERE user_id=1 AND is_deleted=0 GROUP BY type").fetchall()
```
Key facts: amounts stored POSITIVE; `type` in (INCOME, EXPENSE, TRANSFER);
date is TEXT `YYYY-MM-DD 00:00:00.000000`; `is_deleted=0` for active rows.
Category lists + investment-account mappings live in `user_preferences` (JSON).

## Confirmed bugs found + fixed (with real-data evidence)

1. **Net Cashback Earned showed Rs 0.** Code matched category `'Refund &
   Cashbacks'` (singular) — your real data uses `'Refunds & Cashbacks'`
   (plural). Evidence: singular match = 0 txns; substring "cashback" on Income =
   228 txns = Rs 48,747.80; shared-cashback transfers Rs 6,767 → net Rs
   41,980.31. Fix: match by `subcategory` containing "cashback" (Income) and
   `to_account` containing "cashback shared", not exact hardcoded strings.
   (quickInsightsData.ts `computeNetCashback`). **Lesson: never hardcode a
   user-defined category string — match by substring or the preference list.**

2. **Income Stability / Savings Volatility scored 0.** CV was computed over the
   FULL 89-month history. Your income ramped from ~Rs 0 (2019, student) to ~Rs
   2.4M/yr → all-time income CV = **129.7%** → score floors at 0. Last-12-month
   CV = **10.3%** (genuinely stable). Fix: compute volatility/stability CVs over
   a rolling 12-month window (healthScoreAnalysis.ts). **Lesson: "stability"
   metrics must use a recent window, not lifetime history.**

3. **Days of Buffering showed "NaN days".** `total_income`/`total_expenses` can
   arrive as strings (backend Decimal serialized); `string - number` → NaN. Fix:
   `Number()`-coerce + `Number.isFinite` guard in DashboardPage and a defensive
   guard in `computeDaysOfBuffering`. **Lesson: coerce backend Decimals to Number
   before arithmetic in the frontend.**

4. **lifestyle_inflation = 61,232%** (calculator.py). Divided each window by a
   hardcoded 3 even with <3 real months; sparse early Rs 40 month exploded the
   ratio. Fix: divide by distinct-month count, require 3-month windows, guard a
   near-zero baseline.

5. **Large-transaction anomalies dropped the worst.** 50-row cap with no sort:
   your top outliers (Gadgets Rs 1,80,495 / 638%, Family Rs 1,50,000 / 745%)
   were absent while Rs 20k ones were kept. Fix: sort by deviation desc before
   the cap; grade severity 'high' at ≥5x category average.

6. **net_worth_change stored 0** on 7/12 snapshots — the "previous snapshot"
   lookup included today's row (same-day re-upload compared against itself).
   Real 2026-06-27 change = +Rs 1,91,009 (+9.1%). Fix: exclude today.

7. **infer_expected_day_of_month** returned the 31st for a day-1 bill / 27th
   salary. Fix: mode-first, prefer max only when the mode itself is late (≥28).

8. **Investment holdings** (fixed earlier): income-funded accounts (EPF, RSU
   vesting) booked their whole balance as "realized gains" on 0 invested and
   were hidden by `is_active = invested > 0`. Fix: income credited to an
   investment account = principal; realized_gains stays 0 (no market data);
   active = current_value > 0. The 7 holdings now sum to Rs 15,57,029, matching
   the net-worth snapshot's investments total.

## Open modeling decisions (need user's call — NOT silently changed)

- **"Tax already paid" gross-vs-net assumption.** The app treats recorded salary
  as NET of TDS and backs out a gross to tax. For FY2025-26 (received taxable Rs
  24,96,415): model-A (received=net) → implied gross Rs 29,59,615, tax Rs
  4,63,200; model-B (received=gross) → tax Rs 3,18,681. Difference Rs 1,44,518.
  Correct choice depends on whether the ledger records gross or net salary.
- **Net-worth projection** compounds a 161%/yr rate off a cumulative FLOW series
  → Rs 28 crore in 5 years. Should be linear, or asset-split. (book-value, no
  market feed.)
- **Days-of-buffering input** uses lifetime net (Rs 22.9L) as "liquid"; should be
  cash/bank-only balance.
- **GST cross-cutover FY** category-aggregate headline understates ~3.8% (the
  per-transaction monthly path is correct).

## Recurring bug classes seen here (watch for these)

- Hardcoded user-defined category/account strings (use substring / prefs).
- Backend Decimal serialized as string → NaN in frontend arithmetic.
- "Stability/consistency/inflation" metrics over full multi-year history.
- Averaging divisors = global span count instead of per-bucket occurrences.
- Same-day snapshot self-comparison.
