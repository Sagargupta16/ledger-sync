# Backend - Ledger Sync

FastAPI backend for financial data processing and analytics.

## Features

- Excel file ingestion with duplicate detection
- SHA-256 based transaction reconciliation
- Financial analytics and calculations
- SQLite database with SQLAlchemy ORM
- Alembic database migrations

## Tech Stack

| Component  | Technology     |
| ---------- | -------------- |
| Language   | Python 3.11+   |
| Framework  | FastAPI        |
| ORM        | SQLAlchemy 2.0 |
| Database   | SQLite         |
| Migrations | Alembic        |
| Testing    | pytest         |
| Linting    | Ruff           |
| Type Check | mypy           |
| Packaging  | Poetry         |

## Quick Start

```bash
# Install dependencies (including dev tools)
poetry install --with dev

# Initialize database
poetry run alembic upgrade head

# Start development server
poetry run uvicorn ledger_sync.api.main:app --reload --port 8000
```

Backend available at http://localhost:8000

## Project Structure

```
backend/
├── src/ledger_sync/
│   ├── api/              # FastAPI endpoints
│   │   ├── main.py       # Application entry point
│   │   ├── analytics.py  # Analytics endpoints
│   │   ├── analytics_v2.py # V2 analytics
│   │   ├── calculations.py # Calculations
│   │   ├── preferences.py  # User preferences
│   │   └── account_classifications.py
│   ├── core/             # Business logic
│   │   ├── reconciler.py # Transaction reconciliation
│   │   ├── calculator.py # Financial calculations
│   │   └── analytics_engine.py
│   ├── db/               # Database layer
│   │   ├── models.py     # SQLAlchemy models
│   │   └── session.py    # Database session
│   ├── ingest/           # Data ingestion
│   │   ├── excel_loader.py # Excel processing
│   │   ├── normalizer.py # Data normalization
│   │   ├── validator.py  # Validation
│   │   └── hash_id.py    # Hash ID generation
│   ├── config/           # Configuration
│   │   └── settings.py   # App settings
│   └── utils/            # Utilities
├── tests/                # Test suite
│   ├── unit/            # Unit tests
│   └── integration/     # Integration tests
└── alembic/             # Database migrations
```

## API Endpoints

### Upload

| Method | Endpoint      | Description       |
| ------ | ------------- | ----------------- |
| POST   | `/api/upload` | Upload Excel file |

**Response includes:**

- `processed` - Total rows processed
- `inserted` - New transactions
- `updated` - Modified transactions
- `deleted` - Soft-deleted transactions
- `unchanged` - Skipped (no changes)

### Analytics

| Method | Endpoint                  | Description                |
| ------ | ------------------------- | -------------------------- |
| GET    | `/api/analytics/overview` | Financial overview         |
| GET    | `/api/analytics/kpis`     | Key performance indicators |
| GET    | `/api/analytics/trends`   | Financial trends           |

### Calculations

- `GET /api/calculations/totals` - Income/expense totals
- `GET /api/calculations/monthly-aggregation` - Monthly data
- `GET /api/calculations/category-breakdown` - Category analysis
- `GET /api/calculations/insights` - Financial insights

## Development

### Running Tests

```bash
# Run all tests
poetry run pytest tests/ -v

# Run with coverage
poetry run pytest --cov=ledger_sync tests/

# Run specific test file
poetry run pytest tests/unit/test_hash_id.py -v
```

### Linting & Type Checking

```bash
# Lint
poetry run ruff check .

# Auto-fix lint issues
poetry run ruff check --fix .

# Type check
poetry run mypy src/
```

### Database Migrations

```bash
# Apply migrations
poetry run alembic upgrade head

# Create new migration
poetry run alembic revision --autogenerate -m "description"

# Rollback one migration
poetry run alembic downgrade -1
```

## API Documentation

- Interactive docs: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

## Configuration

Environment variables (optional):

- `LEDGER_SYNC_DATABASE_URL` - Database connection string (default: `sqlite:///./ledger_sync.db`)
- `LEDGER_SYNC_LOG_LEVEL` - Log level (default: `INFO`)

## License

MIT
