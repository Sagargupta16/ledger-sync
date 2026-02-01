# Quick Reference

Fast lookup for common commands and configurations.

## Startup Commands

```bash
# Both services
npm run dev

# Backend only
npm run backend

# Frontend only
npm run frontend

# Backend with direct Python
cd backend && python -m uvicorn ledger_sync.api.main:app --reload

# Frontend with Vite
cd frontend && npm run dev
```

## API Endpoints Summary

| Method | Endpoint                                     | Purpose                      |
| ------ | -------------------------------------------- | ---------------------------- |
| POST   | `/api/upload`                                | Upload Excel file            |
| GET    | `/api/transactions`                          | Get all transactions         |
| GET    | `/api/analytics/overview`                    | Financial overview           |
| GET    | `/api/analytics/kpis`                        | KPI metrics                  |
| GET    | `/api/analytics/behavior`                    | Spending behavior            |
| GET    | `/api/analytics/trends`                      | Financial trends             |
| GET    | `/api/analytics/wrapped`                     | Yearly financial wrap        |
| GET    | `/api/analytics/charts/income-expense`       | Income vs expense chart data |
| GET    | `/api/analytics/charts/categories`           | Category breakdown chart     |
| GET    | `/api/analytics/charts/monthly-trends`       | Monthly trends chart         |
| GET    | `/api/analytics/charts/account-distribution` | Account distribution         |
| GET    | `/api/analytics/insights/generated`          | AI-generated insights        |
| GET    | `/api/calculations/totals`                   | Income/expense totals        |
| GET    | `/api/calculations/monthly-aggregation`      | Monthly aggregation          |
| GET    | `/api/calculations/yearly-aggregation`       | Yearly aggregation           |
| GET    | `/api/calculations/category-breakdown`       | Category breakdown           |
| GET    | `/api/calculations/account-balances`         | Account balances             |
| GET    | `/api/calculations/categories/master`        | Master category list         |
| GET    | `/api/account-classifications`               | Account classifications      |
| POST   | `/api/account-classifications`               | Set account classification   |
| DELETE | `/api/account-classifications/{name}`        | Remove classification        |

## Common Backend Commands

```bash
cd backend

# Run tests
pytest                              # All tests
pytest tests/unit/                  # Unit tests only
pytest tests/unit/test_hash_id.py   # Specific file
pytest --cov=ledger_sync tests/     # With coverage

# Database
alembic upgrade head                # Apply migrations
alembic revision --autogenerate -m "message"  # Create migration
alembic downgrade -1                # Rollback one

# Database shell
sqlite3 ledger_sync.db

# Run server
python -m uvicorn ledger_sync.api.main:app --reload

# Clean database
rm ledger_sync.db
alembic upgrade head
```

## Common Frontend Commands

```bash
cd frontend

# Development
npm run dev                   # Start dev server
npm run build                # Build for production
npm run preview              # Preview production build

# Quality
npm run lint                 # Check for errors
npm run format              # Format code
npm run type-check          # TypeScript checking
npm test                    # Run tests

# Clean
rm -rf node_modules dist
npm install
npm run build
```

## Database Queries

```sql
-- Count transactions
SELECT COUNT(*) FROM transactions;

-- Total income
SELECT SUM(amount) FROM transactions WHERE type='Income' AND is_deleted=0;

-- Total expenses
SELECT SUM(amount) FROM transactions WHERE type='Expense' AND is_deleted=0;

-- Transactions by category
SELECT category, COUNT(*), SUM(amount) FROM transactions
WHERE is_deleted=0 GROUP BY category ORDER BY SUM(amount) DESC;

-- Recent transactions
SELECT * FROM transactions WHERE is_deleted=0 ORDER BY date DESC LIMIT 10;

-- Find duplicate hashes
SELECT hash_id, COUNT(*) FROM transactions GROUP BY hash_id HAVING COUNT(*) > 1;
```

## Environment Variables

### Backend (.env)

```
DATABASE_URL=sqlite:///ledger_sync.db
DEBUG=False
CORS_ORIGINS=http://localhost:3000
```

### Frontend (.env)

```
VITE_API_URL=http://localhost:8000
```

## Port Mappings

| Service  | Port | URL                         |
| -------- | ---- | --------------------------- |
| Frontend | 3000 | http://localhost:3000       |
| Backend  | 8000 | http://localhost:8000       |
| API Docs | 8000 | http://localhost:8000/docs  |
| ReDoc    | 8000 | http://localhost:8000/redoc |

## File Structure Essentials

```
ledger-sync/
├── backend/src/ledger_sync/
│   ├── api/           ← Add endpoints here
│   ├── core/          ← Business logic here
│   ├── db/            ← Database models here
│   └── ingest/        ← File processing
│
└── frontend/src/
    ├── pages/         ← Add pages here (13 pages)
    ├── components/    ← UI components
    │   ├── analytics/ ← Analytics components (13 components)
    │   ├── layout/    ← Layout components
    │   ├── shared/    ← Shared components
    │   ├── transactions/ ← Transaction components
    │   ├── ui/        ← Base UI components
    │   └── upload/    ← Upload components
    ├── hooks/         ← Custom hooks
    ├── lib/           ← Utilities (cn, queryClient)
    ├── services/      ← API client
    ├── store/         ← Zustand stores
    ├── types/         ← TypeScript types
    └── constants/     ← App constants
```

## Testing Quick Start

```bash
# Backend tests
cd backend
pytest -v                    # Verbose output
pytest --pdb                 # Debug on failure
pytest --cov=ledger_sync     # With coverage

# Frontend tests
cd frontend
npm test                     # Run tests
npm test -- --watch         # Watch mode
npm test -- --coverage      # With coverage
```

## Git Workflow

```bash
# Create feature
git checkout -b feature/my-feature

# Make changes
git add .
git commit -m "feat: description"

# Push
git push origin feature/my-feature

# Create PR on GitHub

# After merge, update locally
git checkout main
git pull origin main
```

## Debugging Checklist

**Backend not starting?**

1. Check Python version: `python --version` (need 3.11+)
2. Activate venv: `source venv/bin/activate`
3. Install deps: `pip install -r requirements.txt`
4. Check port: Is 8000 in use?
5. Check DB: Does `ledger_sync.db` exist?

**Frontend not loading?**

1. Check Node version: `node --version` (need 18+)
2. Install deps: `npm install`
3. Check port: Is 3000 in use?
4. Check API: Is backend running?
5. Check env: Is `VITE_API_URL` correct?

**API errors?**

1. Check backend logs: Terminal where backend runs
2. Check browser console: F12 DevTools
3. Test with curl: `curl http://localhost:8000/docs`
4. Check CORS: Is frontend origin whitelisted?

**Database errors?**

1. Check file exists: `ls -la backend/ledger_sync.db`
2. Check permissions: `chmod 600 backend/ledger_sync.db`
3. Verify integrity: `sqlite3 ledger_sync.db "PRAGMA integrity_check;"`
4. Backup and reset: Move old DB, run migrations

## Code Patterns

### Backend API Endpoint

```python
from fastapi import APIRouter, Depends
from ledger_sync.db.session import get_session

router = APIRouter(prefix="/api/new", tags=["new"])

@router.get("/endpoint")
def get_data(db: Session = Depends(get_session)):
    result = db.query(Transaction).all()
    return {"data": result}
```

### Frontend Component with TanStack Query

```tsx
import { useQuery } from "@tanstack/react-query";
import { api } from "@/services/api";

export const MyComponent = () => {
  const { data, isLoading, error } = useQuery({
    queryKey: ["myData"],
    queryFn: () => api.getData(),
  });

  if (isLoading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return <div>{/* JSX */}</div>;
};
```

### API Call with Services

```typescript
// services/api/index.ts
const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

export const api = {
  async getTransactions(limit = 100) {
    const response = await fetch(
      `${API_BASE_URL}/api/transactions?limit=${limit}`,
    );
    if (!response.ok) throw new Error("Failed");
    return await response.json();
  },
};
```

## Performance Tips

### Backend

- Use database indexes
- Batch process large uploads
- Cache analytics queries
- Profile slow queries

### Frontend

- Lazy load pages
- Memoize expensive calculations
- Virtualize long lists
- Use React DevTools Profiler

## Security Checklist

- [ ] Use HTTPS in production
- [ ] Don't commit secrets (.env in .gitignore)
- [ ] Validate all inputs
- [ ] Use ORM (prevents SQL injection)
- [ ] Configure CORS properly
- [ ] Keep dependencies updated
- [ ] Use strong database backups
- [ ] Monitor error logs for issues

## Useful Links

- API Docs: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc
- GitHub: https://github.com/Sagargupta16/ledger-sync
- Architecture Docs: See `docs/architecture.md`
- API Reference: See `docs/API.md`

## Emergency Procedures

### Database Corrupted

```bash
cd backend
rm ledger_sync.db
alembic upgrade head
# Re-import files from backup
```

### Can't Connect to API

```bash
# Check if backend is running
lsof -i :8000  # Linux/Mac
netstat -ano | findstr :8000  # Windows

# Restart backend
ps aux | grep uvicorn  # Find process
kill <process_id>  # Kill it
# Restart from terminal
```

### Frontend Build Failing

```bash
cd frontend
rm -rf node_modules dist
npm install
npm run build
```

---

**Last Updated**: January 2025
**For more details, see full documentation in `docs/` folder**
