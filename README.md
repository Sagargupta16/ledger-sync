# Ledger Sync

**Production-ready Excel ingestion and reconciliation engine with modern web interface**

[![Python 3.11+](https://img.shields.io/badge/python-3.11+-blue.svg)](https://www.python.org/downloads/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.110+-green.svg)](https://fastapi.tiangolo.com/)
[![Next.js 15](https://img.shields.io/badge/next.js-15-black.svg)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/typescript-5.7-blue.svg)](https://www.typescriptlang.org/)

## Overview

Full-stack application that ingests Excel exports from Money Manager Pro and maintains a synchronized SQLite database. Features a modern web interface for easy file uploads with real-time feedback and statistics, plus a comprehensive insights dashboard for understanding your financial patterns.

### Key Features

**Phase 1 - Data Ingestion:**

- 📊 **Excel Ingestion** - Validates and loads Money Manager Pro exports
- 🔄 **Intelligent Reconciliation** - Automatic insert, update, and soft-delete
- 🆔 **Deterministic IDs** - SHA-256 hashing ensures consistency
- 🌐 **Modern Web UI** - Beautiful Next.js interface with drag & drop
- 🔔 **Real-time Feedback** - Toast notifications with detailed statistics
- ⚡ **Idempotent Operations** - Same file uploaded twice = zero net changes

**Phase 2 - Financial Insights:**

- 📈 **Overview Dashboard** - Income, expenses, asset allocation, best/worst months
- 🧠 **Behavior Analysis** - Spending patterns, lifestyle inflation, convenience spending
- 📊 **Trends & Consistency** - Monthly trends, surplus tracking, consistency scoring
- ✨ **Yearly Wrapped** - Text-based insights and narratives about your money story

## Tech Stack

**Backend:** Python 3.11+ • FastAPI • SQLAlchemy 2.0 • SQLite • Alembic  
**Frontend:** Next.js 15 • React 19 • TypeScript 5.7 • Tailwind CSS • shadcn/ui

---

## Quick Start

### 🚀 Start Development (One Command)

```powershell
# Install dependencies and start both servers
npm run dev
```

This starts:

- Backend API at http://localhost:8000
- Frontend at http://localhost:3000
- API Docs at http://localhost:8000/docs

### Alternative: PowerShell Script

```powershell
.\start.ps1
```

---

## Project Structure

```
ledger-sync/
├── backend/              # Python FastAPI backend
│   ├── src/             # Source code
│   │   └── ledger_sync/
│   │       ├── api/     # FastAPI endpoints
│   │       ├── cli/     # Command-line interface
│   │       ├── core/    # Business logic
│   │       ├── db/      # Database models
│   │       ├── ingest/  # Excel processing
│   │       └── utils/   # Utilities
│   ├── tests/           # Test suite
│   ├── requirements.txt # Python dependencies
│   └── alembic.ini      # Migration config
├── frontend/            # Next.js frontend
│   ├── app/            # Pages and layouts
│   │   ├── insights/   # Phase 2: Analytics pages
│   │   └── ...         # Upload & other pages
│   ├── components/     # React components
│   │   ├── ui/         # shadcn/ui components
│   │   ├── insights/   # Phase 2: Insight components
│   │   └── ...         # Custom components
│   ├── hooks/          # Custom React hooks
│   ├── lib/            # Utilities
│   └── package.json    # Node dependencies
├── docs/               # Documentation
│   ├── PHASE2.md       # Phase 2: Insights documentation
│   └── ...             # Other docs
├── package.json        # Root orchestrator
└── start.ps1           # Quick start script
```

---

## Installation

### Prerequisites

- Python 3.11+
- Node.js 18+
- npm or yarn

### Setup Steps

1. **Clone the repository**

   ```bash
   git clone https://github.com/yourusername/ledger-sync.git
   cd ledger-sync
   ```

2. **Install root dependencies**

   ```bash
   npm install
   ```

3. **Setup backend**

   ```bash
   cd backend
   pip install -r requirements.txt
   alembic upgrade head
   cd ..
   ```

4. **Setup frontend**

   ```bash
   cd frontend
   npm install
   cd ..
   ```

5. **Start development**
   ```bash
   npm run dev
   ```

---

## Available Commands

### Root Commands (From project root)

```bash
npm run dev              # Start both backend + frontend concurrently
npm run backend          # Start backend only (port 8000)
npm run frontend         # Start frontend only (port 3000)
npm run setup            # Install all dependencies
```

### Backend Commands

```bash
cd backend

# Development server
python -m uvicorn ledger_sync.api.main:app --reload

# CLI Import
python -m ledger_sync.cli.main import file.xlsx
python -m ledger_sync.cli.main import file.xlsx --force
python -m ledger_sync.cli.main import file.xlsx --verbose

# Testing
pytest
pytest --cov=ledger_sync tests/
pytest tests/unit/test_hash_id.py -v

# Database migrations
alembic upgrade head              # Apply migrations
alembic revision --autogenerate   # Create new migration
```

### Frontend Commands

```bash
cd frontend

# Development
npm run dev

# Production
npm run build
npm start

# Linting
npm run lint
```

---

## Usage

### Web Interface (Phase 1: Upload)

1. Open http://localhost:3000 in your browser
2. Drag & drop your Excel file or click to browse
3. Click "Upload & Sync" button
4. View real-time statistics in toast notification

### Financial Insights (Phase 2: Analytics)

1. Click "View Financial Insights" on the home page
2. Navigate between 4 insight screens:
   - **Overview**: Income, expenses, best/worst months, asset allocation
   - **Behavior**: Spending patterns, lifestyle inflation, top categories
   - **Trends**: Monthly trends, surplus tracking, consistency score
   - **Wrapped**: Text-based insights and narratives

**📖 See [Phase 2 Documentation](docs/PHASE2.md) for detailed metrics explanation**

**Features:**

- Read-only analytics (no CRUD operations)
- Behavioral pattern recognition
- Trend analysis and consistency scoring
- Text-based yearly wrapped insights
- Calm, minimal UI design

### CLI Interface

```bash
cd backend

# Basic import
python -m ledger_sync.cli.main import "path/to/MoneyManager.xlsx"

# Force re-import (skip cache)
python -m ledger_sync.cli.main import "file.xlsx" --force

# Verbose output
python -m ledger_sync.cli.main import "file.xlsx" --verbose
```

**Example Output:**

```
📁 Loading Excel file: MoneyManager.xlsx
✅ Validation passed
🔄 Reconciling transactions...
✨ Sync Complete!
   Inserted: 45
   Updated: 12
   Soft-deleted: 3
   Unchanged: 234
```

---

## Excel Format

### Required Columns

Expects Money Manager Pro Excel exports with these columns (case-insensitive):

| Column      | Required    | Accepted Names                   | Examples                 |
| ----------- | ----------- | -------------------------------- | ------------------------ |
| Date/Period | ✅          | "Period", "Date", "date"         | "2024-01-15", "Jan 2024" |
| Account     | ✅          | "Accounts", "Account", "account" | "Cash", "Bank Account"   |
| Category    | ✅          | "Category", "category"           | "Food", "Salary"         |
| Amount      | ✅          | "INR", "Amount / INR", "Amount"  | "1500.00", "-250.50"     |
| Type        | ✅          | "Income/Expense", "Type"         | "Expense", "Income"      |
| Note        | ⚪ Optional | "Note", "Description"            | "Lunch with team"        |
| Subcategory | ⚪ Optional | "Subcategory", "Sub Category"    | "Restaurants"            |

### Supported Transaction Types

- **Expense** - Money spent
- **Income** - Money received
- **Transfer-In** - Money transferred into account
- **Transfer-Out** - Money transferred out of account

---

## How It Works

### Data Flow

```
Excel File → Validation → Normalization → Hash Generation → Reconciliation → Database
```

### Process Steps

1. **Validation**

   - Checks file format (.xlsx)
   - Verifies required columns exist
   - Validates data types

2. **Normalization**

   - Standardizes date formats
   - Normalizes amount representations
   - Converts transaction types to canonical form

3. **Hash Generation**

   - Creates deterministic SHA-256 hash IDs
   - Based on: date, account, category, amount, type
   - Ensures same transaction = same ID

4. **Reconciliation**

   - Compares incoming data with database
   - Identifies inserts, updates, deletes, unchanged
   - Maintains data integrity

5. **Database Update**
   - Inserts new transactions
   - Updates modified transactions
   - Soft-deletes removed transactions
   - Preserves audit trail

### Reconciliation Logic

| Operation       | Condition                    | Action                 |
| --------------- | ---------------------------- | ---------------------- |
| **Insert**      | Hash ID not in database      | Add new record         |
| **Update**      | Hash ID exists, data changed | Update existing record |
| **Soft Delete** | Database record not in file  | Mark as deleted        |
| **Unchanged**   | Hash ID exists, data same    | No action              |

---

## API Documentation

### Endpoints

#### POST /api/upload

Upload and process Excel file

**Request:**

- Content-Type: `multipart/form-data`
- Body: Form data with `file` field
- Query params: `force` (boolean, optional)

**Response:**

```json
{
  "success": true,
  "filename": "MoneyManager.xlsx",
  "inserted": 45,
  "updated": 12,
  "soft_deleted": 3,
  "unchanged": 234,
  "total_processed": 294,
  "timestamp": "2024-01-15T10:30:00"
}
```

#### GET /health

Health check endpoint

**Response:**

```json
{
  "status": "ok",
  "version": "1.0.0"
}
```

### Interactive Documentation

- **Swagger UI:** http://localhost:8000/docs
- **ReDoc:** http://localhost:8000/redoc

---

## Development

### Backend Development

```bash
cd backend

# Create virtual environment
python -m venv venv

# Activate virtual environment
venv\Scripts\activate  # Windows
source venv/bin/activate  # Linux/Mac

# Install dependencies
pip install -r requirements.txt
pip install -r requirements-dev.txt

# Run with auto-reload
python -m uvicorn ledger_sync.api.main:app --reload --port 8000
```

### Frontend Development

```bash
cd frontend

# Install dependencies
npm install

# Run development server
npm run dev

# Lint code
npm run lint

# Build for production
npm run build
```

### Hot Reloading

Both backend and frontend support hot reloading:

- **Backend:** FastAPI's `--reload` flag
- **Frontend:** Next.js Fast Refresh

---

## Testing

### Backend Tests

```bash
cd backend

# Run all tests
pytest

# With coverage report
pytest --cov=ledger_sync tests/

# Specific test file
pytest tests/unit/test_hash_id.py -v

# Integration tests
pytest tests/integration/ -v
```

### Test Structure

```
tests/
├── conftest.py          # Shared fixtures
├── fixtures/            # Test data
├── unit/               # Unit tests
│   ├── test_hash_id.py
│   └── test_normalizer.py
└── integration/        # Integration tests
    └── test_reconciler.py
```

---

## Database

### Database File

SQLite database stored at: `backend/ledger_sync.db`

### Schema

**Tables:**

- `transactions` - All transaction records
- `import_logs` - File import history
- `alembic_version` - Migration tracking

### Database Operations

```bash
cd backend

# View schema
sqlite3 ledger_sync.db ".schema"

# Query transactions
sqlite3 ledger_sync.db "SELECT * FROM transactions LIMIT 10;"

# Reset database
Remove-Item ledger_sync.db
alembic upgrade head
```

---

## Troubleshooting

### Port Already in Use

**Backend (8000):**

```bash
cd backend
python -m uvicorn ledger_sync.api.main:app --reload --port 8001
```

**Frontend (3000):**

```bash
cd frontend
npm run dev -- -p 3001
```

### CORS Errors

Update `backend/src/ledger_sync/api/main.py`:

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://your-domain.com"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

### Module Not Found Errors

**Backend:**

```bash
cd backend
pip install -r requirements.txt
```

**Frontend:**

```bash
cd frontend
npm install
```

### Database Migration Issues

```bash
cd backend

# Check current version
alembic current

# Reset migrations
Remove-Item ledger_sync.db
alembic upgrade head
```

### File Upload Errors

**Common issues:**

1. File too large - Check backend `MAX_FILE_SIZE` setting
2. Wrong format - Ensure file is `.xlsx`
3. Missing columns - Verify all required columns exist

---

## Production Deployment

### Backend

```bash
cd backend

# Install production dependencies
pip install gunicorn

# Run with Gunicorn
gunicorn ledger_sync.api.main:app \
  -w 4 \
  -k uvicorn.workers.UvicornWorker \
  --bind 0.0.0.0:8000
```

### Frontend

```bash
cd frontend

# Build for production
npm run build

# Start production server
npm start
```

### Environment Variables

**Backend (.env):**

```env
DATABASE_URL=sqlite:///./ledger_sync.db
LOG_LEVEL=INFO
MAX_FILE_SIZE=10485760
```

**Frontend (.env.local):**

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

---

## Architecture

### Backend Architecture

```
backend/src/ledger_sync/
├── api/              # FastAPI application
│   └── main.py       # API routes and app setup
├── cli/              # Command-line interface
│   └── main.py       # CLI commands with Typer
├── core/             # Business logic
│   ├── sync_engine.py    # Main sync orchestration
│   └── reconciler.py     # Reconciliation logic
├── db/               # Database layer
│   ├── models.py         # SQLAlchemy models
│   ├── session.py        # Database sessions
│   └── migrations/       # Alembic migrations
├── ingest/           # Data ingestion
│   ├── excel_loader.py   # Excel file parsing
│   ├── validator.py      # Data validation
│   ├── normalizer.py     # Data normalization
│   └── hash_id.py        # ID generation
└── utils/            # Utilities
    └── logging.py        # Logging configuration
```

### Frontend Architecture

```
frontend/
├── app/                   # Next.js App Router
│   ├── page.tsx          # Home page
│   ├── layout.tsx        # Root layout
│   └── globals.css       # Global styles
├── components/           # React components
│   ├── ui/              # shadcn/ui components
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   ├── input.tsx
│   │   └── toast.tsx
│   └── FileUpload.tsx   # Custom upload component
├── hooks/               # Custom hooks
│   └── use-toast.ts    # Toast hook
└── lib/                # Utilities
    └── utils.ts        # Helper functions
```

---

## Contributing

Contributions are welcome! Please follow these steps:

1. **Fork the repository**
2. **Create a feature branch**
   ```bash
   git checkout -b feature/amazing-feature
   ```
3. **Commit your changes**
   ```bash
   git commit -m 'Add amazing feature'
   ```
4. **Push to the branch**
   ```bash
   git push origin feature/amazing-feature
   ```
5. **Open a Pull Request**

### Code Standards

- **Backend:** Follow PEP 8, use type hints
- **Frontend:** Follow ESLint rules, use TypeScript
- **Tests:** Write tests for new features
- **Documentation:** Update relevant docs

---

## License

MIT License - see LICENSE file for details

---

## Acknowledgments

Built with modern web technologies:

- [FastAPI](https://fastapi.tiangolo.com/) - Modern Python web framework
- [Next.js](https://nextjs.org/) - React framework for production
- [shadcn/ui](https://ui.shadcn.com/) - Beautiful UI components
- [Tailwind CSS](https://tailwindcss.com/) - Utility-first CSS framework
- [SQLAlchemy](https://www.sqlalchemy.org/) - Python SQL toolkit
- [Alembic](https://alembic.sqlalchemy.org/) - Database migrations
- [Radix UI](https://www.radix-ui.com/) - Unstyled, accessible components
- [Lucide](https://lucide.dev/) - Beautiful icon set

---

**Made with ❤️ for efficient financial data management**
