# Plan: Forward TDS Schedule mode for Tax Planning

Status: PLAN ONLY (no code yet) -- awaiting review.

## Problem

The Tax Planning page computes tax **reactively** -- on income *received to
date*. Early in the FY this under-states tax, because it ignores the rest of
the year. Real TDS is **forward-looking**: payroll projects your full-year
income from April and deducts tax proportionally, truing-up whenever income
changes.

## Concept

A Settings toggle (default **OFF**) switches the page between:

- **OFF -- "Actual to date" (today's behaviour):** tax on cumulative income
  received so far. Unchanged.
- **ON -- "Projected TDS schedule":** a month-by-month TDS table that mirrors
  how an employer deducts tax.

## The model (confirmed with user)

**Base salary is certain -> project it forward. Bonus / RSU are uncertain ->
fold them in only the month they actually land.** This is exactly why a real
payslip schedule has flat TDS early, then spikes on bonus months.

Worked example (user's own table):

| Month   | Month income | Projected annual | Monthly TDS | Note                         |
| ------- | ------------ | ---------------- | ----------- | ---------------------------- |
| Apr-Jul | base/12      | base-only ~2.59M | ~45k flat   | only the sure thing          |
| Aug     | base + bonus | revised 3.12M    | ~150k spike | bonus lands -> re-project    |
| Sep-Jan | base/12      | 3.12M (held)     | ~30k        | trued-up, lower steady state |
| Feb     | base + RSU   | revised 3.57M    | spike       | second event                 |

## Algorithm (payroll-style true-up)

`buildTdsSchedule(salaryStructure, rsuGrants, fyStartMonth, regime) -> MonthRow[]`

Iterate months Apr..Mar, tracking `tdsPaidSoFar`:

1. **Income this month** = base/12 (+ any bonus/RSU whose event date is this
   month).
2. **Projected annual income** = base + every bonus/RSU *known by this month*
   (i.e. already landed). Future uncertain income is NOT projected.
3. **Annual tax** on that projection via the existing `calculateTax()` +
   `getTaxSlabs()` + `getStandardDeduction()` (reuse, do not reinvent).
4. **This month's TDS** = `(annualTax - tdsPaidSoFar) / monthsRemaining`.
   -- spreads the *remaining* liability over the *remaining* months, so a new
   bonus's tax is caught up across the rest of the year (the spike).
5. **Take-home** = monthIncome - monthTds.
6. Accumulate `tdsPaidSoFar += monthTds`.

`MonthRow = { month, monthIncome, projectedAnnual, annualTax, monthlyTds, takeHome, cumulativeTds }`

Edge cases to cover in tests:
- Flat salary, no bonus -> even TDS every month (no spikes).
- Mid-year bonus -> spike in that month, lower steady-state after (the Aug case).
- RSU vesting mid-year -> same as bonus.
- Regime switch (old/new) -> different slabs feed the same schedule.
- New regime 87A rebate / surcharge already handled by `calculateTax`.

## Implementation surface (when approved)

1. **Preference** -- add `tax_projection_mode: "actual" | "projected_tds"` to
   `user_preferences` (default `"actual"`). New column + Alembic migration with
   the empty-downgrade convention; re-export via `_models` facade; Pydantic
   `UserPreferencesResponse`/`Update` + the manual mapper in
   `preferences_helpers.py`; TS type in `frontend/src/types`.
2. **Calculator** -- `frontend/src/lib/tdsScheduleCalculator.ts` (pure, no React)
   + `__tests__/tdsScheduleCalculator.test.ts` (TDD, mirrors
   `projectionCalculator.test.ts`).
3. **Settings toggle** -- a row in `settings/sections/` wired to the new
   preference (default off).
4. **Tax page table** -- new `components/TdsScheduleTable.tsx` on the
   tax-planning page, rendered only when the toggle is on. Uses `DataTable`,
   `formatCurrency`, existing chart tokens.
5. **Tests + full gate** -- vitest, eslint, tsc, build; backend ruff+mypy+pytest
   for the migration/schema. PR on a branch, CI green.

## Open questions for review

- Table columns: keep your 6 (month income / projected annual / 2 tax cols /
  TDS / take-home), or collapse the two tax columns into one "tax" column?
  Your sheet's cols 3-4 looked like a cess/surcharge or regime split -- I'd
  confirm which before building the table.
- Should the schedule also overlay **actual** salary credits from transactions
  (a thin "actual vs scheduled" comparison), or stay purely projected for v1?
  (User said salary-only for the projection; this is just about an optional
  comparison column later.)

## Explicitly out of scope for v1

- Reading actual bank transactions into the schedule (projection-only).
- Uneven employer TDS quirks (we model the standard remaining/months spread).
- Editing per-month TDS by hand.
