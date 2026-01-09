# Quick Start Guide

This guide will help you get `ledger-sync` up and running in minutes.

## Prerequisites

- **Python 3.11+** installed on your system
- Git (to clone the repository)

## Installation Steps

### 1. Clone Repository

```bash
git clone https://github.com/Sagargupta16/ledger-sync.git
cd ledger-sync
```

### 2. Create Virtual Environment

```bash
# Windows
python -m venv venv
venv\Scripts\activate

# Linux/Mac
python3 -m venv venv
source venv/bin/activate
```

### 3. Install Dependencies

```bash
pip install -r requirements.txt
pip install -e .
```

This will install all required packages.

### 4. Initialize Database

```bash
python -m ledger_sync.cli.main init
```

This creates the SQLite database (`ledger_sync.db`) and all necessary tables.

### 5. Verify Installation

```bash
python -m ledger_sync.cli.main --version
```

You should see: `ledger-sync version 0.1.0`

## First Import

### Prepare Your Excel File

Make sure your Excel file from **Money Manager Pro** has these columns:

- **Period** (or Date) - Transaction timestamp
- **Accounts** (or Account) - Account name
- **Category** - Transaction category
- **INR** (or Amount) - Transaction amount
- **Income/Expense** (or Type) - Transaction type
- **Note** (optional) - Transaction description

### Run Import

```bash
python -m ledger_sync.cli.main import "MoneyManager.xlsx"
```

You'll see output like:

```
✓ Import completed successfully!

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

## Common Tasks

### Re-import a File

If you need to force a re-import:

```bash
python -m ledger_sync.cli.main import "file.xlsx" --force
```

### Enable Verbose Logging

For debugging or detailed output:

```bash
python -m ledger_sync.cli.main import "file.xlsx" --verbose
```

### Run Tests

```bash
# Run all tests
pytest

# Run with coverage report
pytest --cov=src/ledger_sync

# Run specific test file
pytest tests/unit/test_hash_id.py
```

## Configuration

### Using Environment Variables

```bash
# Windows
set LEDGER_SYNC_DATABASE_URL=sqlite:///./my_custom.db
set LEDGER_SYNC_LOG_LEVEL=DEBUG
python -m ledger_sync.cli.main import "file.xlsx"

# Linux/Mac
export LEDGER_SYNC_DATABASE_URL="sqlite:///./my_custom.db"
export LEDGER_SYNC_LOG_LEVEL="DEBUG"
python -m ledger_sync.cli.main import "file.xlsx"
```

### Using .env File

Create a `.env` file in the project root:

```env
LEDGER_SYNC_DATABASE_URL=sqlite:///./ledger_sync.db
LEDGER_SYNC_LOG_LEVEL=INFO
LEDGER_SYNC_DATA_DIR=./data
```

## Troubleshooting

### "Command not found: ledger-sync"

Make sure you're in the Poetry shell:

```bash
poetry shell
```

### "File already imported"

The file was previously imported. Use `--force` to re-import:

```bash
ledger-sync import file.xlsx --force
```

### "Missing required column"

Your Excel file doesn't have the expected columns. Check the README for required column names.

### Database locked

Close any applications that might have the database file open (DB Browser, etc.).

## Next Steps

- Read the [Architecture Documentation](docs/architecture.md) to understand how it works
- Explore the [README](README.md) for detailed usage information
- Check the [test files](tests/) for usage examples

## Getting Help

- Check existing issues on GitHub
- Review the documentation in `docs/`
- Run commands with `--help` flag: `ledger-sync import --help`

## Development Workflow

If you're contributing to the project:

```bash
# 1. Make your changes

# 2. Format code
poetry run black src/ tests/

# 3. Check linting
poetry run ruff check src/ tests/

# 4. Type check
poetry run mypy src/

# 5. Run tests
poetry run pytest

# 6. Commit your changes
git add .
git commit -m "Your descriptive message"
```

## Database Migrations

If you modify the database models:

```bash
# Generate migration
alembic revision --autogenerate -m "Description of changes"

# Apply migration
alembic upgrade head

# Rollback migration
alembic downgrade -1
```

## Performance Tips

- For large Excel files (10,000+ rows), use verbose mode to track progress
- The first import is slower due to indexing; subsequent imports are faster
- SQLite database file can be backed up simply by copying the `.db` file

## Security Notes

- All data stays on your local machine
- No network communication occurs
- Excel files are read-only; never modified
- Database uses parameterized queries (no SQL injection risk)

---

**Happy syncing! 🚀**
