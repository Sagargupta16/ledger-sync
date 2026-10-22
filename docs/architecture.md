# System Architecture

Architecture reference for the current Ledger Sync source.

Source walkthrough updated on 2026-09-16. The local Graphify graph is a
navigation aid; the application entry points, routes, services, stores, models,
and workflows define the contracts below.

Every figure on this page is drawn with orrery from a YAML spec in
[diagrams/](diagrams/README.md) whose nodes and edges cite the file and line
they come from (`orrery verify` checks them). Each renders in light and dark
themes and has an editable draw.io copy.

## System Overview

Ledger Sync is a static React workspace backed by a FastAPI JSON API and a
user-scoped relational ledger.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="diagrams/system-overview-dark.svg">
  <img alt="Ledger Sync PWA on GitHub Pages calls FastAPI on Vercel, Neon, OAuth, market data and AI APIs" src="diagrams/system-overview-light.svg" width="100%">
</picture>

Local development uses the same frontend and backend with SQLite and a Vite
proxy. The browser and API can run on different origins: API requests use bearer
tokens and an explicit CORS allowlist, while OAuth initiation does not depend
on third-party cookies.

## Repository Layout

```text
ledger-sync/
  frontend/                   React and TypeScript SPA
  backend/                    Python and FastAPI service
  docs/                       Maintained references and dated records
  .github/workflows/          CI, deploy, migration, and (disabled) keepalive workflows
  package.json                Root orchestration scripts
```

## Backend Architecture

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="diagrams/backend-layers-dark.svg">
  <img alt="FastAPI backend layers: routers, services, core, ingest and ORM down to Neon" src="diagrams/backend-layers-light.svg" width="100%">
</picture>

### API layer

Location: `backend/src/ledger_sync/api/`

Responsibilities:

- HTTP request and response contracts
- Authentication dependencies
- User-scoped query boundaries
- Rate limits
- External service proxies
- Error and status mapping

`main.py` creates the FastAPI app, shared `httpx` client, middleware, exception
handlers, health checks, and router registration.

The registered routers cover:

- Authentication and OAuth
- Upload and transactions
- Tags, rules, and saved views
- Analytics and calculations
- Preferences and classifications
- Goals
- Currency, instrument, and stock rates
- AI chat, tools, and usage

See [API.md](API.md) for the complete inventory.

### Business logic

Location: `backend/src/ledger_sync/core/`

Key modules:

| Module | Responsibility |
| --- | --- |
| `sync_engine.py` | Coordinates row or CLI-file imports |
| `reconciler.py` | User-scoped upsert, restore, and soft-delete behavior |
| `reconciler_transfers.py` | Transfer-pair normalization and reconciliation |
| `calculator.py` | Pure on-demand financial metrics |
| [ledger_math.py](../backend/src/ledger_sync/core/ledger_math.py) | Shared `Decimal` account balances and signed transfers across the investment boundary; callers own authorization and exclusions |
| `query_helpers.py` | Database-agnostic SQL and shared filters |
| `time_filter.py` | `TimeRange` options; `api/analytics_helpers.py` resolves them on the IST ledger clock |
| `ledger_clock.py` | Single source of naive IST `now`, `today`, month, and financial-year boundaries |
| `expense_class.py` | Realised-capital-loss taxonomy that keeps trading losses out of consumption totals |
| `rules.py` | Categorization rule matching |
| `encryption.py` | AES-256-GCM BYOK key encryption and legacy migration |
| `auth/` | JWT creation, decoding, and token-version verification |

Analytics implementation lives under `core/analytics/` as domain mixins:

```text
base.py
classification.py
summaries.py
trends.py
merchants.py
recurring.py
net_worth.py
fy_summaries.py
anomalies.py
cohort.py
engine.py
```

`merchant_extract.py` sits alongside them as a pure helper rather than a mixin.
It owns merchant label extraction: brands are matched with an ambiguity guard,
and a miss keeps the whole normalized note as a descriptor instead of the first
word, so nothing is dropped and unrelated purchases are not over-merged.

`core/analytics_engine.py` is a backwards-compatible facade that re-exports
the composed `AnalyticsEngine`. New analytics behavior belongs in the domain
package, not in the facade.

### Data access

Location: `backend/src/ledger_sync/db/`

- `base.py` owns the declarative base.
- `session.py` owns the engine and request-session lifecycle.
- `_models/` groups SQLAlchemy models by domain.
- `models.py` re-exports the public model surface.
- `migrations/versions/` contains the Alembic history.

The model metadata includes the ledger, derived analytics, preferences, goals,
OAuth audit records, and AI usage reservations. Hosted deployments use Neon
PostgreSQL; SQLite remains the default local and unit-test backend. Native
PostgreSQL verifies dialect-specific migrations and constraints.

Every user-owned query includes `user_id`. Current model foreign keys use
database cascades for account deletion, but authorization remains an explicit
query concern.

The chain is linear; `uv run alembic heads` reports the current head (the
September 2026 ledger and domain-storage revisions follow the two described
here). `identity_constraints_2026` follows `ai_usage_reservations_2026`. The
reservation revision extends existing AI
usage rows with funding, status, and reserved-token fields. The identity
revision closes uniqueness/constraint gaps, rejects conflicting identities or
invalid positive amounts before changing data, and removes obsolete global
uniqueness. It does not merge users or rewrite financial values. Goal editing
uses the existing goal model without a new goal migration.

Historical transfer consolidation preserves unmatched incoming legs and
ambiguous groups, collapsing only a matching pair. Unsupported downgrades
are rejected before any schema or version mutation, including consolidation
whose original legs and account links cannot be reconstructed. Historical
PostgreSQL setup also handles both existing enums and legacy VARCHAR columns.

### Schemas and services

Location:

```text
backend/src/ledger_sync/schemas/
backend/src/ledger_sync/services/
```

Pydantic models validate wire contracts. Services contain cross-router
workflows such as OAuth user creation, token refresh, account reset, and
account deletion.

### Ingestion

Location: `backend/src/ledger_sync/ingest/`

The web and CLI paths share normalization and hashing but enter differently:

- Web import parses files in the browser and calls `SyncEngine.import_rows`.
- CLI import reads a local file and calls `SyncEngine.import_file`.
- A Money Manager backup is read on the server by
  [money_manager.py](../backend/src/ledger_sync/ingest/money_manager.py) and
  also enters through `SyncEngine.import_rows`.

The web upload router does not pass the source file through an Excel loader.

## Backend Request Lifecycle

For an authenticated financial request:

```text
request
  -> CORS and timing middleware
  -> security and cache headers
  -> IP and optional user rate limits
  -> JWT decode
  -> token_version comparison against users table
  -> CurrentUser dependency
  -> request-scoped SQLAlchemy session
  -> user-scoped router or domain logic
  -> commit only when the session has changes
  -> JSON response
```

An exception rolls back the request session. Database operational errors become
HTTP 503. Unexpected errors return a correlation ID without a traceback.

## Upload and Analytics Flow

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="diagrams/statement-import-dark.svg">
  <img alt="Statement import flow: browser review, backend checks, reconcile, commit, analytics refresh" src="diagrams/statement-import-light.svg" width="100%">
</picture>

The version-2 source fingerprint uses canonical JSON encoding of user, date,
amount, account, note, source category/subcategory, type, explicit transfer
destination, currency, and duplicate occurrence. It is captured before user
categorization rules. Public transaction IDs remain stable through category
edits; legacy IDs are adopted only after verified matching. User-owned account
and category dimensions provide stable references while retaining source labels
on transaction rows.

The reconciliation sweep is user-wide, including accounts or dates omitted
from the replacement snapshot. Both transaction and transfer reconciliation
run even when one set is empty. Transfer legs become canonical transfer rows;
they are not income or consumption. The review requires an explicit full-ledger
acknowledgment, including on a forced reupload.

All rows are normalized and validated before reconciliation. Decimal INR
amounts are the supported ingestion contract; display-currency conversion is a
separate concern. The raw-file hash detects repeated files, while row hashes
preserve legitimate duplicate occurrences and idempotence. PostgreSQL
serializes concurrent imports for a user with a user-row lock.

`SyncEngine` commits ledger changes, the import log, and analytics invalidation
together or rolls all of them back. Upload orchestration lives in
`services/upload_service.py`; serialization and synchronous database work run in
one worker phase. It then refreshes analytics separately and reports its status.
A failed analytics refresh leaves the saved ledger intact. The frontend offers
an analytics-only retry instead of a second import. An upload timeout can occur
after persistence, so recovery first directs the user to import history.

### Money Manager backups

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="diagrams/money-manager-import-dark.svg">
  <img alt="Money Manager .mmbak import: iPhone Shortcut or browser dry run, backend checks, reconcile, commit" src="diagrams/money-manager-import-light.svg" width="100%">
</picture>

A `.mmbak` backup is Money Manager's Core Data SQLite store. The browser gzips
it, because Vercel refuses request bodies over 4.5 MB, and posts the bytes to
`POST /api/upload/money-manager`. The server unpacks gzip or zip within a 64 MB
cap and loads the store into an in-memory connection: query-only, defensive,
untrusted schema off, and a 10-second query deadline. It checks the store's
integrity and tables, then reads live transactions, accounts and categories
into the same upload rows a spreadsheet produces, plus each row's UID and
timestamps. From there the rows take the snapshot path above, with three
differences:

- Identity resolves the source UID first
  ([source_identity.py](../backend/src/ledger_sync/core/source_identity.py)),
  so edits update rows in place.
- `dry_run=true` reconciles and rolls back to produce the review.
- Without a reviewed confirmation, a snapshot that would soft-delete more than
  max(25, 5% of live rows) rolls back with 409.

[money_manager_import.py](../backend/src/ledger_sync/services/money_manager_import.py)
adds the backup's account settings to the same commit and reports an
already-imported store as `unchanged`.

The same route accepts an upload token instead of a session.
[upload_tokens.py](../backend/src/ledger_sync/services/upload_tokens.py) stores
only token hashes. `get_upload_principal` in `api/deps.py` resolves a token to
its user for this one route, and token uploads never preview or lift the guard.
An iOS Shortcut can therefore sync the newest backup without OAuth; the steps
are in the [Handbook](HANDBOOK.md#automatic-sync-with-an-ios-shortcut).

### Analytics and calculation boundaries

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="diagrams/analytics-boundaries-dark.svg">
  <img alt="Ledger Sync data sources: rollup tables, on-demand SQL, full ledger and browser lib/finance" src="diagrams/analytics-boundaries-light.svg" width="100%">
</picture>

The composed engine uses durable ledger, preference, and algorithm versions.
An unchanged generation on the same IST day skips recomputation. Dirty dates
limit daily/monthly summary writes, including the following month's comparison
values; other domains still rebuild from one shared active-transaction load.
Unknown scope and changed preferences request a full rebuild.

Writers and refreshes serialize on the user's database row. Refresh takes that
lock before loading inputs, guards the publication version, and commits derived
rows, publication metadata, and the analytics audit together. Multi-query
analytics reads share a reader lock on PostgreSQL to avoid crossing publications.
A refresh failure rolls back that work,
independently of the preceding import commit. Data Health exposes coverage and
rollup freshness.

Read endpoints use persisted aggregates or user-scoped SQL for the requested
period. `ledger_math.py` provides reusable balance and investment-boundary
arithmetic underneath backend callers; it does not decide user scope. Frontend
domain modules own preference-sensitive tax, scenario, and projection models.
Imported cash flows and book-value holdings do not establish a live market
valuation or an actual investment return by themselves.

The [developer calculation map](CALCULATIONS.md#developer-calculation-map)
identifies the current backend and frontend owners, monetary/date conventions,
rate sources, and focused checks. Reuse those owners when adding a page;
chart components receive computed values rather than duplicating business
formulas.

### Shared finance composition

Share one implementation per financial rule, with small modules by domain.
The common directory is not a single calculator that fetches data, reads every
preference, and renders charts.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="diagrams/finance-composition-dark.svg">
  <img alt="Page hooks calling lib/finance modules, with metricRules.ts kept in step with metric_rules.py" src="diagrams/finance-composition-light.svg" width="100%">
</picture>

| Change needed | Canonical source to edit | Composition boundary |
| --- | --- | --- |
| Investment funding or account legs | [investmentFlows.ts](../frontend/src/lib/finance/investmentFlows.ts) | Exact configured membership or a caller-supplied predicate; internal moves cancel at the investment boundary. |
| Recorded investment return classification | [investmentReturns.ts](../frontend/src/lib/finance/investmentReturns.ts) | One category per event; the returns page adapter formats the shared metrics. |
| SIP compounding or modeled history | [sipProjection.ts](../frontend/src/lib/finance/sipProjection.ts) | One forward monthly loop; separate proportional historical estimate and contribution benchmark. Page adapters preserve seeds, labels, and rounding. |
| Goal savings, completion, or funding pace | [goalProjection.ts](../frontend/src/lib/finance/goalProjection.ts) | Pure requirements/status/pace; goal helpers add labels and theme colors. |
| Asset/liability totals, calendar growth, or milestones | [netWorth.ts](../frontend/src/lib/finance/netWorth.ts) | Carried balance levels, first attainment/recovery/ETA, and the separately labeled cumulative cash-flow model. Milestone names and visible-row caps stay in the adapter. |
| Cash-flow projection | [cashFlowForecast.ts](../frontend/src/lib/finance/cashFlowForecast.ts) | Preserve recorded API net savings; project consumption surplus before future capital losses. |
| Dashboard month comparisons | [dashboardMetrics.ts](../frontend/src/lib/finance/dashboardMetrics.ts) | Complete-month API comparisons and savings-rate percentage-point change. |
| Spending-rule flags or calendar-month means/medians | [spending.ts](../frontend/src/lib/finance/spending.ts) | Shared rule surplus, configured targets/tolerance, calendar spine, and zero-month statistics. |
| Burn rates or typical day/month/weekday | [spendingStatistics.ts](../frontend/src/lib/finance/spendingStatistics.ts) | Inclusive days, fractional calendar months, active spending days, and completed-month medians remain separate policies. |
| Card outstanding, utilization, and coverage | [creditCardUtilization.ts](../frontend/src/lib/finance/creditCardUtilization.ts) | Signed API balances become nonnegative debt; prepaid assets contribute zero. Known limits define the measured numerator/denominator. |
| Tax basis, combined annual tax, or regime comparison | [taxPlanning.ts](../frontend/src/lib/finance/taxPlanning.ts) | Employment eligibility, gross/net reconstruction with known deductions, and annual employment plus the selected FY's other taxable income once. |
| FY grouping, tax history, or residual withholding | [taxHistory.ts](../frontend/src/lib/finance/taxHistory.ts) | Explicit salary preferences, recorded-income liability, annual comparisons, and `reconcileTaxWithholding` for IncomeExpenseFlow; legacy `paidTax` is not proof of payment. |
| Dated payroll and tax display composition | [payrollPlanning.ts](../frontend/src/lib/finance/payrollPlanning.ts) | `buildSalaryPayroll` supplies monthly settlement and annual cash sums with closing share credit. Combined annual tax and employment-only payroll cash keep separate scopes. |
| Hypothetical effective tax curve | [taxRateCurve.ts](../frontend/src/lib/finance/taxRateCurve.ts) | Same FY, employment eligibility, and tax engine as the planning model; pre-2020 curves display the old regime only. |
| Vest quantities, price basis, withholding | [rsuVesting.ts](../frontend/src/lib/rsuVesting.ts) | Canonical valued events shared by Settings, annual projections, and TDS. |
| Cash/share settlement and salary growth | [salaryCompensation.ts](../frontend/src/lib/salaryCompensation.ts), [projectionCalculator.ts](../frontend/src/lib/projectionCalculator.ts), [tdsScheduleCalculator.ts](../frontend/src/lib/tdsScheduleCalculator.ts) | Monthly settlement primitive, growth inputs, and TDS schedule compose through `buildSalaryPayroll`; derived projections carry `fyStartMonth`. |
| Recurring amounts, income coverage, and review status | [recurringCalculations.ts](../frontend/src/lib/recurringCalculations.ts), [recurrenceFrequency.ts](../frontend/src/lib/recurrenceFrequency.ts) | Shared recent positive-income median/coverage, cadence/annualization, explicit as-of date, and all active commitments retained in totals. |
| Median or concentration threshold | [distribution.ts](../frontend/src/lib/distribution.ts) | `medianOf` and `cumulativeShareCutoff`; callers retain row order/identity and the chart's Other cap. |
| Financial-health inputs and liquid-assets proxy | [financialHealthCalculator.ts](../frontend/src/lib/financialHealthCalculator.ts), [healthScoreAnalysis.ts](../frontend/src/components/analytics/health/healthScoreAnalysis.ts) | Summary/detail share `cfpInputsFromAnalysis`; `liquidAssetsFromFlows` is used only without observed balances. FHN and CFP remain separate. |
| Instrument or FIRE assumptions | [instrumentCalculators.ts](../frontend/src/lib/instrumentCalculators.ts), [fireCalculator.ts](../frontend/src/lib/fireCalculator.ts) | One NPS weighted-return kernel, EPF split/minimum, and FIRE input annualization/60% essentials assumption; no generic merged projection engine. |
| GST or dated investment return | [gstCalculator.ts](../frontend/src/lib/gstCalculator.ts), [xirr.ts](../frontend/src/lib/xirr.ts) | Existing global owners stay in place; adapters supply inputs rather than relocating solvers for naming consistency. |

`taxPlanningUtils.ts` re-exports tax planning and history functions.
`returnsAnalysisUtils.ts`, `netWorthUtils.ts`, `netWorthProjection.ts`,
`cashFlowUtils.ts`, SIP `projectionUtils.ts`, goal `helpers.ts`,
`spendingAnalysisUtils.ts`, `quickInsightsData.ts`, and `dayOfWeekUtils.ts`
retain compatibility and presentation work. Put a correction
in the canonical module and test a consumer; do not create a second formula in
an adapter.

The contracts that presentation must preserve are:

- Ledger money is INR major units with positive transaction magnitudes and
  signed derived balances. Domain investment net contributions are positive
  for funding; monthly API net investment flow is negative for funding; FY
  investments made counts gross external contributions.
- Credit-card outstanding is `max(0, -signedBalance)`: positive prepaid assets
  contribute zero debt/utilization, without offsetting another card's debt.
  Missing/zero limits and unavailable balances do not acquire invented ratios.
- Recorded net savings includes known capital losses. The forecast keeps
  that history while projecting consumption surplus before future losses.
  Net-worth growth counts actual calendar intervals, including inactive
  months, and distinguishes account balances from cash-flow history.
- Spending calendar averages include interior zero months; burn rates use
  inclusive days and fractional calendar-month coverage; typical spending days
  count active days; completed-month medians exclude the current month even on
  its last day. Recurring coverage instead uses the latest twelve usable
  positive-income months. Do not unify those denominators.
- Tax rules are FY-versioned. Business-only income gets no salary standard
  deduction. Gross receipts do not establish tax paid; net-of-TDS reconstruction
  applies only to classified employment, restoring explicit known cash deductions
  first. Employee EPF reduces cash, not new-regime taxable income. Pre-2020 rate
  charts expose only the available old regime.
- Combined annual tax uses the greater of recorded and projected employment
  gross plus the selected FY's other recorded taxable income once. Cards,
  annual charts, and regime comparisons share that scope. The dated salary
  schedule and cash take-home remain employment-only.
- Gross RSU units remain the tax basis. Missing actual received units use
  30% tax plus 4% cess on tax: 25 - 7.5 - 0.3 = 17.2 estimated received shares.
  Entered units, including zero, override that estimate. Cash take-home and
  retained share value remain separate. Missing `bonus_mode` preserves the
  legacy zero-growth one-time bonus choice.
- `buildSalaryPayroll` derives annual cash from the dated monthly schedule and
  retains the final month's excess share credit separately. Late share
  withholding does not retroactively refund earlier cash TDS. All classified
  RSU ledger receipts in the FY are excluded from cash inference regardless of
  settlement month; no vest-month matching or broker reconciliation is claimed.
- SIP summary and chart adapters preserve their distinct initial value/cost
  bases and rounding. Allocated historical SIP values are estimates. Goal and
  milestone ETAs share calendar-month/fractional-day stepping, with presentation
  outside the math domains.
- Estimate and freshness flags travel with values. Active recurring items
  needing review remain in totals; a gap is not cancellation. Stale analytics
  and missing payroll observations are not made trustworthy by a chart.

RSU prices still use the legacy display-currency field convention. The shared
valuation helpers multiply supplied prices without migrating stored values or
establishing a new currency contract. Payroll inference, recorded book values,
and illustrative forecast bands retain their limitations, detailed in
[Calculations](CALCULATIONS.md#trust-and-compatibility).

## Frontend Architecture

Location: `frontend/src/`

```text
App.tsx
pages/
components/
hooks/
services/api/
store/
lib/
constants/
types/
```

### Routing and loading

`App.tsx` defines 29 routed page components:

- 3 public routes
- 26 protected workspace pages
- 4 eager page components
- 25 lazy page components

Eager components:

- Home
- Dashboard
- Demo Entry
- OAuth Callback

The remaining pages use `React.lazy`. After authentication initializes, route
intent through pointer, keyboard focus, or touch can prefetch the matching
internal page module. Startup no longer eagerly imports every page. Production
Workbox installation still precaches static chunks for offline use, including
in anonymous sessions; runtime lazy loading does not promise zero asset
downloads.

`BrowserRouter` uses its supported `useTransitions={false}` option so requested
locations and pending feedback update promptly. `AppRoutes` separately defers
workspace route content while a lazy destination loads.
The committed page, header, and shell stay visible; the header announces
`Opening {pendingTitle}` with a thin progress treatment. Full motion animates
the treatment; the app's Reduced setting keeps it stationary. Public and
authentication routes render immediately. Initial loads still use the delayed
Suspense fallback when there is no committed workspace to retain.

The protected route wraps an identity-keyed `AppLayout`. Its captured outlet
crossfades in synchronous mode, without a blank wait between pages. Outgoing
frames become `inert` and `aria-hidden`. Search-only location changes update
the route without a pathname remount; logout/account changes discard the old
workspace. The header and currency atmosphere live outside the route frame.
`/home` is a compatibility redirect to `/dashboard`.

See [PAGES.md](PAGES.md) for every route and data source.

### Page layer

Simple pages can remain a single file. Larger pages use:

```text
pages/<feature>/
  <Feature>Page.tsx
  use<Feature>.ts
  types.ts
  <feature>Utils.ts
  components/
```

Page orchestrators own composition. Data shaping belongs in hooks and pure
utilities. Repeated visual patterns belong in shared components.

### Component layer

| Directory | Responsibility |
| --- | --- |
| `components/layout/` | Sidebar, mobile navigation, and workspace header |
| `components/ui/` | Buttons, cards, inputs, tables, chart helpers, and page primitives |
| `components/charts/` | The in-house animated SVG chart kit |
| `components/shared/` | Cross-feature states, authentication UI, command palette, and preferences |
| `components/analytics/` | Reusable financial visualizations |
| `components/transactions/` | Ledger filters, table, tags, pagination, and saved views |
| `components/chat/` | AI panel, messages, and orchestration |

The upload drop zone, review, feedback, and import history are page-local under
`pages/upload-sync/components/`.

[PageContainer](../frontend/src/components/ui/PageContainer.tsx) and
[PageHeader](../frontend/src/components/ui/PageHeader.tsx) define page-level
structure. [Card](../frontend/src/components/ui/Card.tsx) supplies the common
surface; [MetricCard](../frontend/src/components/shared/MetricCard.tsx) and
[SummaryCard](../frontend/src/components/shared/SummaryCard.tsx) present supplied
headline values. Shared tokens in [index.css](../frontend/src/index.css) control
theme, density, borders, chart colors, focus states, and responsive behavior.

### Shared chart composition

Every chart is drawn by the in-house SVG kit in
[components/charts](../frontend/src/components/charts/) and animated with
Motion; the kit replaced Recharts in 2.30.0. Feature components pass prepared
rows, series metadata, formatters, and drilldown callbacks to
[StandardAreaChart](../frontend/src/components/analytics/StandardAreaChart.tsx),
[StandardBarChart](../frontend/src/components/analytics/StandardBarChart.tsx),
[StandardPieChart](../frontend/src/components/analytics/StandardPieChart.tsx),
[StandardRadarChart](../frontend/src/components/analytics/StandardRadarChart.tsx),
and [TimeSeriesLineChart](../frontend/src/components/analytics/TimeSeriesLineChart.tsx),
or compose the kit directly when a chart needs its own marks:

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="diagrams/chart-kit-dark.svg">
  <img alt="Pages and wrappers render Cartesian, Pie, Radar, Treemap, Sankey, Slope charts, all in ChartFrame on Motion" src="diagrams/chart-kit-light.svg" width="100%">
</picture>

| Kit source | Responsibility |
| --- | --- |
| [ChartFrame](../frontend/src/components/charts/ChartFrame.tsx) | Root of every chart. Measures its box, names the plot with `ariaLabel` as one `role="img"`, and starts the entrance once a fifth of it is in view. Below 640 px, `mobileHeight` wins; otherwise heights above 280 px are capped. Printing and Reduced motion draw final geometry. |
| [CartesianChart](../frontend/src/components/charts/CartesianChart.tsx) | Category and value scales (with an optional right axis), diverging stacks, the plot-only `visibleRange` zoom, and the hovered or arrow-key row, shared with its children through context. |
| [Bars](../frontend/src/components/charts/Bars.tsx), [LineSeries](../frontend/src/components/charts/LineSeries.tsx), [AreaSeries](../frontend/src/components/charts/AreaSeries.tsx) | Marks. Bars grow out of the zero line, lines draw in left to right, and fills wipe in behind them; new data morphs the geometry instead of replaying the entrance. |
| [Axis](../frontend/src/components/charts/Axis.tsx), [Grid](../frontend/src/components/charts/Grid.tsx) | Axes and grid lines; their ticks glide to the new scale when a filter or range changes. |
| [References](../frontend/src/components/charts/References.tsx) | `ReferenceLine`, `ReferenceArea`, and `ReferenceDot` for peak, average, target, goal, and zero marks. They enter after the series. |
| [CartesianTooltip](../frontend/src/components/charts/CartesianTooltip.tsx), [Crosshair](../frontend/src/components/charts/Crosshair.tsx) | HTML tooltip and cursor that glide between rows. On phones the tooltip pins to the top of the frame; arrow-key readings go to a polite live region. |
| [ChartBrush](../frontend/src/components/charts/ChartBrush.tsx) | Drag-to-zoom range strip under a chart. Changes go through `useChartRange`, so tables keep every row. |
| [PieChart](../frontend/src/components/charts/PieChart.tsx), [RadarChart](../frontend/src/components/charts/RadarChart.tsx), [SankeyDiagram](../frontend/src/components/charts/SankeyDiagram.tsx) | Roots of their own on ChartFrame. Slices sweep open from 12 o'clock, radar series grow out of the centre, and Sankey ribbons sweep in, with drill-downs gliding between views. |
| [Treemap](../frontend/src/components/charts/Treemap.tsx), [treemapLayout](../frontend/src/components/charts/treemapLayout.ts) | Squarified two-level treemap (category, then subcategory). A category zooms in as one motion with a breadcrumb back out; labels show what fits. |
| [SlopeChart](../frontend/src/components/charts/SlopeChart.tsx), [slopeLayout](../frontend/src/components/charts/slopeLayout.ts) | Two periods on one value scale, one line per item, with rank moves. Overlapping labels spread apart with hairline leaders. |
| [chartMotion](../frontend/src/components/charts/chartMotion.ts) | Durations, easing, and stagger for every mark, so all charts move alike. |

Presentation helpers in `components/ui/` sit around the plots:

| Shared source | Responsibility |
| --- | --- |
| [ChartSeriesLegend](../frontend/src/components/ui/ChartSeriesLegend.tsx) | HTML series names outside the plot, with optional latest values and a caption. |
| [PieChartLedger](../frontend/src/components/ui/PieChartLedger.tsx) | Ranked amount/share rows, coordinated slice hover/focus, and native buttons for category drilldown. |
| [useChartPresentation](../frontend/src/components/ui/useChartPresentation.ts) | Live viewport, theme, and motion subscriptions for the HTML beside a pie; returns `isMobile`, `theme`, and `animate`. |
| [ChartSection](../frontend/src/components/ui/ChartSection.tsx) | Panel shell for a full-width custom chart section: scroll-in reveal, eyebrow/title/description header labeled by `titleId`, and an optional header control. |
| [TooltipValueList](../frontend/src/components/ui/TooltipValueList.tsx) | Color-keyed label and currency rows for a custom chart tooltip. |

Financial definitions remain in the named finance domains, shared helpers,
and backend calculations. For example,
[useDashboardMetrics](../frontend/src/hooks/useDashboardMetrics.ts) composes
[dashboardMetrics](../frontend/src/lib/finance/dashboardMetrics.ts) for
complete-month comparisons before supplying chart rows;
[useAnalytics](../frontend/src/hooks/api/useAnalytics.ts) accesses the typed
[calculation service](../frontend/src/services/api/calculations.ts). Shared chart
primitives do not fetch ledger data or own financial preferences.
[chartDefaults](../frontend/src/components/ui/chartDefaults.tsx) keeps the bar
corner radius and the currency tooltip formatter; axis, grid, reference, and
brush styling live in the kit's own marks.

The pie adapter uses [pieSlices](../frontend/src/components/ui/pieSlices.ts) to
drop non-positive values and cap wedges at seven by default. The tail becomes
an exact-sum `Other (N categories)` slice. Wedges, the visible ledger, and the
accessible table share these grouped rows. `sliceClickTarget` prevents the
synthetic Other slice from becoming a category filter.

#### Accessible table contract

[chartDataTable](../frontend/src/components/ui/chartDataTable.tsx) renders a
visually hidden table with a caption, `<th scope="col">` headers, and one
`rowHeader: true` column rendered as `<th scope="row">`. Area, bar, line, and
radar fallbacks retain every supplied row; the pie fallback mirrors its grouped
slices with amount and share columns.

Pass `ariaLabel` to the chart adapter so `ChartFrame` names only the visual
plot with `role="img"`. The table must be a sibling of the visual chart branch,
outside that image subtree. The pie adapter places it after the plot/ledger
grid. Neither `ChartFrame` nor a caller-supplied `role="img"` wrapper may
enclose the table: ARIA makes image descendants presentational. A visible
legend or tooltip does not replace this table. jsdom does not model that ARIA
behavior, so finding a table in a unit test alone does not prove it is exposed
to assistive technology.

#### Live appearance and range state

[themeStore](../frontend/src/store/themeStore.ts) applies the Light or Dark
theme through [theme.ts](../frontend/src/lib/theme.ts). Kit chrome (grid,
axes, cursor, tooltip) paints with the `--chart-*` CSS variables, so a theme
change repaints it without a remount. Series colors are resolved strings from
[colors.ts](../frontend/src/constants/colors.ts) and
[chartColors.ts](../frontend/src/constants/chartColors.ts), which theme.ts
refreshes in place; callers read them through
[usePaletteSnapshot](../frontend/src/hooks/usePaletteSnapshot.ts), which
re-renders them on a toggle.

The existing [motionStore](../frontend/src/store/motionStore.ts) persists Full
or Reduced mode. `ChartFrame` animates only in Full mode, outside print, and
when the series is shorter than `CHART_ANIMATION_THRESHOLD`.
[App.tsx](../frontend/src/App.tsx) applies the same preference through
`MotionConfig`; shared tooltips and pie ledger rows honor it too. Motion
changes do not remount page state.

[MonthlyFlowChart](../frontend/src/components/analytics/MonthlyFlowChart.tsx)
keeps the complete selected-period dataset and owns the controlled
`StandardBarChart.brush` selection outside the plot. On mobile, more than six
months opens on the latest six, with range labels, earlier/later buttons, and
drag handles to reach all history. Desktop displays every supplied month.
The summary totals and accessible table always use the full dataset. A changed
data array resets the window to the latest months; appearance changes leave
that caller-owned selection intact. `StandardAreaChart.showBrush` also windows
the plot without slicing its input or accessible table.

### Server state

TanStack Query owns data fetched from the API.

Defaults:

- Infinite stale time
- One retry
- No refetch on window focus
- One-hour garbage-collection time

Mutations invalidate affected query keys. Upload invalidates ledger and
analytics data after the backend response. Browser HTTP caching is disabled for
API data, so TanStack Query is the only client cache.

### API client

`services/api/client.ts` creates the shared Axios instance.

It:

- Uses `API_BASE_URL` from the constants layer
- Attaches the current access token
- Serializes concurrent refresh attempts through one mutex
- Replays queued requests after refresh
- Rejects responses from an expired session and ends the session when refresh fails
- Intercepts demo-mode reads
- Blocks demo-mode mutations

Feature service modules expose typed API methods. Hooks under `hooks/api/`
compose those services with TanStack Query.

`services/api/auth.ts` uses a separate, credential-free OAuth client so sign-in
can run while demo mode is active and does not enter the authenticated refresh
queue. The new profile is fetched with the exchanged access token before the
new user and tokens are installed together.

### Session cleanup and startup

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="diagrams/session-lifecycle-dark.svg">
  <img alt="Session startup, sign-out and identity change; every exit ends in endSession" src="diagrams/session-lifecycle-light.svg" width="100%">
</picture>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="diagrams/token-refresh-dark.svg">
  <img alt="Token refresh: the first 401 refreshes once with one-use rotation; failures end the session" src="diagrams/token-refresh-light.svg" width="100%">
</picture>

`lib/session.ts` centralizes cancellation, query-cache clearing, and user-store
resets. Each boundary also advances a generation. Axios captures the signal
synchronously, and queued user mutations retain that generation in their keys
and their original signal. Mutation hooks capture the signal during render
and carry it through `onMutate` context. Generation keys prevent a rerendered
observer from replacing queued work with another session's options.
Dispatch and publication both check the session;
a late result cannot repopulate a different user's cache or tokens. Token
refresh within the same session keeps its generation. Identity changes remount
the authenticated layout so local page state is also discarded. Theme and
motion remain device preferences. A transaction-only reset keeps settings
stores, while a full reset clears them.

Startup data prefetch is limited to preferences, active recurring commitments,
and Data Health, and is skipped for demo mode. Full-ledger reads remain an
explicit page need.

Settings batches ordinary preferences, salary structure, RSU grants, and
growth assumptions into one preferences request. Classifications and rules
have separate writes. Save waits for those writes before final rehydration;
partial failure retains the draft for retry. This is not one database
transaction across every Settings section.

### Persisted goals and legacy recovery

Goal creation, editing, progress, allocations, and deletion use the existing
goal model through `CurrentUser`-scoped APIs and `goal_service`. Query keys
include the account or demo identity. Demo edits remain in page memory.

Older global browser keys are never applied automatically or mutated.
Authenticated, non-demo recovery compares recognized fields only with
positive goal IDs fetched for the current account. Users select fields and
confirm ownership; a hidden-goal choice requires separate deletion
confirmation. Goals with IDs 1-4 receive a possible-demo warning because an
old global key cannot establish account ownership.

Recovery refetches the goal before an action, rejects changed server or
browser values, and guards writes against session changes. Failed writes
keep the draft and original browser values. Separate per-account, per-goal,
per-field acknowledgment markers record the reviewed value after a confirmed
choice or successful write. The same value is not reoffered; a changed browser
value can be reviewed again. These markers do not erase the original data.
The preflight comparison does not add atomic server version preconditions
to the existing PATCH/DELETE APIs.

### Client state

Zustand stores:

| Store | Responsibility |
| --- | --- |
| `authStore` | Token persistence and current auth state |
| `preferencesStore` | Normalized user preferences |
| `accountStore` | Account metadata |
| `investmentAccountStore` | Local investment-account set |
| `budgetStore` | Budget client state |
| `demoStore` | Demo mode activation |
| `themeStore` | Light or dark mode plus the resolved theme; new users start from the OS preference |
| `motionStore` | Device-local Full or Reduced motion preference, applied without remounting page state |

Stores should not duplicate API server state without a specific persistence or
cross-page reason.

### Demo mode

Demo entry seeds generated transactions and analytics into the query cache.
The API interceptor returns computed demo responses for supported GETs and
rejects server mutations. Goal creation, editing, progress, and deletion have
an explicit page-local demo implementation, discarded when the page remounts.
The mode does not send the generated ledger to the backend. OAuth initiation
can still contact the backend to leave demo mode and sign in.

### Responsive shell

Desktop uses a grouped sidebar and global workspace header. Phone layouts use
a fixed bottom bar plus the complete More page. Shared page and table
primitives switch wide tabular data into readable card or stacked layouts
where appropriate.

The layout reserves fixed space for navigation and safe areas so the chat
widget, demo banner, mobile bar, and page content do not overlap.

## Authentication Flow

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="diagrams/oauth-sign-in-dark.sequence.svg">
  <img alt="OAuth PKCE sign-in in 16 steps across SPA, OAuth router, audit_logs, users and Google or GitHub" src="diagrams/oauth-sign-in-light.sequence.svg" width="100%">
</picture>

`GET /api/auth/oauth/providers?flow_version=2` reports configured providers
with a version 2 contract. A fresh
`POST /api/auth/oauth/{provider}/authorize` creates each attempt. The signed
state binds the provider, S256 challenge, expiry, and configured redirect URI.
The verifier stays in the initiating tab until the callback request. No
cross-origin cookie is needed.

The backend records attempts in `audit_logs` and atomically changes a pending
record to consumed before exchanging the code. This works across Vercel
instances and prevents replay even after a failed provider exchange. The
frontend separately consumes its `sessionStorage` attempt before sending the
callback. An expired attempt, wrong provider, different tab, cancellation, or
failed exchange requires a new sign-in attempt; the callback page offers
explicit recovery.

Unversioned provider requests from older clients receive the existing config
shape with a navigation-only `/api/auth/oauth/v2/{provider}/restart` URL and a
non-authenticating marker. The old URL builder therefore reaches the bridge
instead of starting an unbound provider flow. The bridge ignores supplied
redirect/code/state values and redirects to the configured frontend callback
with a restart flag and cache-busting nonce. The current callback then creates
a fresh verifier and state.

Callbacks without a verifier receive HTTP 409 and a readable refresh/sign-in
message before required-field validation. HEAD clients can display that
message and return home. A stale PWA shell also receives that guidance and may
need a refresh after its app-shell update. No legacy state is accepted, and
the actual callback schema still requires the verifier.

Google and GitHub both support S256 PKCE. Provider authorization hosts and
frontend callback origin/base-path validation remain explicit, including
`/ledger-sync/` on GitHub Pages. Provider identity lookup uses the immutable
provider subject. Verified-email fallback may claim only a legacy user whose
provider and provider subject are both null; a bound or partially bound
identity cannot be rebound by email. A conditional update protects concurrent
legacy claims.

Official protocol references:

- [Google PKCE flow and S256 challenge](https://developers.google.com/identity/protocols/oauth2/native-app)
- [GitHub OAuth authorization and S256 requirement](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps)

JWTs contain the user ID, email, type, expiry, and token version. Protected
requests load the user and compare the token version. Logout and reset
increment the stored version and revoke every outstanding token pair.

The Axios refresh mutex prevents a burst of simultaneous 401 responses from
creating parallel refresh requests.

## AI Architecture

The assistant supports three provider adapters with one provider-neutral block
shape:

- OpenAI, browser-direct with the user's key
- Anthropic, browser-direct with the user's key
- Bedrock, backend proxy because AWS authentication and browser CORS require it

All adapters are non-streaming. One round returns complete JSON text or tool
requests. The tool loop:

```text
send messages
  -> receive text or tool_use blocks
  -> execute requested read-only tools in parallel
  -> append tool_result blocks
  -> send next round
  -> stop at end_turn or the configured round limit
```

`chatContext.ts` fetches preferences only. It provides currency, date,
fiscal-year context, and tool-use rules. Financial summaries are not copied
into the system prompt; the model calls one of 15 read-only, user-scoped tools
for data.

Browser-direct provider usage is logged through `/api/ai/usage/log`. Bedrock
usage is reserved and settled by the proxy to avoid double counting.

### Funding, quotas, and tool access

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="diagrams/ai-chat-dark.svg">
  <img alt="AI chat turn: Bedrock via backend quota, OpenAI or Anthropic direct, tool loop capped at 6 calls" src="diagrams/ai-chat-light.svg" width="100%">
</picture>

App-funded Bedrock fixes the model and region and applies the shared daily
limit. A usable personal Bedrock bearer key uses personal funding. Missing,
empty, placeholder, or unreadable Bedrock BYOK keys return HTTP 400 before
reservation or invocation. Shared funding requires an explicit `app_bedrock`
selection. OpenAI and Anthropic use the user's key directly from the browser.

For Bedrock, `ai_usage.py` locks the user row while checking limits and writing
a reservation, then commits before the network call. Outstanding reservations
count against token budgets and, for app funding, the shared cap. Each model
invocation, including another tool round, consumes a quota unit. Successful
calls settle usage once. Client creation, credential resolution, and personal
bearer setup failures release the reservation because inference has not
started. Known nonbillable provider rejections, including
`ModelNotReadyException`, also release it. Ambiguous failures during inference
retain the reservation within the applicable daily/monthly windows. Provider
invocation has bounded timeouts and no automatic billable retry.

Zero token budget blocks a proxied call; null removes that personal cap.
Pending reservations count toward the applicable daily/monthly windows.
Usage responses expose `reserved_tokens` and `pending_call_count` separately
from completed-call totals. Historical Bedrock records have legacy funding
and conservatively count toward their original day's shared allowance.

Browser-direct usage reports are accounting inputs, not an enforceable vendor
spending ceiling. Tool schemas come from the same typed registry that validates
execution arguments. Unknown tools, invalid arguments, and excessive result
limits are rejected before user-scoped reads. The tools do not mutate the
ledger, but their returned financial data becomes part of the selected external
provider's conversation.

Model/region-only saves omit `api_key` (or send null) and retain a usable stored
key only when the provider is unchanged. A concurrent key/provider replacement
returns HTTP 409; the UI reloads saved metadata while retaining the draft.
Changing provider requires a new key. `has_key` describes stored personal-key
availability, not verified live authentication or the current funding source.
App mode preserves that personal configuration for later use.

New encrypted API keys use an authenticated `ls-byok:v3:` envelope with
AES-256-GCM and HKDF-SHA256. Legacy v1 PBKDF2 and v2 HKDF ciphertexts are accepted
only after successful authentication and can be rewrapped on access. Apply the
reservation migration before new workers, and drain old workers before v3
writes because the old reader cannot decode that envelope. Retain previous
encryption material until rewrapping finishes. See
[DEPLOYMENT.md](DEPLOYMENT.md) for operational steps and rollback requirements.

## Security Architecture

- OAuth-only login
- Browser-bound, provider-specific, expiring and one-use OAuth state with S256 PKCE
- Verified provider email where required
- JWT access and refresh tokens with server-side version revocation
- Explicit user scoping in API and analytics queries
- Database `ON DELETE CASCADE` for current user foreign keys
- AES-256-GCM BYOK key encryption
- Dedicated HKDF-derived encryption key for current ciphertexts
- IP and authenticated-user rate limits
- Explicit CORS allowlist
- Security response headers and production HSTS
- No browser HTTP or service-worker cache for financial API responses
- No production source maps
- Whole-batch upload validation, bounded AI rounds, and runtime-validated tool arguments
- Database-backed Bedrock usage reservations across serverless instances
- Distributed SlowAPI storage required for global per-minute limits
- Generic server errors with correlation IDs

## Performance Design

Backend:

- Shared `httpx` client for OAuth and stock calls
- PostgreSQL pool size 5 with max overflow 3 by default
- Pool pre-ping and bounded database timeouts
- User-scoped composite transaction indexes
- One active-transaction load per full analytics refresh
- Persisted daily, monthly, category, cohort, net-worth, and fiscal-year data
- GZip for larger responses

Frontend:

- Route-level lazy loading
- Intent-based route chunk prefetch and small startup data prefetch
- Vendor chunk splitting
- Infinite-stale server cache with explicit invalidation
- Lightweight facet and date-range endpoints instead of full-ledger reads
- Responsive chart sizing
- PWA app-shell caching with API denial rules

## Deployment

| Layer | Hosted platform |
| --- | --- |
| Frontend | GitHub Pages |
| Backend | Vercel serverless, ASGI |
| Database | Neon PostgreSQL 17 |

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="diagrams/release-delivery-dark.svg">
  <img alt="Release flow: five CI checks gate the Neon migration, then Pages waits on Vercel health checks" src="diagrams/release-delivery-light.svg" width="100%">
</picture>

The CI dependency chain gates migrations on all check jobs. Pages also waits
for a healthy backend reporting the frontend release version and a connected
database, leaving the previous site active if that check times out.
Native PostgreSQL runs from isolated test-cluster binaries
in CI. Vercel's Git deployment is outside this dependency chain; the workflow
does not establish that a backend release waits for migrations; only a Vercel
Deployment Check on `migrate / migrate` does. Preserve schema compatibility
and follow [DEPLOYMENT.md](DEPLOYMENT.md) for that console step, rollout,
health, and recovery procedures.

## Verification

CI checks include:

- Frontend shared workflow for install, lint, build, and Vitest
- GitHub Pages build run exactly as the deployment workflow runs it
- Backend Python 3.14 job for Ruff, format check, mypy, pytest, and an
  `alembic upgrade head` plus `alembic check` run against an empty database
- Shared security scan workflow
- Native PostgreSQL bootstrap, constraints, data preservation, and rollback guards

Test totals change with the source and are not an architecture contract.
SQLite tests do not establish PostgreSQL migration or locking behavior; those
checks require a native PostgreSQL test database. OAuth verification can use
synthetic identities and stubbed provider responses without a real login.

For finance changes, start with the domain suite plus an affected consumer:

```bash
pnpm --dir frontend exec vitest run src/lib/finance/__tests__
pnpm --dir frontend exec vitest run src/pages/tax-planning/__tests__/taxPlanningUtils.test.ts src/lib/__tests__/rsuVesting.test.ts src/lib/__tests__/projectionCalculator.test.ts src/lib/__tests__/tdsScheduleCalculator.test.ts src/lib/__tests__/recurringCalculations.test.ts
pnpm --dir frontend exec vitest run src/pages/mutual-fund-projection/__tests__ src/pages/goals/__tests__ src/pages/net-worth/__tests__
pnpm --dir frontend exec vitest run src/lib/__tests__/instrumentCalculators.test.ts src/lib/__tests__/fireCalculator.test.ts src/components/analytics/__tests__/CreditCardHealth.test.tsx src/components/analytics/__tests__/FinancialHealthScore.test.tsx
pnpm --dir frontend run type-check
```

From the repository root, backend arithmetic and investment-summary checks run
natively with synthetic fixtures:

```bash
cd backend
uv run pytest tests/unit/test_ledger_math.py tests/integration/test_investment_transfer_summaries.py
```

No Docker is required. Use isolated test configuration; PostgreSQL-specific
checks need a disposable native PostgreSQL cluster. Run fresh/populated
migrations, constraints, downgrade guards, transaction-local timeouts, and
cross-connection quota races there when those boundaries change. These commands
and coverage descriptions are not a claim that CI or deployment checks passed.
Vercel protection/promotion and distributed rate-limit storage remain external
deployment configuration.

See the [focused calculation checks](CALCULATIONS.md#focused-calculation-checks)
and [TESTING.md](TESTING.md) for commands and scope. Deployment health and
database recovery checks are maintained in [DEPLOYMENT.md](DEPLOYMENT.md) and
[DATABASE.md](DATABASE.md).

## Related Reading

- [API](API.md)
- [Database](DATABASE.md)
- [Calculation Map and Formula Reference](CALCULATIONS.md)
- [Development](DEVELOPMENT.md)
- [Page Catalog](PAGES.md)
