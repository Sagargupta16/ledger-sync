# Refactor Plan — Items 3, 5, 7

Concrete file-by-file split plan for three oversized modules. Written so you can execute one section at a time and verify with `pnpm run check` / `uv run pytest` between each.

## Status (2026-04-24)

| Item | Status | Notes |
|---|---|---|
| #7 `db/models.py` | **DONE + VERIFIED** | Split into `db/_models/` package. 7 files: `_constants.py`, `enums.py`, `user.py`, `transactions.py`, `investments.py`, `analytics.py`, `planning.py`, plus `__init__.py`. `db/models.py` is a 21-line facade. Verified with `alembic check`, `pytest` (54 tests pass), and `mypy`. |
| #3 `core/analytics_engine.py` | **PARTIAL** | Module-level helpers (`_group_txns_by_pattern`, `_resolve_pattern_display`, `_aggregate_holdings_data`) + constants extracted to `_analytics_helpers.py` (~120 lines out). AnalyticsEngine class still a single 1,930-line file. Full 8-mixin split is still pending — see the mixin plan below. |
| #5a `TaxPlanningPage.tsx` | **DONE** | Split into `tax-planning/` module (hook, utils, types, 6 sub-components). 1,090 lines → 280-line orchestrator + helpers. |
| #5b `BillCalendarPage.tsx` | **DONE** | Split into `bill-calendar/` module (hook, utils, types, 4 sub-components). 799 lines → 270-line orchestrator + helpers. |
| #5c `TrendsForecastsPage.tsx` | **DONE** | Split into `trends-forecasts/` module (hook, utils, types, 2 sub-components). 775 lines → 320-line orchestrator + helpers. |
| #5d `YearInReviewPage.tsx` | **DONE** | Split into `year-in-review/` module (hook, utils, types, 4 new sub-components; existing StatCard/InsightRow/DayOfWeekChart kept). 757 lines → 400-line orchestrator + helpers. |

**Deviation from plan in #7:** package is named `_models/` (underscore-prefixed, internal) instead of `models/`, because `db/models.py` is still needed as a facade and Python can't have both `models.py` and `models/` as siblings. Consumer imports (`from ledger_sync.db.models import X`) are unchanged — 24 call-sites were not touched.

---

Total LOC in scope: ~4,600
- `db/models.py` 1,344
- `core/analytics_engine.py` 2,026
- `pages/TaxPlanningPage.tsx` 1,090
- `pages/BillCalendarPage.tsx` 799
- `pages/TrendsForecastsPage.tsx` 775
- `pages/YearInReviewPage.tsx` 757

Strategy: split each file behind a **facade module** that re-exports the old symbols from new locations. No consumer imports change on the first pass, so the blast radius is contained to the file being split.

---

## 7 — `db/models.py` (1,344 lines → 7 modules) — DO THIS FIRST

Lowest risk, highest leverage. SQLAlchemy is sensitive to import order and `relationship()` string references, so the facade pattern is especially valuable here.

### 22 classes grouped by bounded context

| New file | Classes moved | Lines |
|---|---|---|
| `db/models/_base.py` | (nothing — just re-exports `Base` from `db.base`) | small |
| `db/models/enums.py` | `TransactionType`, `AccountType`, `AnomalyType`, `RecurrenceFrequency`, `GoalStatus` | ~60 |
| `db/models/user.py` | `User`, `UserPreferences`, `AuditLog` | ~290 |
| `db/models/transactions.py` | `Transaction`, `ImportLog`, `AccountClassification`, `ColumnMappingLog` | ~280 |
| `db/models/investments.py` | `NetWorthSnapshot`, `InvestmentHolding`, `TaxRecord` | ~220 |
| `db/models/analytics.py` | `DailySummary`, `MonthlySummary`, `CategoryTrend`, `TransferFlow`, `FYSummary`, `MerchantIntelligence` | ~380 |
| `db/models/planning.py` | `RecurringTransaction`, `ScheduledTransaction`, `Anomaly`, `Budget`, `FinancialGoal` | ~310 |
| `db/models/__init__.py` | facade — `from .user import *` etc., then `__all__` listing every class | ~40 |

### Execution order

1. Create `db/models/` directory. Move `models.py` → `models/_legacy.py` temporarily as a safety net (delete after).
2. Create `db/models/enums.py` first — no dependencies on other models.
3. Create each model module. Paste the class block from `_legacy.py`. Fix imports (SQLAlchemy types + `Base` from `..base`).
4. **Critical: `relationship()` must use string references** (e.g., `relationship("Transaction", ...)`) — they're resolved lazily by SQLAlchemy's registry, so cross-module refs still work *as long as every model is imported before `Base.metadata` is used*. `__init__.py` must import all modules.
5. Replace `db/models.py` with `db/models/__init__.py` facade that re-exports every symbol. Every `from ledger_sync.db.models import X` statement in the 22 existing consumers continues to work untouched.
6. Run `uv run alembic check` — Alembic will crash if a model isn't registered on `Base.metadata`.

### Verification checklist

- `uv run alembic check` — catches missing registrations.
- `uv run alembic revision --autogenerate -m "refactor-noop"` — output must be **empty** (no schema diff). Delete the revision if empty.
- `uv run pytest tests/ -v`
- `uv run mypy src/`

### Risks & landmines

- **`ForeignKey("users.id")`** uses table name strings — these keep working.
- **`relationship("User", back_populates="...")`** uses class name strings — work as long as `__init__.py` imports every module.
- **Alembic's `env.py` already does `from ledger_sync.db import models`** (line 13) — the facade preserves this.
- Circular imports: if `Transaction` needs `User` at class-definition time (it doesn't — only string refs), you'd need TYPE_CHECKING guards. Shouldn't be required.
- Leave `_legacy.py` in git history; delete from disk after a full CI pass.

---

## 3 — `core/analytics_engine.py` (2,026 lines → 8 modules)

The `AnalyticsEngine` class has 50+ methods. Split by domain into **mixin classes**, then compose them. This preserves the `AnalyticsEngine(session, user_id=...)` public API — the only external surface (used by `sync_engine.py:10` and `api/analytics_v2.py:17`).

### Module layout

```
core/analytics/
├── __init__.py          # re-exports AnalyticsEngine
├── base.py              # AnalyticsEngineBase: __init__, _load_preferences,
│                        # _parse_json_field, _user_transaction_query,
│                        # all @property accessors, _currency_symbol
├── classification.py    # ClassificationMixin: _is_taxable_income,
│                        # _is_salary_income, _is_bonus_income,
│                        # _is_investment_income, _is_investment_account,
│                        # _get_investment_type, _get_fiscal_year
├── summaries.py         # SummariesMixin: _calculate_monthly_summaries,
│                        # _calculate_daily_summaries, _mom_change_pct,
│                        # _upsert_monthly_summary, _categorize_transaction_for_summary,
│                        # _monthly_type_totals
├── trends.py            # TrendsMixin: _calculate_category_trends,
│                        # _calculate_transfer_flows
├── merchants.py         # MerchantsMixin: _extract_merchant_intelligence,
│                        # _build_merchant_record, _extract_merchant_name,
│                        # _normalize_note, _group_txns_by_pattern (module fn),
│                        # _resolve_pattern_display (module fn)
├── recurring.py         # RecurringMixin: _load_confirmed_recurring,
│                        # _detect_recurring_transactions, _detect_frequency
├── net_worth.py         # NetWorthMixin: _calculate_net_worth_snapshot,
│                        # _compute_account_balances, _get_net_worth_change,
│                        # _upsert_net_worth_snapshot, _populate_investment_holdings,
│                        # _categorize_account_balances, _assign_balance_to_bucket,
│                        # _assign_investment_balance, _aggregate_holdings_data (module fn)
├── fy_summaries.py      # FYSummariesMixin: _calculate_fy_summaries,
│                        # _calculate_yoy_changes, _build_fy_summary_record,
│                        # _categorize_transaction_for_fy
├── anomalies.py         # AnomaliesMixin: _detect_anomalies,
│                        # _detect_high_expense_months, _detect_large_transactions,
│                        # _update_budget_tracking
└── engine.py            # AnalyticsEngine(AnalyticsEngineBase, *mixins):
                         #   run_full_analytics (orchestrator), _log_audit
```

### Execution order

1. Create `core/analytics/` package with `__init__.py` that simply does:
   ```python
   from .engine import AnalyticsEngine
   __all__ = ["AnalyticsEngine"]
   ```
2. Create `base.py` with `AnalyticsEngineBase` containing `__init__`, state, and all `@property` accessors. This is the shared state that every mixin uses (`self.db`, `self.user_id`, `self._preferences`).
3. For each mixin file: create a `class XxxMixin:` that contains the listed methods, copied verbatim. They access `self.db`, `self.user_id`, and `self.*` properties — so they work unchanged.
4. Each mixin file needs its own SQLAlchemy/model imports (narrower than current file's blob import).
5. `engine.py` declares:
   ```python
   class AnalyticsEngine(
       AnalyticsEngineBase,
       ClassificationMixin,
       SummariesMixin,
       TrendsMixin,
       MerchantsMixin,
       RecurringMixin,
       NetWorthMixin,
       FYSummariesMixin,
       AnomaliesMixin,
   ):
       def run_full_analytics(self, source_file=None): ...
       def _log_audit(self, ...): ...
   ```
6. Replace old `core/analytics_engine.py` with a stub:
   ```python
   from ledger_sync.core.analytics import AnalyticsEngine
   __all__ = ["AnalyticsEngine"]
   ```
   (Or just delete it — consumers import from `core.analytics_engine` today; grep confirms 3 callers, all easy to update. But the stub is safer.)

### Verification checklist

- `uv run ruff check .`
- `uv run mypy src/` — mypy is strict about mixin protocols. You may need `from __future__ import annotations` + TYPE_CHECKING blocks importing `AnalyticsEngineBase` as the expected `self` type. If mypy complains, the fix is declaring each mixin as `class XxxMixin(AnalyticsEngineBase):` — but **do not let Python actually inherit from Base twice**, so that's only for typing. Use a Protocol pattern if needed.
- `uv run pytest tests/ -v`
- Run the app locally, trigger `POST /api/analytics/v2/refresh`, confirm no regressions.

### Risks

- **Mixin + mypy friction.** The protocol trick above is the usual fix. Worst case, merge two mixins that share private state.
- **Module-level helpers** at `analytics_engine.py:77` (`_group_txns_by_pattern`), `:93` (`_resolve_pattern_display`), `:124` (`_aggregate_holdings_data`) — move them into the mixin file that uses them, as module-private functions.
- **Circular imports.** Mixins import from `db.models` and `db.session` only — no cross-mixin imports. Safe.

---

## 5 — Four large React pages → component + hook extraction

Pattern for all four: a monolithic page component doing data fetching, computation, and rendering. Extract into:

```
pages/<page-name>/
├── index.ts              # re-export the default (PER CLAUDE.MD: avoid — see note below)
├── <PageName>Page.tsx    # thin orchestrator, <200 lines
├── use<PageName>.ts      # custom hook: all useQuery + useMemo logic
├── components/
│   └── <SubComponent>.tsx  # each sub-render in its own file
└── utils.ts              # pure functions (getDaysInMonth, etc.)
```

**⚠ Barrel file note:** CLAUDE.md forbids `index.ts` re-exports. The project already has ~17 of them so the rule is soft, but do this properly: keep the router's lazy import pointing at `pages/<name>/<PageName>Page.tsx` directly. No index.ts.

### 5a. `TaxPlanningPage.tsx` (1,090 lines)

Already has 11 internal functions/components. Split into:

```
pages/tax-planning/
├── TaxPlanningPage.tsx            # ~150 lines — orchestrator + layout
├── useTaxPlanning.ts              # ~250 lines — data hook: groupTransactionsByFY,
│                                  #   classifyAndAccumulateIncome, computePaidTax,
│                                  #   computeProjectedTax, buildYearlyTaxData,
│                                  #   resolveSelectedRegime, computeTaxForFY
├── taxPlanningUtils.ts            # ~100 lines — calculateBreakEvenDeduction,
│                                  #   computePrevFYDisplay, createEmptyFYData
├── types.ts                       # TaxRegimeOverride, YearlyTaxDatum,
│                                  #   IncomeGroupAccumulator, FYData
├── components/
│   ├── TaxPageActions.tsx         # ~100 lines (line 302)
│   ├── TaxTip.tsx                 # ~20 lines (line 805)
│   ├── RegimeVerdictDetail.tsx    # ~50 lines (line 838)
│   ├── RegimeComparison.tsx       # ~110 lines (line 884)
│   ├── DeductionInput.tsx         # ~30 lines (line 993)
│   └── MultiYearProjectionTable.tsx  # ~75 lines (line 1018)
```

### 5b. `BillCalendarPage.tsx` (799 lines)

Already decomposed into 20+ helpers and 4 sub-components — just needs moving into files:

```
pages/bill-calendar/
├── BillCalendarPage.tsx           # ~200 lines — main page (line 449+)
├── useBillCalendar.ts             # ~150 lines — buildBillMap, findFirstBillFromDay,
│                                  #   findNextUpcomingBill, state, navigation
├── billUtils.ts                   # ~250 lines — getDaysInMonth, getFirstDayOfWeek,
│                                  #   formatMonthYear, formatShortDate, isSameDay,
│                                  #   clampDay, capitalize, getCategoryColor,
│                                  #   getRecurringDaysInMonth, getWeeklyDays,
│                                  #   getMonthlyDays, getQuarterlyDays,
│                                  #   getYearlyDays, getFortnightlyDays,
│                                  #   getBillDaysForMonth, getBillDotColor
├── types.ts                       # PlacedBill, constants (DAY_NAMES, CATEGORY_COLORS)
└── components/
    ├── SummaryCard.tsx            # line 241
    ├── SourceBadge.tsx            # line 280
    ├── BillDetailItem.tsx         # line 293
    └── DayCell.tsx                # line 331
```

**Tests:** `billUtils.ts` is a goldmine of pure functions — add `__tests__/billUtils.test.ts` covering `getRecurringDaysInMonth` (the frequency branches are the highest-risk logic).

### 5c. `TrendsForecastsPage.tsx` (775 lines)

Most bulk is in the page body itself. Needs a genuine extract, not just code-move.

```
pages/trends-forecasts/
├── TrendsForecastsPage.tsx        # ~250 lines — orchestration + layout
├── useTrendsForecasts.ts          # ~300 lines — all useQuery/useMemo from page body,
│                                  #   forecast computations
├── trendsUtils.ts                 # getDirectionIcon, formatTooltipName, ariaSort
├── types.ts                       # TrendMetrics, TrendCardProps, MonthlyBreakdownTableProps
└── components/
    ├── TrendCard.tsx              # line 69
    └── MonthlyBreakdownTable.tsx  # line 157 (already ~100 lines — keep intact)
```

### 5d. `YearInReviewPage.tsx` (757 lines)

```
pages/year-in-review/
├── YearInReviewPage.tsx           # ~200 lines
├── useYearInReview.ts             # ~250 lines — aggregateDayTotals,
│                                  #   aggregateFromDailySummaries, buildDayCells,
│                                  #   accumulateStats, deriveMonthLabels
├── heatmapUtils.ts                # getIntensityLevel, getMonthlyValue, getMonthlyMax,
│                                  #   getStreakColor, getStreakDotColor + color maps
├── types.ts                       # HeatmapMode, DayCell, constants
└── components/
    ├── MobileMonthlySummary.tsx   # line 115
    ├── HeatmapCell.tsx            # line 294
    ├── HeatmapWeeks.tsx           # line 314
    └── HeatmapDayDetail.tsx       # line 335
    (InsightRow.tsx and StatCard.tsx already exist in pages/year-in-review/ —
     keep them)
```

### Execution order for each page

1. Create the new directory.
2. Move pure utilities first (`*Utils.ts`) — zero dependencies on React.
3. Move `types.ts`.
4. Extract sub-components (each one: cut from page, paste into new file, fix imports, add `export`).
5. Extract the hook — move `useState`/`useMemo`/`useQuery` blocks into `use<Name>.ts` and return a single `{data, handlers}` object. This is the trickiest step; do it last and carefully, component-by-component.
6. Update the lazy import in the router (`App.tsx` or `main.tsx`) to point at `pages/<name>/<PageName>Page.tsx`. Delete the old flat file.
7. `pnpm run type-check && pnpm run lint && pnpm test`.

### Risks

- **State closure bugs** when pulling `useState` into a custom hook — callbacks that were defined inline may capture different variables. Extract handlers explicitly and return them.
- **Recharts re-renders** can regress if memoization boundaries change. Profile with React DevTools if a chart feels sluggish after the split.
- **Router lazy import path must match**. `App.tsx` has `const TaxPlanningPage = lazy(() => import('./pages/TaxPlanningPage'))` → change to `'./pages/tax-planning/TaxPlanningPage'`.

---

## Suggested order & timing

| Step | What | Verify with | Est. |
|---|---|---|---|
| 1 | #7 models.py split | `alembic check`, `pytest`, `mypy` | 45 min |
| 2 | #3 analytics_engine split | `pytest`, `mypy`, manual `/analytics/v2/refresh` | 90 min |
| 3 | #5a TaxPlanningPage | `pnpm run check` | 60 min |
| 4 | #5b BillCalendarPage (+ tests) | `pnpm run check` + new unit tests | 75 min |
| 5 | #5c TrendsForecastsPage | `pnpm run check` | 60 min |
| 6 | #5d YearInReviewPage | `pnpm run check` | 45 min |

Each step is independently mergeable — 6 PRs, not one. Smaller diffs = easier code review and bisect if something breaks.

## Rollback plan

Each step is a single `git revert` away from clean because nothing renames *public* symbols. If #3 causes a production analytics regression, reverting that commit restores the monolithic `analytics_engine.py` with zero consumer changes.
