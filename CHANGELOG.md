# Changelog -- Ledger Sync

All notable changes to Ledger Sync are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- **Multi-currency display conversion** - View all financial data in 15 currencies (USD, EUR, GBP, JPY, CAD, AUD, CHF, SGD, AED, CNY, KRW, SEK, NZD, HKD) with live ECB exchange rates via frankfurter.app
- **Currency quick-switcher** - Sidebar currency selector for instant switching with rate indicator pill
- **Exchange rate proxy** - Backend endpoint (`GET /api/exchange-rates`) with 24h in-memory cache and three-tier fallback (fresh cache, stale cache, hardcoded rates)
- **Currency metadata constants** - `currencies.ts` with locale, symbol, number format, and short unit configuration per currency
- **`display_currency` preference** - Persisted per-user with Alembic migration, auto-derives number format, symbol, and symbol position

### Changed

- **Settings: Display Preferences** - Replaced manual number format, currency symbol, and symbol position fields with a single "Display Currency" dropdown that auto-derives all three
- **Formatters** - `formatCurrency`, `formatCurrencyCompact`, and `formatCurrencyShort` now apply exchange rate conversion automatically via `convertAmount()` helper
- **Formatter short units** - `formatCurrencyShort` switches between Cr/L/K (INR) and B/M/K (international) based on display currency metadata

## [0.9.1] - 2026-04-05

### Added

- **Daily summaries table** - Pre-computed daily aggregations (income, expenses, net, transaction counts, top category) stored in `daily_summaries` table for instant heatmap rendering
- **Daily summaries API** - `GET /api/analytics/v2/daily-summaries` endpoint with start_date, end_date, and limit filters
- **Investment holdings API** - `GET /api/analytics/v2/investment-holdings` endpoint with active_only filter and portfolio summary
- **Auto-populate investment holdings** - Analytics engine dynamically detects investment accounts from user preferences and computes net invested amounts from transfer flows

### Changed

- **Calculations fast path** - `get_totals`, `get_monthly_aggregation`, and `get_category_breakdown` now read from pre-computed `monthly_summaries`/`category_trends` tables when no date filter is active, falling back to raw transaction scan otherwise
- **YearInReview heatmap** - Uses pre-computed daily summaries instead of scanning all transactions, with automatic fallback

## [0.9.0] - 2026-04-05

### Added

- **Demo mode** - "Try Demo" button on landing page and `/demo` direct link let visitors explore the full dashboard with realistic sample data, zero signup required
  - ~500 deterministic Indian household transactions generated client-side (salary, rent, EMI, SIP, PPF, groceries, dining, etc.)
  - 18 derived data generators seed all analytics pages (KPIs, monthly summaries, category trends, net worth, budgets, goals, anomalies, recurring transactions, etc.)
  - Axios interceptor as safety net blocks real API calls and returns computed data for un-seeded query keys
  - Floating demo banner with "Sign up" and exit controls, overlays pages without displacing layout
  - `useDemoGuard` hook blocks mutations (upload, settings save, goal/budget creation, anomaly review) with user-friendly toast
  - Browser refresh re-seeds TanStack Query cache via `useAuthInit`; stale demo tokens auto-cleaned on tab reopen
  - Real OAuth login from demo mode automatically clears demo state
- **Smart account classification defaults** - Keyword matching now recognizes EPF, PPF, NPS, Mutual Funds, Groww, Zerodha, Kuvera, Stocks, Demat, Fixed Deposits, Gold, Crypto as Investments; Indian bank names (HDFC, SBI, ICICI, Axis, Kotak, etc.) as Bank Accounts; EMI/mortgage as Loans
- **Auto income classification** - When all income categories are unclassified, keyword matching auto-assigns: Salary/Freelance/Bonus to Taxable, Dividends/Interest/Capital Gains to Investment Returns, Cashbacks/Refunds to Non-taxable, Gifts/Prizes to Other
- **Auto investment account mapping** - Unmapped investment accounts auto-map by keyword: MF/Groww to mutual_funds, Stocks/Zerodha to stocks, FD to fixed_deposits, PPF/EPF/NPS to ppf_epf, Gold/Crypto/Real Estate to their types
- **Backend migrated to Vercel** - Replaced Render (free tier with 30-50s cold starts) with Vercel serverless via Mangum adapter for zero cold start latency
- **Neon database via Vercel integration** - Database connected through Vercel's Neon Storage integration for unified dashboard management
- **Alembic migration workflow** - GitHub Actions workflow runs migrations automatically on push to main when schema files change

### Changed

- Demo banner uses `fixed` positioning (floating pill overlay) instead of `sticky` full-width bar that pushed page content down
- Account classification priority order: Credit Cards > Investments > Loans > Bank Accounts > Cash > Other (prevents "ICICI Loan" from matching bank instead of loan)

## [0.8.0] - 2026-03-14

### Added

- CLAUDE.md code quality rules: 200-line file limit, import conventions, design system constraints, testing expectations, performance rules
- `CHART_TEXT`, `CHART_SURFACE`, `CHART_INPUT` constants in `chartColors.ts` for centralized chart styling tokens
- `settings/styles.ts` for shared CSS class strings separated from component exports

### Changed

- Split `SettingsPage.tsx` (1733 lines) into 20 focused components under `pages/settings/`
- Split `SubscriptionTrackerPage.tsx` (1109 lines) into 13 components under `pages/subscription-tracker/`
- Split `GoalsPage.tsx` (1106 lines) into 13 components under `pages/goals/`
- Split `ComparisonPage.tsx` (1036 lines) into 13 components under `pages/comparison/`
- Replaced raw hex/rgba values in `chartDefaults.tsx` and `ChartTooltip.tsx` with `CHART_TEXT`/`CHART_SURFACE` constants
- Fixed relative `../../` imports in `useAnalyticsV2.ts` to use `@/` path alias

## [0.7.0] - 2026-03-03

### Added

- Analytics V2 API with stored aggregations: monthly summaries, category trends, transfer flows, recurring transactions, merchant intelligence, net worth snapshots, fiscal year summaries
- Sidebar component with collapsible navigation groups, user profile, search, dynamic badge counts, and integrated notification center
- Returns Analysis page with investment returns tracking and heatmap visualization
- Tax Planning page with India FY-based slab breakdown and regime comparison
- Cash Flow Forecast component with projected income/expense trends
- Profile modal for user account management
- Net Worth page with assets, liabilities, historical trends, and categorized account details
- Budget page with tracking, monitoring, and radar chart visualization
- Subscription Tracker page with recurring expense detection
- Spending Analysis page with 50/30/20 rule visualization
- Investment Analytics page with portfolio breakdown across 4 categories
- Dashboard page with KPI sparklines and quick insights
- Standard chart components: `StandardAreaChart`, `StandardBarChart`, `StandardPieChart`
- `ChartEmptyState` and `Sparkline` shared components

### Changed

- Backend restructured with FastAPI application configuration, routers, middleware, and error handling
- OAuth authentication endpoints for Google and GitHub (authorization code flow)
- Core analytics engine and calculation service consolidated
- Frontend UI components, layout, and shared features rebuilt

## [0.6.0] - 2026-03-01

### Added

- Comprehensive frontend enhancement: fixed 30 issues across 28 files
- Settings page complete rebuild: single scrollable page with glass card sections, replaced drag-drop with toggles/selects
- `ProfileModal` component for user account management
- `ConfirmDialog` generic confirmation dialog component
- Financial Goals page with savings pool allocation, smart projections, sort/edit/delete
- Subscription Tracker with confirm/manual add, integrated with Bill Calendar
- Bill Calendar page with monthly calendar view of upcoming bills
- User preferences API with comprehensive Pydantic models
- OAuth fields added to users table with Alembic migration

### Changed

- UI/UX polish across all 18+ pages: hover states, visual hierarchy, animations
- Settings page consolidated from 10 tabs to single-page layout
- Goal/budget/anomaly creation now properly refreshes lists without page reload
- Wired up 3 previously unused preference fields to consumer pages

### Fixed

- Goal/budget creation data sent as JSON body instead of query params
- GoalsPage vertical gaps reduced, animation issues resolved

## [0.5.0] - 2026-02-28

### Added

- Deployment configuration for GitHub Pages (frontend), Neon PostgreSQL (database), and backend (originally Render, later migrated to Vercel)
- `AnalyticsEngine` for post-upload data analytics: monthly summaries, category trends, transfer flows, recurring transactions, merchant intelligence, anomaly detection, net worth, fiscal year summaries
- `ChartContainer` component to prevent negative dimension warnings
- CI workflow with GitHub Actions: lint, type-check, build, deploy
- `pnpm-lock.yaml` for reproducible builds

### Changed

- Backend startup made robust for production deployment
- SQLite-only `strftime` replaced with database-agnostic date formatting
- React Router basename configured for `/ledger-sync/` subpath routing
- GitHub Actions pinned to commit SHAs for security
- Poetry lockfile regenerated to match updated `pyproject.toml`

### Fixed

- `email-validator` dependency added for Pydantic `EmailStr`
- Explicit pnpm cache pattern in deploy workflow
- `frontend/src/lib/` files tracked (previously ignored by overly broad `.gitignore`)
- TypeScript errors resolved across the codebase
- SonarQube code quality issues addressed
- Debug print statements removed

## [0.4.0] - 2026-02-21

### Added

- Core application architecture with React Router, authentication, and page routing
- Dark theme with iOS-inspired color palette and Framer Motion animations
- `AppLayout` with sidebar navigation and `PageHeader` component
- Investment Analytics, Comparison, and Net Worth reporting pages
- `Sparkline` and `ChartEmptyState` shared components
- Financial calculation APIs: totals, aggregations, category breakdowns, daily net worth
- `useAnalyticsTimeFilter` hook for centralized time filter state management
- `MetricCard` component with animated values and trend indicators
- `Button` component with variants and loading states
- Command palette for quick navigation
- Initial backend API with analytics engine and database models
- Comprehensive documentation: API reference, database schema, development guide, architecture

### Changed

- Frontend rebuilt from Next.js to React + Vite SPA architecture
- Backend migrated to layered architecture with SQLAlchemy 2.0

## [0.3.0] - 2026-02-04

### Added

- Authentication flow with login, registration, and protected routes
- HomePage component with quick actions and features overview
- ComparisonPage for period-over-period financial analysis
- Year in Review page with spending heatmap and annual insights
- Settings tabs: essential categories, income classification, investment account mappings
- Spending Velocity Gauge and related analytics components
- Financial Health Score calculation with 8 metrics across 4 pillars
- Budget management page
- Anomaly review page with filtering and summary statistics

### Changed

- Chart tooltips enhanced with consistent glass styling
- Analytics components refactored for improved calculations and UI consistency
- API endpoints migrated to `DatabaseSession` instead of `Session`
- Transaction processing improved with better duplicate handling
- Time range defaults updated to `all_time` across all analytics pages
- Charts refactored to use natural line type with enhanced animations
- Console logs replaced with `logger.debug` for transfer updates
- Date handling standardized using `getDateKey` across all pages

### Fixed

- Anomaly key generation improved for better uniqueness

## [0.2.0] - 2026-01-27

### Added

- PostgreSQL support via `psycopg2-binary`
- Recurring transaction detection and top merchants analytics
- Year-over-year comparison charts
- Tax Planning page with user preferences integration
- Trends & Forecasts page with rolling averages
- Time filter for spending analysis with income classification
- Upload page improvements with better feedback and sample data format
- CSV export endpoint for transactions
- Period navigation for analytics components

### Changed

- Currency formatting refactored across all pages for consistent display
- Monetary values rounded for improved display accuracy

## [0.1.0] - 2026-01-09

### Added

- Backend synchronization engine for Excel file imports (Money Manager Pro format)
- Data ingestion pipeline: `excel_loader` -> `normalizer` -> `validator` -> `hash_id`
- SHA-256 transaction deduplication (idempotent re-uploads)
- Frontend with layout and homepage
- Phase 2 Financial Insights Dashboard: overview, behavior, trends, and wrapped insights
- Advanced spending forecast chart
- ExpenseTreemap, MultiCategoryTimeAnalysis, and SubcategoryAnalysis components
- Income-Expense Flow page
- Date range filtering for transactions API
- QuickInsights component
- Transaction filtering and sidebar layout
- Income categorization with financial year grouping
- Testing setup, CSV utilities, and structured logging
- Comprehensive documentation and project roadmap
- MIT License
