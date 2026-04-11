# Changelog -- Ledger Sync

All notable changes to this project are documented here.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

---

## [Unreleased]

### Added

- **Income & tax projections** -- input your salary CTC structure (basic, HRA, special allowance, EPF, NPS, professional tax, variable pay) per fiscal year, with FY-to-FY navigation and editing
- **RSU grant management** -- add stock grants with vesting schedules; vesting amounts auto-projected with stock appreciation
- **Growth assumptions** -- configure annual salary hike, variable pay growth, stock appreciation, and projection horizon; projections compound from the latest salary FY
- **Multi-year tax comparison table** -- side-by-side projected gross, tax, and net across future fiscal years
- **Projection calculator** (`lib/projectionCalculator.ts`) -- pure functions for multi-year salary/RSU/tax projection with full TDD test coverage
- **Salary Pydantic schemas** -- `SalaryComponents`, `RsuGrant`, `GrowthAssumptions` with backend validation
- **Three new preference endpoints** -- `PUT /api/preferences/salary-structure`, `PUT /api/preferences/rsu-grants`, `PUT /api/preferences/growth-assumptions`
- **Alembic migration** -- adds `salary_structure`, `rsu_grants`, `growth_assumptions` JSON columns to `user_preferences`

### Changed

- **Tax Planning page** -- extended with salary-based projection toggle, stacked paid-vs-projected tax bars in yearly chart, projection-aware labels throughout
- **Settings page** -- new "Income & Salary Structure" section with salary grid, RSU grant editor, and growth assumption sliders
- **preferencesStore** -- hydration logic extracted into standalone pure helpers to reduce cognitive complexity (SonarCloud finding)
- **tsconfig** -- bumped `lib` from ES2022 to ES2023 for `Array.findLast()` support

### Fixed

- **Sticky PageHeader consistency** -- moved PageHeader outside Framer Motion containers on InsightsPage, FIRECalculatorPage, and TaxPlanningPage so `position: sticky` works correctly (CSS `transform` from animations was breaking it)
- **Scroll-to-top on navigation** -- reset `#main-content` scroll position on route change so every page starts from the top
- **Returns Analysis FY switching** (issue #88) -- CAGR and Monthly ROI now update when changing fiscal year
- **TaxPlanningPage cognitive complexity** -- extracted helper functions to bring SonarCloud score under threshold
- **Chart hover/tooltip standardization** -- consistent hover states and tooltip styling across all chart pages
- **SonarCloud findings** -- `localeCompare` for string sorts, `Number.parseInt` over global `parseInt`, `findLast` over `filter().at(-1)`, extracted nested ternaries, composite keys for RSU vesting rows
- **Projected tax bar color** -- uses orange instead of green to distinguish from paid tax

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
