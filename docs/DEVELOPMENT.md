# Development Guide

## Development Environment Setup

### Prerequisites

- Python 3.11+
- Node.js 18+
- Git
- Code editor (VS Code recommended)

### Initial Setup

```powershell
# 1. Clone repository
git clone https://github.com/Sagargupta16/ledger-sync.git
cd ledger-sync

# 2. Create Python virtual environment
python -m venv venv

# 3. Activate virtual environment
# Windows
venv\Scripts\activate
# macOS/Linux
source venv/bin/activate

# 4. Install Python dependencies
cd backend
pip install -r requirements.txt
pip install -r requirements-dev.txt  # For development tools
cd ..

# 5. Install Node dependencies
cd frontend
npm install
cd ..

# 6. Initialize database
cd backend
alembic upgrade head
cd ..
```

## Running the Application

### Option 1: Run Both Services (Recommended)

```powershell
npm run dev
```

This runs both backend and frontend concurrently using the `concurrently` package.

### Option 2: Run Services Separately

**Terminal 1 - Backend:**

```powershell
cd backend
python -m uvicorn ledger_sync.api.main:app --reload
```

**Terminal 2 - Frontend:**

```powershell
cd frontend
npm run dev
```

### Option 3: PowerShell Script

```powershell
.\start.ps1
```

## Backend Development

### Project Structure

```
backend/
├── src/ledger_sync/
│   ├── api/              # FastAPI endpoints
│   ├── core/             # Business logic
│   ├── db/               # Database layer
│   ├── ingest/           # Data ingestion
│   └── utils/            # Utilities
├── tests/                # Test suite
├── alembic/              # Migrations
└── requirements.txt      # Dependencies
```

### Hot Reload

The backend server automatically reloads when you make changes (using `--reload` flag).

### Creating New Endpoints

1. **Add endpoint to** `src/ledger_sync/api/`:

```python
# In analytics.py
from fastapi import APIRouter, Depends, Query
from ledger_sync.db.session import get_session

router = APIRouter(prefix="/api/analytics", tags=["analytics"])

@router.get("/new-endpoint")
def get_new_data(db: Session = Depends(get_session)):
    """Get new data"""
    # Implementation
    return {"data": []}
```

2. **Add business logic to** `src/ledger_sync/core/`:

```python
# In calculator.py
def calculate_new_metric(transactions):
    """Calculate new metric"""
    return sum(t.amount for t in transactions)
```

3. **Test the endpoint**:
   - Access http://localhost:8000/docs
   - Try the endpoint in Swagger UI

### Adding Database Models

1. **Define model in** `src/ledger_sync/db/models.py`:

```python
from sqlalchemy import Column, String, Integer
from ledger_sync.db.base import Base

class NewModel(Base):
    __tablename__ = "new_table"

    id = Column(Integer, primary_key=True)
    name = Column(String(100))
```

2. **Create migration**:

```bash
alembic revision --autogenerate -m "Add new_table"
```

3. **Apply migration**:

```bash
alembic upgrade head
```

### Testing Backend

```bash
# Run all tests
pytest

# Run specific test file
pytest tests/unit/test_hash_id.py

# Run with coverage
pytest --cov=ledger_sync tests/

# Run with verbose output
pytest -v

# Run in watch mode (requires pytest-watch)
ptw
```

### Writing Tests

```python
# In tests/unit/test_example.py
import pytest
from ledger_sync.core.calculator import calculate_total_income

def test_calculate_total_income():
    transactions = [
        {"type": "Income", "amount": 100},
        {"type": "Expense", "amount": 50},
    ]
    result = calculate_total_income(transactions)
    assert result == 100
```

### Debugging

**Using print statements:**

```python
print(f"Debug: {variable}")  # Will show in terminal
```

**Using Python debugger:**

```python
import pdb
pdb.set_trace()  # Execution will pause here
```

**Using logging:**

```python
from ledger_sync.utils.logging import logger
logger.debug("Debug message")
logger.info("Info message")
logger.error("Error message")
```

### Database Debugging

```bash
# Open SQLite shell
sqlite3 ledger_sync.db

# List tables
.tables

# Show schema
.schema transactions

# Run query
SELECT COUNT(*) FROM transactions;

# Exit
.quit
```

### Performance Profiling

```python
import time

start = time.time()
# Code to profile
end = time.time()
print(f"Elapsed: {end - start:.3f}s")
```

## Frontend Development

### Project Structure

```
frontend/
├── src/
│   ├── pages/           # Page components
│   ├── features/        # Feature modules
│   ├── components/      # Shared components
│   ├── hooks/          # Custom hooks
│   ├── lib/            # Utilities
│   ├── services/       # API client
│   ├── store/          # State management
│   └── types/          # TypeScript types
├── public/             # Static assets
└── package.json        # Dependencies
```

### Hot Reload

The frontend uses Vite's HMR (Hot Module Replacement). Changes automatically refresh in the browser.

### Creating New Pages

1. **Create page component** in `src/pages/`:

```tsx
// src/pages/NewPage/NewPage.tsx
export const NewPage = ({ filteredData }) => {
  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold">New Page</h1>
      {/* Content */}
    </div>
  );
};
```

2. **Add route in** `src/app/App.tsx`:

```tsx
const NewPage = lazyLoad(() => import("../pages/NewPage/NewPage"), "NewPage");

// In the render method
case "new-page":
  return <NewPage filteredData={filteredData} />;
```

3. **Add navigation tab**:

```tsx
<button
  onClick={() => setActiveTab("new-page")}
  className={activeTab === "new-page" ? "active" : ""}
>
  New Page
</button>
```

### Creating New Components

1. **Create component** in `src/features/` or `src/components/`:

```tsx
// src/components/MyComponent.tsx
interface MyComponentProps {
  data: string;
  onAction: () => void;
}

export const MyComponent = ({ data, onAction }: MyComponentProps) => {
  return (
    <div className="p-4 border rounded">
      <p>{data}</p>
      <button onClick={onAction}>Action</button>
    </div>
  );
};
```

2. **Use in page**:

```tsx
import { MyComponent } from "../components/MyComponent";

export const MyPage = () => {
  return <MyComponent data="Hello" onAction={() => console.log("Clicked")} />;
};
```

### Creating Custom Hooks

```typescript
// src/hooks/useMyHook.ts
import { useState, useEffect } from "react";

export const useMyHook = (initialValue: string) => {
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    // Side effect
  }, [value]);

  return { value, setValue };
};
```

### API Integration

1. **Add API call** in `src/services/api.ts`:

```typescript
export async function fetchNewData(): Promise<Data[]> {
  const response = await fetch(`${API_BASE_URL}/api/new-endpoint`);
  if (!response.ok) {
    throw new Error(`Failed to fetch: ${response.statusText}`);
  }
  return await response.json();
}
```

2. **Create custom hook** in `src/hooks/`:

```typescript
export const useNewData = () => {
  const [data, setData] = useState<Data[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    fetchNewData()
      .then(setData)
      .catch(setError)
      .finally(() => setLoading(false));
  }, []);

  return { data, loading, error };
};
```

3. **Use in component**:

```tsx
export const MyComponent = () => {
  const { data, loading, error } = useNewData();

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return <div>{/* Render data */}</div>;
};
```

### Styling

Use Tailwind CSS utility classes:

```tsx
<div className="p-4 bg-white rounded-lg shadow-lg border border-gray-200">
  <h2 className="text-xl font-bold text-gray-900">Title</h2>
  <p className="text-gray-600 mt-2">Description</p>
</div>
```

### TypeScript

Keep types organized in `src/types/`:

```typescript
// src/types/index.ts
export interface Transaction {
  id: string;
  date: Date;
  amount: number;
  type: "Income" | "Expense" | "Transfer";
  category: string;
}

export interface KPIData {
  income: number;
  expenses: number;
  netSavings: number;
}
```

### Debugging Frontend

**Browser DevTools:**

- F12 to open
- Console tab for logs
- Network tab to inspect API calls
- React DevTools extension for component inspection

**VS Code Debugger:**

Create `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "chrome",
      "request": "launch",
      "name": "Launch Chrome",
      "url": "http://localhost:3000",
      "webRoot": "${workspaceFolder}/frontend/src"
    }
  ]
}
```

### Linting & Formatting

```bash
cd frontend

# Check for errors
npm run lint

# Format code
npm run format

# Type check
npm run type-check
```

## Common Development Tasks

### Adding a New Feature

1. Create feature branch:

```bash
git checkout -b feature/new-feature
```

2. Implement backend endpoint (if needed)
3. Write backend tests
4. Implement frontend page/component
5. Add API integration
6. Test end-to-end
7. Commit and push:

```bash
git add .
git commit -m "feat: add new feature"
git push origin feature/new-feature
```

### Updating Dependencies

**Backend:**

```bash
cd backend
pip install --upgrade pip
pip list --outdated
pip install -U package_name
```

**Frontend:**

```bash
cd frontend
npm outdated
npm update
npm install new-package
```

### Database Migration

```bash
cd backend

# Create migration
alembic revision --autogenerate -m "Description"

# Apply
alembic upgrade head

# Rollback
alembic downgrade -1
```

### Environment Variables

Create `.env` files:

**backend/.env**

```
DATABASE_URL=sqlite:///ledger_sync.db
DEBUG=True
```

**frontend/.env**

```
VITE_API_URL=http://localhost:8000
```

### Git Workflow

```bash
# Update from main
git pull origin main

# Create feature branch
git checkout -b feature/my-feature

# Make changes and commit
git add .
git commit -m "commit message"

# Push to remote
git push origin feature/my-feature

# Create pull request on GitHub
```

## Troubleshooting

### Backend won't start

1. Check Python version: `python --version`
2. Activate virtual environment
3. Install dependencies: `pip install -r requirements.txt`
4. Check port 8000 is available
5. Check database permissions

### Frontend won't start

1. Check Node version: `node --version`
2. Install dependencies: `npm install`
3. Clear node_modules: `rm -rf node_modules && npm install`
4. Check port 3000 is available
5. Clear Vite cache: `npm run clean`

### Database errors

1. Check SQLite file exists
2. Run migrations: `alembic upgrade head`
3. Check permissions on database file
4. Reset database: delete `.db` file and re-run migrations

### API errors

1. Check backend is running on port 8000
2. Check API endpoint exists
3. Check request/response format
4. Check CORS configuration
5. Check browser console for errors

## IDE Setup (VS Code)

### Recommended Extensions

- **Python**: ms-python.python
- **Pylance**: ms-python.vscode-pylance
- **Prettier**: esbenp.prettier-vscode
- **ESLint**: dbaeumer.vscode-eslint
- **REST Client**: humao.rest-client
- **SQLite**: alexcvzz.vscode-sqlite

### Launch Configuration

Create `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Backend",
      "type": "python",
      "request": "launch",
      "module": "uvicorn",
      "args": ["ledger_sync.api.main:app", "--reload"],
      "jinja": true,
      "cwd": "${workspaceFolder}/backend"
    }
  ]
}
```

### Settings

Add to `.vscode/settings.json`:

```json
{
  "python.defaultInterpreterPath": "${workspaceFolder}/venv/bin/python",
  "python.linting.enabled": true,
  "python.linting.pylintEnabled": true,
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "[python]": {
    "editor.defaultFormatter": "ms-python.python",
    "editor.formatOnSave": true
  }
}
```
