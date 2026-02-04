# Backend - Ledger Sync

FastAPI backend for financial data processing and analytics.

## Features

- 📤 Excel file ingestion with duplicate detection
- 🔄 SHA-256 based transaction reconciliation
- 📊 Financial analytics and calculations
- 🗄️ SQLite database with SQLAlchemy ORM
- 🔀 Alembic database migrations

## Tech Stack

| Component  | Technology     |
| ---------- | -------------- |
| Language   | Python 3.11+   |
| Framework  | FastAPI        |
| ORM        | SQLAlchemy 2.0 |
| Database   | SQLite         |
| Migrations | Alembic        |
| Testing    | pytest         |

## Quick Start

```powershell
# Install dependencies
pip install -e ".[dev]"

# Initialize database
alembic upgrade head

# Start development server
python -m uvicorn ledger_sync.api.main:app --reload
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

```powershell
# Run all tests
pytest

# Run with coverage
pytest --cov=ledger_sync tests/

# Run specific test file
pytest tests/unit/test_hash_id.py -v
```

### Database Migrations

```powershell
# Apply migrations
alembic upgrade head

# Create new migration
alembic revision --autogenerate -m "description"

# Rollback one migration
alembic downgrade -1
```

### CLI Commands

```powershell
# Import Excel file
python -m ledger_sync.cli.main import file.xlsx

# Force re-import
python -m ledger_sync.cli.main import file.xlsx --force

# Verbose output
python -m ledger_sync.cli.main import file.xlsx --verbose
```

## API Documentation

- Interactive docs: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

## Configuration

Environment variables (optional):

- `DATABASE_URL` - Database connection string
- `CORS_ORIGINS` - Allowed CORS origins

## License

MIT
