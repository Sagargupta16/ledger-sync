# System Architecture

## Overview

Ledger Sync is a self-hosted personal finance dashboard built as a full-stack application with clear separation between backend and frontend. The system imports Excel bank statements, reconciles transactions via SHA-256 hashing, and delivers 24 pages of financial analytics -- from spending breakdowns to investment tracking and tax projections -- with multi-currency display and an AI chatbot that has full context of your financial data.

## High-Level Architecture

<p align="center">
  <img src="images/system-overview.svg" alt="System Architecture" width="100%"/>
</p>

## Backend Architecture

### Layers

#### 1. **API Layer** (`src/ledger_sync/api/`)

- **Responsibility**: HTTP endpoints, request/response handling
- **Components**:
  - `main.py` - FastAPI application setup, middleware, CORS, security headers
  - `auth.py` - Token refresh, logout, profile management
  - `oauth.py` - OAuth login via Google and GitHub (authorization code exchange via `httpx`)
  - `analytics.py` - On-the-fly analytics endpoints (overview, KPIs, trends, behavior)
  - `analytics_v2.py` - Pre-aggregated analytics endpoints (reads from summary tables for speed)
  - `calculations.py` - Financial calculation endpoints
  - `preferences.py` - User preferences CRUD (includes AI config endpoints: `PUT/GET/DELETE /api/preferences/ai-config`)
  - `ai_chat.py` - Bedrock streaming proxy (`POST /api/ai/bedrock/chat`). Required because Bedrock needs SigV4 auth and doesn't support CORS for browser-direct calls. Uses `boto3.client('bedrock-runtime').converse_stream()` and re-streams as SSE
  - `exchange_rates.py` - Exchange rate proxy with 24h cache (frankfurter.dev)
  - `stock_price.py` - Yahoo Finance proxy for RSU grant stock prices
  - `deps.py` - JWT authentication dependency (`get_current_user`)
  - Routes requests to business logic and return JSON responses
- **Authentication**: OAuth-only (no email/password). Google/GitHub OAuth providers configured via environment variables. Backend exchanges authorization codes for user info, then issues JWT access/refresh tokens.

#### 2. **Core/Business Logic Layer** (`src/ledger_sync/core/`)

- **Responsibility**: Business rules, algorithms, data processing
- **Components**:
  - `reconciler.py` - Transaction reconciliation logic
    - Insert new transactions
    - Update existing ones
    - Soft-delete stale records
    - Uses SHA-256 hashing for deterministic IDs
  - `sync_engine.py` - Data synchronization orchestration
  - `calculator.py` - Financial calculations (income, expenses, insights)
  - `analytics_engine.py` - Heavy analytics computation (monthly summaries, category trends, net worth snapshots, anomaly detection, FY summaries). Module-level helpers (`_group_txns_by_pattern`, `_resolve_pattern_display`, `_aggregate_holdings_data`) + constants (`DEFAULT_ESSENTIAL_CATEGORIES`, `DEFAULT_INVESTMENT_ACCOUNT_PATTERNS`) extracted into `_analytics_helpers.py`
  - `insights.py` - Smart financial insight generation
  - `query_helpers.py` - Shared SQL aggregation helpers (`income_sum_col`, `expense_sum_col`, `build_transaction_query`) used by both `calculations.py` and `analytics.py` to eliminate duplicated CASE/SUM patterns
  - `time_filter.py` - Time range filtering logic
  - `encryption.py` - AES-256-GCM encrypt/decrypt for AI API keys. Uses PBKDF2-HMAC-SHA256 to derive an encryption key from the JWT secret, with a per-ciphertext random 128-bit salt. Output format: base64(salt[16] || nonce[12] || ciphertext). `DecryptionError` raised on tag mismatch so callers can prompt for re-entry.
  - `auth/` - JWT token creation, verification, and blacklisting

#### 3. **Data Access Layer** (`src/ledger_sync/db/`)

- **Responsibility**: Database interactions, ORM operations
- **Components**:
  - `models.py` - 21-line facade that re-exports from `_models/` package. All consumer code imports from here (`from ledger_sync.db.models import User, Transaction, ...`)
  - `_models/` - SQLAlchemy models split by bounded context:
    - `_constants.py` - Length constants used across models
    - `enums.py` - `TransactionType`, `AccountType`, `AnomalyType`, `RecurrenceFrequency`, `GoalStatus`
    - `user.py` - `User`, `UserPreferences` (now includes `ai_provider`, `ai_model`, `ai_api_key_encrypted`), `AuditLog`
    - `transactions.py` - `Transaction`, `ImportLog`, `AccountClassification`, `ColumnMappingLog`
    - `investments.py` - `NetWorthSnapshot`, `InvestmentHolding`, `TaxRecord`
    - `analytics.py` - `DailySummary`, `MonthlySummary`, `CategoryTrend`, `TransferFlow`, `FYSummary`, `MerchantIntelligence`
    - `planning.py` - `RecurringTransaction`, `ScheduledTransaction`, `Anomaly`, `Budget`, `FinancialGoal`
  - `session.py` - Database session management
  - `base.py` - Base configuration
  - `migrations/` - Alembic migration scripts

#### 4. **Ingestion Layer** (`src/ledger_sync/ingest/`)

- **Responsibility**: Data import and validation
- **Components**:
  - `excel_loader.py` - Read Excel files, parse data (used by CLI only; web uploads are parsed client-side)
  - `csv_loader.py` - Read CSV files (used by CLI only)
  - `normalizer.py` - Clean, transform, standardize data. `normalize_from_dict()` handles JSON upload rows; `normalize_row()` handles DataFrame rows from CLI
  - `validator.py` - Validate data integrity and format
  - `hash_id.py` - Generate deterministic transaction IDs

#### 5. **Utilities Layer** (`src/ledger_sync/utils/`)

- **Responsibility**: Helper functions, logging, common utilities
- **Components**:
  - `logging.py` - Centralized logging configuration

### Data Flow

<p align="center">
  <img src="images/upload-pipeline.svg" alt="Upload & Sync Pipeline" width="100%"/>
</p>

### Key Algorithms

#### Transaction Reconciliation

```python
For each imported transaction:
1. Calculate SHA-256 hash of (date, amount, category, account)
2. Look up hash_id in database
3. If not found: INSERT
4. If found but data changed: UPDATE
5. If found and same: SKIP
6. Mark old transactions not in import as SOFT_DELETE
```

#### Income & Tax Projection Pipeline

The projection system is entirely client-side (no backend computation). Data flows through these layers:

```
Settings (SalaryStructureSection)
  -> preferencesStore (Zustand, persisted to API)
     -> TaxPlanningPage reads salaryStructure, rsuGrants, growthAssumptions
        -> projectionCalculator.ts (pure functions)
           -> projectFiscalYear(targetFY, salary, rsus, growth, fyStartMonth)
              -> Returns ProjectedFYBreakdown (gross, basic, variable, RSU vestings)
           -> projectMultipleYears(salary, rsus, growth, fyStartMonth)
              -> Returns array of projected breakdowns for comparison table
           -> getRsuVestingsByFY(grants, fyStartMonth, appreciation)
              -> Returns FY-keyed vesting amounts with stock appreciation
        -> taxCalculator.ts computes tax on projected gross
           -> Returns slab breakdown, cess, surcharge, rebate
```

Key design decisions:
- **Pure functions**: `projectionCalculator.ts` has zero side effects, making it trivially testable
- **FY-keyed salary**: Each fiscal year has its own salary structure, allowing users to track raises
- **Growth compounding**: Projections compound from the latest user-entered FY (not from the current FY)
- **RSU appreciation**: Stock price appreciates at user-configured rate from grant date to vesting date

#### Financial Calculations

```python
Income = Sum of all Income type transactions
Expenses = Sum of all Expense type transactions
Net = Income - Expenses
Savings Rate = (Income - Expenses) / Income

# 50/30/20 Budget Rule (based on income)
Needs = Essential expenses (should be ≤50% of income)
Wants = Discretionary expenses (should be ≤30% of income)
Savings = Income - Expenses (should be ≥20% of income)

# Investment NET calculation
NET Investment = Transfer-In amounts - Transfer-Out amounts
```

## Frontend Architecture

### Layers

#### 1. **Pages Layer** (`src/pages/`)

- **Responsibility**: Screen-level components, layout, page composition
- **Structure convention**:
  - **Single-file pages** use PascalCase (e.g., `DashboardPage.tsx`, `BudgetPage.tsx`)
  - **Multi-file pages** use kebab-case directories, each containing `<PageName>Page.tsx` (thin orchestrator) + `use<Page>.ts` (state/data hook) + `types.ts` + `*utils.ts` + `components/` subfolder for sub-components
  - Barrel files (`index.ts`) are **not** used at the page level; `App.tsx` lazy-imports each page's main file directly
- **Multi-file page folders**: `bill-calendar/`, `comparison/`, `goals/`, `income-expense-flow/`, `settings/`, `subscription-tracker/`, `tax-planning/`, `trends-forecasts/`, `year-in-review/`. Settings uses `sections/` instead of `components/` because "section" is the domain term.
- **Pages** (24 total):
  - `HomePage` - Landing page
  - `DashboardPage` - Main dashboard with KPIs, sparklines, and quick insights
  - `UploadSyncPage` - Hero upload UI with sample format preview
  - `TransactionsPage` - Transaction table with filtering
  - `SpendingAnalysisPage` - 50/30/20 budget rule analysis
  - `IncomeAnalysisPage` - Income sources and growth tracking
  - `comparison/` - Period-over-period financial comparison (multi-file)
  - `trends-forecasts/` - Trends and forecasting (multi-file)
  - `income-expense-flow/` - Sankey diagram cash flow visualization (multi-file)
  - `InvestmentAnalyticsPage` - 4-category investment portfolio
  - `MutualFundProjectionPage` - SIP/MF projections
  - `ReturnsAnalysisPage` - Investment returns tracking
  - `tax-planning/` - Tax planning with salary-based multi-year projections (multi-file)
  - `FIRECalculatorPage` - FIRE number, Coast FIRE, retirement corpus planner
  - `NetWorthPage` - Net worth tracking
  - `BudgetPage` - Budget tracking and monitoring
  - `goals/` - Financial goal setting with savings allocation (multi-file)
  - `InsightsPage` - Advanced analytics (velocity, stability, milestones)
  - `AnomalyReviewPage` - Flag and review unusual transactions
  - `year-in-review/` - Annual financial summary with heatmap (multi-file)
  - `subscription-tracker/` - Recurring expense detection and manual tracking (multi-file)
  - `bill-calendar/` - Monthly calendar of upcoming bills (multi-file)
  - `settings/` - Single-page settings with collapsible sections, including AIAssistantSection and SalaryStructureSection (multi-file)

#### 2. **Components Layer** (`src/components/`)

- **Responsibility**: Reusable UI components organized by domain
- **Modules**:
  - `analytics/` - Analytics visualization components
    - `FinancialHealthScore` - Comprehensive health score (8 metrics across 4 pillars)
    - `YearOverYearComparison` - YoY financial comparison
    - `PeriodComparison` - Month-to-month comparison with selectors
    - `CashFlowForecast` - Future cash flow predictions
    - `RecurringTransactions` - Recurring payment detection
    - `CategoryBreakdown` - Shared category treemap/table component (parameterized for income or expense)
    - `ExpenseTreemap` - Thin wrapper around `CategoryBreakdown` for expense visualization
    - `TopMerchants` - Top merchants/vendors analysis
    - `EnhancedSubcategoryAnalysis` - Advanced subcategory analysis
    - `MultiCategoryTimeAnalysis` - Time-based category analysis
    - `StandardBarChart` - Reusable bar chart wrapper with consistent theming and defaults
    - `StandardAreaChart` - Reusable area chart wrapper with gradient fills and consistent styling
    - `StandardPieChart` - Reusable pie/donut chart wrapper with legend defaults
  - `chat/` - AI chatbot widget (`ChatWidget`, `ChatPanel`, `ChatMessage`, `useChat` hook). Floating bottom-right button expands into a glass-morphism panel; streams responses token-by-token via provider adapters
  - `layout/` - Layout components (AppLayout, Sidebar)
  - `shared/` - Shared components (EmptyState, AnalyticsTimeFilter, MetricCard)
  - `transactions/` - Transaction table components
  - `ui/` - Base UI components (shadcn-style), including `chartDefaults.tsx` which exports shared Recharts configuration tokens (`GRID_DEFAULTS`, `xAxisDefaults`, `yAxisDefaults`, `LEGEND_DEFAULTS`, `BAR_RADIUS`, `shouldAnimate`, `areaGradient`, etc.) used by all chart components for consistent styling
  - `upload/` - File upload components (DropZone)

#### 3. **Hooks Layer** (`src/hooks/`)

- **Responsibility**: Custom React hooks for logic reuse
- **Examples**:
  - `useAnalyticsTimeFilter` - Shared time-filter state (view mode, date range, FY) used by all analytics pages
  - `useAccountTypes` - Account type management
  - `useAnalytics` - Analytics data fetching
  - `useChartDimensions` - Responsive chart sizing based on viewport
  - `usePeriodNavigation` - Time period navigation
  - `api/` - TanStack Query hooks for API calls

#### 4. **Services Layer** (`src/services/`)

- **Responsibility**: API communication
- **Components**:
  - `api/` - Backend API client with typed endpoints

#### 5. **Store/State Layer** (`src/store/`)

- **Responsibility**: Global state management with Zustand
- **Stores**:
  - `authStore` - JWT tokens with persist middleware
  - `preferencesStore` - User display/financial preferences (hydrated from API)
  - `accountStore` - Account settings and preferences
  - `investmentAccountStore` - Investment account classifications
  - `budgetStore` - Budget settings

#### 6. **Utils Layer** (`src/lib/`)

- **Responsibility**: Utility functions and helpers
- **Modules**:
  - `cn.ts` - Class name utility (clsx + tailwind-merge)
  - `queryClient.ts` - TanStack Query client configuration
  - `fileParser.ts` - Client-side Excel/CSV parsing (lazy-loads SheetJS, SHA-256 hashing, column mapping, row validation)
  - `projectionCalculator.ts` - Pure functions for multi-year salary/RSU/tax projections
  - `taxCalculator.ts` - India tax slab computation (old and new regime)
  - `fireCalculator.ts` - FIRE number, Coast FIRE, retirement corpus calculations
  - `formatters.ts` - Currency and number formatting with multi-currency conversion
  - `chatAdapters.ts` - Streaming chat adapters for OpenAI, Anthropic, and Bedrock (OpenAI/Anthropic browser-direct, Bedrock via backend proxy)
  - `chatContext.ts` - Financial context builder that fetches V2 analytics endpoints and compresses them into a ~2-4K token system prompt

### Component Hierarchy

```
App
├── Layout
│   ├── Sidebar (Navigation)
│   └── Main Content Area
│       └── Page Component
│           ├── Page-specific state
│           ├── Data fetching (TanStack Query)
│           └── Analytics Components
│               ├── Chart Components (Recharts)
│               │   ├── LineChart
│               │   ├── BarChart
│               │   ├── PieChart
│               │   ├── AreaChart
│               │   └── Treemap
│               ├── Score Components
│               │   └── FinancialHealthScore
│               ├── Comparison Components
│               │   ├── YearOverYearComparison
│               │   └── PeriodComparison
│               └── Analysis Components
│                   ├── CashFlowForecast
│                   ├── RecurringTransactions
│                   └── SubcategoryAnalysis
└── Upload Components
    └── FileUpload
```

### Authentication Flow

<p align="center">
  <img src="images/auth-flow.svg" alt="Authentication Flow" width="100%"/>
</p>

### Backend Layer Architecture

<p align="center">
  <img src="images/backend-layers.svg" alt="Backend Layers" width="100%"/>
</p>

## Data Models

### Core Entities

#### Transaction

```
id (hash_id)          - Unique identifier (SHA-256)
date                  - Transaction date
amount                - Transaction amount
type                  - Income/Expense/Transfer
category              - Spending category
subcategory          - Sub-category (optional)
account              - Account name
description          - Transaction description
is_deleted           - Soft delete flag
file_source          - Source file
created_at           - Insert timestamp
updated_at           - Last update timestamp
```

#### Account (implied)

```
name                 - Account name (Savings, Checking, etc.)
total_balance        - Current balance
transactions         - Related transactions
```

### Derived Data (Calculations)

#### Financial Metrics

- Total Income
- Total Expenses
- Net Savings
- Savings Rate
- Average Monthly Spending
- Category Totals

#### Behavioral Insights

- Spending Patterns
- Recurring Payments
- Unusual Transactions
- Cash Flow Forecast

## Technology Choices

### Backend

- **FastAPI**: Modern, fast, with automatic API documentation
- **SQLAlchemy 2.0**: Type-safe ORM with async support
- **SQLite**: Lightweight, file-based, no server needed
- **Alembic**: Version control for database schema

### Frontend

- **React 19**: Component-based UI with latest features
- **TypeScript**: Type safety and better DX
- **Vite**: Fast build tool and dev server
- **Tailwind CSS**: Utility-first styling
- **Recharts**: Data visualization library (replaces Chart.js)
- **Zustand**: Lightweight state management
- **TanStack Query**: Server state management and caching

## API Contract

### Request/Response Format

```
Request: JSON
Response: JSON
Status Codes:
  200 - Success
  400 - Bad Request
  404 - Not Found
  409 - Conflict (duplicate file)
  500 - Server Error
```

### Key Endpoints

```
POST   /api/upload                      - Upload transactions (JSON body: file_name, file_hash, rows, force)
GET    /api/transactions                - Get all transactions
GET    /api/analytics/overview          - Get financial overview
GET    /api/analytics/kpis              - Get KPIs
GET    /api/analytics/behavior          - Get spending behavior
GET    /api/analytics/trends            - Get financial trends
GET    /api/analytics/wrapped           - Get yearly financial wrap
GET    /api/analytics/charts/*          - Chart data endpoints
GET    /api/analytics/insights/generated - AI-generated insights
GET    /api/calculations/totals         - Get income/expense totals
GET    /api/calculations/monthly-aggregation - Monthly data
GET    /api/calculations/yearly-aggregation - Yearly data
GET    /api/calculations/category-breakdown - Category analysis
GET    /api/calculations/account-balances - Account balances
GET    /api/calculations/categories/master - Master category list
GET    /api/account-classifications/*   - Account classification endpoints
GET    /api/meta/*                      - Metadata endpoints
```

## Security Considerations

1. **Input Validation**
   - Client-side file parsing via SheetJS (files never leave the browser as raw uploads)
   - Backend validates structured JSON via Pydantic schemas (`TransactionRow`, `TransactionUploadRequest`)
   - Sanitize data during normalization
   - Type checking with TypeScript and Python

2. **Data Protection**
   - Use soft deletes instead of hard deletes
   - Maintain audit trail with timestamps
   - CORS configuration for cross-origin requests

3. **CORS**
   - Frontend and backend on different ports
   - CORS middleware configured in FastAPI

4. **AI API Key Encryption**
   - User-provided AI provider API keys (OpenAI, Anthropic, Bedrock) are encrypted at rest with AES-256-GCM
   - Encryption key derived from `LEDGER_SYNC_JWT_SECRET_KEY` via PBKDF2-HMAC-SHA256 (100,000 iterations)
   - Each ciphertext uses a fresh random 128-bit salt stored alongside nonce and ciphertext
   - Decryption errors (tag mismatch) raise `DecryptionError`, prompting the user to re-enter their key (happens if JWT secret rotates between saving and using)
   - OpenAI/Anthropic streaming calls go browser-direct to the provider; Bedrock goes through backend proxy because it requires SigV4 auth and has no CORS headers

## Scalability Considerations

### Current Design

- SQLite for development (file-based), PostgreSQL-ready for production
- PostgreSQL connection pooling pre-configured (pool_size=20, max_overflow=10)
- JWT-based multi-user authentication and authorization
- All data is user-scoped

### Future Improvements

- Implement caching (Redis) for analytics
- Async database operations
- Virtual scrolling for large transaction tables

## Performance Optimizations

### Backend

- Composite indexes on high-traffic query patterns (`user_id+category`, `user_id+date+type`)
- PostgreSQL connection pooling (pool_size=20, max_overflow=10, pool_pre_ping=True)
- SQLite WAL mode with 64MB cache and NORMAL sync for fast writes
- O(n) pre-grouped category analysis (replaced O(c*n) nested loops)
- Batch processing for large imports
- Shared SQL aggregation helpers to reduce query duplication

### Frontend

- Code splitting with Vite and lazy-loaded pages (`React.lazy`)
- `useDeferredValue` for non-blocking search in CommandPalette
- Memoized chart data objects in DashboardPage to prevent unnecessary re-renders
- Responsive chart dimensions via `useChartDimensions` hook
- TanStack Query caching with `staleTime: Infinity` to avoid refetches

## Testing Strategy

### Backend

- Unit tests for business logic
- Integration tests for API endpoints
- Test database fixtures
- Coverage reporting

### Frontend

- Component testing
- Integration testing
- Type checking with TypeScript
- End-to-end testing (future)

## Deployment

### Backend

- Vercel serverless function via Mangum adapter (`backend/api/index.py`)
- Wraps FastAPI ASGI app for AWS Lambda-compatible execution
- Dependencies installed via `uv` (auto-detected from `uv.lock`)
- Neon PostgreSQL connected via Vercel's Neon integration

### Frontend

- Static React SPA built with Vite, deployed to GitHub Pages
- `VITE_API_BASE_URL` GitHub Actions variable points to Vercel backend
- SPA routing via `404.html` copy workaround

## Error Handling

### Backend

- Try-catch blocks for database operations
- Meaningful error messages
- Logging of errors and warnings

### Frontend

- Error boundaries for React errors
- Toast notifications for user feedback
- Graceful fallbacks for failed API calls

## Monitoring & Logging

### Backend

- Structured logging with timestamps
- Log levels: DEBUG, INFO, WARNING, ERROR
- Centralized logging configuration

### Frontend

- Browser console for development
- Error tracking in production (future)
- Performance monitoring (future)
