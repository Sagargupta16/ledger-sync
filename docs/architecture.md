# System Architecture

## Overview

Ledger Sync is a full-stack financial management application with a clear separation of concerns between backend and frontend. The system processes Excel financial data, reconciles transactions, and provides comprehensive analytics through an interactive dashboard.

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Web Browser (Client)                     │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTP/WebSocket
                         │
┌────────────────────────▼────────────────────────────────────┐
│                    Frontend (React + TS)                      │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ Pages: Overview, Income, Categories, Trends, etc.   │   │
│  │ Components: Charts, KPIs, Forms, Tables             │   │
│  │ Services: API client, State management              │   │
│  └──────────────────────────────────────────────────────┘   │
└────────────────────────┬────────────────────────────────────┘
                         │ REST API (JSON)
                         │
┌────────────────────────▼────────────────────────────────────┐
│               Backend API (FastAPI + Python)                 │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ Endpoints: Upload, Transactions, Analytics, Calc.   │   │
│  │ Business Logic: Reconciliation, Sync, Calculations  │   │
│  │ Data Layer: SQLAlchemy ORM, Database Access         │   │
│  └──────────────────────────────────────────────────────┘   │
└────────────────────────┬────────────────────────────────────┘
                         │ SQL
                         │
┌────────────────────────▼────────────────────────────────────┐
│                    SQLite Database                           │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ Tables: Transactions, Accounts, Analytics Data      │   │
│  │ Schema: Managed by Alembic migrations              │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## Backend Architecture

### Layers

#### 1. **API Layer** (`src/ledger_sync/api/`)

- **Responsibility**: HTTP endpoints, request/response handling
- **Components**:
  - `main.py` - FastAPI application setup, middleware, CORS
  - `analytics.py` - Analytics endpoints (overview, KPIs, trends, behavior)
  - `calculations.py` - Financial calculation endpoints
  - Routes requests to business logic and return JSON responses

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
  - `time_filter.py` - Time range filtering logic

#### 3. **Data Access Layer** (`src/ledger_sync/db/`)

- **Responsibility**: Database interactions, ORM operations
- **Components**:
  - `models.py` - SQLAlchemy models (Transaction, Account, etc.)
  - `session.py` - Database session management
  - `base.py` - Base configuration
  - Direct database queries and transactions

#### 4. **Ingestion Layer** (`src/ledger_sync/ingest/`)

- **Responsibility**: Data import and validation
- **Components**:
  - `excel_loader.py` - Read Excel files, parse data
  - `normalizer.py` - Clean, transform, standardize data
  - `validator.py` - Validate data integrity and format
  - `hash_id.py` - Generate deterministic transaction IDs

#### 5. **Utilities Layer** (`src/ledger_sync/utils/`)

- **Responsibility**: Helper functions, logging, common utilities
- **Components**:
  - `logging.py` - Centralized logging configuration

### Data Flow

```
Excel File Upload
       │
       ▼
┌─────────────────┐
│ Excel Loader    │  Read and parse Excel file
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Normalizer      │  Clean and standardize data
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Validator       │  Validate data integrity
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Hash ID Gen     │  Generate deterministic IDs
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Reconciler      │  Compare with DB, decide action
└────────┬────────┘
         │
    ┌────┴───┬──────┬────────┐
    │         │      │        │
    ▼         ▼      ▼        ▼
 Insert   Update  Delete   Skip
    │         │      │        │
    └────┬────┴──────┴────────┘
         │
         ▼
┌─────────────────┐
│ SQLite DB       │  Persist data
└─────────────────┘
```

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

#### Financial Calculations

```python
Income = Sum of all Income type transactions
Expenses = Sum of all Expense type transactions
Net = Income - Expenses
Savings Rate = (Income - Expenses) / Income
```

## Frontend Architecture

### Layers

#### 1. **Pages Layer** (`src/pages/`)

- **Responsibility**: Screen-level components, layout
- **Components**:
  - `OverviewPage` - Dashboard with KPIs
  - `IncomeExpensePage` - Income/expense analysis
  - `CategoryAnalysisPage` - Category breakdown
  - `TrendsForecastsPage` - Trends and predictions
  - `TransactionsPage` - Transaction table
  - `PatternsPage` - Recurring payments and analytics

#### 2. **Features Layer** (`src/features/`)

- **Responsibility**: Feature-specific components and logic
- **Modules**:
  - `analytics/` - Investment, tax, housing components
  - `budget/` - Budget and goals management
  - `charts/` - Visualization components
  - `kpi/` - KPI cards and metrics
  - `transactions/` - Transaction components

#### 3. **Components Layer** (`src/components/`)

- **Responsibility**: Reusable UI components
- **Types**:
  - `FileUpload` - File upload component
  - `ui/` - Base UI components (buttons, cards, dialogs)
  - Other shared components

#### 4. **Hooks Layer** (`src/hooks/`)

- **Responsibility**: Custom React hooks for logic reuse
- **Examples**:
  - `useDataProcessor` - Parse and process transaction data
  - `useChartExport` - Export charts as PNG
  - `useLocalStorage` - Persist data to localStorage

#### 5. **Services Layer** (`src/services/`)

- **Responsibility**: API communication
- **Components**:
  - `api.ts` - Backend API client with all endpoints

#### 6. **Store/State Layer** (`src/store/`)

- **Responsibility**: Global state management
- **Tools**: Zustand for state management
- **Stores**:
  - Transaction store
  - Filter and sort state

#### 7. **Utils Layer** (`src/lib/`)

- **Responsibility**: Utility functions and helpers
- **Modules**:
  - `analytics/` - Analytics calculations
  - `calculations/` - Financial calculations
  - `formatters.ts` - Data formatting utilities
  - `parsers.ts` - Data parsing

### Component Hierarchy

```
App
├── FileUpload
├── Navigation/Tabs
└── Page Component
    ├── Page-specific state
    ├── Data fetching
    └── Feature Components
        ├── Chart Components
        │   ├── Line
        │   ├── Bar
        │   ├── Doughnut
        │   └── Custom Charts
        ├── KPI Cards
        ├── Tables
        └── Panels
```

### Data Flow

```
User Input (File Upload, Navigation)
       │
       ▼
┌──────────────────┐
│ Event Handler    │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ API Service      │  Call backend endpoint
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ State Update     │  Update store/local state
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Component Render │  React re-renders
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ UI Update        │  Browser displays new data
└──────────────────┘
```

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

- **React 19**: Component-based UI
- **TypeScript**: Type safety and better DX
- **Vite**: Fast build tool and dev server
- **Tailwind CSS**: Utility-first styling
- **Chart.js**: Data visualization
- **Zustand**: Lightweight state management

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
POST   /api/upload                      - Upload Excel file
GET    /api/transactions                - Get all transactions
GET    /api/analytics/overview          - Get financial overview
GET    /api/analytics/kpis              - Get KPIs
GET    /api/calculations/totals         - Get income/expense totals
GET    /api/calculations/insights       - Get financial insights
```

## Security Considerations

1. **Input Validation**

   - Validate Excel file format
   - Sanitize data during import
   - Type checking with TypeScript and Python

2. **Data Protection**

   - Use soft deletes instead of hard deletes
   - Maintain audit trail with timestamps
   - CORS configuration for cross-origin requests

3. **CORS**
   - Frontend and backend on different ports
   - CORS middleware configured in FastAPI

## Scalability Considerations

### Current Design

- Single SQLite database (file-based)
- Suitable for personal use and small datasets
- All data in one instance

### Future Improvements

- Migrate to PostgreSQL for multi-user scenarios
- Implement caching (Redis) for analytics
- Async database operations
- API rate limiting
- User authentication and authorization

## Performance Optimizations

### Backend

- Efficient queries with SQLAlchemy
- Database indexes on frequently queried columns
- Batch processing for large imports
- Response caching for analytics

### Frontend

- Code splitting with Vite
- Lazy loading of pages
- Memoization of expensive calculations
- Chart rendering optimization

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

- Python environment with dependencies
- SQLite database file
- Uvicorn ASGI server

### Frontend

- Build as static assets
- Served via web server
- Environment variables for API URL

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
