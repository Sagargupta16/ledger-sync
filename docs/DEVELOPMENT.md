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
pip install -e ".[dev]"  # Install with development dependencies
cd ..

# 5. Install Node dependencies (using pnpm)
cd frontend
pnpm install
cd ..

# 6. Initialize database
cd backend
alembic upgrade head
cd ..
```

## Running the Application

### Option 1: Use Setup Script (Windows)

```powershell
.\setup.ps1   # First time setup
.\start.ps1   # Start both services
```

### Option 2: Run Both Services Manually

```powershell
# From project root
pnpm run dev
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
│   ├── pages/           # Page components (13 pages)
│   ├── components/      # UI components
│   │   ├── analytics/   # Analytics components (13 components)
│   │   ├── layout/      # Layout components
│   │   ├── shared/      # Shared components
│   │   ├── transactions/ # Transaction components
│   │   ├── ui/          # Base UI components
│   │   └── upload/      # Upload components
│   ├── hooks/           # Custom hooks
│   │   └── api/         # API-specific hooks
│   ├── lib/             # Utilities (cn, queryClient)
│   ├── services/        # API client
│   │   └── api/         # API service modules
│   ├── store/           # Zustand state stores
│   ├── types/           # TypeScript types
│   └── constants/       # App constants
├── public/              # Static assets
└── package.json         # Dependencies
```

### Hot Reload

The frontend uses Vite's HMR (Hot Module Replacement). Changes automatically refresh in the browser.

### Creating New Pages

1. **Create page component** in `src/pages/`:

```tsx
// src/pages/NewPage.tsx
export default function NewPage() {
  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold text-white">New Page</h1>
      {/* Content */}
    </div>
  );
}
```

2. **Export from** `src/pages/index.ts`:

```tsx
export { default as NewPage } from "./NewPage";
```

3. **Add route** in App.tsx or router configuration

### Creating New Analytics Components

1. **Create component** in `src/components/analytics/`:

```tsx
// src/components/analytics/MyAnalyticsComponent.tsx
import { useQuery } from "@tanstack/react-query";
import { api } from "@/services/api";

interface Props {
  timeRange?: string;
}

export default function MyAnalyticsComponent({ timeRange }: Props) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["myData", timeRange],
    queryFn: () => api.getMyData(timeRange),
  });

  if (isLoading) return <div className="animate-pulse">Loading...</div>;
  if (error) return <div className="text-red-400">Error loading data</div>;

  return (
    <div className="bg-zinc-900 rounded-xl p-6 border border-white/10">
      <h3 className="text-lg font-semibold text-white mb-4">My Analytics</h3>
      {/* Chart or visualization */}
    </div>
  );
}
```

2. **Export from** `src/components/analytics/index.ts`:

```tsx
export { default as MyAnalyticsComponent } from "./MyAnalyticsComponent";
```

### Creating Custom Hooks with TanStack Query

```typescript
// src/hooks/api/useMyData.ts
import { useQuery } from "@tanstack/react-query";
import { api } from "@/services/api";

export function useMyData(timeRange?: string) {
  return useQuery({
    queryKey: ["myData", timeRange],
    queryFn: () => api.getMyData(timeRange),
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
```

### API Integration with Services

1. **Add API call** in `src/services/api/`:

```typescript
// src/services/api/myApi.ts
const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

export interface MyDataResponse {
  data: MyData[];
  total: number;
}

export async function getMyData(timeRange?: string): Promise<MyDataResponse> {
  const params = new URLSearchParams();
  if (timeRange) params.set("time_range", timeRange);

  const response = await fetch(
    `${API_BASE_URL}/api/my-endpoint?${params.toString()}`,
  );
  if (!response.ok) {
    throw new Error(`Failed to fetch: ${response.statusText}`);
  }
  return await response.json();
}
```

2. **Use with TanStack Query**:

```tsx
import { useQuery } from "@tanstack/react-query";
import { getMyData } from "@/services/api/myApi";

export const MyComponent = () => {
  const { data, isLoading, error } = useQuery({
    queryKey: ["myData"],
    queryFn: () => getMyData(),
  });

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return <div>{/* Render data */}</div>;
};
```

### Using Zustand Stores

```typescript
// src/store/myStore.ts
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface MyStore {
  items: string[];
  addItem: (item: string) => void;
  removeItem: (item: string) => void;
}

export const useMyStore = create<MyStore>()(
  persist(
    (set) => ({
      items: [],
      addItem: (item) => set((state) => ({ items: [...state.items, item] })),
      removeItem: (item) =>
        set((state) => ({ items: state.items.filter((i) => i !== item) })),
    }),
    { name: "my-store" },
  ),
);
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
