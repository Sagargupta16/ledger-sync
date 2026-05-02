# Feature Audit — Ledger Sync vs the Gold Standard

A one-shot critical review of **every page, every chart, every KPI** in the app, scored against what modern personal-finance tools (Monarch, YNAB, Copilot, Mint's successors) actually ship. Produced as research + code archaeology on 2026-04-29; update when the app changes.

How to read the scores:

- **10** — best-in-class, matches or beats the gold standard
- **8-9** — solid, minor polish away from best-in-class
- **6-7** — works, but the experience trails the leaders
- **4-5** — present but weak; reworking would pay off
- **1-3** — broken, hidden, or worse than nothing
- **N/A** — not present

The scoring reflects **what a knowledgeable user would experience**, not code quality. A rough algorithm wrapped in a beautiful interface can still score 8 if it helps the user decide something.

---

## Executive summary

**Coverage**: ~90% of Tier-1-2 personal-finance features, 6/8 of Tier-3. Better than most self-hosted options. Comparable to Monarch/Copilot on analytics depth, weaker on ingestion (no bank sync).

**Biggest wins**:

- AI chatbot with tool calling over your own data (very few competitors have this)
- India-specific tax planning (multi-year, old vs new regime, RSU vesting) — no US tool handles this
- Full offline / self-hosted architecture — no subscription
- 24 pages of analytics, genuinely useful breadth

**Biggest weaknesses**:

- **Insights page is a dumping ground** of 9 experimental widgets with thin value and inconsistent UX — rating 5/10 overall; several components inside should be retired or merged
- **Two dead components** in `components/analytics/` never rendered anywhere: `SubcategoryAnalysis` (385 lines) and `YearOverYearComparison`. Pure debt
- **No debt payoff planner** — a Tier-2 essential gap
- **Net worth projection** uses a single linear regression — decision-driving but a brittle model
- **Mobile performance** on the heaviest pages (Year-in-Review, Spending Analysis) — not measured recently

**Quick-win cleanup** (concrete candidates listed in the "Unnecessary / Duplicate" section):

- Delete 2 unused analytics components (~550 LOC dead code)
- Merge `SubcategoryAnalysis` vs `EnhancedSubcategoryAnalysis` — same concept, two implementations
- Trim the Insights page from 9 widgets to 4 strong ones
- Replace the peer-comparison widget (uses static made-up benchmarks) with a real-data alternative or delete

---

## Gold-standard reference

The full feature catalog we scored against (researched from Monarch features page, YNAB five principles, Copilot Money site, Coast FIRE mechanics, ClearTax AY 2025-26 rules, and advisor consensus on KPI relevance):

### Tier 1 — essentials

Net worth tracking · transaction ingestion · auto-categorization · budget vs actual · cash flow view · savings rate · spending breakdown · recurring detection · search/filter · bulk edit + split · multi-account dashboard · mobile-first UI.

### Tier 2 — important

Goals · debt payoff planner · bill calendar · anomaly flagging · investment portfolio tracking · tax planning · income vs expense Sankey · year-in-review · smart insights feed · emergency fund tracker · net worth growth rate · shared/partner view.

### Tier 3 — advanced

FIRE calculator · scenario modeling · cash flow forecasting · tax-loss harvesting · real estate tracking · insurance vault · AI chat over data · multi-currency consolidation.

### India-specific (US tools skip these)

FY April-March · old vs new regime · RSU taxation · capital gains (STCG 20% / LTCG 12.5% with ₹1L exemption, indexation removed for debt post-Apr-2023) · EPF/PPF/NPS (including 80CCD(1B) ₹50k extra) · ELSS 3-yr lock · advance tax schedule · HRA exemption formula · GST for freelancers · UPI + Indian bank statement formats.

### Visualization — what actually helps decisions

Sankey for flow · stacked bar for composition-over-time · treemap for hierarchy · line for trend · heatmap for spending-by-day · waterfall for income-to-savings · small-multiple sparklines per category · metric cards with Δ vs last period.

### What doesn't help

3D anything · pie charts with >7 slices · dual-axis mismatched scales · gauges for continuous metrics · word clouds · fancy reveal animations that delay data.

---

## Page-by-page scoring

### Dashboard — 8 / 10

**What it has**: Quick Insights strip (14 configurable KPIs), Financial Health Score (8-metric / 4-pillar composite), Income vs Expense pie twins, 12-month trend area chart. Time filter at top.

**What works**: Health Score is a genuine differentiator — most apps show one number; ours decomposes into Spend/Save/Borrow/Plan. Quick Insights are user-configurable, which respects that different users care about different metrics. Pie charts are sized down to 180 px on mobile.

**What's weak**:

- 14 KPIs is too many defaults. Monarch ships 4 headline metrics. **Reduce defaults to 6, keep the rest as opt-in**
- No "Today" block — the first thing a user wants to see on open is the day-to-day balance + recent transactions
- Pie chart colours are not tied to category colour scheme elsewhere → same "Food" category is pink on Dashboard but red on Spending Analysis

**Upgrade ideas**: Add a "scrollytelling" top section — Today / This Week / This Month / This FY as horizontal pages you swipe between on mobile.

---

### Transactions — 9 / 10

**What it has**: Full ledger with search, category/subcategory/account/type/date/amount filters, inline edit, split, soft delete, virtualization for 10k+ rows.

**What works**: Filter combinations are properly ANDed. Inline edit means users actually re-categorize (the biggest friction in every finance tool). Virtualization keeps it fast.

**What's weak**:

- **No bulk edit** — select multiple rows + "recategorize all" (Monarch and Copilot both have this). For a user reclassifying 200 Amazon transactions, this is the difference between 3 minutes and 30
- **No transaction tags** — categories are a rigid tree; tags would let the same transaction appear in "vacation-2026" AND "entertainment"
- **No attachments / notes** — can't stash the receipt image, can't note "split with roommate"

Upgrade: implement bulk edit → jumps this to a 10.

---

### Cash Flow (Sankey) — 8 / 10

**What it has**: Recharts Sankey on desktop (income sources → Total Income → Savings + Expenses → top expense categories). Dedicated MobileFlowView on phone (vertical card stack) because Sankey doesn't scale below 720 px.

**What works**: Sankey is the single best "where did my money go?" visual. The mobile fallback is thoughtful rather than a squished desktop chart.

**What's weak**:

- No time-period comparison Sankey (overlay this FY vs last FY)
- No drill-down — clicking a category band doesn't filter
- Income grouping is by category, not by account or tax bucket — missing a way to see "all W2 income" vs "all side-income"

---

### Expense Analysis — 8 / 10

**What it has**: 50/30/20 stacked bar · category treemap · monthly trend line · top 10 merchants · Needs/Wants/Savings toggle · "include transfers" toggle · subcategory drill-in via `EnhancedSubcategoryAnalysis` · multi-category time analysis · cohort spending analysis.

**What works**: Treemap + drill-in is the industry-standard way to explore category hierarchy. 50/30/20 is a famous heuristic well-implemented.

**What's weak**:

- **`SubcategoryAnalysis` (plain) vs `EnhancedSubcategoryAnalysis`** — two nearly identical components exist; only Enhanced is used (plain is dead code). Consolidate → delete plain (385 LOC)
- **CohortSpendingAnalysis** — compares your spending to itself in prior cohorts, well-intentioned but the UI is dense and the insight is niche. Rating: 4/10. Consider hiding behind a toggle
- Treemap rectangles are hard to click on mobile (< 40 px tap targets when a small category)

---

### Income Analysis — 7 / 10

**What it has**: Pie of tax buckets (Taxable / Investment returns / Non-taxable / Other) · monthly stacked area by bucket · income subcategory table grouped by bucket.

**What works**: The tax-bucket framing is genuinely India-specific and ties directly into the Tax Planning page. Few US tools split income this way.

**What's weak**:

- No YoY growth per income source — a senior user wants to see "salary grew 12%, freelance shrank 30%"
- No "unclassified income" indicator on the page itself (you only see it in Settings)
- Chart stacking by bucket hides within-bucket drilldown — you can't tell if the taxable spike was salary vs bonus

---

### Comparison — 7 / 10

**What it has**: Side-by-side KPI cards (A, B, Δ, %Δ) · category delta bar chart · trend overlay normalized to day-of-period · top movers table.

**What works**: Period pick is flexible (month, FY, custom). Normalizing 31-day vs 28-day months is the right thing — most apps get this wrong.

**What's weak**:

- **Default comparison is weak** — always opens on "this month vs last month" which is noisy. Default to "this FY to-date vs last FY same-period"
- No 3-period comparison (this month vs last month vs 3-month rolling)
- No saved comparisons ("save as FY25 vs FY24") for return visits

---

### Year in Review — 9 / 10

**What it has**: Hero KPIs · 52×7 spending heatmap · peak day / peak merchant · category of the year (grew / shrank most) · milestones detected from data · fun facts (weekend vs weekday, biggest single txn).

**What works**: Spotify-Wrapped-style scroll narrative is genuinely delightful. The heatmap is the best visualization on the site. Milestones are detected from data, not hard-coded.

**What's weak**:

- **Mobile performance** — this is a heavy page, 52 weeks × 7 days = 364 cells each with hover + tooltip. Not re-measured since last overhaul; likely slow on older phones
- No share/export — year-in-review is the #1 thing users screenshot

Upgrade: "Export as image" button → 10/10.

---

### Net Worth — 9 / 10

**What it has**: Asset/Liability twin donuts · headline net worth + trend · liquid net worth · debt-to-asset ratio · emergency fund months · daily net worth line (3/6/12/24 month toggle) · credit card health widget · milestones table.

**What works**: The "emergency fund months" KPI is advisor-gold — few apps ship it. Credit card health rolled into the page (utilization + over-limit warnings) is Tier-2 quality.

**What's weak**:

- Investment "current value" = invested + realized gains (no live market prices) — this undersells your real net worth if your MFs have grown. Either **fetch live NAVs** or clearly label it as "cost basis + realized"
- **Real estate is not tracked** — missing a major asset class for many users. Workaround: classify as "Other Asset"; long-term: dedicated real-estate tab with index-linked appreciation (Tier-3 gap)

---

### Trends & Forecasts — 7 / 10

**What it has**: Monthly trend (income / expense / savings) · category drift (12-month slopes) · net worth projection (linear regression + 6/12/24-month extrapolation).

**What works**: Category drift catches "my food spending is up 40% over 12 months" — the kind of trend that doesn't show in monthly snapshots.

**What's weak**:

- **Net worth projection uses linear regression.** Real financial projections need compound growth. A user with ₹50L at 12% returns won't hit ₹1Cr in 50 months — it's sooner and not linear. **Replace with geometric / CAGR-based projection**
- Projection has no scenario modeling ("what if I save 10% more?")
- `CashFlowForecast` component is imported but doesn't appear to fire anywhere user-visible — worth auditing

---

### Investment Analytics — 8 / 10

**What it has**: Summary cards (invested, current value, realized, overall return) · breakdown by type · holdings table.

**What works**: Covers 8 investment types (MF, PPF/EPF, FD, Stocks, Gold, Crypto, Real Estate, Other) with separate buckets. Mapping flows auto-detect type from account name.

**What's weak**:

- Same problem as Net Worth — **no live market prices**. Current value is just `invested + realized_gains`, undersells growth
- No asset allocation target vs actual ("your target is 60% equity, you're at 72%")
- No XIRR at the portfolio level (it's on Returns Analysis per-holding)

---

### SIP Projections — 8 / 10

**What it has**: Inputs for monthly SIP + lump sum + return % + years. Outputs: maturity value · total invested · wealth gained · year-by-year table · line chart. Real-return toggle.

**What works**: Pure client-side math, fast, accurate. Real-return toggle is thoughtful — few apps offer inflation-adjusted views.

**What's weak**:

- No step-up SIP modeling — real users increase SIP every year with salary growth
- No comparison mode — SIP vs Lump vs SIP+Lump side by side
- No integration with actual holdings ("project your current Groww MF forward")

---

### Returns Analysis — 7 / 10

**What it has**: Per-account ranking (invested, current value, returns, XIRR) · top 5 / bottom 5 · dormant / underwater flags.

**What works**: XIRR via Newton-Raphson with CAGR fallback is mathematically correct. Winners/losers framing helps users decide what to exit.

**What's weak**:

- Same market-price gap — "return" is bounded by your own realized gains
- No benchmark comparison ("your MFs returned 12%, Nifty 50 did 15%")
- No time-weighted return (TWR) alongside money-weighted (XIRR) — institutional standard

---

### Recurring / Subscriptions — 9 / 10

**What it has**: Detected recurring items · confidence score · frequency · expected amount · variance · next expected · missed count · user can confirm / dismiss / edit / deactivate.

**What works**: This is **Copilot's headline feature** and we match it. Detection logic (≥ 3 occurrences, ≥ 2 different months, amount within ±10%) is defensible.

**What's weak**:

- No "savings from cancellations" KPI — when user marks a sub as cancelled, surface "you'll save ₹X/month"
- No category suggestions — if detected as subscription, default to "Subscription" category

---

### Bill Calendar — 8 / 10

**What it has**: Month grid with paid / due / variance indicators · side panel for today / this week / missed / total due.

**What works**: Calendar view beats list view for "when am I getting hit?" questions. Variance indicator (paid amount ± 10% from expected) catches sneaky price hikes.

**What's weak**:

- No multi-month view — can't scroll to next month without a jump
- No drag-to-reschedule — if you know rent is a day late, can't adjust the expected date without going to Settings
- No "pay via UPI" deep link (long-term; nice-to-have)

---

### Budgets — 7 / 10

**What it has**: Per-category budget · spent · remaining · % used · status badge · stacked total bar · auto-create from trailing average · alert threshold · rollover.

**What works**: Auto-create from trailing 3-month average is the right default (beats a blank slate).

**What's weak**:

- **Not YNAB-style zero-based** — YNAB's four rules require every rupee to be assigned to a category, with next-month's money visible. Worth considering as an opt-in "zero-based mode"
- No savings budget (only expense budgets)
- Sparkline per category is shown but small and doesn't drive hover-to-drill

---

### Goals — 8 / 10

**What it has**: Named goals · target amount + date · linked accounts · progress bar · on-track indicator · required monthly contribution.

**What works**: Linking goals to specific accounts (not just "your net worth") is the right abstraction — a down-payment goal is funded from savings account, not stocks.

**What's weak**:

- No milestone celebrations (in-app confetti when goal hits 25%/50%/75%) — small but delightful
- No goal prioritization — if you have 5 goals, which eats your free cashflow first?
- No "competing goals" visualization — which I'd argue is the whole point of financial goal-setting

---

### FIRE Calculator — 9 / 10

**What it has**: FIRE number · Coast FIRE · years to FIRE · savings rate · Lean/Standard/Fat variants · adjustable SWR / real return / retirement age · projection chart.

**What works**: Correct FIRE math with the right variants. Auto-fills corpus from net worth + expenses from trailing 12-month average — zero setup.

**What's weak**:

- No Barista FIRE (part-time income post-FI) — a 2024-era concept that's resonating with users
- Chart could show multiple scenarios overlaid (conservative / base / optimistic returns)

---

### Insights — 5 / 10

**What it has**: SpendingVelocityGauge · IncomeStabilityIndex · SavingsMilestonesTimeline · CategoryCorrelationAnalysis · AccountActivityScore · MonthlyFinancialReportCard · PeerComparisonBenchmarks · LifestyleCreepDetection · ExpenseElasticityChart.

**What works**: A few of these are genuinely insightful (LifestyleCreepDetection — comparing this year's lifestyle spend to same income-tier last year — is a Tier-3 idea).

**What's weak**:

- **This page is a dumping ground** for experiments that accumulated. Users don't know which ones to trust
- **PeerComparisonBenchmarks** likely uses made-up benchmarks (no real peer data source) — either pipe in aggregated anonymous data (privacy nightmare) or delete
- **SpendingVelocityGauge** — velocity is a continuous metric; gauges are wrong for continuous metrics per viz best practice
- **CategoryCorrelationAnalysis** — what does a user do with "food correlates 0.72 with weekends"? No actionable next step
- **MonthlyFinancialReportCard** — duplicates Year-in-Review's content at monthly scale, but with less polish

**Recommendation**: Cut down to 3-4 strong widgets. Candidates to keep: LifestyleCreepDetection, SavingsMilestonesTimeline, IncomeStabilityIndex. Rest → retire or fold into other pages.

---

### Anomaly Review — 7 / 10

**What it has**: List of flagged anomalies · types (duplicate / unusual amount / unusual category / missing recurring) · confirm / delete / edit / ignore actions · review_status persistence.

**What works**: The duplicate-detection type is genuine value — users often re-upload the same statement and end up with duplicate rows despite hash-based dedupe if their bank varies amounts by ₹0.01.

**What's weak**:

- Threshold for "unusual amount" is 3× median — hard-coded, no user control
- No ML classifier — rule-based is fine but misses subtle patterns
- Empty state is passive — doesn't tell user "this is good news, no anomalies detected"

---

### Income Tax Planning — 9 / 10

**What it has**: Gross taxable breakdown · deductions (std, 80C, HRA, 80D, 24b) · old vs new regime side-by-side · surcharge + cess · multi-year salary projection with RSU vesting.

**What works**: **This is the hidden differentiator**. No US-focused tool does Indian tax right. Old vs new regime comparison with slab breakdown is genuinely decision-driving. Multi-year projection using your actual salary structure + growth assumptions + RSU schedule is unmatched.

**What's weak**:

- **NPS / 80CCD(1B)** — ₹50k additional NPS deduction isn't surfaced
- No advance tax schedule display (15%/45%/75%/100% by Jun/Sep/Dec/Mar — missing these means users get penalty interest)
- Capital gains split (STCG 20% / LTCG 12.5% with ₹1L exemption) — confirm it's in the calc
- No post-retirement tax estimate (tax at withdrawal)

Upgrade: fill these gaps → 10/10.

---

### GST Analysis — 6 / 10

**What it has**: Approximate GST paid by applying standard slabs to expense categories.

**What works**: Concept is right — users are curious about taxes-within-taxes.

**What's weak**:

- Inherently approximate. Bank statements don't line-item GST. Unless the user uploads receipts, this is gut-feel precision at best
- Page is quiet — 1 chart. Rounds out to feel incomplete vs neighbours

Upgrade: either add receipt OCR (big feature, separate project) or lean into the "approximate GST paid on your lifestyle" framing with a disclaimer banner.

---

### Upload & Sync — 8 / 10

**What it has**: Drag-drop Excel/CSV · client-side SheetJS parsing · SHA-256 dedupe · 4-phase UX · column-mapping preview.

**What works**: Parsing client-side means statements never leave the browser until they're structured JSON. Re-uploading is idempotent. Preview before submit is rare in self-hosted tools.

**What's weak**:

- No **bank statement auto-parser for common Indian banks** (HDFC / ICICI / SBI / Axis format detection). Adding just HDFC's format would capture ~30% of Indian users
- No **PDF statement support** — Indian banks often email PDFs, user has to convert
- No **email-in** — forward a statement to an address, app imports it

---

### Settings — 8 / 10

**What it has**: 11 collapsible sections (now collapsed-by-default as of 2.7.1), drag-drop account classifications, balance-sign auto-classify refinement, salary structure + RSU grants + growth assumptions, AI assistant configuration with dual-mode split.

**What works**: The balance-aware auto-classifier landing in 2.7.1 was the right fix. Drag-drop reclassification is the correct UX (faster than dropdowns).

**What's weak**:

- Some sections are heavy forms — a migration to wizard-style "Setup Wizard on first upload" would help first-time users
- Account classification suggestions should have confidence indicators ("High confidence this is a credit card because of balance sign")

---

## Cross-cutting capabilities

### AI Chatbot — 9 / 10

**What it has**: Tool-calling over 15 read-only tools · dual mode (app_bedrock default / BYOK) · usage tracking · 6-round tool loop cap · non-streaming with 2-5s full response.

**What works**: Tool calling over your actual data is **genuinely ahead** of Monarch/Copilot/YNAB — none of them ship this yet (2026). The 15-tool set covers most questions. User-scoped enforcement at the FastAPI layer means no cross-user leak.

**What's weak**:

- Non-streaming means a 5-second blank while it thinks → add "thinking / using tool: search_transactions…" progress indicator
- No followup-question memory across sessions (each chat is stateless on reload)
- Tool list could add: `find_similar_merchants`, `detect_lifestyle_drift`, `suggest_budget_cuts` (agentic rather than read-only)

---

### Multi-currency — 8 / 10

**What it has**: 15 supported display currencies · 24h-cached exchange rates (frankfurter.dev) · transactions stored in source currency, converted on display.

**What works**: The "store source, convert on display" architecture is correct. Prevents rounding bugs.

**What's weak**:

- Rate is frozen at display time — historical transactions show using today's rate, which is fine for current-balance but wrong for "how much did I actually pay in INR in Jan 2024?" Consider **capturing rate at transaction time** as a separate improvement

---

### PWA / Mobile — 9 / 10

**What it has**: Installable · full-bleed icon · bottom tab bar on phone · `h-dvh` layout · safe-area insets · status-bar colour matched to app.

**What works**: The 2.7.0 PWA polish PRs (mobile tab bar + full-bleed icon + safe-area wiring) moved this from "web app on a phone" to "feels like an app." Four-tab nav is the native pattern users recognize.

**What's weak**:

- No haptic feedback on interactions (cheap; `navigator.vibrate(10)` on primary actions)
- No share extension / "send transaction to app" from other iOS apps
- No notifications (push) for bills due / anomalies

---

### Demo mode — 10 / 10

Seeded Indian-household data, 500 transactions, every page fully populated, mutations gracefully blocked. First-class feature, rare in self-hosted tools. Let people try it in 30 seconds.

---

## Unnecessary / duplicate / dead code

Concrete cleanup candidates — all are in `frontend/src/components/analytics/`:

| Component | Status | Action |
|---|---|---|
| **SubcategoryAnalysis.tsx** (385 LOC) | Exported from barrel, not used by any page | **Delete** |
| **YearOverYearComparison.tsx** | Exported from barrel, not used | **Delete** or fold into Comparison page |
| **CategoryCorrelationAnalysis** | Used on Insights, but "food correlates 0.72 with weekends" has no actionable next step | **Retire** |
| **SpendingVelocityGauge** | Used on Insights; gauges are wrong for continuous metrics per viz best-practice | **Retire** (or replace with a trend line) |
| **PeerComparisonBenchmarks** | Used on Insights; likely static made-up numbers | **Delete** unless we add real peer aggregation (privacy-heavy to build) |
| **MonthlyFinancialReportCard** | Used on Insights; duplicates Year-in-Review monthly with less polish | **Merge into Year-in-Review** as a "Month in Review" button, delete original |
| **CohortSpendingAnalysis** | Used on Spending Analysis; dense UI, niche insight | Hide behind a toggle or move to Insights |

**If all seven land**: the `components/analytics/` folder drops from 37 files to 30, Insights page trims from 9 widgets to 4 strong ones, and one full 385-LOC dead file is gone. Net: cleaner mental model for users, less code to maintain.

---

## What's missing vs the gold standard

Ranked by user impact:

### High-impact gaps (ship next)

1. **Debt payoff planner** — avalanche vs snowball simulator. Tier-2 essential we don't have. Moderate build effort
2. **Bulk transaction edit** — multi-select + batch recategorize. Would turn reclassification from drudge to delight
3. **Live market prices for holdings** — Yahoo Finance stock price we already proxy can be extended to MF NAVs via AMFI. Fixes the "invested + realized" undervaluation
4. **NPS 80CCD(1B)** in Tax Planning — India-specific gap for salaried users
5. **Advance tax schedule** — Jun/Sep/Dec/Mar reminders on Tax Planning page to dodge penalty interest
6. **Net worth projection with CAGR** — linear regression is wrong for compound growth

### Medium-impact gaps

7. **Scenario modeling** on FIRE / forecasts ("save 10% more → years-to-FI impact")
8. **Transaction tags** for cross-cutting classifications (vacation-2026 + entertainment)
9. **PDF bank statement support** — most Indian banks email PDFs, not XLSX
10. **Receipt attachment** per transaction
11. **Step-up SIP** in projections — real SIPs ramp with salary
12. **Push notifications** for bills due / budget threshold breaches

### Low-impact / nice-to-have

13. Step-up SIP, Barista FIRE variant
14. Goal milestone celebrations
15. Multi-month bill calendar
16. Historical exchange rate capture (vs today's rate for old transactions)
17. Real estate tracking with index-linked valuation
18. Shared / partner view

---

## Representation improvements

Things that exist but are poorly rendered:

| Current | Issue | Better |
|---|---|---|
| Dashboard pie charts | Different colour scheme than Spending Analysis | Unify category colour palette across the app (already have `rawColors.app.*` — use consistently) |
| Net worth projection | Linear regression | Compound-growth / CAGR with confidence band |
| Insights page widgets | Wall of experimental charts, low uniform styling | Reduce to 4 strong widgets, consistent card framework |
| Peer-comparison | Static benchmarks | Delete or replace with "your past self" comparison |
| Velocity gauge | Wrong chart type for continuous metric | Replace with 30-day trend sparkline |
| GST Analysis | Too sparse, looks incomplete | Add "estimated" banner + richer lifestyle-tax-paid framing |
| Subcategory treemap | Small rectangles hard to tap on mobile | Min tap target 44×44 px, zoom-on-tap drill-in |

---

## Aggregate score

| Axis | Rating | Notes |
|---|---|---|
| **Tier-1 coverage** | 9/10 | Only ingestion (no bank sync) trails leaders |
| **Tier-2 coverage** | 7/10 | Gap: debt payoff planner |
| **Tier-3 coverage** | 8/10 | AI chat + multi-currency + FIRE all present |
| **India-specific** | 10/10 | No competitor handles Indian tax this well |
| **Visualization quality** | 7/10 | Strong (Sankey, treemap, heatmap); weak (velocity gauge, peer benchmarks) |
| **Mobile UX** | 9/10 | After 2.7.0 PWA polish |
| **Code quality debt** | 7/10 | 2 dead files + 5 retire-candidates in analytics/ |
| **Chatbot** | 9/10 | Tool calling over your own data is genuinely ahead |

**Overall: 8.3 / 10.** Very good, with a clear path to 9+ via the "high-impact gaps" list and the cleanup of analytics experiments.
