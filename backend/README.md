# Ledger Sync -- Backend

FastAPI backend powering the Ledger Sync personal finance dashboard. Handles Excel import, transaction reconciliation, financial analytics, exchange rate proxying, user preferences, AI assistant configuration with encrypted key storage, and Bedrock streaming proxy.

## Features

- OAuth authentication (Google, GitHub) with JWT tokens
- Excel file ingestion with duplicate detection
- SHA-256 based transaction reconciliation
- Financial analytics and calculations
- SQLite (dev) / PostgreSQL (prod) with SQLAlchemy ORM
- Alembic database migrations
- AI assistant config with AES-256-GCM encrypted API keys (PBKDF2 + per-ciphertext random salt)
- Bedrock streaming proxy via boto3 (SigV4 auth + EventStream parsing)

## Tech Stack

| Component  | Technology     |
| ---------- | -------------- |
| Language   | Python 3.11+   |
| Framework  | FastAPI        |
| ORM        | SQLAlchemy 2.0 |
| Database   | SQLite (dev) / PostgreSQL (prod) |
| Migrations | Alembic        |
| Testing    | pytest         |
| Linting    | Ruff           |
| Type Check | mypy           |
| Packaging  | uv             |

## Quick Start

```bash
# Install dependencies (including dev tools)
uv sync --group dev

# Initialize database
uv run alembic upgrade head

# Start development server
uv run uvicorn ledger_sync.api.main:app --reload --port 8000
```

Backend available at http://localhost:8000

## Project Structure

```
backend/
├── src/ledger_sync/
│   ├── api/              # FastAPI routers (one file per resource)
│   │   ├── main.py       # Application entry point
│   │   ├── auth.py       # Token refresh, logout, profile
│   │   ├── oauth.py      # Google/GitHub OAuth login
│   │   ├── analytics.py  # On-the-fly analytics
│   │   ├── analytics_v2.py  # Pre-aggregated analytics
│   │   ├── calculations.py  # Financial calculation endpoints
│   │   ├── preferences.py   # User preferences (incl. AI config)
│   │   ├── ai_chat.py       # Bedrock streaming proxy
│   │   ├── account_classifications.py
│   │   ├── exchange_rates.py, stock_price.py
│   │   └── meta.py, reports.py, transactions.py, upload.py
│   ├── core/             # Business logic
│   │   ├── reconciler.py          # Transaction reconciliation
│   │   ├── calculator.py          # Financial calculations
│   │   ├── analytics_engine.py    # Heavy analytics computation
│   │   ├── _analytics_helpers.py  # Module-level helpers for analytics_engine
│   │   ├── encryption.py          # AES-256-GCM for API keys
│   │   ├── sync_engine.py         # Upload orchestration
│   │   ├── query_helpers.py       # Shared SQL aggregation helpers
│   │   ├── time_filter.py, insights.py, report_generator.py
│   │   └── auth/                  # JWT token creation/verification
│   ├── db/               # Database layer
│   │   ├── models.py     # 21-line facade that re-exports from _models/
│   │   ├── _models/      # Split by bounded context
│   │   │   ├── __init__.py, _constants.py, enums.py
│   │   │   ├── user.py, transactions.py
│   │   │   └── investments.py, analytics.py, planning.py
│   │   ├── session.py    # Database session
│   │   ├── base.py
│   │   └── migrations/versions/  # Alembic migrations
│   ├── schemas/          # Pydantic request/response models
│   ├── services/         # Cross-cutting services
│   ├── ingest/           # Data ingestion (CLI path only)
│   │   ├── excel_loader.py, csv_loader.py
│   │   ├── normalizer.py, validator.py, hash_id.py
│   ├── config/           # Configuration
│   │   └── settings.py
│   └── utils/            # Utilities
├── tests/                # Test suite
│   ├── unit/             # Unit tests
│   └── integration/      # Integration tests
└── pyproject.toml        # Dependencies (uv)
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
uv run pytest tests/ -v

# Run with coverage
uv run pytest --cov=ledger_sync tests/

# Run specific test file
uv run pytest tests/unit/test_hash_id.py -v
```

### Linting & Type Checking

```bash
# Lint
uv run ruff check .

# Auto-fix lint issues
uv run ruff check --fix .

# Type check
uv run mypy src/
```

### Database Migrations

```bash
# Apply migrations
uv run alembic upgrade head

# Create new migration
uv run alembic revision --autogenerate -m "description"

# Rollback one migration
uv run alembic downgrade -1
```

## API Documentation

- Interactive docs: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

## Configuration

Environment variables (prefix: `LEDGER_SYNC_`):

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `sqlite:///./ledger_sync.db` | Database connection string |
| `LOG_LEVEL` | `INFO` | Python log level |
| `GOOGLE_CLIENT_ID` | - | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | - | Google OAuth client secret |
| `GITHUB_CLIENT_ID` | - | GitHub OAuth client ID |
| `GITHUB_CLIENT_SECRET` | - | GitHub OAuth client secret |
| `FRONTEND_URL` | `http://localhost:5173` | Frontend URL for OAuth redirects |
| `JWT_SECRET_KEY` | dev default | JWT signing secret (required in production) |
| `ENVIRONMENT` | `development` | `development` or `production` |

## License

MIT
