# Backend - Ledger Sync

FastAPI backend for financial data processing and analytics.

## Features

- Excel file ingestion and validation
- Intelligent transaction reconciliation
- Financial calculations and analytics
- RESTful API endpoints
- SQLite database with SQLAlchemy ORM
- Database migrations with Alembic

## Tech Stack

- Python 3.11+
- FastAPI - Modern web framework
- SQLAlchemy 2.0 - ORM and database toolkit
- Alembic - Database migrations
- SQLite - Embedded database
- Pytest - Testing framework

## Quick Start

```powershell
# Install dependencies
pip install -r requirements.txt

# Initialize database
alembic upgrade head

# Start development server
python -m uvicorn ledger_sync.api.main:app --reload
```

Backend will be available at http://localhost:8000

## Project Structure

```
backend/
├── src/ledger_sync/
│   ├── api/              # FastAPI endpoints
│   │   ├── main.py       # Application entry point
│   │   ├── analytics.py  # Analytics endpoints
│   │   └── calculations.py # Calculation endpoints
│   ├── core/             # Business logic
│   │   ├── reconciler.py # Transaction reconciliation
│   │   └── sync_engine.py # Data synchronization
│   ├── db/               # Database layer
│   │   ├── models.py     # SQLAlchemy models
│   │   └── session.py    # Database session
│   ├── ingest/           # Data ingestion
│   │   ├── excel_loader.py # Excel file processing
│   │   ├── normalizer.py # Data normalization
│   │   └── validator.py  # Data validation
│   └── utils/            # Utilities
├── tests/                # Test suite
│   ├── unit/            # Unit tests
│   └── integration/     # Integration tests
├── alembic/             # Database migrations
├── requirements.txt     # Python dependencies
└── setup.py            # Package setup
```

## API Endpoints

### Transactions

- `GET /api/transactions` - Get all transactions
- `POST /api/upload` - Upload Excel file

### Analytics

- `GET /api/analytics/overview` - Financial overview
- `GET /api/analytics/kpis` - Key performance indicators
- `GET /api/analytics/behavior` - Spending behavior
- `GET /api/analytics/trends` - Financial trends

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
