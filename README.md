# ledger-sync

**Production-ready data ingestion and reconciliation engine for Money Manager Pro Excel exports**

[![Python 3.11+](https://img.shields.io/badge/python-3.11+-blue.svg)](https://www.python.org/downloads/)
[![SQLAlchemy 2.0](https://img.shields.io/badge/sqlalchemy-2.0-red.svg)](https://www.sqlalchemy.org/)

## Overview

`ledger-sync` is a backend-first application that ingests Excel exports from Money Manager Pro (iOS) and maintains a canonical SQLite database perfectly synchronized with the Excel data across repeated uploads.

This is a **data ingestion + reconciliation engine**, not a finance UI application.

### Core Principles

- ✅ **Excel is the single source of truth** - Database is a deterministic reflection
- ✅ **Idempotent operations** - Re-uploads produce consistent results
- ✅ **Production-ready** - Modern stack, clean architecture, type-safe
- ✅ **Deterministic reconciliation** - Same data → same IDs, every time

## Features

- 📊 **Excel Ingestion** - Validates and loads Money Manager Pro Excel exports
- 🔄 **Intelligent Reconciliation** - Insert, update, or soft-delete based on changes
- 🆔 **Deterministic Transaction IDs** - SHA-256 hashing with full field coverage (date, amount, account, note, category, subcategory, type)
- 💰 **Smart Transfer Handling** - Properly tracks money flow between accounts with "Transfer: From/To" labels
- 🔍 **Duplicate Detection** - Automatically identifies genuine vs duplicate transactions
- 🗄️ **SQLite Database** - Fast, reliable, zero-configuration storage
- ⚡ **Idempotency Guarantee** - Same file uploaded twice = zero net changes
- 📝 **Comprehensive Logging** - Full audit trail of all operations
- 🧪 **Tested** - Unit and integration tests with pytest

## Tech Stack

| Component             | Technology                  |
| --------------------- | --------------------------- |
| Language              | Python 3.11+                |
| Dependency Management | pip + venv                  |
| Database              | SQLite + SQLAlchemy 2.0 ORM |
| Migrations            | Alembic                     |
| Data Processing       | pandas + openpyxl           |
| CLI                   | Typer + Rich                |
| Testing               | pytest                      |

## Installation

### Prerequisites

- Python 3.11 or higher

### Setup

1. Clone the repository:

```bash
git clone https://github.com/Sagargupta16/ledger-sync.git
cd ledger-sync
```

2. Create and activate virtual environment:

```bash
python -m venv venv
venv\Scripts\activate  # Windows
# source venv/bin/activate  # Linux/Mac
```

3. Install dependencies:

```bash
pip install -r requirements.txt
pip install -e .
```

4. Initialize the database:

```bash
python -m ledger_sync.cli.main init
```

## Usage

### Import Excel File

```bash
python -m ledger_sync.cli.main import "MoneyManager.xlsx"
```

### Force Re-import

If you need to re-import a file that was previously imported:

```bash
python -m ledger_sync.cli.main import "MoneyManager.xlsx" --force
```

### Verbose Logging

Enable detailed logging for debugging:

```bash
python -m ledger_sync.cli.main import "MoneyManager.xlsx" --verbose
```

### Check Version

```bash
python -m ledger_sync.cli.main --version
```

## Excel Format

The application expects Excel files exported from **Money Manager Pro** with the following columns:

| Column           | Required | Examples                         |
| ---------------- | -------- | -------------------------------- |
| Date/Period      | ✅       | "Period", "Date", "date"         |
| Account          | ✅       | "Accounts", "Account", "account" |
| Category         | ✅       | "Category", "category"           |
| Amount           | ✅       | "INR", "Amount / INR", "Amount"  |
| Type             | ✅       | "Income/Expense", "Type"         |
| Note/Description | ⚪       | "Note", "Description"            |
| Subcategory      | ⚪       | "Subcategory", "Sub Category"    |
| Currency         | ⚪       | "Currency" (defaults to INR)     |

### Supported Transaction Types

- `Expense` / `Exp.`
- `Income` / `Inc.`
- `Transfer-In` / `Transfer-Out` (automatically labeled with direction)

## How It Works

### 1. Excel Validation

- Checks file exists and is readable
- Validates required columns are present
- Verifies data types are correct
- Maps optional columns like Note/Description

### 2. Data Normalization

- Dates → ISO-8601 datetime (preserves timestamp precision)
- Amounts → Decimal with 2-digit precision
- Strings → Trimmed, preserves case for accounts/notes
- Types → Mapped to enum values (EXPENSE, INCOME, TRANSFER)
- **Transfers** → Category labeled as "Transfer: From X" or "Transfer: To Y"

### 3. Transaction ID Generation

Each transaction gets a **deterministic ID** using SHA-256 hash of:

```python
hash(date + amount + account + note + category + subcategory + type)
```

**Key Benefits:**

- Includes all relevant fields to avoid false duplicates
- Same transaction always gets same ID
- Genuine transactions at same time/amount are distinguished by note/category

### 4. Reconciliation Logic

For each Excel transaction:

| Scenario                 | Action                                       |
| ------------------------ | -------------------------------------------- |
| New transaction          | **INSERT** into database                     |
| Existing transaction     | **UPDATE** category, subcategory, note, type |
| Transaction not in Excel | **SOFT DELETE** (mark as deleted)            |

### 5. Idempotency Guarantee

- File hash (SHA-256) is calculated before import
- Previously imported files are detected and skipped
- Use `--force` to re-import same file
- Re-importing results in all transactions marked as "skipped" (unchanged)
- All operations are deterministic and reproducible

## Import Results

After each import, you'll see a summary table:

```
                Import Results
┏━━━━━━━━━━━━━━━━━━━━┳━━━━━━━━━━┓
┃ Metric             ┃    Count ┃
┡━━━━━━━━━━━━━━━━━━━━╇━━━━━━━━━━┩
│ Rows Processed     │     5410 │
│ Inserted           │     5410 │
│ Updated            │        0 │
│ Soft Deleted       │        0 │
│ Skipped (Unchanged)│        0 │
└────────────────────┴──────────┘
```

## Database Schema

### Transaction Model

```python
class Transaction:
    transaction_id: str         # SHA-256 hash (PK)
    date: datetime             # Transaction timestamp
    amount: Decimal            # Amount (2 decimal places)
    currency: str              # Currency code (default: INR)
    type: TransactionType      # Expense | Income | Transfer
    account: str               # Account name
    category: str              # Category
    subcategory: str | None    # Optional subcategory
    note: str | None           # Optional note
    source_file: str           # Source Excel filename
    last_seen_at: datetime     # Last import timestamp
    is_deleted: bool           # Soft delete flag
```

### Import Log Model

```python
class ImportLog:
    id: int                    # Auto-increment PK
    file_hash: str             # SHA-256 file hash (unique)
    file_name: str             # Filename
    imported_at: datetime      # Import timestamp
    rows_processed: int        # Total rows processed
    rows_inserted: int         # New rows inserted
    rows_updated: int          # Existing rows updated
    rows_deleted: int          # Rows soft deleted
    rows_skipped: int          # Unchanged rows skipped
```

## Architecture

```
┌─────────────────┐
│  Excel File     │
│  (Source)       │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Excel Loader   │ ─► Validation
│  + Validator    │    File Hash
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Normalizer     │ ─► Clean Data
│                 │    Type Conversion
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Hash ID Gen    │ ─► Deterministic IDs
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Reconciler     │ ─► Insert/Update/Delete
│                 │    Transaction Logic
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  SQLite DB      │
│  (Canonical)    │
└─────────────────┘
```

## Development

### Run Tests

```bash
poetry run pytest
```

### Run Tests with Coverage

```bash
poetry run pytest --cov=src/ledger_sync --cov-report=html
```

### Code Formatting

```bash
poetry run black src/ tests/
```

### Linting

```bash
poetry run ruff check src/ tests/
```

### Type Checking

```bash
poetry run mypy src/
```

### Database Migrations

Generate a new migration after model changes:

```bash
alembic revision --autogenerate -m "description"
```

Apply migrations:

```bash
alembic upgrade head
```

## Configuration

Environment variables can be set with `LEDGER_SYNC_` prefix:

```bash
export LEDGER_SYNC_DATABASE_URL="sqlite:///./my_ledger.db"
export LEDGER_SYNC_LOG_LEVEL="DEBUG"
```

Or create a `.env` file in the project root:

```env
LEDGER_SYNC_DATABASE_URL=sqlite:///./my_ledger.db
LEDGER_SYNC_LOG_LEVEL=INFO
LEDGER_SYNC_DATA_DIR=./data
```

## Project Structure

```
ledger-sync/
├── pyproject.toml              # Poetry configuration
├── alembic.ini                 # Alembic migrations config
├── README.md                   # This file
├── src/
│   └── ledger_sync/
│       ├── config/             # Configuration & settings
│       ├── ingest/             # Excel loading & validation
│       ├── db/                 # Database models & session
│       ├── core/               # Reconciliation engine
│       ├── cli/                # CLI application
│       └── utils/              # Logging & utilities
├── tests/
│   ├── unit/                   # Unit tests
│   ├── integration/            # Integration tests
│   └── conftest.py             # Pytest fixtures
└── docs/
    └── architecture.md         # Architecture documentation
```

## Future Enhancements (Not Implemented)

The architecture is designed to support future additions:

- 📈 Semantic layers (Consumption vs Asset categorization)
- 📊 Yearly financial summaries
- 🎁 "Wrapped"-style insights
- 🚨 Rule-based alerts and notifications
- 📱 API layer for external integrations

## Philosophy

> **Excel is truth. Database is reflection. Sync must be deterministic, lossless, and auditable.**

This project follows the principle that the Excel export is the authoritative source of financial data. The database exists solely to provide a structured, queryable representation of that data for analysis and reporting.

## License

[Add your license here]

## Contributing

[Add contribution guidelines here]

## Support

For issues, questions, or contributions, please [open an issue](issues) on GitHub.
