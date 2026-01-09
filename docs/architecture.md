# Architecture Documentation

## Overview

`ledger-sync` is a backend-first data reconciliation engine following clean architecture principles. This document describes the architectural decisions, design patterns, and data flow.

## Design Principles

### 1. Single Source of Truth

Excel files from Money Manager Pro are the **authoritative source**. The database is a **derived reflection** optimized for querying and analysis.

### 2. Idempotency

All operations must be idempotent:

- Same file uploaded twice → zero changes
- Same data with different timestamps → consistent results
- Deterministic transaction IDs ensure stability

### 3. Clean Architecture

The codebase is organized in layers with clear separation of concerns:

```
┌─────────────────────────────────────┐
│         CLI Layer (Typer)           │
│  • User interaction                 │
│  • Command parsing                  │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│      Core Business Logic            │
│  • SyncEngine (orchestration)       │
│  • Reconciler (transaction logic)   │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│       Data Ingestion Layer          │
│  • ExcelLoader                      │
│  • Validator                        │
│  • Normalizer                       │
│  • TransactionHasher                │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│       Data Access Layer             │
│  • SQLAlchemy ORM                   │
│  • Models                           │
│  • Session Management               │
└─────────────────────────────────────┘
```

### 4. Type Safety

- All code uses Python type hints
- Pydantic for configuration validation
- mypy in strict mode for static type checking
- SQLAlchemy 2.0 with typed mappings

### 5. Testability

- Dependency injection for database sessions
- In-memory SQLite for fast tests
- Clear separation between pure logic and I/O
- Comprehensive fixtures for test data

## Component Details

### Excel Ingestion Pipeline

#### 1. ExcelLoader

**Responsibility:** Load Excel files and calculate file hash

**Key Operations:**

- Read Excel file using openpyxl engine
- Calculate SHA-256 file hash for idempotency
- Pass data to validator

**Why openpyxl?** Better support for .xlsx files and more reliable than xlrd.

#### 2. Validator

**Responsibility:** Ensure Excel data meets requirements

**Validation Steps:**

1. File existence and readability
2. Required columns present (with fuzzy matching)
3. Data types are coercible to expected types
4. Non-empty dataset

**Design Decision:** Fail fast with descriptive errors. Users should know immediately if their Excel file won't work.

#### 3. Normalizer

**Responsibility:** Transform raw Excel data into consistent format

**Normalization Rules:**

- **Dates:** Convert to datetime, ISO-8601 format (preserves timestamp precision)
- **Amounts:** Decimal with 2-digit precision (monetary accuracy)
- **Strings:** Trim whitespace, preserve case for accounts/notes
- **Types:** Map various representations to canonical enum (EXPENSE, INCOME, TRANSFER)
- **Currency:** Default to INR if missing
- **Transfers:** Special handling - Category labeled as "Transfer: From X" or "Transfer: To Y" to show direction

**Why Decimal?** Floating-point arithmetic is unsuitable for financial calculations due to precision errors.

**Transfer Handling:** Money Manager Pro creates two entries for each transfer (one for each account). We preserve both but make the direction explicit in the category field.

#### 4. TransactionHasher

**Responsibility:** Generate deterministic transaction IDs

**Hash Input (v2 - Enhanced):**

```
normalized_date | normalized_amount | normalized_account | normalized_note |
normalized_category | normalized_subcategory | normalized_type
```

**Why Include All Fields?**

- Prevents false duplicates (e.g., two cab rides at same time for same amount but different notes)
- Category/subcategory distinguish different transactions at same timestamp
- Type ensures transfers are unique from regular transactions
- Note field captures transaction-specific details (essential for uniqueness)

**Why SHA-256?**

- Cryptographically strong (collision-resistant)
- 64-character hex output (good for primary key)
- Deterministic and reproducible

**Critical Insight:** The hash must be stable across imports. Every field that makes a transaction unique must be included to avoid losing genuine transactions.

### Reconciliation Engine

#### Reconciler

**Responsibility:** Apply business logic for insert/update/delete

**Algorithm:**

```python
for each transaction in Excel:
    transaction_id = generate_hash(date, amount, account, note)

    if transaction_id exists in DB:
        # EXISTING TRANSACTION
        if category or subcategory or note or type changed:
            UPDATE those fields
            action = "updated"
        else:
            action = "skipped"

        mark last_seen_at = import_time
        mark is_deleted = False

    else:
        # NEW TRANSACTION
        INSERT transaction
        action = "inserted"

# SOFT DELETE DETECTION
for each transaction in DB:
    if last_seen_at < import_time:
        mark is_deleted = True
```

**Design Decision: Soft Deletes**

We never hard-delete transactions. Why?

1. **Audit Trail:** Preserve history of what was once there
2. **Reversibility:** User can restore deleted transactions
3. **Data Integrity:** Safer than destructive operations
4. **Analysis:** Can analyze deleted transactions separately

#### SyncEngine

**Responsibility:** Orchestrate the entire import process

**Workflow:**

1. **Load:** Read Excel file, calculate hash
2. **Idempotency Check:** Has this file been imported?
3. **Normalize:** Clean and transform data
4. **Reconcile:** Apply insert/update/delete logic
5. **Log:** Record import statistics
6. **Commit:** Atomically save all changes

**Why Atomic?** Either the entire import succeeds or none of it does. No partial imports.

### Database Design

#### Transaction Model

**Primary Key:** `transaction_id` (deterministic hash)

**Indexes:**

- `date` (for date-range queries)
- `type` (filter by income/expense)
- `account` (per-account analysis)
- `category` (category-based reports)
- `is_deleted` (exclude deleted transactions)
- Composite: `(date, type)` and `(category, subcategory)`

**Why these indexes?** Common query patterns:

- "Show all expenses in January"
- "Total by category"
- "Active transactions only"

#### ImportLog Model

**Purpose:** Track import history for idempotency and auditing

**Primary Key:** Auto-increment `id`

**Unique Constraint:** `file_hash` (prevents duplicate imports)

**Statistics Tracked:**

- Rows processed, inserted, updated, deleted, skipped
- Import timestamp
- Source filename

### Configuration Management

**Pydantic Settings:**

- Type-safe configuration
- Environment variable support
- .env file loading
- Default values with overrides

**Why Pydantic?** Validation at startup, not runtime. Invalid config = app won't start (fail fast).

### CLI Design

**Typer + Rich:**

- Modern, declarative CLI framework
- Beautiful terminal output with Rich
- Type-safe argument/option parsing
- Automatic help generation

**Commands:**

- `ledger-sync import <file>` - Main import command
- `ledger-sync init` - Initialize database
- `ledger-sync --version` - Version info

**Design Decision:** Keep CLI thin. Business logic lives in core modules, CLI is just a presentation layer.

## Data Flow

### Import Operation

```
┌──────────────┐
│ User runs:   │
│ ledger-sync  │
│   import     │
│   file.xlsx  │
└──────┬───────┘
       │
       ▼
┌──────────────────────┐
│ CLI validates args   │
│ Creates DB session   │
└──────┬───────────────┘
       │
       ▼
┌──────────────────────┐
│ SyncEngine.import()  │
└──────┬───────────────┘
       │
       ├─► ExcelLoader.load()
       │   ├─► Calculate file hash
       │   ├─► Read Excel with pandas
       │   └─► Validator.validate()
       │
       ├─► Check ImportLog (idempotency)
       │   └─► Raise error if duplicate
       │
       ├─► Normalizer.normalize_dataframe()
       │   └─► Transform each row
       │
       ├─► Reconciler.reconcile_batch()
       │   ├─► For each row:
       │   │   ├─► TransactionHasher.generate_id()
       │   │   ├─► Query DB for existing
       │   │   └─► INSERT or UPDATE
       │   ├─► Commit changes
       │   └─► Mark soft deletes
       │
       └─► Create ImportLog entry
           └─► Commit all
```

### Idempotency Check

```
User uploads file.xlsx
        │
        ▼
Calculate SHA-256(file contents)
        │
        ▼
Query ImportLog WHERE file_hash = ?
        │
        ├─► Found
        │   └─► Raise "Already imported"
        │
        └─► Not Found
            └─► Proceed with import
```

### Transaction ID Stability

```
Excel Row:
  Date: 2024-01-15
  Amount: 100.50
  Account: Cash
  Note: Coffee
  Category: Food

Step 1: Normalize
  date → 2024-01-15T00:00:00
  amount → 100.50
  account → "cash"
  note → "coffee"

Step 2: Generate Hash
  hash_input = "2024-01-15T00:00:00|100.50|cash|coffee"
  transaction_id = sha256(hash_input) = "a3f2..."

Step 3: Reconcile
  Query: SELECT * WHERE transaction_id = "a3f2..."

  If NOT EXISTS → INSERT
  If EXISTS → UPDATE category/subcategory/note
```

**Key Insight:** Same core fields → same ID → same database row.

User changes category from "Food" to "Dining Out":

- Same date, amount, account, note → **Same transaction_id**
- UPDATE existing row, don't create duplicate

## Error Handling

### Validation Errors

**Strategy:** Fail fast with descriptive messages

```python
# Example
raise ValidationError(
    f"Missing required column type 'date'. "
    f"Expected one of: {', '.join(date_column_names)}"
)
```

**User Experience:** Clear error messages explain exactly what's wrong and how to fix it.

### Normalization Errors

**Strategy:** Skip problematic rows, log warnings, continue

**Rationale:** One bad row shouldn't break entire import. User gets partial success + warnings.

### Database Errors

**Strategy:** Rollback transaction, preserve consistency

**SQLAlchemy Session Management:**

```python
try:
    session.commit()
except Exception:
    session.rollback()
    raise
finally:
    session.close()
```

## Performance Considerations

### Batch Processing

All reconciliation happens in a single transaction:

- Reduces database round-trips
- Ensures atomicity
- Faster than row-by-row commits

### Index Strategy

Strategic indexes on:

- Primary keys (transaction_id)
- Foreign keys (none currently, but ready)
- Frequently filtered columns (date, type, category)
- Soft delete flag (is_deleted)

### Query Optimization

- Use SQLAlchemy's `select()` construct (more efficient than legacy Query API)
- Eager loading where needed (prevent N+1 queries)
- Limit result sets in production queries

## Security Considerations

### SQL Injection

**Mitigation:** SQLAlchemy ORM with parameterized queries. No raw SQL with user input.

### File System Access

**Mitigation:** CLI validates file paths before reading. No arbitrary file access.

### Data Privacy

**Note:** This is a local application. No network communication, no external APIs. Data stays on user's machine.

## Testing Strategy

### Unit Tests

**Scope:** Individual functions in isolation

**Examples:**

- TransactionHasher: Same inputs → same hash
- Normalizer: Type conversions work correctly
- Validator: Required columns detected

**Benefits:** Fast, deterministic, no I/O

### Integration Tests

**Scope:** Multiple components working together

**Examples:**

- Reconciler with real database session
- End-to-end import workflow
- Soft delete logic

**Benefits:** Catch integration issues, verify business logic

### Test Database

**Strategy:** In-memory SQLite (`sqlite:///:memory:`)

**Benefits:**

- Fast (no disk I/O)
- Isolated (each test gets fresh DB)
- No cleanup needed

## Future-Proofing

### Async Support

SQLAlchemy 2.0 is async-ready. Current implementation is synchronous for simplicity, but can be migrated to async without major refactoring:

```python
# Current
session = SessionLocal()

# Future
async with AsyncSessionLocal() as session:
    ...
```

### API Layer

Architecture supports adding a REST API:

```
┌─────────────┐
│  FastAPI    │
│  REST API   │
└──────┬──────┘
       │
       ▼
┌──────────────┐
│  SyncEngine  │  ← Already exists!
│  Reconciler  │
└──────────────┘
```

### Multiple Data Sources

Current: Excel only

Future: Add loaders for CSV, JSON, bank APIs

```python
class DataLoader(ABC):
    @abstractmethod
    def load(self, source: str) -> DataFrame:
        pass

class ExcelLoader(DataLoader):
    def load(self, source: str) -> DataFrame:
        # Current implementation

class CSVLoader(DataLoader):
    def load(self, source: str) -> DataFrame:
        # Future implementation
```

### Semantic Layers

Add categorization layers on top of raw transactions:

```python
class SemanticCategory(Enum):
    CONSUMPTION = "consumption"
    ASSET = "asset"
    LIABILITY = "liability"

# Map raw categories → semantic categories
semantic_mapping = {
    "Food": SemanticCategory.CONSUMPTION,
    "Investment": SemanticCategory.ASSET,
    # ...
}
```

## Deployment

### Current: Local CLI

```bash
poetry install
poetry shell
ledger-sync import file.xlsx
```

### Future: Docker

```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY . .
RUN pip install poetry && poetry install
ENTRYPOINT ["poetry", "run", "ledger-sync"]
```

### Future: Scheduled Imports

```bash
# Cron job
0 0 * * * /usr/bin/ledger-sync import /path/to/latest.xlsx
```

## Monitoring & Observability

### Current: Logs

Structured logging to stdout:

```
2024-01-15 10:30:00 - ledger_sync - INFO - Starting import of file.xlsx
2024-01-15 10:30:05 - ledger_sync - INFO - Import completed: 150 processed, 10 inserted
```

### Future: Metrics

Add Prometheus metrics:

- `ledger_sync_imports_total{status="success"}`
- `ledger_sync_transactions_total{action="inserted"}`
- `ledger_sync_import_duration_seconds`

## Conclusion

`ledger-sync` is designed as a **production-ready foundation**, not a throwaway script. The architecture prioritizes:

1. **Correctness** - Deterministic, auditable, lossless
2. **Maintainability** - Clean code, type-safe, testable
3. **Extensibility** - Easy to add features without breaking existing code
4. **Performance** - Efficient queries, batch processing, proper indexes

The codebase is ready for real-world use and can scale to handle thousands of transactions with ease.
