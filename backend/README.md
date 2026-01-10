# Ledger Sync - Backend

FastAPI-based backend for Excel ingestion and database reconciliation.

## 🚀 Quick Start

```powershell
# Install dependencies
pip install -r requirements.txt

# Initialize database
alembic upgrade head

# Start server
python -m uvicorn ledger_sync.api.main:app --reload
```

Backend will be available at: `http://localhost:8000`

## 📁 Structure

```
backend/
├── src/
│   └── ledger_sync/
│       ├── api/           # FastAPI endpoints
│       ├── cli/           # CLI commands
│       ├── core/          # Business logic
│       ├── db/            # Database models
│       ├── ingest/        # Excel processing
│       └── utils/         # Utilities
├── tests/                 # Test suite
├── alembic.ini           # Alembic config
├── requirements.txt      # Dependencies
└── setup.py             # Package setup
```

## 📚 Documentation

- API Docs: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

## 🧪 Testing

```powershell
pytest
pytest --cov=ledger_sync tests/
```

## 🔧 Configuration

Environment variables (optional):

- `DATABASE_URL` - Database connection string (default: sqlite:///ledger_sync.db)

## 📝 CLI Usage

```powershell
# Import Excel file
python -m ledger_sync.cli.main import file.xlsx

# Force re-import
python -m ledger_sync.cli.main import file.xlsx --force
```
