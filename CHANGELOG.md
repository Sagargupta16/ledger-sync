# Changelog -- Ledger Sync

All notable changes to this project are documented here.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## 2.8.0 - 2026-04-29

Audit-driven cleanup and accuracy pass. Comes out of `docs/AUDIT.md` which rated every page, chart, and calculation against the gold-standard personal-finance feature set.

### Removed

- **8 underperforming / dead analytics components** (~1 400 lines total) all in `frontend/src/components/analytics/`:
  - Dead code: `SubcategoryAnalysis.tsx` (superseded by `EnhancedSubcategoryAnalysis`), `YearOverYearComparison.tsx` (never consumed).
  - Retired from the Insights page: `SpendingVelocityGauge` (gauges are wrong for continuous metrics), `PeerComparisonBenchmarks` (invented peer data), `CategoryCorrelationAnalysis` (correlation numbers without actionable next step), `AccountActivityScore` (paired with the correlation widget - niche), `MonthlyFinancialReportCard` (duplicated Year-in-Review), `ExpenseElasticityChart` (duplicated lifestyle-creep signal).

### Changed

- **Insights page trimmed from 9 widgets to 3 strong ones** -- `IncomeStabilityIndex`, `LifestyleCreepDetection`, `SavingsMilestonesTimeline`. Each drives a specific decision: "how predictable is my cash flow", "is my spending quietly growing faster than income", "what big milestones have I hit / am I nearing".
- **Net worth projection math fixed: linear regression -> compound (geometric)**. Savings and asset returns both compound, so the old linear model dramatically underestimated time-to-target. A user with ₹50L at 12 % annualized reaches ₹1Cr in ~6 years by compound, but ~17 years by linear extrapolation -- the UI now shows the realistic number. New helpers `computeMonthlyGrowthRate`, `projectNetWorthCompound`, and `buildMilestoneRowsCompound` use geometric mean over the last 12 monthly data points. Old linear helpers kept for backwards compatibility.
- **Milestone summary bar now shows annualized %** instead of an absolute monthly rupee delta (the delta number was meaningless once the rate is compound). Hover tooltip still shows the approximate rupee gain at the current net worth.
- **Dashboard default widget count reduced from 14 to 6** on first visit. Power users can still turn on the other 8 from Settings > Dashboard Widgets. New default set: Savings Rate, Top Spending, Top Income, Burn Rate, Daily Spending, Biggest Transaction.

### Added

- **Section 80CCD(1B) deduction input** in Tax Planning's regime-comparison form. Lets users claim the standalone ₹50 000 NPS Tier-1 deduction that sits over and above the 80C ₹1.5L cap -- a common miss for salaried NPS contributors.
- **Advance Tax Schedule panel** on the Tax Planning page showing the four Indian deadlines (15 Jun / 15 Sep / 15 Dec / 15 Mar) with cumulative percentages (15 / 45 / 75 / 100) and amounts due based on the projected annual liability. Current-FY deadlines within 30 days are highlighted to dodge penalty interest under Sections 234B / 234C. Hidden when total tax is zero.

### Tests

- **10 new tests** for the compound-growth helpers in `netWorthProjection.test.ts`: edge cases (empty / single-point / zero / negative start), geometric-mean recovery against a synthetic 4 %/month series, compound-vs-linear horizon comparison, and compound milestone ETA solver accuracy. Frontend test count 104 -> 114.

---

## 2.7.1 - 2026-04-29

Polish patch -- Settings UX cleanup and a smarter auto-classifier, plus a new data-focused page catalog.

### Changed

- **Settings sections are collapsed by default.** The `Section` primitive (`frontend/src/pages/settings/sectionPrimitives.tsx`) now defaults `defaultCollapsed` to `true`, so opening Settings shows a scannable list of headers instead of a wall of forms. Dropped the per-mode override on `AIAssistantSection` (was auto-expanding when the user was configured) and the redundant `defaultCollapsed={true}` on `AdvancedSection` so every section has a uniform baseline.
- **Auto-account classification now studies balance data, not just account names.** `getDefaultClassifications` in `frontend/src/pages/settings/helpers.ts` gained an optional `accountStats` argument and applies a balance-sign refinement pass to anything the keyword dictionary couldn't classify: negative balance + activity -> **Credit Cards**, positive balance + >=3 transactions -> **Bank Accounts**. User-saved classifications still win. Keyword list also extended with Indian card brands the old dictionary missed (Jupiter Edge, OneCard, Slice, Millennia, SimplyCLICK, Regalia, Swiggy HDFC, Amazon Pay ICICI, Flipkart Axis, Amex, Diners) and `jupiter` (neobank).

### Added

- **`docs/PAGES.md`** -- new data-focused catalog documenting every page in the app: what each one shows, the tables/endpoints it reads from, the decisions it helps the user make. Written for "what can I learn from this app?" rather than "how is this built?".

---

## 2.7.0 - 2026-04-29

Mobile PWA polish landed in three stacked PRs (#126 / #127 / #128). The app now installs on iPhone/Android home screens like a native-feeling finance app, with a bottom tab bar for phone-sized viewports and a full-bleed app icon.

### Added

- **Bottom tab bar** for phone viewports (`<lg` breakpoint). `Home / Txns / Flow / More` with a Framer-Motion shared-element active pill and 52px touch targets. Hidden on desktop (sidebar stays).
- **`/more` route + `MorePage.tsx`** -- grid menu grouping every route that didn't earn a tab slot (Analytics, Investments, Planning, Tax, Data) + sign-out.
- **Full-bleed PWA app icon** -- uses the same PiggyBank glyph on the blue-to-indigo gradient as the web header. `pwa-assets.config.ts` overrides `minimal-2023`'s apple-touch transform to `padding: 0` + transparent background so the gradient paints edge-to-edge; iOS applies its own squircle mask on install. No more white-ring "unfinished-app" look on the home screen.

### Changed

- **`h-screen` -> `h-dvh`** in `AppLayout` and `Sidebar` so the viewport tracks the dynamic-viewport-height API. No more content jumping when the mobile address bar toggles.
- **Safe-area insets wired through** the sticky `PageHeader`, chat widget / panel, and `HomePage` header. Sticky headers bake `env(safe-area-inset-top)` into padding so titles don't render behind the iOS notch in standalone mode. Main content gets `pb-safe` so the last row clears the home indicator. `ChatWidget` respects `safe-area-inset-right` for landscape on notched devices.
- **`theme-color` aligned to `#000000`** (was `#09090b`) in both `index.html` and the PWA manifest so the status bar blends into the app black -- no seam at the top.
- **Body/HTML reset** in `index.css`: `margin: 0`, `padding: 0`, `overscroll-behavior-y: none`, `html { height: 100% }`, `#root { height: 100% }` so `h-dvh` has a reference and rubber-band scroll doesn't flash white behind the notch.
- **`CreditCardHealth` widget now uses the user's account classifications** instead of substring-grepping `"credit"` in account names. Cards like "HDFC Millennia" or "Amazon Pay Card" were silently dropped before. Falls back to the old name match only when an account has no classification yet.

### Fixed

- **HomePage layout shifted up behind the notch in PWA standalone mode.** The landing page lives outside `AppLayout` so the safe-area work from the other PRs didn't reach it. Header padding-top/left/right now use `env(safe-area-inset-*)`; main's `pt-20` becomes `calc(5rem + inset-top)`; footer gets `inset-bottom`. `h-screen` -> `min-h-dvh` matches the rest of the app.

---

## 2.5.0 - 2026-04-26

Major AI chat upgrade: the bot can now answer questions about *any* of your data, not just the six fields we pre-loaded into the system prompt.

### Changed

- **AI chat now uses tool calling instead of context stuffing.** Previously `buildFinancialContext` fetched six endpoints up front and crammed them into the system prompt; anything outside that fixed slice ("when did I last go for a haircut?", "how many bank accounts?") was unanswerable. The model now has nine read-only tools it can call on demand -- `list_accounts`, `search_transactions`, `get_monthly_summary`, `list_categories`, `get_category_spending`, `get_net_worth`, `list_recurring`, `list_goals`, `list_recent_months` -- and picks the right one based on the question. Same tool schema works across OpenAI, Anthropic, and Bedrock (each provider has a native tool-calling API).
- **System prompt shrunk to ~10 lines.** Just preferences (currency, fiscal year), today's date, tool-usage guidance, and an anti-hallucination nudge. The bot reaches for tools instead of making up plausible numbers.
- **All three providers are now non-streaming.** Tool-calling requires handling `tool_use` events between turns, which makes SSE streaming awkward. Plain JSON for all providers keeps the tool loop simple (one HTTP call per round). Users see "processing... 2-5s... full reply" instead of token-by-token streaming.

### Added

- **`backend/src/ledger_sync/api/ai_tools.py`** -- tool registry + `/api/ai/tools` (list) + `/api/ai/tools/execute` (run). Every tool is user-scoped via `CurrentUser`, enforced at the FastAPI dependency level so the LLM can never see another user's data.
- **`search_transactions` tool** -- full-text search over transaction notes/category/subcategory/account with optional date, category, account, type, and amount filters. Capped at 100 results to prevent runaway queries.
- **Frontend tool-calling loop in `useChat`.** Sends -> receives `tool_use` -> executes tools in parallel -> appends `tool_result` -> sends again -> repeats until `end_turn` or 6-round limit (prevents runaway loops).
- **16 new tests:** 7 for `/api/ai/bedrock/chat` covering the new block-based message shape (`tool_use`/`tool_result` round-trip, `toolConfig` forwarding), 9 for `/api/ai/tools` covering every tool against a real SQLite DB with seeded data. Backend test count 75 -> 91.
- **6 rewritten frontend tests** for `chatAdapters.ts` covering OpenAI/Anthropic/Bedrock request + response mapping including tool-call conversion.

### Why tool calling over a vector database (RAG)

Finance data is structured. `SELECT category, SUM(amount) FROM transactions WHERE user_id = ? AND date >= ?` beats any embedding similarity search when the question is a database query in disguise. Vector DBs are worth adding later for semantic merchant matching ("food delivery", "subscriptions I don't use") but are overkill for 90% of finance questions.

---

## 2.6.0 - 2026-04-27

Follow-up to 2.5.0's tool-calling chat. Biggest change: the chat now has a **two-mode split** so users can either use the app's shared Bedrock key (free, rate-limited) or bring their own API key (unlimited, they pay). Plus six new tools expose tax / FY / cash-flow / budget data to the assistant, and every LLM round-trip is now logged for cost transparency.

### Added — App vs BYOK mode split

- **`ai_mode` column** on `user_preferences` (`'app_bedrock'` default or `'byok'`) + `PATCH /api/preferences/ai-config/mode` to toggle.
- **App mode (default):** new users get a working chatbot immediately. No provider picker, no key input — the server uses the app's shared Bedrock bearer token and a fixed cheap default model (`us.anthropic.claude-haiku-4-5-20251001-v1:0`). Rate-limited to `LEDGER_SYNC_AI_DAILY_MESSAGE_LIMIT` messages per day (default 10) so our AWS bill stays predictable. Users who hit the cap get a clear 429 with a "switch to BYOK" pointer.
- **BYOK mode:** existing provider/model/key picker + per-user token limits. Users pay their own provider. No app-level cap (the provider bills them directly).
- **`settings.py`** gains three new env-overridable fields: `ai_default_bedrock_model`, `ai_default_bedrock_region`, `ai_daily_message_limit`.
- **Settings → AI Assistant** rebuilt with a stacked two-card mode picker. App-mode panel shows a live "3 / 10 left" counter with a small explainer. BYOK-mode panel unchanged from 2.5.0 (provider/model/key + optional token limits).
- **ChatPanel usage badge** is now mode-aware: `"· 3 / 10 left"` in app mode (messages), `"· 1.2k / 50k"` in BYOK mode (tokens).
- **ChatWidget gating:** opening the chat no longer requires `has_key` when the user is in app mode — they can chat out of the box.

### Added — 6 new AI tools (registry now 15)

- `get_fy_summary` — fiscal-year rollup (income by source, tax paid, savings, YoY change) from the `fy_summaries` table.
- `get_tax_summary` — prefers uploaded `TaxRecord` filings (gross/TDS/advance/self-assessment/80C/80D/standard deductions) and falls back to transaction-derived totals when no filing is available.
- `get_cash_flow` — monthly income-vs-expense time series with totals and averages.
- `list_budgets` — active budgets with current-month usage %, ranked by usage.
- `list_anomalies` — recent unusual-spending alerts the system detected.
- `get_preferences_summary` — currency, fiscal-year start, and salary-structure components so the LLM can reason about context.

### Added — Usage tracking

- **`ai_usage_log` table** with `(provider, model, input_tokens, output_tokens, tool_rounds, cost_usd, timestamp)`. Bedrock usage is recorded server-side after `converse()`; OpenAI and Anthropic report back from the browser via `POST /api/ai/usage/log`.
- **Cost estimation** via `core/ai_pricing.py` — per-provider, per-model-prefix USD-per-1M-token table with longest-prefix match. Unknown models fall through to a conservative 10/40 USD-per-1M fallback so we never under-report cost.
- **`GET /api/ai/usage`** returns today / MTD / all-time rollups + current limits + today's message count (for app mode). Used by Settings and the chat header.
- **BYOK per-user token limits:** two nullable columns `ai_daily_token_limit` / `ai_monthly_token_limit` plus `PATCH /api/preferences/ai-config/limits`. Applies only in BYOK mode; app mode uses the server-wide message cap instead.

### Changed

- **System prompt stays minimal.** The LLM fetches data via tools instead of having summaries pre-stuffed. ~300 tokens per round instead of ~2K.
- **Default mode is `app_bedrock`.** Existing users stay in their previous configuration (the migration sets `app_bedrock` as the server-default, but the save-config endpoint now flips prefs to `byok` whenever someone configures a provider key, so migrating users who already had BYOK remain BYOK after their next save).

### Migrations

- **`20260427_1200_add_ai_usage_log_and_token_limits.py`** creates the `ai_usage_log` table + two indexes, adds `ai_daily_token_limit` + `ai_monthly_token_limit` to `user_preferences`, and adds the `ai_mode` column (default `'app_bedrock'`). Downgrade is intentionally empty per project convention.

### Tests

- **Backend:** 32 new tests across 3 suites (`test_ai_tools.py`, `test_ai_usage.py`, `test_ai_chat.py` extensions). Coverage of the 6 new tools, usage rollups, cost estimation edge cases, app-mode message cap enforcement, BYOK bypass of the app cap, and default-model selection. Test count 75 → 107.

### Deploy notes

- Run `uv run alembic upgrade head` once after deploy (auto-runs on Vercel via the migrate workflow).
- No new required env vars. Optional overrides: `LEDGER_SYNC_AI_DAILY_MESSAGE_LIMIT` (default 10), `LEDGER_SYNC_AI_DEFAULT_BEDROCK_MODEL` (default Haiku), `LEDGER_SYNC_AI_DEFAULT_BEDROCK_REGION` (default `us-east-1`).

---

## 2.4.2 - 2026-04-25

Further mobile polish after device testing, plus an AI chat fix.

### Changed

- **PWA icon redesigned.** The old mark had the L-glyph in the top-left corner leaving dead space bottom-right, and read as "a bar chart" at 64px. New icon is a centered bold rupee (₹) glyph over a subtle ascending trend line on the blue-to-indigo gradient. Reads clearly at 64px home-screen badge size, stays recognisable after Android's maskable crop, and ties the mark to the product (personal finance) rather than a generic chart. Regenerated all 6 PNG sizes from [pwa-icon-source.svg](frontend/public/pwa-icon-source.svg).
- **Cash Flow on mobile is now a dedicated vertical view, not a shrunken Sankey.** Phones get [MobileFlowView](frontend/src/pages/income-expense-flow/components/MobileFlowView.tsx) -- a stacked sequence (Income sources -> Total Income -> Savings + Expenses split -> Expense categories) with proportional bars and currency-accurate labels. No swipe, no cramped nodes, no horizontal scroll. Desktop still gets the full Sankey.
- **Bedrock chat path switched from SSE streaming to plain JSON.** The backend runs on Vercel via Mangum, which buffers streaming responses end-to-end, so the old `StreamingResponse` made the UI sit on "processing" forever -- the browser only saw the first byte once boto3's `converse_stream` generator had fully drained (or the function timed out). Now the backend calls `converse` (non-streaming), collects the full reply, and returns `{ "content": "..." }`. The frontend [Bedrock adapter](frontend/src/lib/chatAdapters.ts) fetches once, parses JSON, emits the full text as a single token. Anthropic and OpenAI paths still stream browser-direct since they don't go through Mangum.

### Fixed

- **Chart heights auto-cap at 280px on mobile** via a new `MOBILE_HEIGHT_CAP` in [ChartContainer](frontend/src/components/ui/ChartContainer.tsx). Previously a chart with `height={400}` would eat ~60% of a 667px iPhone viewport. Now any numeric height greater than 280 is auto-shrunk on `max-width: 639px`; percent heights (`'100%'`) and the new optional `mobileHeight` prop still win. Affects ~20 chart call-sites with one change.
- **Numeric columns in DataTable now use `tabular-nums`.** Right-aligned cells align digit-by-digit vertically, which matters most on mobile where rows are tight.
- **CommandPalette (Cmd+K) on mobile** -- panel no longer pushed off-screen by the on-screen keyboard. Top offset drops from `15vh` to `8vh` below `sm`, panel is `flex flex-col max-h-[80vh]` so the input stays visible while results scroll inside.
- **AI chat "processing... forever" with no error surfaced.** Silent `{"error": "..."}` SSE events from the Bedrock proxy were dropped by the token extractor (it only looked for `{"token": "..."}`), so invalid model IDs, auth failures, region mismatches, and timeouts all looked identical to the user: a spinner that never resolved. With the new JSON path, Bedrock errors surface as HTTP 502 with a readable `detail`; the existing `onError` path displays them in the chat UI.
- **AI model selection now has a "Custom model ID" free-text field.** The hardcoded Bedrock model list can get stale the moment AWS ships a new inference profile; a user who picked "Claude Opus 4.7 (Bedrock)" was sending `us.anthropic.claude-opus-4-7-v1` which Bedrock no longer accepts. The dropdown now includes "Custom model ID..." which enables a text input below so the exact `modelId` (e.g. `us.anthropic.claude-opus-4-1-20250805-v1:0`) can be pasted straight from the Bedrock console -- no code update required. Also shown/editable when a saved value doesn't match any dropdown option, so users migrating from stale IDs can see and fix them.
- **Bedrock auth via bearer token (`AWS_BEARER_TOKEN_BEDROCK`).** The server-side proxy used `boto3.client("bedrock-runtime").converse(...)` expecting SigV4 credentials, but production was running with only a Bedrock API key. boto3 1.39+ auto-detects `AWS_BEARER_TOKEN_BEDROCK`, so the existing code works once the env var is in place. Added a [`LEDGER_SYNC_BEDROCK_API_KEY`](backend/src/ledger_sync/config/settings.py) setting that gets injected into `AWS_BEARER_TOKEN_BEDROCK` on startup, so all app secrets stay under the `LEDGER_SYNC_` prefix on Vercel. Added a pre-flight check that returns HTTP 503 with a clear "server not configured" message when no auth mechanism is present -- before, boto3's error surfaced as the misleading "model identifier is invalid".
- **AI chat had zero financial context despite `buildFinancialContext`.** The context builder expected flat response shapes like `summary.income` as a number, but every V2 endpoint returns `{ data: [...], count: N }` with **nested** objects (`summary.income.total`). Every section's `Array.isArray && length > 0` guard silently skipped, `Promise.allSettled` swallowed fetch errors, and the chat shipped with an empty system prompt -- which is why the assistant replied "I don't have access to your financial data." Rewrote [chatContext.ts](frontend/src/lib/chatContext.ts) to match the actual V2 response shapes (monthly-summaries, category-breakdown `{ categories, total }`, recurring, net-worth `current`, goals) and log failures with `console.warn` so future endpoint shape changes don't silently return an empty prompt.

### New

- **5 unit tests for the Bedrock chat endpoint** ([test_ai_chat.py](backend/tests/unit/test_ai_chat.py)): no-preferences, wrong-provider, missing-AWS-auth, successful converse, boto3-exception handling. Uses `StaticPool` + `check_same_thread=False` so `TestClient` (httpx worker thread) can reuse the in-memory SQLite DB.
- **Live Bedrock smoke-test script** ([backend/scripts/bedrock_smoke_test.py](backend/scripts/bedrock_smoke_test.py)): runs `converse()` against a real model to verify the bearer-token path end-to-end. Kept out of the pytest suite because CI has no AWS access; invoked with `AWS_BEARER_TOKEN_BEDROCK=... uv run python scripts/bedrock_smoke_test.py`.
- **Shared `useIsMobile` hook** extracted to [hooks/useIsMobile.ts](frontend/src/hooks/useIsMobile.ts) from the inline definition in `IncomeExpenseFlowPage`.

---

## 2.4.1 - 2026-04-25

Follow-up mobile-UX pass after installing the 2.4.0 PWA on iPhone and finding real-device issues.

### Fixed

- **iOS Safari auto-zoom on input focus.** Every input with `font-size < 16px` (all of them -- default was `text-sm` = 14px) triggered a viewport zoom on tap, which then failed to zoom back out. Now any input/select/textarea on viewports below the `sm` breakpoint (640px) renders at 16px. Desktop typography is unchanged. Single global rule in [frontend/src/index.css](frontend/src/index.css).
- **PWA content hidden under the iPhone notch.** Added `viewport-fit=cover` to [index.html](frontend/index.html) and safe-area-inset utility classes (`pt-safe`, `pb-safe`, etc.) to index.css. The sidebar hamburger button and chat widget now offset themselves by `env(safe-area-inset-top)` / `env(safe-area-inset-bottom)` so they clear the notch and home indicator in standalone PWA mode.
- **Hamburger button overlapping page titles.** The `lg:hidden` hamburger at `fixed top-4 left-4` was sitting directly over every page's `<h1>`. [PageHeader](frontend/src/components/ui/PageHeader.tsx) now adds `px-12 text-center` on mobile (reserves 48px for the hamburger on each side and centers the title) and reverts to `px-0 text-left` at `sm+`. Affects all 22 pages that use `PageHeader`.
- **ChatPanel overflowing 375px viewport.** Hardcoded `w-[380px]` caused horizontal scroll on iPhone SE. Now `w-[calc(100vw-2rem)] max-w-[380px]` and `max-h-[70vh] sm:max-h-[500px]` in [ChatPanel.tsx](frontend/src/components/chat/ChatPanel.tsx).
- **Below-minimum touch targets (< 44px).** Grew the sidebar bottom-bar icons, chat-panel header buttons, and profile-modal close button from 32-36px to 44px on mobile, keeping the desktop dimensions via `sm:` resets. Apple HIG minimum is 44x44 px.
- **Numeric inputs showing full alphabetic keyboard on mobile.** Added `inputMode="decimal"` to 31 currency/percentage inputs across 14 files (budget forms, goals, settings, tax deductions, mutual fund projections, etc.). Mobile users now see a decimal-optimized keypad.
- **DataTable horizontal scroll invisible on mobile.** Existing 4px scrollbar was invisible on touch devices. The scroll wrapper now shows a thin scrollbar on viewports below `sm` and uses `-webkit-overflow-scrolling: touch` + `overscroll-behavior-x: contain` for smooth momentum scroll without rubber-banding the outer page.

---

## 2.4.0 - 2026-04-25

### Added

- **PWA support** (#80) -- Ledger Sync is now installable on iOS, Android, and desktop. Closes #80.
  - Web App Manifest with `display: standalone`, dark theme color (`#09090b`), portrait orientation, and 4 icon sizes (64, 192, 512, maskable 512). Manifest `start_url` and `scope` are relative so they resolve correctly under the `/ledger-sync/` GitHub Pages base path.
  - Service worker via `vite-plugin-pwa` (Workbox under the hood) with `registerType: 'autoUpdate'` -- updates propagate within one app restart. Precaches the entire app shell (JS/CSS/HTML/fonts/icons, ~2.4 MiB across 68 entries) so the UI loads instantly offline.
  - **Financial data is intentionally NOT cached.** The service worker explicitly denies `/api/*` via `navigateFallbackDenylist` -- API calls always hit the network, so account balances and analytics are never stale. TanStack Query's existing error-state handling covers the offline-with-data case.
  - iOS/Android install meta tags: `apple-mobile-web-app-capable`, `mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style=black-translucent`, `apple-mobile-web-app-title`, and a 180x180 apple-touch-icon.
  - Icon source committed as [frontend/public/pwa-icon-source.svg](frontend/public/pwa-icon-source.svg). Regenerate with `pnpm run generate:icons` (uses `@vite-pwa/assets-generator` + sharp).

---

## 2.3.2 - 2026-04-25

### Fixed

- **Earning-start-date is now a view filter, not a data filter.** Previously, toggling "Use as analytics start" silently dropped pre-earning-start transactions from every backend query, which corrupted factual totals: Net Worth dropped (because pre-earning balance-affecting transactions vanished), account balances shrank, and historical milestone crossings disappeared. Earning-start is now applied only at the chart x-axis layer via `useAnalyticsTimeFilter`; all underlying data (account balances, totals, milestone history) is always computed from the user's full transaction history.
  - Backend: `build_transaction_query(apply_earning_start=True)` default flipped to `False`. `_apply_date_range` in `transactions.py` no longer accepts a `user` parameter. Three analytics_v2 endpoints (`/monthly-summaries`, `/daily-summaries`, `/category-trends`) no longer clamp their period by earning-start. The `_get_earning_start_period` helper is removed (dead code).
  - Frontend: `useTransactions` hook no longer filters by earning-start-date. `useAnalyticsTimeFilter` now applies earning-start to `dateRange.start_date` (the chart-window lower bound) via a new `clampStartToEarningStart` helper with unit tests. Net Worth milestones scan the full unfiltered history, so "First Reached" dates from before earning-start remain visible.
  - 8 new unit tests (7 for `clampStartToEarningStart`, 1 regression for milestone preservation).

---

## 2.3.1 - 2026-04-25

Milestones table redesigned around the question users actually ask: "have I *held* this threshold, or just touched it once?"

### Changed

- **[Milestones table](frontend/src/pages/net-worth/components/MilestonesTable.tsx) columns simplified to 5:** Target | Status | First Reached | Stable Since | Expected to Reach. Dropped the separate Amount column (now shown as a subline under the Target label) and the Notes column (replaced by structured date columns).
- **Status now has 3 states** instead of 2:
  - **Stable** (green ✓) -- crossed the threshold and never dipped below since.
  - **Reached** (yellow ○) -- crossed once but later dipped below; still achieved, not stable.
  - **Upcoming** (muted ⊙) -- not yet crossed.
- **Header stats** now show Current net worth, Avg monthly growth, Stable X/N, and Reached X/N (was: Achieved X/N only).

### Added

- **`stableSince` field** on [`MilestoneRow`](frontend/src/pages/net-worth/netWorthProjection.ts). Computed by scanning backward for the last dip below target; returns the crossing date that stuck. `null` when the milestone is upcoming or when net worth is currently below threshold after a prior crossing. 5 new unit tests covering never-dipped, dipped-then-recovered, dipped-still-below, upcoming, and multiple-dips scenarios.

---

## 2.3.0 - 2026-04-25

Codebase-wide consolidation of hand-rolled UI primitives. A component-reuse audit found 35+ files re-implementing identical `<table>` + `<thead>` + `<tbody>` boilerplate and ~30 files repeating recharts config. This release ships a shared table primitive, a new radar chart wrapper, and migrates every file where the chart shape cleanly fits the existing wrappers.

### Added

- **`DataTable` primitive** ([frontend/src/components/ui/DataTable.tsx](frontend/src/components/ui/DataTable.tsx)) -- a generic, type-safe `<table>` with column-driven config, internal sort state (click or keyboard Enter/Space), optional row animation (auto-disabled above 200 rows), and per-row/per-cell className callbacks. 10 unit tests.
- **`StandardRadarChart`** ([frontend/src/components/analytics/StandardRadarChart.tsx](frontend/src/components/analytics/StandardRadarChart.tsx)) -- wraps the PolarGrid/PolarAngleAxis/PolarRadiusAxis/Radar boilerplate previously duplicated in `FinancialHealthScore` and `CFPScoreView`.

### Changed

- **Tables migrated to `DataTable`:** [MilestonesTable](frontend/src/pages/net-worth/components/MilestonesTable.tsx) (Net Worth), [MonthlyBreakdownTable](frontend/src/pages/trends-forecasts/components/MonthlyBreakdownTable.tsx) (Trends & Forecasts). Sort state moved off `useTrendsForecasts` into the table; hook now exposes `recentChartData` directly. `ariaSort` helper removed from `trendsUtils.tsx` (was only used by this table).
- **Charts migrated to `StandardBarChart`:** [YearOverYearComparison](frontend/src/components/analytics/YearOverYearComparison.tsx), [DayOfWeekChart](frontend/src/pages/year-in-review/components/DayOfWeekChart.tsx), [CohortSpendingAnalysis](frontend/src/components/analytics/CohortSpendingAnalysis.tsx), [PeerComparisonBenchmarks](frontend/src/components/analytics/PeerComparisonBenchmarks.tsx), [IncomeStabilityIndex](frontend/src/components/analytics/IncomeStabilityIndex.tsx) (horizontal), [LifestyleCreepDetection](frontend/src/components/analytics/LifestyleCreepDetection.tsx) (horizontal), [ExpenseElasticityChart](frontend/src/components/analytics/ExpenseElasticityChart.tsx) (horizontal).
- **Charts migrated to `StandardAreaChart`:** [SavingsMilestonesTimeline](frontend/src/components/analytics/SavingsMilestonesTimeline.tsx), [InstrumentProjections](frontend/src/components/analytics/InstrumentProjections.tsx), [FIRECalculatorPage](frontend/src/pages/FIRECalculatorPage.tsx) projection chart.
- **Charts migrated to `StandardPieChart`:** [TopMerchants](frontend/src/components/analytics/TopMerchants.tsx), [DashboardPage](frontend/src/pages/DashboardPage.tsx) (income + expense donuts with center labels), [IncomeAnalysisPage](frontend/src/pages/income-analysis/IncomeAnalysisPage.tsx) income-by-category donut.
- **Charts migrated to `StandardRadarChart`:** [FinancialHealthScore](frontend/src/components/analytics/FinancialHealthScore.tsx), [CFPScoreView](frontend/src/components/analytics/health/CFPScoreView.tsx).

### Internal

- Wrapper extensions needed during migration: `StandardBarChart` gained `referenceLines`, `xDomain`/`xType`/`yType`, `yCategoryKey` for horizontal layout, `xTickFormatter`/`yTickFormatter`, `tooltipValueWithPayload` (advanced tooltip that sees the row), `barGap`, `hideVerticalGrid`/`hideHorizontalGrid`, per-bar `fillOpacity`/`getCellColor`. `StandardAreaChart` gained `strokeDasharray` on `AreaConfig`. `StandardPieChart` gained `onSliceClick` (with auto pointer cursor). All extensions are generic — no file-specific escape hatches.
- Net ~160 LOC deleted across migrated files. Same visual output, one source of truth for chart styling.
- Deferred as intentionally custom (shape doesn't fit a generic wrapper): [CashFlowForecast](frontend/src/components/analytics/CashFlowForecast.tsx) (8 Areas with per-area strokeDasharray + confidence-cone trick), [EffectiveTaxRateChart](frontend/src/components/analytics/EffectiveTaxRateChart.tsx) (uses ReferenceDot), [SubcategoryAnalysis](frontend/src/components/analytics/SubcategoryAnalysis.tsx) (non-date x-axis with dots), [NetWorthPage](frontend/src/pages/net-worth/NetWorthPage.tsx) waterfall, [IncomeExpenseFlowPage](frontend/src/pages/income-expense-flow/IncomeExpenseFlowPage.tsx) Sankey, [SpendingAnalysisPage](frontend/src/pages/spending-analysis/SpendingAnalysisPage.tsx) nested pies, [TaxPlanningPage](frontend/src/pages/tax-planning/TaxPlanningPage.tsx) bar+line composed chart, [BudgetPage](frontend/src/pages/budget/BudgetPage.tsx) (mix of bar/area/radar in one page), plus IncomeAnalysisPage's area chart. Also deferred: the two non-flat tables ([TaxableIncomeTable](frontend/src/components/analytics/TaxableIncomeTable.tsx) expandable tree, [MultiYearProjectionTable](frontend/src/pages/tax-planning/components/MultiYearProjectionTable.tsx) pivot) — these need dedicated primitives, not `DataTable` flags.

---

## 2.2.1 - 2026-04-25

Rework of the net-worth milestones feature from 2.2.0 after self-review found two visual issues.

### Changed

- **Unified Milestones table** -- the separate "Milestones Achieved" and "Next Targets" tables from 2.2.0 have been merged into a single "Net Worth Milestones" table. One row per threshold (₹1L through ₹10Cr), sorted low-to-high, with a Status column (✓ Achieved / ⏳ Upcoming), date, and notes. Removes visual redundancy and makes the "just crossed" → "next target" progression obvious at a glance.

### Fixed

- **Projection used a different "current" value than the chart ends at.** Old code passed the account-balance-derived `netWorth` (MetricCard value) into `projectNetWorth`, while the chart ended at the cumulative income-minus-expense series. On users where those two differ, the projection line had a vertical discontinuity at "today". Fixed: the projection anchor is now the last point of the filtered chart series, and milestones/ETAs use the same anchor value. No more jump.
- **Daily + monthly dates mixed on a categorical x-axis stretched the projection horizontally.** With 1,448 historical daily points + 60 monthly points on the same string-keyed axis, Recharts gave each unique date equal width, so the 60 projected months visually occupied ~4% of the axis while representing 5 years. When projection is ON, historical data is now downsampled to month-end points so the whole timeline renders at uniform monthly spacing.
- **"Today" reference line moved to the actual projection start** (the last historical point, labeled "Now") -- previously it used `new Date()` which could sit a few days past the last data point and create tiny visual artifacts.

### Internal

- `netWorthProjection.ts` API simplified: one `buildMilestoneRows(series, anchor, growth)` replaces the previous `detectMilestonesAchieved` + `computeMilestoneETAs` pair. Added `downsampleToMonthly` helper. `projectNetWorth` signature now takes an anchor point (date + value) instead of just a number.
- Removed `MilestonesAchieved.tsx` and `TargetProjectionsTable.tsx`. New `MilestonesTable.tsx` is the single consumer. 18 unit tests.

---

## 2.2.0 - 2026-04-25

### Added

- **Net Worth milestones + projection** -- see 2.2.1 for the shipped design. This version had two separate tables and a projection anchor mismatch; fixed immediately in 2.2.1.

### Fixed (production data)

After the transfer-dedup fix in 2.1.6, production user 1's Cashback Shared account still showed a phantom -₹39 balance because the broken raw transactions never got re-ingested. Re-uploading through the UI (with force=true) recovers the 3 silently-dropped same-day duplicate transfer pairs and restores the 0.00 balance.

---

## 2.1.6 - 2026-04-25

Ingestion-pipeline fixes from a full xlsx vs DB audit.

### Fixed

- **Transfer reconciliation silently dropped duplicate same-day transfers** -- each real transfer appears in the source export as two rows (Transfer-In + Transfer-Out). The reconciler correctly collapsed paired legs via a set-based hash but couldn't distinguish "paired leg of same transfer" from "genuine second transfer of the same amount on the same day between the same accounts", so any user who recorded two identical transfers on one day lost one. Fix: normalizer emits `transfer_leg = "in" | "out"`; reconciler uses per-direction occurrence counters keyed on the canonical (date, amount, from, to, category, subcategory, note) tuple. 5 new regression tests in `test_transfer_reconciliation.py`.
- **`POST /api/analytics/v2/refresh` returned HTTP 500 on SQLite** -- the endpoint ran `SET statement_timeout = '120s'` (Postgres-only) unconditionally. Now guarded with `if session.bind.dialect.name == "postgresql"`.
- **`_calculate_category_trends` scrambled subcategory attribution** -- grouping key was `(period, category, type)` and stored subcategory was whichever sub appeared last in the loop. "Refund & Cashbacks" INCOME showed Credit Card Cashbacks ₹18,706 and Other Cashbacks ₹27,773 instead of the correct ₹43,774 / ₹4,086. Now groups by `(period, category, subcategory, type)`; 1,110 rows in `category_trends` instead of 594, matching raw totals exactly.
- **`AuditLog.user_id` was always NULL** -- `AnalyticsEngine._log_audit` never passed `user_id=self.user_id`. Now scoped per user so the audit trail can distinguish runs.
- **`/api/upload` now auto-triggers `run_full_analytics`** -- the defense-in-depth fix ensures pre-aggregated tables never drift from raw transactions when a client skips the explicit `/refresh` call.

---

## 2.1.5 - 2026-04-24

Second-pass audit: fixed calculation bugs, tightened user scoping, and hardened a few response/log paths. No UX changes.

### Fixed

- **FIRE monthly SIP compounding** -- `computeRetirementCorpus` used the naive `expectedReturn/12` as the monthly rate. At 12% effective annual that compounded to ~12.68% and understated the required SIP by ~12-13% for long horizons. Now uses `(1+r)^(1/12) - 1`. The year-by-year projection loop was rewritten to use the same monthly annuity-due so the final projected corpus converges on `requiredCorpus` within 1%
- **Tax surcharge order** -- surcharge is now computed on base tax (before Section 87A rebate), matching Indian tax code. Cess still applies on tax-after-rebate + surcharge. No practical impact today (87A ceiling sits well below any surcharge threshold) but the ordering is now correct for any future rule change
- **FY string year-2100 wraparound** -- `(year+1) % 100` formatted FY 2099-2100 as "2099-00"; now uses a helper that zero-pads the last two digits so 2100 renders as "00" correctly and collisions can't happen
- **Anomaly detection division-by-zero** -- `_detect_high_expense_months` raised `ZeroDivisionError` when all months had zero expenses. Guarded at the top: zero average short-circuits with no anomalies

### Security

- **Cross-user aggregation hardened** -- `AnalyticsEngine` now refuses per-user aggregations when `user_id` is `None` (previously those queries silently scanned every user's data). Three anomaly/budget queries (`_detect_high_expense_months`, `_detect_large_transactions`, `_update_budget_tracking`) rewired to use the explicit user filter
- **`/api/preferences/ai-config/key` response hardened** -- sets `Cache-Control: no-store, no-cache, private, max-age=0` and `Pragma: no-cache` so the decrypted API key can't land in intermediary proxy caches, disk cache, or service workers
- **OAuth error logs redacted** -- Google and GitHub token-exchange failures now log only `status` and the provider's `error` field instead of the full response body. Prevents leaking short-lived codes or internal provider URLs into log aggregators
- **Upload row cap** -- `TransactionUploadRequest.rows` bounded at 100_000 (well above a busy user's annual volume). Prevents an authenticated client from DoS-ing via arbitrarily large request bodies

### Tests

- Added `taxCalculator.test.ts` (12 tests: slab math, 87A rebate, surcharge-on-base-tax, cess, FY helpers)
- Extended `fireCalculator.test.ts` (+3 tests: effective-monthly-rate regression, projection convergence, zero-return handling)
- Extended `projectionCalculator.test.ts` (+1 test: FY 2099/2100 wrap)
- Added `test_analytics_user_scoping.py` (5 integration tests: zero-guard, user-id-required, cross-user isolation for two anomaly paths)
- Added `test_upload_schema.py` (3 unit tests: row cap enforcement)
- Totals: backend 70 tests (up from 62), frontend 65 tests (up from 49)

---

## 2.1.4 - 2026-04-24

### Security

- **python-dotenv CVE-2026-28684** -- constrained to `>=1.2.2` via `pyproject.toml`'s `constraint-dependencies`. The vulnerability allowed arbitrary file overwrite via cross-device rename fallback when `.env` was a symlink
- **PBKDF2 salt hardened** -- initial encryption implementation used a hardcoded salt; now uses a random 128-bit salt per ciphertext (salt + nonce + ciphertext base64-encoded into a single field). Flagged by SonarCloud

---

## 2.1.3 - 2026-04-24

### Changed

- **Pages folder structure standardized** -- every multi-file page now has the same layout: `<page>/PageName.tsx + use<Page>.ts + types.ts + *utils.ts + components/`. Kebab-case for directories, PascalCase for single-file pages
- **`pages/IncomeExpenseFlowPage/`** renamed to `pages/income-expense-flow/` for kebab-case consistency
- **`pages/SettingsPage.tsx`** moved into `pages/settings/SettingsPage.tsx`; sub-sections moved into `pages/settings/sections/`; `settings/components.tsx` renamed to `settings/sectionPrimitives.tsx`
- **Frontend page-level `index.ts` barrel files** removed per CLAUDE.md policy ("no barrel files")
- **Thin re-export stubs deleted** -- `ComparisonPage.tsx`, `GoalsPage.tsx`, `SubscriptionTrackerPage.tsx` were one-line re-exports and have been removed; routes now import directly from the page folders
- Every multi-file page folder now has a `components/` subfolder (settings uses `sections/` instead because "section" is the domain term)

### Removed

- **Issue backlog cleanup** -- closed #70 (Recharts -> Nivo migration, no user benefit for massive work), #13 (Finance Levels gamification page, out of scope), #84 (Lighthouse CI, maintenance burden > value for solo-dev project), #89 (already fixed by enum migration)

---

## 2.1.2 - 2026-04-24

### Changed

- **`pages/BillCalendarPage.tsx`** (799 lines) split into `pages/bill-calendar/` module: `BillCalendarPage.tsx`, `useBillCalendar.ts`, `billUtils.ts`, `types.ts`, plus 4 sub-components in `components/`
- **`pages/YearInReviewPage.tsx`** (757 lines) split into `pages/year-in-review/` module: orchestrator + `useYearInReview.ts` + `heatmapUtils.ts` + `types.ts` + 4 new sub-components; existing StatCard/InsightRow/DayOfWeekChart moved into `components/`
- **`pages/TrendsForecastsPage.tsx`** (775 lines) split into `pages/trends-forecasts/` module with same structure
- **`pages/TaxPlanningPage.tsx`** (1,090 lines) split into `pages/tax-planning/` module with `useTaxPlanning.ts` + `taxPlanningUtils.ts` + `types.ts` + 6 sub-components (TaxPageActions, TaxTip, RegimeVerdictDetail, RegimeComparison, DeductionInput, MultiYearProjectionTable)
- **`core/analytics_engine.py`** -- extracted module-level helpers (`_group_txns_by_pattern`, `_resolve_pattern_display`, `_aggregate_holdings_data`) and constants (`DEFAULT_ESSENTIAL_CATEGORIES`, `DEFAULT_INVESTMENT_ACCOUNT_PATTERNS`) into new `core/_analytics_helpers.py` (full class-level mixin split deferred to a future PR)

---

## 2.1.1 - 2026-04-24

### Changed

- **`db/models.py`** split into `db/_models/` package (7 domain files: `enums.py`, `user.py`, `transactions.py`, `investments.py`, `analytics.py`, `planning.py` + `__init__.py` facade). `db/models.py` is now a 21-line re-export facade; consumer imports unchanged

---

## 2.1.0 - 2026-04-24

### Added

- **AI Finance Chatbot** (closes #90) -- floating chat widget (bottom-right) with glass-morphism UI, streaming token-by-token responses, and conversation history per session
- **Bring Your Own Key (BYOK)** -- configure OpenAI, Anthropic, or AWS Bedrock in Settings > AI Assistant; provider list updated to current models (O3, O4 Mini, GPT-4.1 family, GPT-4o family, Claude Opus 4.7, Sonnet 4.6, Haiku 4.5, Bedrock `us.anthropic.claude-*-v1` variants)
- **AES-256-GCM encryption** (`core/encryption.py`) -- API keys encrypted at rest with PBKDF2-HMAC-SHA256 key derivation
- **Bedrock streaming proxy** (`api/ai_chat.py`) -- browser cannot call Bedrock directly (requires SigV4 + binary EventStream parsing), so `POST /api/ai/bedrock/chat` proxies via `boto3.client('bedrock-runtime').converse_stream()`
- **Financial context builder** (`lib/chatContext.ts`) -- fetches monthly summaries, category breakdowns, recurring bills, net worth, and goals from existing V2 endpoints; compresses into a ~2-4K token system prompt so the AI has full financial context
- **Chat adapters** (`lib/chatAdapters.ts`) -- provider-specific streaming request builders and SSE stream parsers (OpenAI/Anthropic go browser-direct, Bedrock goes through backend proxy)
- **AI config endpoints** -- `PUT/GET/DELETE /api/preferences/ai-config` for configuring provider/model/api_key; `GET /api/preferences/ai-config/key` returns decrypted key for frontend streaming calls
- **`DecryptionError` class** -- raised when the JWT secret rotates between saving and using a key; frontend shows "re-enter your API key" prompt
- **Alembic migration** -- adds `ai_provider`, `ai_model`, `ai_api_key_encrypted` columns to `user_preferences`

### Fixed

- **Bedrock 400 errors from browser** -- bearer tokens don't work for Bedrock inference (SigV4 required), CORS is not supported. Proxy through backend fixed both issues
- **Chat widget double-rendering** -- `doStream()` was being called inside a `setMessages` updater, causing React StrictMode to spawn two parallel streams in dev; rewritten to call streaming outside the state updater
- **Recurring frequency enum bug** (closes #89) -- semi-annual, weekly, biweekly, quarterly recurring transactions were returning 500 errors due to missing enum values in PostgreSQL; fixed by migration `20260412_1200_add_missing_recurrence_enum_values.py`

---

## 2.0.0 - 2026-04-12

### Added

- **Client-side file parsing** -- Excel/CSV files are now parsed in the browser using SheetJS; only structured JSON rows are sent to the backend (breaking API change: `POST /api/upload` now accepts JSON body instead of multipart file)
- **Frontend file parser** (`lib/fileParser.ts`) -- lazy-loads SheetJS, computes SHA-256 hash via `crypto.subtle`, maps flexible column names, validates dates/amounts/types
- **Column mapping constants** (`constants/columns.ts`) -- shared column name mappings and valid transaction types
- **CSV upload support** -- dropzone now accepts `.csv` files in addition to `.xlsx` and `.xls`
- **Backend JSON upload schema** (`schemas/upload.py`) -- `TransactionRow` and `TransactionUploadRequest` Pydantic models for structured upload validation
- **`SyncEngine.import_rows()`** -- new method accepting pre-parsed JSON rows from the frontend
- **`DataNormalizer.normalize_from_dict()`** -- normalizes plain dicts (category corrections, account standardization, transfer resolution) for the JSON upload path
- **Income & tax projections** -- input your salary CTC structure (basic, HRA, special allowance, EPF, NPS, professional tax, variable pay) per fiscal year, with FY-to-FY navigation and editing
- **RSU grant management** -- add stock grants with vesting schedules; vesting amounts auto-projected with stock appreciation
- **Growth assumptions** -- configure annual salary hike, variable pay growth, stock appreciation, and projection horizon; projections compound from the latest salary FY
- **Multi-year tax comparison table** -- side-by-side projected gross, tax, and net across future fiscal years
- **Projection calculator** (`lib/projectionCalculator.ts`) -- pure functions for multi-year salary/RSU/tax projection with full TDD test coverage
- **Salary Pydantic schemas** -- `SalaryComponents`, `RsuGrant`, `GrowthAssumptions` with backend validation
- **Three new preference endpoints** -- `PUT /api/preferences/salary-structure`, `PUT /api/preferences/rsu-grants`, `PUT /api/preferences/growth-assumptions`
- **Alembic migration** -- adds `salary_structure`, `rsu_grants`, `growth_assumptions` JSON columns to `user_preferences`
- **Indirect Tax (GST) analysis page** -- estimates GST paid on expenses using official slab rates (0/3/5/18/28%) with subcategory-first lookup; includes summary cards, GST-by-slab donut chart, monthly trend bar chart, and category breakdown table
- **YoY % change badges** -- Tax Planning summary cards show year-over-year percentage changes comparing actual data for past FYs and salary projections for current/future FYs
- **Stock price auto-fetch** -- RSU grant editor fetches live stock prices via Yahoo Finance backend proxy (`GET /api/stock-price/{symbol}`), auto-converts from stock currency to display currency
- **Account reset modes** -- Profile modal offers two reset options: "Reset Transactions" (preserves preferences, budgets, goals) and "Complete Reset" (wipes everything); backend `POST /api/auth/account/reset` accepts `mode` query parameter (`full` | `transactions`)
- **Analytics refresh endpoint** -- `POST /api/analytics/v2/refresh` recomputes all pre-aggregated analytics tables synchronously; called by the frontend after upload instead of relying on `BackgroundTasks` (which can be killed on Vercel serverless before completion)

### Changed

- **Upload pipeline** -- four-phase UX (Parsing -> Processing -> Uploading -> Computing Analytics) with clear progress indication; analytics refresh is a separate synchronous request for serverless reliability; force-reupload reuses already-parsed data without re-parsing the file
- **Upload API** -- `POST /api/upload` now accepts `{ file_name, file_hash, rows, force }` JSON body instead of multipart file upload (breaking change)
- **SheetJS upgraded** -- migrated from vulnerable npm `xlsx@0.18.5` to CDN-distributed `xlsx@0.20.3` (fixes GHSA-4r6h-8v6p-xvw6 Prototype Pollution and GHSA-5pgg-2g8v-p4x9 ReDoS)
- **Upload error handling** -- Axios error codes mapped to user-friendly toast messages; conflict state (duplicate file) now offers force-reupload inline
- **Tax Planning page** -- extended with salary-based projection toggle, stacked paid-vs-projected tax bars in yearly chart, projection-aware labels throughout
- **Settings page** -- new "Income & Salary Structure" section with salary grid, RSU grant editor, and growth assumption sliders
- **preferencesStore** -- hydration logic extracted into standalone pure helpers to reduce cognitive complexity (SonarCloud finding)
- **tsconfig** -- bumped `lib` from ES2022 to ES2023 for `Array.findLast()` support

### Removed

- **Server-side file parsing for uploads** -- backend no longer receives raw Excel/CSV files via the upload endpoint (CLI still uses the old file-based `import_file()` path)
- **Temporary file handling** -- removed temp file creation, magic byte validation, and chunked file reading from upload endpoint

### Fixed

- **Upload stuck with no feedback in production** (issue #72) -- root cause was Vercel 60s serverless timeout combined with large file uploads; solved by moving parsing to the client
- **Zero-amount transactions rejected** -- `TransactionRow.amount` validation changed from `gt=0` to `ge=0` to accept valid zero-amount rows
- **Sticky PageHeader consistency** -- moved PageHeader outside Framer Motion containers on InsightsPage, FIRECalculatorPage, and TaxPlanningPage so `position: sticky` works correctly (CSS `transform` from animations was breaking it)
- **Scroll-to-top on navigation** -- reset `#main-content` scroll position on route change so every page starts from the top
- **Returns Analysis FY switching** (issue #88) -- CAGR and Monthly ROI now update when changing fiscal year
- **TaxPlanningPage cognitive complexity** -- extracted helper functions to bring SonarCloud score under threshold
- **Chart hover/tooltip standardization** -- consistent hover states and tooltip styling across all chart pages
- **SonarCloud findings** -- `localeCompare` for string sorts, `Number.parseInt` over global `parseInt`, `findLast` over `filter().at(-1)`, extracted nested ternaries, composite keys for RSU vesting rows
- **SonarCloud cognitive complexity** -- extracted helper functions in QuickInsights, InvestmentAnalyticsPage, generateDerivedData, and generateTransactions to bring S3776 scores under threshold
- **Projected tax bar color** -- uses orange instead of green to distinguish from paid tax
- **Sidebar double-highlight** -- NavLink `end` prop prevents parent route from highlighting alongside child

---

## 1.9.0 - 2026-04-10

### Added

- **Multi-currency display conversion** -- view all financial data in 15 currencies (USD, EUR, GBP, JPY, CAD, AUD, CHF, SGD, AED, CNY, KRW, SEK, NZD, HKD) with live ECB exchange rates via frankfurter.dev
- **Currency quick-switcher** -- sidebar currency selector for instant switching with rate indicator pill showing live conversion (e.g., "1 USD = INR 92.68")
- **Exchange rate proxy** -- backend endpoint (`GET /api/exchange-rates`) with 24h in-memory cache and three-tier fallback (fresh cache, stale cache, hardcoded rates)
- **Currency metadata constants** -- `currencies.ts` with locale, symbol, number format, and short unit configuration per currency
- **`display_currency` preference** -- persisted per-user with Alembic migration, auto-derives number format, symbol, and symbol position
- **Google Analytics tracking** -- site-wide analytics via G-PFFMG7D8DP

### Changed

- **Settings: Display Preferences** -- replaced manual number format, currency symbol, and symbol position fields with a single "Display Currency" dropdown that auto-derives all three
- **Formatters** -- `formatCurrency`, `formatCurrencyCompact`, and `formatCurrencyShort` now apply exchange rate conversion automatically via `convertAmount()` helper
- **Formatter short units** -- `formatCurrencyShort` switches between Cr/L/K (INR) and B/M/K (international) based on display currency metadata
- **Documentation rebrand** -- updated README, CLAUDE.md, package.json, pyproject.toml, and all docs with "Personal Finance Dashboard" tagline and compelling descriptions

---

## 1.8.1 - 2026-04-05

### Added

- **Pre-computed daily summaries** -- `daily_summaries` table for instant heatmap rendering (income, expenses, net, transaction counts, top category per day)
- **Daily summaries API** -- `GET /api/analytics/v2/daily-summaries` with date range and limit filters
- **Investment holdings API** -- `GET /api/analytics/v2/investment-holdings` with active_only filter and portfolio summary
- **Auto-populate investment holdings** -- analytics engine dynamically detects investment accounts from preferences and computes net invested amounts from transfer flows

### Changed

- **Calculations fast path** -- `get_totals`, `get_monthly_aggregation`, and `get_category_breakdown` read from pre-computed tables when no date filter is active
- **YearInReview heatmap** -- uses daily summaries instead of scanning all transactions

### Fixed

- User scoping, cascades, indexes, and constraints added to database schema
- Regex backtracking risk eliminated in note normalization
- SonarCloud findings resolved, mobile responsiveness improved

---

## 1.8.0 - 2026-04-05

### Added

- **Demo mode** -- "Try Demo" on landing page lets visitors explore the full dashboard with ~500 realistic sample transactions, zero signup
- **Smart account classification** -- keyword matching for EPF, PPF, Mutual Funds, Groww, Zerodha, FD, Stocks, Gold, Crypto as Investments; Indian banks as Bank Accounts; EMI/mortgage as Loans
- **Auto income classification** -- Salary/Freelance to Taxable, Dividends/Interest to Investment Returns, Cashbacks to Non-taxable
- **Auto investment account mapping** -- MF/Groww to mutual_funds, Stocks/Zerodha to stocks, FD to fixed_deposits, PPF/EPF/NPS to ppf_epf
- **Backend migrated to Vercel** -- replaced Render (30-50s cold starts) with Vercel serverless via Mangum for zero cold start latency
- **Neon database via Vercel integration** -- unified dashboard management
- **Alembic migration workflow** -- GitHub Actions runs migrations on push to main when schema files change

### Changed

- Demo banner uses floating pill overlay instead of sticky bar
- Account classification priority: Credit Cards > Investments > Loans > Bank Accounts > Cash > Other

---

## 1.7.0 - 2026-03-14

### Added

- Code quality rules in CLAUDE.md (200-line file limit, import conventions, design system constraints)
- `CHART_TEXT`, `CHART_SURFACE`, `CHART_INPUT` constants for centralized chart styling

### Changed

- Split 4 oversized pages into focused components: SettingsPage (20 files), SubscriptionTrackerPage (13), GoalsPage (13), ComparisonPage (13)
- Chart styling migrated from raw hex values to shared constants

---

## 1.6.0 - 2026-03-03

### Added

- **Analytics V2 API** -- stored aggregations for monthly summaries, category trends, transfer flows, recurring transactions, merchant intelligence, net worth, fiscal year summaries
- **Sidebar** -- collapsible navigation groups, user profile, search, dynamic badge counts, notification center
- 11 new pages: Returns Analysis, Tax Planning, Cash Flow Forecast, Net Worth, Budget, Subscription Tracker, Spending Analysis, Investment Analytics, Dashboard, Profile Modal
- Standard chart components: `StandardAreaChart`, `StandardBarChart`, `StandardPieChart`

### Changed

- Backend restructured with FastAPI routers, middleware, and error handling
- OAuth authentication (Google, GitHub) via authorization code flow

---

## 1.5.0 - 2026-03-01

### Added

- Settings page complete rebuild (single scrollable page with glass cards)
- Financial Goals with savings pool allocation and smart projections
- Subscription Tracker with confirm/manual add, Bill Calendar integration
- User preferences API with comprehensive Pydantic models
- OAuth fields in users table

### Changed

- UI/UX polish across 18+ pages (hover states, visual hierarchy, animations)
- Goal/budget/anomaly creation refreshes lists without page reload

### Fixed

- Goal/budget creation sent as JSON body instead of query params
- GoalsPage vertical gaps and animation issues

---

## 1.4.0 - 2026-02-28

### Added

- Deployment configuration (GitHub Pages + Neon PostgreSQL + backend hosting)
- `AnalyticsEngine` for post-upload data analytics
- CI workflow with GitHub Actions (lint, type-check, build, deploy)

### Changed

- SQLite-only `strftime` replaced with database-agnostic date formatting
- React Router basename configured for `/ledger-sync/` subpath
- GitHub Actions pinned to commit SHAs for security

### Fixed

- `email-validator` dependency for Pydantic `EmailStr`
- `frontend/src/lib/` tracked (previously ignored by `.gitignore`)
- TypeScript errors and SonarQube findings resolved

---

## 1.3.0 - 2026-02-21

### Added

- Core architecture: React Router, authentication, page routing, dark theme
- iOS-inspired color palette with Framer Motion animations
- `AppLayout`, `PageHeader`, `MetricCard`, `Sparkline`, `ChartEmptyState`
- Investment Analytics, Comparison, and Net Worth pages
- Financial calculation APIs (totals, aggregations, category breakdowns)
- `useAnalyticsTimeFilter` hook for centralized time filter state
- Command palette, comprehensive documentation

### Changed

- Frontend rebuilt from Next.js to React + Vite SPA
- Backend migrated to layered architecture with SQLAlchemy 2.0

---

## 1.2.0 - 2026-02-04

### Added

- Authentication flow (login, registration, protected routes)
- ComparisonPage, Year in Review (heatmap + insights), Budget management, Anomaly review
- Settings tabs (essential categories, income classification, investment mappings)
- Financial Health Score (8 metrics across 4 pillars)
- Spending Velocity Gauge

### Changed

- Chart tooltips with glass styling, natural line types, enhanced animations
- Date handling standardized with `getDateKey`
- API endpoints migrated to `DatabaseSession`

---

## 1.1.0 - 2026-01-27

### Added

- PostgreSQL support
- Recurring transaction detection, top merchants analytics
- Year-over-year comparison charts
- Tax Planning page, Trends & Forecasts page
- CSV export endpoint, period navigation

### Changed

- Currency formatting refactored for consistency across all pages

---

## 1.0.0 - 2026-01-09

### Added

- Backend sync engine for Excel imports (Money Manager Pro format)
- Data ingestion pipeline: `excel_loader` -> `normalizer` -> `validator` -> `hash_id`
- SHA-256 transaction deduplication (idempotent re-uploads)
- Frontend with layout, homepage, and initial analytics
- Income-Expense Flow page, ExpenseTreemap, QuickInsights
- Date range filtering, income categorization with financial year grouping
- Testing setup, structured logging, comprehensive documentation
- MIT License
