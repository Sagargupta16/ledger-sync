# Ledger Sync — Complete Project Audit

> **Last updated:** 2026-02-06
> **Purpose:** A single document that gives any AI agent (or human) full context to understand, navigate, modify, and extend this codebase without reading every file.

---

## Table of Contents

1. [Project Identity](#1-project-identity)
2. [Tech Stack](#2-tech-stack)
3. [Repository Layout](#3-repository-layout)
4. [Data Flow & Core Concepts](#4-data-flow--core-concepts)
5. [Backend Deep Dive](#5-backend-deep-dive)
6. [Frontend Deep Dive](#6-frontend-deep-dive)
7. [API Contract](#7-api-contract)
8. [Database Schema](#8-database-schema)
9. [Authentication System](#9-authentication-system)
10. [Configuration & Preferences](#10-configuration--preferences)
11. [Testing](#11-testing)
12. [Known Issues & Tech Debt](#12-known-issues--tech-debt)
13. [File-by-File Reference](#13-file-by-file-reference)

---

## 1. Project Identity

| Field            | Value                                                                                                                                                                                                                            |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Name**         | Ledger Sync                                                                                                                                                                                                                      |
| **Author**       | Sagar Gupta                                                                                                                                                                                                                      |
| **What it does** | Personal finance dashboard. Import transactions from Money Manager Pro Excel exports, reconcile them into a SQLite database, and visualize spending, income, investments, tax planning, and net worth through a React dashboard. |
| **Target user**  | Individual (India-focused: ₹ currency, April–March fiscal year, Indian tax regimes, Indian bank names)                                                                                                                           |
| **Monorepo**     | Single pnpm workspace. `backend/` (Python) + `frontend/` (React/TS) + `docs/`                                                                                                                                                    |
| **License**      | Private                                                                                                                                                                                                                          |

---

## 2. Tech Stack

### Backend (Python 3.11+)

| Concern         | Library                   | Version  | Notes                                                        |
| --------------- | ------------------------- | -------- | ------------------------------------------------------------ |
| Web framework   | FastAPI                   | ^0.115.0 | Async-capable but used synchronously                         |
| ORM             | SQLAlchemy                | ^2.0.0   | DeclarativeBase, `Mapped[type]` annotations                  |
| Migrations      | Alembic                   | ^1.13.0  | `backend/alembic/`                                           |
| Validation      | Pydantic                  | ^2.7.0   | v2 with `model_dump`, `from_attributes`                      |
| Settings        | pydantic-settings         | ^2.2.0   | Env prefix `LEDGER_SYNC_`, .env file                         |
| Excel parsing   | openpyxl + pandas         | ^2.2.0   | `.xlsx`/`.xls` via `pd.read_excel`                           |
| Auth            | python-jose + bcrypt      | —        | JWT HS256, bcrypt password hashing                           |
| CLI             | typer + rich              | —        | `import-file`, `init-db`, `status` commands                  |
| DB              | SQLite (dev)              | —        | File: `ledger_sync.db`. PostgreSQL-ready via psycopg2-binary |
| Dev tools       | pytest, ruff, black, mypy | —        | black line-length=100                                        |
| Package manager | Poetry                    | —        | `pyproject.toml`                                             |

### Frontend (Node 18+)

| Concern         | Library                 | Version     | Notes                                                                                                                       |
| --------------- | ----------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------- |
| Framework       | React                   | 18          | Via Vite 7.3.1                                                                                                              |
| Language        | TypeScript              | strict mode | `tsconfig.app.json`                                                                                                         |
| Routing         | React Router            | v7          | `BrowserRouter` in `App.tsx`                                                                                                |
| Server state    | TanStack React Query    | —           | 5min stale, 30min gc, 1 retry                                                                                               |
| Client state    | Zustand                 | —           | 5 stores with `persist` middleware                                                                                          |
| HTTP            | Axios                   | —           | Custom instance with auth interceptor                                                                                       |
| Charts          | Recharts                | —           | Used in 8+ components                                                                                                       |
| Animation       | Framer Motion           | —           | Used in 30+ components                                                                                                      |
| Styling         | Tailwind CSS            | —           | Dark theme, iOS-style glassmorphism                                                                                         |
| Tables          | TanStack Table          | —           | TransactionTable only                                                                                                       |
| File upload     | react-dropzone          | —           | UploadSyncPage                                                                                                              |
| Toasts          | Sonner                  | —           | Success/error notifications                                                                                                 |
| Icons           | Lucide React            | —           | Used everywhere                                                                                                             |
| Date utils      | Raw `Date` manipulation | —           | `lib/dateUtils.ts` (NOTE: project convention says use `date-fns` but it's not followed in utils; only used in 2 components) |
| Package manager | pnpm                    | —           | `frontend/pnpm-lock.yaml`                                                                                                   |

### Dev Orchestration

```bash
# Root package.json scripts (uses concurrently):
pnpm run dev          # Backend (uvicorn :8000) + Frontend (vite :5173)
pnpm run setup        # First-time setup
pnpm run format       # Format both (black+ruff for Python, eslint for TS)
```

---

## 3. Repository Layout

```
ledger-sync/
├── package.json                    # Root monorepo orchestration
├── pnpm-lock.yaml
├── README.md
│
├── backend/
│   ├── pyproject.toml              # Poetry config, all Python deps
│   ├── alembic.ini                 # Alembic config
│   ├── Makefile                    # Dev shortcuts
│   ├── logs/                       # Rotating log files (gitignored)
│   ├── src/ledger_sync/
│   │   ├── __init__.py             # Package version
│   │   ├── config/
│   │   │   └── settings.py         # Central config via pydantic-settings
│   │   ├── db/
│   │   │   ├── base.py             # SQLAlchemy DeclarativeBase
│   │   │   ├── session.py          # Engine, SessionLocal, get_session(), init_db()
│   │   │   └── models.py           # ALL 20 ORM models (1023 lines)
│   │   ├── ingest/                 # Excel → normalized data pipeline
│   │   │   ├── excel_loader.py     # Load .xlsx, SHA-256 file hash
│   │   │   ├── validator.py        # Column existence, data type checks
│   │   │   ├── normalizer.py       # Unicode, dates, Decimal, categories (433 lines)
│   │   │   └── hash_id.py          # SHA-256 transaction ID generation
│   │   ├── core/                   # Business logic (NO FastAPI deps)
│   │   │   ├── calculator.py       # 12 static financial calculation methods (407 lines)
│   │   │   ├── reconciler.py       # INSERT/UPDATE/SOFT_DELETE reconciliation (509 lines)
│   │   │   ├── sync_engine.py      # Import orchestrator (200 lines)
│   │   │   ├── analytics_engine.py # 9 post-upload analytics (1292 lines) ← LARGEST FILE
│   │   │   ├── insights.py         # Text-based insight generation (296 lines)
│   │   │   ├── time_filter.py      # TimeRange enum + filter logic
│   │   │   ├── auth.py             # Backwards-compat re-export module
│   │   │   └── auth/               # Modular auth package
│   │   │       ├── tokens.py       # JWT create/decode/verify
│   │   │       └── passwords.py    # bcrypt hash/verify
│   │   ├── api/                    # FastAPI routes (NO business logic)
│   │   │   ├── main.py             # App factory + inline transaction/upload routes (524 lines)
│   │   │   ├── deps.py             # Dependency injection (CurrentUser, get_session)
│   │   │   ├── auth.py             # /api/auth/* (register, login, refresh, me, etc.)
│   │   │   ├── analytics.py        # /api/analytics/* V1 on-the-fly (441 lines)
│   │   │   ├── analytics_v2.py     # /api/analytics/v2/* pre-calculated (628 lines)
│   │   │   ├── calculations.py     # /api/calculations/* (553 lines)
│   │   │   ├── meta.py             # /api/meta/* (types, accounts, filters, buckets)
│   │   │   ├── preferences.py      # /preferences/* (CRUD + 8 section endpoints, 485 lines)
│   │   │   └── account_classifications.py  # /api/account-classifications/*
│   │   ├── schemas/
│   │   │   └── auth.py             # Pydantic auth schemas (Token, UserRegister, etc.)
│   │   ├── services/
│   │   │   └── auth_service.py     # Auth business logic (264 lines)
│   │   ├── utils/
│   │   │   └── logging.py          # Rotating file + console logging setup
│   │   └── cli/
│   │       └── main.py             # Typer CLI (import-file, init-db, status)
│   └── tests/
│       ├── conftest.py             # In-memory SQLite fixtures, test user, sample data
│       ├── unit/
│       │   ├── test_hash_id.py     # 7 tests: deterministic hashing
│       │   └── test_normalizer.py  # 12 tests: date/amount/string/type normalization
│       └── integration/
│           └── test_reconciler.py  # 4 tests: insert/update/skip/soft-delete
│
├── frontend/
│   ├── package.json                # React + all frontend deps
│   ├── vite.config.ts              # Vite config with @ path alias
│   ├── tailwind.config.js          # Dark theme config
│   ├── tsconfig.app.json           # Strict TS
│   ├── index.html                  # SPA entry
│   └── src/
│       ├── App.tsx                  # Router + QueryClientProvider + Toaster
│       ├── main.tsx                 # ReactDOM entry point
│       ├── index.css                # Tailwind imports + custom glass styles
│       ├── types/index.ts           # Shared TS types (127 lines)
│       ├── constants/
│       │   ├── index.ts             # ROUTES, API_BASE_URL, API_ENDPOINTS
│       │   ├── colors.ts            # iOS-style color palette
│       │   ├── chartColors.ts       # Chart color arrays
│       │   └── accountTypes.ts      # Account classification keywords
│       ├── lib/
│       │   ├── cn.ts                # Tailwind class merge utility
│       │   ├── queryClient.ts       # TanStack Query singleton
│       │   ├── formatters.ts        # Currency/number formatting (172 lines)
│       │   ├── dateUtils.ts         # Date range, FY, period navigation (237 lines)
│       │   ├── errorUtils.ts        # FastAPI error message extraction (158 lines)
│       │   └── preferencesUtils.ts  # Income/spending classification (277 lines)
│       ├── store/
│       │   ├── index.ts             # Barrel (missing auth + investment re-exports)
│       │   ├── authStore.ts         # JWT persist to localStorage
│       │   ├── preferencesStore.ts  # Display prefs, income classification
│       │   ├── budgetStore.ts       # Category → limit mappings
│       │   ├── accountStore.ts      # Account → type classification
│       │   └── investmentAccountStore.ts  # Set<string> of investment accounts
│       ├── services/api/
│       │   ├── client.ts            # Axios instance + auth interceptor (72 lines)
│       │   ├── auth.ts              # Auth API calls
│       │   ├── analytics.ts         # V1 analytics API (135 lines)
│       │   ├── analyticsV2.ts       # V2 analytics API (284 lines)
│       │   ├── calculations.ts      # Calculation API (89 lines) ← returns raw AxiosResponse
│       │   ├── transactions.ts      # Transaction fetch + export (72 lines)
│       │   ├── upload.ts            # File upload
│       │   ├── preferences.ts       # Preferences CRUD (166 lines)
│       │   └── accountClassifications.ts  # Account type CRUD
│       ├── hooks/
│       │   ├── api/
│       │   │   ├── useAuth.ts       # Login, register, logout, init (157 lines)
│       │   │   ├── useTransactions.ts  # Fetch all transactions
│       │   │   ├── useAnalytics.ts  # 15 V1 analytics hooks (117 lines)
│       │   │   ├── useAnalyticsV2.ts  # 13 V2 analytics hooks (202 lines)
│       │   │   ├── usePreferences.ts  # Preferences + 8 section hooks (141 lines)
│       │   │   └── useUpload.ts     # File upload mutation
│       │   ├── useAnalytics.ts      # Re-export barrel for backwards compat
│       │   ├── useAccountTypes.ts   # Account classification hooks
│       │   └── usePeriodNavigation.ts  # Period nav state (monthly/yearly/all)
│       ├── pages/                   # 14 route-level page components
│       │   ├── HomePage.tsx         # Landing page (497 lines)
│       │   ├── DashboardPage.tsx    # Main dashboard (428 lines)
│       │   ├── TransactionsPage.tsx # Table + filters + export (216 lines)
│       │   ├── UploadSyncPage.tsx   # Drag-drop upload (292 lines)
│       │   ├── SettingsPage.tsx     # 6-tab settings (1301 lines) ← LARGEST FRONTEND FILE
│       │   ├── SpendingAnalysisPage.tsx  # 50/30/20, treemap, subcategories (374 lines)
│       │   ├── IncomeAnalysisPage.tsx    # Income by category, trends (414 lines)
│       │   ├── InvestmentAnalyticsPage.tsx  # Portfolio by 4 types (588 lines)
│       │   ├── MutualFundProjectionPage.tsx  # SIP calculator
│       │   ├── ReturnsAnalysisPage.tsx   # Investment returns
│       │   ├── TaxPlanningPage.tsx        # India tax regimes
│       │   ├── NetWorthPage.tsx           # Assets vs liabilities
│       │   ├── TrendsForecastsPage.tsx    # Cash flow forecast
│       │   └── IncomeExpenseFlowPage/     # Sankey flow visualization
│       └── components/
│           ├── analytics/           # 12 analytics components (~3,800 lines)
│           ├── shared/              # 14 shared components (~1,500 lines)
│           ├── layout/              # AppLayout + Sidebar (~425 lines)
│           ├── transactions/        # Table, filters, pagination (~585 lines)
│           ├── ui/                  # Card primitives (~145 lines)
│           └── upload/              # DropZone, results, classifiers (~445 lines)
│
└── docs/
    ├── AUDIT.md                    # ← THIS FILE
    ├── API.md                      # API endpoint documentation
    ├── architecture.md             # Architecture overview
    ├── DATABASE.md                 # Schema documentation
    ├── DEPLOYMENT.md               # Deployment guide
    ├── DEVELOPMENT.md              # Dev setup guide
    ├── INDEX.md                    # Docs index
    ├── QUICK-REFERENCE.md          # Quick reference card
    ├── ROADMAP.md                  # Feature roadmap
    └── TESTING.md                  # Testing guide
```

---

## 4. Data Flow & Core Concepts

### Import Pipeline (Excel → DB)

```
User uploads .xlsx
        │
        ▼
┌─────────────────┐
│  ExcelLoader     │  Load file, compute SHA-256 file hash
│  (excel_loader)  │  Check if file_hash already imported (per user)
└────────┬────────┘
         ▼
┌─────────────────┐
│  ExcelValidator  │  Validate required columns exist
│  (validator)     │  Map variant column names → standard names
└────────┬────────┘
         ▼
┌─────────────────┐
│  DataNormalizer  │  Per-row: parse dates, Decimal amounts,
│  (normalizer)    │  clean unicode, standardize categories/accounts,
│                  │  detect transfer direction (in/out)
└────────┬────────┘
         ▼
┌─────────────────┐
│  Reconciler      │  Per-transaction: generate SHA-256 hash ID from
│  (reconciler)    │  (user_id|date|amount|account|note|category|
│                  │   subcategory|type)
│                  │  → INSERT (new hash)
│                  │  → UPDATE (existing but changed data or un-deleted)
│                  │  → SKIP (identical)
│                  │  After batch: SOFT_DELETE stale transactions
└────────┬────────┘
         ▼
┌─────────────────┐
│  AnalyticsEngine │  9 calculations persisted to aggregation tables:
│  (analytics_eng) │  monthly summaries, category trends, transfer flows,
│                  │  merchant intelligence, recurring detection,
│                  │  net worth snapshot, FY summaries, anomalies, budgets
└─────────────────┘
```

### Key Architectural Decisions

1. **Transactions are immutable once imported.** The hash ID is derived from content. If the content changes, it's a different transaction.

2. **Reconciliation never hard-deletes.** Uses `is_deleted` flag + `last_seen_at` timestamp. Transactions not present in a new import get soft-deleted.

3. **Dual analytics system:**
   - **V1** (`/api/analytics/*`): Computed on-the-fly from raw transactions using `FinancialCalculator`. Good for real-time, user-filtered views.
   - **V2** (`/api/analytics/v2/*`): Read from pre-calculated aggregation tables populated by `AnalyticsEngine` after each upload. Fast but **currently not user-scoped** (known issue).

4. **User preferences drive analytics.** Categories like "essential" vs "discretionary", investment account mappings, income tax classification, fiscal year start month — all configurable per user and consumed by `AnalyticsEngine`.

5. **India-centric defaults.** ₹ currency, April–March fiscal year, Indian bank names in normalizer, old vs new tax regime comparison, Cr/L number abbreviations.

---

## 5. Backend Deep Dive

### 5.1 Configuration (`config/settings.py`)

```python
class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="LEDGER_SYNC_", env_file=".env")

    environment: str = "development"
    database_url: str = "sqlite:///./ledger_sync.db"
    log_level: str = "INFO"

    # JWT
    jwt_secret_key: str = "dev-secret-key-change-in-production"
    jwt_algorithm: str = "HS256"
    jwt_access_token_expire_minutes: int = 1440   # 24 hours
    jwt_refresh_token_expire_days: int = 7

    # CORS
    cors_origins: list[str] = ["http://localhost:3000", "http://localhost:5173", "http://localhost:5174"]

    # Column name mappings (for Excel normalization)
    date_column_names: list[str] = ["Period", "Date", "date", "period", "Transaction Date"]
    account_column_names: list[str] = ["Account", "account", "Account Name"]
    category_column_names: list[str] = ["Category", "category"]
    subcategory_column_names: list[str] = ["Subcategory", "subcategory", "Sub Category"]
    note_column_names: list[str] = ["Note", "note", "Description", "Memo"]
    amount_column_names: list[str] = ["Amount", "amount", "INR", "Value"]
    type_column_names: list[str] = ["Income/Expense", "Type", "type"]
    currency_column_names: list[str] = ["Currency", "currency"]
```

### 5.2 Database Models (`db/models.py` — 1023 lines, 20 models)

**Primary models:**

| Model             | PK                             | Purpose                           | Key Fields                                                                                                                                               |
| ----------------- | ------------------------------ | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `User`            | auto int                       | Auth + ownership                  | email, hashed_password, full_name, is_active, is_verified                                                                                                |
| `Transaction`     | `transaction_id` (SHA-256 hex) | Core transaction record           | user_id (FK), date, amount, currency, type (enum), account, category, subcategory, from_account, to_account, note, source_file, last_seen_at, is_deleted |
| `ImportLog`       | auto int                       | Idempotent import tracking        | file_hash, user_id, file_name, row_count, import_stats (JSON)                                                                                            |
| `UserPreferences` | auto int                       | Per-user settings (1:1 with User) | 20+ fields covering fiscal year, categories, investments, income classification, budgets, display, anomaly, recurring                                    |

**Aggregation models (populated by AnalyticsEngine after upload):**

| Model                  | Purpose                                                      |
| ---------------------- | ------------------------------------------------------------ |
| `MonthlySummary`       | Income/expense/transfer breakdown per month with MoM changes |
| `CategoryTrend`        | Category-level amounts, counts, percentages per period       |
| `TransferFlow`         | Aggregated transfer flows between account pairs              |
| `MerchantIntelligence` | Merchant names extracted from notes, spend patterns          |
| `RecurringTransaction` | Auto-detected recurring patterns with confidence scores      |
| `NetWorthSnapshot`     | Point-in-time asset/liability breakdown                      |
| `FYSummary`            | Fiscal year income/expense/tax/investment rollups with YoY   |
| `Anomaly`              | Detected unusual expenses or budget breaches                 |
| `Budget`               | Category budgets with current-month tracking                 |

**Other models:** `AccountClassification`, `TaxRecord`, `InvestmentHolding`, `FinancialGoal`, `AuditLog`, `ColumnMappingLog`

**Enums:** `TransactionType` (Income/Expense/Transfer), `AccountType` (8 types), `AnomalyType` (4 types), `RecurrenceFrequency` (5 levels), `GoalStatus`, `GoalType`

### 5.3 Ingest Pipeline (4 files)

**ExcelLoader** (`ingest/excel_loader.py`):

- `calculate_file_hash(path)` → SHA-256 hex of file bytes
- `load(path, sheet_name)` → `(DataFrame, column_mapping, file_hash)`
- Validates via `ExcelValidator` before returning

**ExcelValidator** (`ingest/validator.py`):

- Checks file exists, is `.xlsx`/`.xls`
- Maps required column groups (`date`, `account`, `category`, `amount`, `type`) against configured column name variants from settings
- Validates amount column is numeric
- Returns `column_mapping: dict[str, str]` (standard name → actual column name)

**DataNormalizer** (`ingest/normalizer.py` — 433 lines):

- `normalize_row(row, column_mapping)` → normalized dict
- `normalize_dataframe(df, column_mapping)` → list of normalized dicts
- **Date:** Parses various formats via `pd.to_datetime`
- **Amount:** Converts to `Decimal` with 2-decimal rounding
- **Strings:** Unicode NFKC normalization, control char removal, whitespace collapse
- **Categories:** Typo corrections dict (`"food & dinning"` → `"Food & Dining"`)
- **Accounts:** Indian bank name standardization (`"hdfc bank"` → `"HDFC Bank"`)
- **Notes:** URL shortening to domain name
- **Transfers:** Detects `Transfer-In` / `Transfer-Out` in type field, sets `from_account` / `to_account` accordingly
- **Type mapping:** `"Exp."` → EXPENSE, `"Income"` → INCOME, `"Transfer-In"/"Transfer-Out"` → TRANSFER

**TransactionHasher** (`ingest/hash_id.py`):

- Normalizes each field (lowercase, strip, ISO dates, 2-decimal amounts)
- Concatenates: `"{user_id}|{date}|{amount}|{account}|{note}|{category}|{subcategory}|{type}"`
- Returns `SHA-256(input).hex()` (64-char string)

### 5.4 Reconciler (`core/reconciler.py` — 509 lines)

```python
class ReconciliationStats:
    processed: int = 0
    inserted: int = 0
    updated: int = 0
    deleted: int = 0
    skipped: int = 0
```

**`reconcile_transaction(row, source_file, import_time)`:**

1. Generate hash ID including `user_id`
2. Query existing transaction by hash
3. If not found → INSERT new Transaction
4. If found and `is_deleted` → restore (UPDATE)
5. If found and fields changed (category, subcategory, note, type) → UPDATE
6. Otherwise → SKIP

**`reconcile_batch(rows, source_file, import_time)`:**

- In-batch dedup via `seen_in_batch` set
- After batch: `mark_soft_deletes(import_time)` marks transactions with `last_seen_at < import_time` as deleted

**Transfer reconciliation:** Parallel methods (`reconcile_transfer`, `reconcile_transfers_batch`, `mark_soft_deletes_transfers`) with same INSERT/UPDATE/SKIP/DELETE logic but using `from_account` for hash generation.

### 5.5 Analytics Engine (`core/analytics_engine.py` — 1292 lines)

**`run_full_analytics(source_file)`** executes 9 calculations in order:

1. **Monthly Summaries** → `MonthlySummary` table
   - Income breakdown: salary, investment, other (via preference-based classification)
   - Expense breakdown: essential vs discretionary (via preference-based category lists)
   - MoM change percentages
2. **Category Trends** → `CategoryTrend` table
   - Per-period, per-category, per-type: total, count, avg, min, max, % of monthly total, MoM change

3. **Transfer Flows** → `TransferFlow` table
   - Aggregated flows between account pairs with account type classification

4. **Merchant Intelligence** → `MerchantIntelligence` table
   - Extracts merchant names from notes (regex patterns for Indian merchants: Swiggy, Zomato, Amazon, etc.)
   - Calculates: total spent, frequency, avg days between, is_recurring flag

5. **Recurring Detection** → `RecurringTransaction` table
   - Groups by (category, account, amount_bucket)
   - Detects frequency: weekly (5-9 day avg), biweekly (12-16), monthly (25-35), quarterly (85-95), yearly (355-375)
   - Confidence score based on std deviation of intervals

6. **Net Worth Snapshot** → `NetWorthSnapshot` table
   - Calculates account balances from all transactions (income adds, expense subtracts, transfers move)
   - Categorizes using `AccountClassification`: cash_and_bank, stocks, mutual_funds, fixed_deposits, ppf_epf, credit_card_outstanding, loans_payable

7. **FY Summaries** → `FYSummary` table
   - Uses configurable `fiscal_year_start_month` (default: April)
   - Income by: salary, bonus, investment, other
   - Tracks tax payments and investment flows
   - YoY change percentages

8. **Anomaly Detection** → `Anomaly` table
   - High expense months: > `threshold` (configurable, default 2.0) std deviations above mean
   - Large individual transactions: > 3x category average
   - Limited to 50 anomalies per run

9. **Budget Tracking** → Updates `Budget` table
   - Compares current month spending by category against budget limits
   - Creates anomaly if budget exceeded

**All preferences are loaded from `UserPreferences` table** with hardcoded defaults as fallback.

### 5.6 Calculator (`core/calculator.py` — 407 lines)

Static methods on `FinancialCalculator`:

| Method                                         | Returns                                            | Description                                  |
| ---------------------------------------------- | -------------------------------------------------- | -------------------------------------------- |
| `calculate_totals(txns)`                       | `{total_income, total_expenses, net_change}`       | Sum by type                                  |
| `calculate_savings_rate(income, expenses)`     | `float`                                            | `(income - expenses) / income * 100`         |
| `calculate_daily_spending_rate(txns)`          | `float`                                            | Total expenses / span in days                |
| `calculate_monthly_burn_rate(txns)`            | `float`                                            | Total expenses / span in months              |
| `group_by_month(txns)`                         | `{YYYY-MM: {income, expenses}}`                    | Monthly aggregation                          |
| `group_by_category(txns)`                      | `{category: total}`                                | Expense categories only                      |
| `group_by_account(txns)`                       | `{account: net_activity}`                          | Income - Expense per account                 |
| `calculate_consistency_score(monthly_values)`  | `0-100`                                            | `100 - coefficient_of_variation`             |
| `calculate_lifestyle_inflation(txns)`          | `float %`                                          | Avg spending first 3 months vs last 3 months |
| `calculate_category_concentration(cat_totals)` | `float %`                                          | Top category as % of total                   |
| `calculate_spending_velocity(txns, days)`      | `{recent_daily, historical_daily, velocity_ratio}` | Recent vs historical spending rate           |
| `find_best_worst_months(monthly_data)`         | `{best_month, worst_month}`                        | By surplus (income - expenses)               |
| `calculate_convenience_spending(txns)`         | `{amount, total, pct}`                             | Shopping/entertainment/food/dining/etc.      |

### 5.7 Insight Engine (`core/insights.py` — 296 lines)

`InsightEngine.generate_all_insights(transactions)` returns `list[{title, description, severity}]`:

- **Spending:** Volatility warning/praise, daily spending rate
- **Category:** High concentration alert, convenience spending alert
- **Temporal:** Spending trending up/down, best financial month
- **Behavioral:** Lifestyle inflation detection, accelerated/reduced spending velocity

### 5.8 Auth System (`core/auth/`, `services/auth_service.py`, `schemas/auth.py`)

See [Section 9: Authentication System](#9-authentication-system).

### 5.9 Logging (`utils/logging.py`)

- **Main logger:** `ledger_sync` → console (formatted) + `logs/ledger_sync.log` (rotating 10MB × 5)
- **Analytics logger:** `ledger_sync.analytics` → `logs/analytics.log` (rotating 10MB × 3)
- Helper functions: `log_import_start`, `log_import_stats`, `log_analytics_calculation`, `log_error`

### 5.10 CLI (`cli/main.py` — 171 lines)

```bash
ledger-sync import-file <path> [--force] [--verbose]  # Import Excel
ledger-sync init-db                                     # Create tables
ledger-sync status                                      # Show DB stats
```

---

## 6. Frontend Deep Dive

### 6.1 Routing (`App.tsx`)

```
/                     → HomePage (public, landing)
/dashboard            → DashboardPage
/upload               → UploadSyncPage
/settings             → SettingsPage
/transactions         → TransactionsPage
/investments          → InvestmentAnalyticsPage
/mutual-fund-projection → MutualFundProjectionPage
/returns-analysis     → ReturnsAnalysisPage
/tax-planning         → TaxPlanningPage
/net-worth            → NetWorthPage
/spending-analysis    → SpendingAnalysisPage
/income-analysis      → IncomeAnalysisPage
/income-expense-flow  → IncomeExpenseFlowPage
/trends-forecasts     → TrendsForecastsPage
```

All routes except `/` are wrapped in `<ProtectedRoute>` (requires auth) and `<AppLayout>` (sidebar + main content).

App-level providers: `QueryClientProvider`, `Toaster` (sonner), `PreferencesProvider`, `AuthInitializer`.

### 6.2 State Management

**5 Zustand Stores (all with `persist` middleware to localStorage):**

| Store                    | Key `localStorage`               | Purpose                                                                                                |
| ------------------------ | -------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `authStore`              | `ledger-sync-auth`               | JWT tokens (access + refresh), user object, isAuthenticated                                            |
| `preferencesStore`       | `ledger-sync-preferences`        | Display prefs (currency, format, FY), income classification, essential categories, investment mappings |
| `budgetStore`            | `ledger-sync-budgets`            | Client-side category → limit mappings                                                                  |
| `accountStore`           | `account-classification-storage` | Account → AccountType[] classification                                                                 |
| `investmentAccountStore` | `investment-account-storage`     | Set<string> of investment account names                                                                |

**TanStack Query (30+ hooks):**

| Hook Group   | File                 | Hooks                                                                                                                                                                                                                                                             |
| ------------ | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth         | `useAuth.ts`         | `useLogin`, `useRegister`, `useLogout`, `useCurrentUser`, `useAuthInit`, `useUpdateProfile`, `useDeleteAccount`, `useResetAccount`                                                                                                                                |
| Transactions | `useTransactions.ts` | `useTransactions` (fetches ALL)                                                                                                                                                                                                                                   |
| Analytics V1 | `useAnalytics.ts`    | `useKPIs`, `useOverview`, `useBehavior`, `useTrends`, `useCategoriesChart`, `useMonthlyTrends`, `useAccountDistribution`, `useGeneratedInsights`, `useRecentTransactions`                                                                                         |
| Calculations | `useAnalytics.ts`    | `useTotals`, `useMonthlyAggregation`, `useCategoryBreakdown`, `useAccountBalances`, `useMasterCategories`                                                                                                                                                         |
| Analytics V2 | `useAnalyticsV2.ts`  | `useMonthlySummaries`, `useCategoryTrends`, `useTransferFlows`, `useRecurringTransactions`, `useMerchantIntelligence`, `useNetWorthSnapshots`, `useFYSummaries`, `useAnomalies`, `useReviewAnomaly`, `useBudgets`, `useCreateBudget`, `useGoals`, `useCreateGoal` |
| Preferences  | `usePreferences.ts`  | `usePreferences`, `useUpdatePreferences`, `useResetPreferences`, + 8 section-specific update hooks                                                                                                                                                                |
| Upload       | `useUpload.ts`       | `useUpload` (invalidates ALL queries on success)                                                                                                                                                                                                                  |

### 6.3 API Service Layer (`services/api/`)

All services use a shared Axios instance (`client.ts`) with:

- Base URL from `VITE_API_BASE_URL` or `http://localhost:8000`
- Request interceptor: adds `Authorization: Bearer <token>` from authStore
- Response interceptor: on 401, attempts token refresh via `/api/auth/refresh`, retries original request; if refresh fails, logs out

**⚠️ Inconsistency:** `calculationsApi` returns raw `AxiosResponse` while all other services unwrap `.data`. Consumers of calculation hooks must do `response.data` unwrapping.

**⚠️ Inconsistency:** URL prefixes vary — analytics v1 uses `/api/analytics/...`, preferences uses `/preferences/...` (no `/api/`), analytics v2 uses `/analytics/v2/...` (no `/api/`).

### 6.4 Key Utility Libraries (`lib/`)

**`formatters.ts`** (172 lines):

- `formatCurrency(amount)` — Uses ₹ or configured symbol, Indian/international number format
- `formatCurrencyShort(amount)` — Abbreviates with Cr/L (always Indian, even in international mode — **known issue**)
- `formatPercent(value)` — Percentage with sign

**`dateUtils.ts`** (237 lines):

- Two view mode types: `ViewMode` (monthly/yearly/all_time) and `AnalyticsViewMode` (monthly/yearly/fy/all_time)
- FY utilities: `getCurrentFY`, `getFYDateRange`, `getAvailableFYs` (all India April–March aware)
- Period navigation: `getDateRange`, `getPreviousPeriod`, `getNextPeriod`
- `getDateKey(dateStr)` — Extracts `YYYY-MM-DD` from datetime strings for comparison

**`preferencesUtils.ts`** (277 lines):

- `classifyIncomeType(category, subcategory)` → taxable/investment/cashback/other/salary/bonus
- `classifySpendingType(category, essentialCategories)` → essential/discretionary
- `calculateIncomeByCategoryBreakdown(transactions)` → `{category: total}` for income
- `calculateSpendingBreakdown(transactions, essentialCategories)` → `{essential, discretionary, total}`
- Uses `"Category::Subcategory"` string matching against preference lists

**`errorUtils.ts`** (158 lines):

- `getApiErrorMessage(error)` — Handles 5 FastAPI error response shapes with progressive fallback
- `isAuthError(error)`, `isForbiddenError(error)` — Status code checks

### 6.5 Components Overview (43 files, ~7,000 lines)

**Analytics components** (`components/analytics/` — 12 components):

| Component                     | Lines | Visualization                          | Data Source                     |
| ----------------------------- | ----- | -------------------------------------- | ------------------------------- |
| `FinancialHealthScore`        | 708   | Composite score gauge, 6 metric bars   | Raw transactions (24mo)         |
| `PeriodComparison`            | 551   | Side-by-side metric rows               | Raw transactions                |
| `EnhancedSubcategoryAnalysis` | 368   | LineChart drill-down, CSV export       | Raw transactions                |
| `RecurringTransactions`       | 352   | Pattern table with frequency detection | Raw transactions                |
| `MultiCategoryTimeAnalysis`   | 336   | Multi-line chart, granularity selector | Raw transactions                |
| `BudgetTracker`               | 330   | Progress bars per category             | Zustand budgetStore             |
| `ExpenseTreemap`              | 314   | Treemap by category/subcategory        | Raw transactions                |
| `YearOverYearComparison`      | 283   | BarChart per FY                        | Raw transactions                |
| `CashFlowForecast`            | 249   | AreaChart + linear regression          | Monthly aggregation API         |
| `TopMerchants`                | 234   | PieChart + ranked list                 | Raw transaction notes           |
| `CreditCardHealth`            | 225   | Utilization gauges                     | Hardcoded limits + transactions |
| `SubcategoryAnalysis`         | 383   | Expandable rows + line charts          | Props from parent               |

**Shared components** (`components/shared/` — 14 components):
MetricCard, EmptyState, ErrorBoundary, ErrorState, LoadingSkeleton, AuthModal (login/register), ProtectedRoute, PreferencesProvider, TimeRangeSelector, AnalyticsTimeFilter, PeriodNavigator, QuickInsights (8 computed stats), RecentTransactions, Sparkline

**Layout** (`components/layout/`):
AppLayout (flex shell + gradient orbs) + Sidebar (collapsible, 5 nav groups, persisted collapse state)

**Transactions** (`components/transactions/`):
TransactionTable (TanStack Table, sortable), TransactionFilters (debounced search, dropdowns, date/amount range), Pagination

**UI primitives** (`components/ui/`):
Card (3 variants: default/elevated/interactive, glassmorphism), CardHeader, StatCard

**Upload** (`components/upload/`):
DropZone (react-dropzone), UploadResults (stats summary), AccountClassifier (type toggles), InvestmentAccountSelector (investment account toggles)

---

## 7. API Contract

### Base URLs

- Backend: `http://localhost:8000`
- Frontend dev: `http://localhost:5173`

### Route Prefix Map

| Prefix                          | Router                       | Auth Required                         |
| ------------------------------- | ---------------------------- | ------------------------------------- |
| `/api/auth/*`                   | `auth.py`                    | No (register/login), Yes (me/profile) |
| `/api/transactions*`            | `main.py` (inline)           | Yes                                   |
| `/api/upload`                   | `main.py` (inline)           | Yes                                   |
| `/api/analytics/*`              | `analytics.py`               | Yes                                   |
| `/api/analytics/v2/*`           | `analytics_v2.py`            | Yes                                   |
| `/api/calculations/*`           | `calculations.py`            | Yes                                   |
| `/api/meta/*`                   | `meta.py`                    | Yes                                   |
| `/preferences*`                 | `preferences.py`             | Yes                                   |
| `/api/account-classifications*` | `account_classifications.py` | Yes                                   |
| `/`, `/health`                  | `main.py` (inline)           | No                                    |

### Key Endpoints

**Auth:**

```
POST /api/auth/register     {email, password, full_name?} → {access_token, refresh_token}
POST /api/auth/login        {email, password} → {access_token, refresh_token}
POST /api/auth/refresh      {refresh_token} → {access_token, refresh_token}
GET  /api/auth/me           → {id, email, full_name, is_active, ...}
POST /api/auth/logout       → {message}
PUT  /api/auth/me           ?full_name=... → UserResponse
DELETE /api/auth/account     → {message} (IRREVERSIBLE)
POST /api/auth/account/reset → {message} (keeps auth, deletes all data)
```

**Transactions:**

```
GET  /api/transactions      ?page=&limit=&start_date=&end_date= → {transactions[], total, page, limit}
GET  /api/transactions/search ?q= → [Transaction]
GET  /api/transactions/export → CSV blob
POST /api/upload            multipart(file, force?) → {filename, rows_processed, stats{inserted,updated,deleted,unchanged}}
```

**Analytics V1 (computed on-the-fly):**

```
GET /api/analytics/overview    ?time_range= → {total_income, total_expenses, net_change, best_month, worst_month, asset_allocation}
GET /api/analytics/behavior    ?time_range= → {avg_transaction_size, spending_frequency, convenience_pct, lifestyle_inflation, top_categories}
GET /api/analytics/trends      ?time_range= → {monthly_trends[], surplus_trend[], consistency_score}
GET /api/analytics/wrapped     ?time_range= → {insights[{title, value, description}]}
GET /api/analytics/kpis        ?time_range= → {savings_rate, daily_spending_rate, monthly_burn_rate, spending_velocity, category_concentration, consistency_score, lifestyle_inflation, convenience_spending_pct}
GET /api/analytics/charts/income-expense     ?time_range= → {data[{name, value}]}
GET /api/analytics/charts/categories         ?time_range=&limit= → {data[{category, amount}]}
GET /api/analytics/charts/monthly-trends     ?time_range= → {data[{month, income, expenses, net}]}
GET /api/analytics/charts/account-distribution ?time_range= → {data[{account, value}]}
GET /api/analytics/insights/generated         ?time_range= → {insights[{title, description, severity}]}
```

**Analytics V2 (pre-calculated, reads from aggregation tables):**

```
GET  /api/analytics/v2/monthly-summaries     ?start_period=&end_period=&limit=
GET  /api/analytics/v2/category-trends       ?category=&transaction_type=&start_period=&end_period=&limit=
GET  /api/analytics/v2/transfer-flows        ?min_amount=&min_count=
GET  /api/analytics/v2/recurring-transactions ?active_only=&min_confidence=
GET  /api/analytics/v2/merchant-intelligence  ?min_transactions=&recurring_only=&limit=
GET  /api/analytics/v2/net-worth             ?limit=
GET  /api/analytics/v2/fy-summaries
GET  /api/analytics/v2/anomalies             ?severity=&unreviewed_only=&limit=
POST /api/analytics/v2/anomalies/{id}/review ?dismiss=&notes=
GET  /api/analytics/v2/budgets               ?active_only=
POST /api/analytics/v2/budgets               ?category=&monthly_limit=&subcategory=&alert_threshold=
GET  /api/analytics/v2/goals                 ?status=
POST /api/analytics/v2/goals                 ?name=&target_amount=&goal_type=&description=&target_date=
```

**Calculations:**

```
GET /api/calculations/categories/master → {income: {Cat: [Subcat]}, expense: {Cat: [Subcat]}}
GET /api/calculations/totals            ?start_date=&end_date= → {total_income, total_expenses, net_savings, savings_rate}
GET /api/calculations/monthly-aggregation ?start_date=&end_date= → {YYYY-MM: {income, expense, net_savings}}
GET /api/calculations/yearly-aggregation  ?start_date=&end_date= → {YYYY: {income, expense, net_savings, months[]}}
GET /api/calculations/category-breakdown  ?start_date=&end_date=&transaction_type= → {categories: {...}, total}
GET /api/calculations/account-balances    ?start_date=&end_date= → {accounts: {...}, statistics: {...}}
GET /api/calculations/insights           ?start_date=&end_date= → {top_expense_category, most_frequent, avg_daily, savings_rate, unusual_spending[]}
GET /api/calculations/daily-net-worth    ?start_date=&end_date= → {daily_data, cumulative_data}
GET /api/calculations/top-categories     ?start_date=&end_date=&limit=&transaction_type= → [{category, amount, percentage, count}]
```

**Meta:**

```
GET /api/meta/types    → {transaction_types: ["Income", "Expense", "Transfer"]}
GET /api/meta/accounts → {accounts: ["HDFC Bank", "Cash", ...]}
GET /api/meta/filters  → {transaction_types, accounts}
GET /api/meta/buckets  → {needs[], wants[], savings[], investment_categories[], investment_accounts[]}
```

**Preferences:**

```
GET  /preferences                  → Full UserPreferences object
PUT  /preferences                  Partial update body → UserPreferences
POST /preferences/reset            → Reset to defaults
PUT  /preferences/fiscal-year      {fiscal_year_start_month}
PUT  /preferences/essential-categories {essential_categories[]}
PUT  /preferences/investment-mappings  {investment_account_mappings{}}
PUT  /preferences/income-sources       {taxable_income_categories[], investment_returns_categories[], non_taxable_income_categories[], other_income_categories[]}
PUT  /preferences/budget-defaults      {default_budget_alert_threshold, auto_create_budgets, budget_rollover_enabled}
PUT  /preferences/display              {number_format, currency_symbol, currency_symbol_position, default_time_range}
PUT  /preferences/anomaly-settings     {anomaly_expense_threshold, anomaly_types_enabled[], auto_dismiss_recurring_anomalies}
PUT  /preferences/recurring-settings   {recurring_min_confidence, recurring_auto_confirm_occurrences}
```

**Account Classifications:**

```
GET    /api/account-classifications                → {account_name: type_string}
GET    /api/account-classifications/{name}         → {account_name, account_type}
POST   /api/account-classifications ?account_name=&account_type= → {status}
DELETE /api/account-classifications/{name}         → {status}
GET    /api/account-classifications/type/{type}    → {account_type, accounts[]}
```

---

## 8. Database Schema

### Entity-Relationship Summary

```
User (1) ──── (N) Transaction
User (1) ──── (1) UserPreferences
User (1) ──── (N) ImportLog

Transaction ──── (hash PK: transaction_id)
  ├── type: Income | Expense | Transfer
  ├── amount: Decimal
  ├── date: DateTime
  ├── account, category, subcategory, note
  ├── from_account, to_account (transfers only)
  ├── is_deleted: Boolean (soft delete)
  └── last_seen_at: DateTime (reconciliation tracking)

MonthlySummary ──── (period_key: YYYY-MM)
CategoryTrend  ──── (period_key + category + type)
TransferFlow   ──── (from_account + to_account)
RecurringTransaction ──── (pattern_name + category + account)
MerchantIntelligence ──── (merchant_name)
NetWorthSnapshot ──── (snapshot_date)
FYSummary        ──── (fiscal_year label)
Anomaly          ──── (auto int, links to transaction_id or period_key)
Budget           ──── (category + subcategory)
FinancialGoal    ──── (name + goal_type)
AccountClassification ──── (account_name → account_type)
AuditLog         ──── (operation + entity_type + action)
```

### Key Indexes

- `Transaction`: composite on `(user_id, date)`, `(user_id, category)`, `(user_id, is_deleted)`
- `ImportLog`: `(file_hash, user_id)` for idempotent import checks

---

## 9. Authentication System

### Flow

```
Register/Login → JWT tokens (access + refresh)
     │
     ▼
Frontend stores tokens in Zustand (persisted to localStorage)
     │
     ▼
Every API request → Axios interceptor adds "Authorization: Bearer <access_token>"
     │
     ▼
Backend deps.py → get_current_user() decodes JWT, queries User by ID
     │
     ▼
On 401 → Axios response interceptor tries POST /api/auth/refresh
     │
     ├── Success: retry original request with new tokens
     └── Failure: logout (clear store + redirect)
```

### Token Structure

| Field   | Access Token     | Refresh Token    |
| ------- | ---------------- | ---------------- |
| `sub`   | user_id (string) | user_id (string) |
| `email` | user email       | user email       |
| `exp`   | now + 24h        | now + 7d         |
| `type`  | `"access"`       | `"refresh"`      |

**Algorithm:** HS256
**Secret:** `settings.jwt_secret_key` (default: `"dev-secret-key-change-in-production"`)

### Password Storage

- `bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt())`
- Verification: `bcrypt.checkpw(plain.encode('utf-8'), hashed.encode('utf-8'))`

### Auth Startup Sequence (Frontend)

1. `AuthInitializer` component runs `useAuthInit()` on mount
2. If tokens exist in localStorage (persisted Zustand), calls `GET /api/auth/me`
3. If valid → sets user in store, marks `isAuthenticated = true`
4. If invalid → clears tokens, marks `isAuthenticated = false`

---

## 10. Configuration & Preferences

### Backend Config (`settings.py`)

Loaded from environment variables with `LEDGER_SYNC_` prefix or `.env` file:

| Variable                                      | Default                          | Description             |
| --------------------------------------------- | -------------------------------- | ----------------------- |
| `LEDGER_SYNC_ENVIRONMENT`                     | `development`                    |                         |
| `LEDGER_SYNC_DATABASE_URL`                    | `sqlite:///./ledger_sync.db`     |                         |
| `LEDGER_SYNC_LOG_LEVEL`                       | `INFO`                           |                         |
| `LEDGER_SYNC_JWT_SECRET_KEY`                  | `dev-secret-key-...`             | ⚠️ Change in production |
| `LEDGER_SYNC_JWT_ALGORITHM`                   | `HS256`                          |                         |
| `LEDGER_SYNC_JWT_ACCESS_TOKEN_EXPIRE_MINUTES` | `1440`                           | 24 hours                |
| `LEDGER_SYNC_JWT_REFRESH_TOKEN_EXPIRE_DAYS`   | `7`                              |                         |
| `LEDGER_SYNC_CORS_ORIGINS`                    | `[localhost:3000, :5173, :5174]` |                         |

### User Preferences (per-user, stored in DB)

8 preference sections, all configurable via UI (SettingsPage) and REST API:

| Section                   | Key Fields                                                                                                                                                              | Default                                                                                                            |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **Fiscal Year**           | `fiscal_year_start_month`                                                                                                                                               | `4` (April)                                                                                                        |
| **Essential Categories**  | `essential_categories` (JSON list)                                                                                                                                      | Housing, Healthcare, Transportation, Food & Dining, Education, Family, Utilities                                   |
| **Investment Mappings**   | `investment_account_mappings` (JSON dict)                                                                                                                               | Grow Stocks→stocks, Grow Mutual Funds→mutual_funds, FD/Bonds→fixed_deposits, EPF→ppf_epf, PPF→ppf_epf, RSUs→stocks |
| **Income Classification** | `taxable_income_categories`, `investment_returns_categories`, `non_taxable_income_categories`, `other_income_categories` (JSON lists, `"Category::Subcategory"` format) | India-specific: Employment Income::Salary, Investment Income::Dividends, Refund & Cashbacks::\*, etc.              |
| **Budget Defaults**       | `default_budget_alert_threshold`, `auto_create_budgets`, `budget_rollover_enabled`                                                                                      | 80%, false, false                                                                                                  |
| **Display**               | `number_format`, `currency_symbol`, `currency_symbol_position`, `default_time_range`                                                                                    | `"indian"`, `"₹"`, `"before"`, `"last_12_months"`                                                                  |
| **Anomaly**               | `anomaly_expense_threshold`, `anomaly_types_enabled`, `auto_dismiss_recurring_anomalies`                                                                                | 2.0 std devs, all types, true                                                                                      |
| **Recurring**             | `recurring_min_confidence`, `recurring_auto_confirm_occurrences`                                                                                                        | 50%, 6                                                                                                             |

---

## 11. Testing

### Current Coverage

| Test File                              | Tests | Type        | What's Tested                                                                                                                                                                           |
| -------------------------------------- | ----- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/unit/test_hash_id.py`           | 7     | Unit        | Deterministic hashing, case insensitivity, whitespace normalization, None handling, hash length                                                                                         |
| `tests/unit/test_normalizer.py`        | 12    | Unit        | Date parsing (datetime/string/missing), amount conversion (float/int/rounding), string normalization (lowercase/preserve-case), transaction type mapping (Exp./Income/Transfer/invalid) |
| `tests/integration/test_reconciler.py` | 4     | Integration | Insert new, update (restore soft-deleted), skip unchanged, soft-delete stale                                                                                                            |

### Test Infrastructure

- **Fixtures** (`conftest.py`): In-memory SQLite engine, `test_db_session`, `test_user` (with dummy password hash), `sample_transaction_data`, `sample_transaction` (pre-inserted with old timestamp)
- **Run:** `cd backend && pytest` (or `pytest --cov=ledger_sync tests/`)

### Test Gaps (not yet covered)

- No API endpoint tests (FastAPI TestClient)
- No AnalyticsEngine tests
- No Calculator tests
- No ExcelLoader/Validator tests
- No auth flow tests
- No frontend tests at all (no Jest/Vitest/Playwright)

---

## 12. Known Issues & Tech Debt

### High Severity

| #   | Issue                                                       | Location                                                                                                                                                                      | Impact                                                                                                                                       |
| --- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Analytics V2 aggregation tables are NOT user-scoped**     | `analytics_v2.py` header comment, `analytics_engine.py` queries                                                                                                               | In multi-user mode, aggregation tables contain data for ALL users. V2 endpoints return mixed data. V1 endpoints are correctly user-filtered. |
| 2   | **Account classification fragmented across 4 systems**      | `accountStore`, `investmentAccountStore`, `preferencesStore.investmentAccountMappings`, server `AccountClassification` table, plus keyword heuristics in `useAccountTypes.ts` | Inconsistent classification, confusing UX, potential data drift between client and server                                                    |
| 3   | **`getTransactions` fetches ALL records in unbounded loop** | `frontend/src/services/api/transactions.ts`                                                                                                                                   | `while(true)` loop fetching 1000-per-page with no upper cap. Could OOM on large datasets.                                                    |

### Medium Severity

| #   | Issue                                                                                                           | Location                                                        |
| --- | --------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| 4   | Inconsistent API URL prefixes: `/api/analytics/...` vs `/preferences` vs `/analytics/v2/...`                    | Service files + backend routers                                 |
| 5   | `calculationsApi` returns raw `AxiosResponse` while all other services unwrap `.data`                           | `calculations.ts`, forcing hook consumers to do `response.data` |
| 6   | Budget state duplication: local Zustand `budgetStore` vs server V2 `Budget` table                               | `budgetStore.ts` vs `analytics_v2.py` `/budgets` endpoints      |
| 7   | `formatCurrencyShort` always uses Cr/L abbreviations even when `numberFormat === 'international'`               | `lib/formatters.ts`                                             |
| 8   | Minimal test coverage (23 tests total, no API/analytics/frontend tests)                                         | `backend/tests/`                                                |
| 9   | Duplicate `settings = Settings()` instantiation                                                                 | `config/settings.py` bottom lines                               |
| 10  | `update_income_sources` endpoint references non-existent fields (`salary_categories`, `bonus_categories`, etc.) | `api/preferences.py` `update_income_sources()` function         |

### Low Severity

| #   | Issue                                                                              | Location                                    |
| --- | ---------------------------------------------------------------------------------- | ------------------------------------------- |
| 11  | No `date-fns` usage in `dateUtils.ts` despite project convention                   | `lib/dateUtils.ts`                          |
| 12  | Two overlapping `ViewMode` types (`ViewMode` vs `AnalyticsViewMode`)               | `lib/dateUtils.ts`                          |
| 13  | Store barrel re-exports incomplete (missing `authStore`, `investmentAccountStore`) | `store/index.ts`                            |
| 14  | `useAuthInit` uses `useQuery` for side-effects (anti-pattern)                      | `hooks/api/useAuth.ts`                      |
| 15  | `useAnalyticsV2` uses relative import `../../` instead of `@/` alias               | `hooks/api/useAnalyticsV2.ts`               |
| 16  | `usePeriodNavigation` doesn't support fiscal year view mode                        | `hooks/usePeriodNavigation.ts`              |
| 17  | `CreditCardHealth` component uses hardcoded credit card limits                     | `components/analytics/CreditCardHealth.tsx` |

---

## 13. File-by-File Reference

### Backend — Source (`backend/src/ledger_sync/`)

| File                             | Lines | Purpose                                                           |
| -------------------------------- | ----- | ----------------------------------------------------------------- |
| `__init__.py`                    | ~5    | Package version                                                   |
| `config/settings.py`             | ~135  | Central pydantic-settings config                                  |
| `db/base.py`                     | ~10   | SQLAlchemy DeclarativeBase                                        |
| `db/session.py`                  | ~50   | Engine, SessionLocal, get_session(), init_db()                    |
| `db/models.py`                   | 1023  | 20 ORM models, 6 enums                                            |
| `ingest/excel_loader.py`         | ~80   | Load + hash Excel files                                           |
| `ingest/validator.py`            | ~140  | Column existence + data type validation                           |
| `ingest/normalizer.py`           | 433   | Full data cleaning + normalization pipeline                       |
| `ingest/hash_id.py`              | ~100  | SHA-256 transaction ID generation                                 |
| `core/calculator.py`             | 407   | 12 static financial calculation methods                           |
| `core/reconciler.py`             | 509   | Transaction + transfer reconciliation                             |
| `core/sync_engine.py`            | ~200  | Import orchestration                                              |
| `core/analytics_engine.py`       | 1292  | 9 post-upload analytics calculations                              |
| `core/insights.py`               | 296   | Text-based insight generation                                     |
| `core/time_filter.py`            | ~200  | TimeRange enum + filtering                                        |
| `core/auth.py`                   | ~45   | Backwards-compat re-export (deprecated)                           |
| `core/auth/tokens.py`            | 120   | JWT create/decode/verify                                          |
| `core/auth/passwords.py`         | ~35   | bcrypt hash/verify                                                |
| `api/main.py`                    | 524   | FastAPI app + inline routes (transactions, upload, health)        |
| `api/deps.py`                    | ~100  | get_current_user, CurrentUser type alias                          |
| `api/auth.py`                    | ~200  | Auth endpoints (register, login, refresh, profile, account mgmt)  |
| `api/analytics.py`               | 441   | V1 analytics (overview, behavior, trends, KPIs, charts, insights) |
| `api/analytics_v2.py`            | 628   | V2 pre-calculated analytics (10 domains)                          |
| `api/calculations.py`            | 553   | Financial calculations (totals, aggregations, breakdowns)         |
| `api/meta.py`                    | ~280  | Metadata for UI dropdowns (types, accounts, buckets)              |
| `api/preferences.py`             | 485   | User preferences CRUD (full + 8 section endpoints)                |
| `api/account_classifications.py` | ~190  | Account type classification CRUD                                  |
| `schemas/auth.py`                | 92    | Pydantic auth schemas                                             |
| `services/auth_service.py`       | 264   | Auth business logic                                               |
| `utils/logging.py`               | ~160  | Rotating file + console logging                                   |
| `cli/main.py`                    | 171   | Typer CLI commands                                                |

### Backend — Tests (`backend/tests/`)

| File                             | Lines | Purpose                                        |
| -------------------------------- | ----- | ---------------------------------------------- |
| `conftest.py`                    | ~90   | Fixtures: in-memory DB, test user, sample data |
| `unit/test_hash_id.py`           | ~90   | 7 hash ID tests                                |
| `unit/test_normalizer.py`        | ~130  | 12 normalizer tests                            |
| `integration/test_reconciler.py` | ~120  | 4 reconciliation tests                         |

### Frontend — Pages (`frontend/src/pages/`)

| File                           | Lines | Description                                |
| ------------------------------ | ----- | ------------------------------------------ |
| `HomePage.tsx`                 | 497   | Marketing landing page                     |
| `DashboardPage.tsx`            | 428   | Main dashboard with KPIs, charts, insights |
| `TransactionsPage.tsx`         | 216   | Data table with filters, sorting, export   |
| `UploadSyncPage.tsx`           | 292   | Drag-drop upload + format guide            |
| `SettingsPage.tsx`             | 1301  | 6-tab comprehensive settings               |
| `SpendingAnalysisPage.tsx`     | 374   | Spending breakdown + analytics             |
| `IncomeAnalysisPage.tsx`       | 414   | Income analysis + trends                   |
| `InvestmentAnalyticsPage.tsx`  | 588   | Investment portfolio analytics             |
| `MutualFundProjectionPage.tsx` | ~300  | SIP calculator                             |
| `ReturnsAnalysisPage.tsx`      | ~300  | Investment returns                         |
| `TaxPlanningPage.tsx`          | ~400  | India tax planning                         |
| `NetWorthPage.tsx`             | ~300  | Net worth dashboard                        |
| `TrendsForecastsPage.tsx`      | ~250  | Cash flow forecasting                      |
| `IncomeExpenseFlowPage/`       | ~300  | Sankey flow visualization                  |

### Frontend — Components (`frontend/src/components/`)

| Directory       | Files | ~Lines | Key Components                                                                                                                                                                                                                                                  |
| --------------- | ----- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `analytics/`    | 13    | 3,823  | FinancialHealthScore (708), PeriodComparison (551), ExpenseTreemap, CashFlowForecast, BudgetTracker, RecurringTransactions, MultiCategoryTimeAnalysis, YearOverYearComparison, TopMerchants, CreditCardHealth, SubcategoryAnalysis, EnhancedSubcategoryAnalysis |
| `shared/`       | 15    | 1,542  | MetricCard, EmptyState, ErrorBoundary, ErrorState, LoadingSkeleton, AuthModal, ProtectedRoute, PreferencesProvider, TimeRangeSelector, AnalyticsTimeFilter, PeriodNavigator, QuickInsights, RecentTransactions, Sparkline                                       |
| `layout/`       | 4     | 426    | AppLayout, Sidebar, SidebarGroup, SidebarItem                                                                                                                                                                                                                   |
| `transactions/` | 4     | 586    | TransactionTable, TransactionFilters, Pagination                                                                                                                                                                                                                |
| `ui/`           | 2     | 147    | Card (3 variants), CardHeader, StatCard                                                                                                                                                                                                                         |
| `upload/`       | 5     | 444    | DropZone, UploadResults, AccountClassifier, InvestmentAccountSelector                                                                                                                                                                                           |

### Frontend — State & Services (`frontend/src/`)

| File                                     | Lines | Purpose                                  |
| ---------------------------------------- | ----- | ---------------------------------------- |
| `store/authStore.ts`                     | 117   | JWT + user state (persist)               |
| `store/preferencesStore.ts`              | 168   | Display + classification prefs (persist) |
| `store/budgetStore.ts`                   | 46    | Category budgets (persist)               |
| `store/accountStore.ts`                  | 33    | Account types (persist)                  |
| `store/investmentAccountStore.ts`        | 71    | Investment account Set (persist)         |
| `services/api/client.ts`                 | 72    | Axios instance + interceptors            |
| `services/api/auth.ts`                   | 88    | Auth API calls                           |
| `services/api/analytics.ts`              | 135   | V1 analytics service                     |
| `services/api/analyticsV2.ts`            | 284   | V2 analytics service                     |
| `services/api/calculations.ts`           | 89    | Calculations service                     |
| `services/api/transactions.ts`           | 72    | Transaction service                      |
| `services/api/upload.ts`                 | 19    | Upload service                           |
| `services/api/preferences.ts`            | 166   | Preferences service                      |
| `services/api/accountClassifications.ts` | 43    | Account classification service           |
| `hooks/api/useAuth.ts`                   | 157   | 8 auth hooks                             |
| `hooks/api/useTransactions.ts`           | 9     | Transaction query hook                   |
| `hooks/api/useAnalytics.ts`              | 117   | 15 V1 analytics/calculation hooks        |
| `hooks/api/useAnalyticsV2.ts`            | 202   | 13 V2 analytics hooks                    |
| `hooks/api/usePreferences.ts`            | 141   | Preferences + 8 section hooks            |
| `hooks/api/useUpload.ts`                 | 22    | Upload mutation hook                     |
| `hooks/useAnalytics.ts`                  | 18    | Re-export barrel                         |
| `hooks/useAccountTypes.ts`               | 63    | Account classification hooks             |
| `hooks/usePeriodNavigation.ts`           | 60    | Period navigation state                  |
| `lib/cn.ts`                              | ~5    | Tailwind class merge                     |
| `lib/queryClient.ts`                     | 13    | TanStack Query config                    |
| `lib/formatters.ts`                      | 172   | Currency/number formatting               |
| `lib/dateUtils.ts`                       | 237   | Date ranges, FY, periods                 |
| `lib/errorUtils.ts`                      | 158   | Error message extraction                 |
| `lib/preferencesUtils.ts`                | 277   | Income/spending classification           |
| `types/index.ts`                         | 127   | Shared TypeScript types                  |
| `constants/index.ts`                     | 64    | Routes, API URLs, endpoints              |
| `constants/colors.ts`                    | ~50   | iOS color palette                        |
| `constants/chartColors.ts`               | ~30   | Chart color arrays                       |
| `constants/accountTypes.ts`              | ~40   | Account classification keywords          |

---

_End of audit. This document should provide any AI agent with complete context to understand, navigate, and modify the Ledger Sync codebase._
