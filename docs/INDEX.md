# Documentation Index

Welcome to Ledger Sync documentation! Your personal finance command center.

## 🌟 Key Features

| Feature                  | Description                                   |
| ------------------------ | --------------------------------------------- |
| **Smart Upload**         | Drag-and-drop Excel with duplicate detection  |
| **50/30/20 Budget**      | Needs/Wants/Savings analysis based on income  |
| **Investment Portfolio** | Track FD/Bonds, Mutual Funds, PPF/EPF, Stocks |
| **Cash Flow Sankey**     | Visual money flow diagrams                    |
| **Tax Planning**         | India FY (Apr-Mar) based insights             |

---

## Quick Navigation

### Getting Started

- **[README](../README.md)** - Project overview and quick start
- **[Backend README](../backend/README.md)** - Backend-specific guide
- **[Frontend README](../frontend/README.md)** - Frontend-specific guide
- **[Quick Reference](./QUICK-REFERENCE.md)** - Commands and shortcuts

### Comprehensive Guides

1. **[Architecture](./architecture.md)** - System design and components
   - High-level architecture
   - Backend layers (API, Business Logic, Data Access)
   - Frontend layers (Pages, Components)
   - Data models and flow
   - Financial calculations (50/30/20 rule, NET investments)

2. **[API Documentation](./API.md)** - REST API reference
   - Upload endpoints
   - Transaction endpoints
   - Analytics endpoints
   - Preferences endpoints

3. **[Database Schema](./DATABASE.md)** - Database design and operations
   - Database models (Transaction, ImportLog, Preferences)
   - Hash ID generation for deduplication
   - Alembic migrations

4. **[Development Guide](./DEVELOPMENT.md)** - Development environment and workflow
   - Setup instructions
   - Creating new endpoints
   - Creating new components
   - Debugging techniques

5. **[Testing Guide](./TESTING.md)** - Testing strategies and practices
   - Backend testing (pytest)
   - Frontend testing
   - Code coverage

6. **[Deployment Guide](./DEPLOYMENT.md)** - Deployment to production
   - Self-hosted deployment
   - Docker deployment
   - Cloud deployments

---

## Documentation by Use Case

### I want to...

#### Understand the Project

1. Read [README](../README.md) - 5 min overview
2. Review [Architecture](./architecture.md) - Understand system design

#### Set Up Development Environment

1. Follow [Development Guide](./DEVELOPMENT.md) - Setup section
2. Read backend/frontend READMEs for tool-specific info

#### Add a New Feature

1. Check [Architecture](./architecture.md) - Understand where to add code
2. Follow [Development Guide](./DEVELOPMENT.md) - Creating new endpoints/components
3. Reference [API Documentation](./API.md) - For API contracts
4. Write tests using [Testing Guide](./TESTING.md)

#### Deploy to Production

1. Review [Pre-deployment Checklist](./DEPLOYMENT.md#pre-deployment-checklist)
2. Choose deployment option in [Deployment Guide](./DEPLOYMENT.md)
3. Follow specific deployment steps
4. Setup monitoring and backups

#### Fix a Bug

1. Check logs using [Development Guide](./DEVELOPMENT.md#debugging)
2. Write failing test using [Testing Guide](./TESTING.md)
3. Fix code and verify test passes
4. Deploy following [Deployment Guide](./DEPLOYMENT.md)

#### Understand the Database

1. Read [Database Schema](./DATABASE.md)
2. Learn about queries and migrations
3. Check backup/recovery procedures

#### Optimize Performance

1. Check [Architecture](./architecture.md#performance-optimizations)
2. Review [Deployment Guide](./DEPLOYMENT.md#performance-optimization)
3. Use profiling tools mentioned in [Development Guide](./DEVELOPMENT.md)

#### Monitor Production System

1. Setup monitoring in [Deployment Guide](./DEPLOYMENT.md#monitoring--logging)
2. Configure logging
3. Setup alerts
4. Review disaster recovery plan

---

## Project Structure

```
ledger-sync/
├── docs/                    # This folder
│   ├── architecture.md      # System architecture
│   ├── API.md              # API reference
│   ├── DATABASE.md         # Database schema
│   ├── DEVELOPMENT.md      # Development guide
│   ├── TESTING.md          # Testing guide
│   ├── DEPLOYMENT.md       # Deployment guide
│   ├── ROADMAP.md          # Future roadmap
│   ├── QUICK-REFERENCE.md  # Quick reference guide
│   └── INDEX.md            # This file
├── backend/                 # Python FastAPI backend
│   ├── README.md
│   ├── src/
│   │   └── ledger_sync/
│   │       ├── api/        # FastAPI endpoints
│   │       ├── core/       # Business logic
│   │       ├── db/         # Database models & migrations
│   │       ├── ingest/     # Excel file processing
│   │       └── utils/      # Utilities
│   └── tests/
├── frontend/                # React TypeScript frontend
│   ├── README.md
│   ├── src/
│   │   ├── pages/          # Page components (13 pages)
│   │   ├── components/     # UI components
│   │   │   ├── analytics/  # Analytics components (13 components)
│   │   │   ├── layout/     # Layout components
│   │   │   ├── shared/     # Shared components
│   │   │   ├── transactions/ # Transaction components
│   │   │   ├── ui/         # Base UI components
│   │   │   └── upload/     # Upload components
│   │   ├── hooks/          # Custom React hooks
│   │   ├── lib/            # Utilities (cn, queryClient)
│   │   ├── services/       # API client services
│   │   ├── store/          # Zustand state stores
│   │   ├── types/          # TypeScript types
│   │   └── constants/      # App constants
│   └── tests/
└── README.md                # Main project README
```

---

## Technology Stack

### Backend

- **Language**: Python 3.11+
- **Framework**: FastAPI
- **ORM**: SQLAlchemy 2.0
- **Database**: SQLite
- **Testing**: pytest
- **Migrations**: Alembic

### Frontend

- **Language**: TypeScript
- **Framework**: React 18
- **Build Tool**: Vite
- **Styling**: Tailwind CSS
- **Charts**: Recharts
- **State Management**: Zustand + TanStack Query
- **Notifications**: Sonner (toast)

---

## Key Concepts

### 50/30/20 Budget Rule

The spending analysis follows the 50/30/20 budgeting framework:

| Category | Target | Description                                         |
| -------- | ------ | --------------------------------------------------- |
| Needs    | ≤ 50%  | Essential expenses (rent, bills, groceries)         |
| Wants    | ≤ 30%  | Non-essential spending (entertainment, dining)      |
| Savings  | ≥ 20%  | Income minus expenses (investments, emergency fund) |

**Calculation**: `Savings = Total Income - Total Expenses`

### Investment Categories

The investment portfolio tracks 4 asset types:

| Category     | Accounts              | Calculation             |
| ------------ | --------------------- | ----------------------- |
| FD/Bonds     | Fixed Deposits, Bonds | Cumulative transfers in |
| Mutual Funds | All MF accounts       | Cumulative transfers in |
| PPF/EPF      | Provident funds       | Cumulative transfers in |
| Stocks       | Equity holdings       | NET (In - Out)          |

**Note**: Stocks use NET calculation since transfers out may represent sales, not actual withdrawal.

### Transaction Reconciliation

The system uses SHA-256 hashing to generate deterministic transaction IDs:

- **Deduplication** - Same transaction won't be imported twice
- **Idempotent uploads** - Re-uploading produces no changes
- **Audit trail** - Soft deletes preserve history

See [Architecture](./architecture.md#transaction-reconciliation) for details.

### API Structure

Endpoints are organized into three main groups:

- **Upload**: File ingestion with duplicate detection
- **Transactions**: Transaction data access and filtering
- **Analytics/Calculations**: Financial insights and metrics

See [API Documentation](./API.md) for full reference.

---

## Common Workflows

### Adding a New Financial Metric

1. **Backend**:
   - Add calculation function in `core/calculator.py`
   - Create API endpoint in `api/calculations.py`
   - Add tests in `tests/unit/test_calculator.py`
   - Update database if needed (migration)

2. **Frontend**:
   - Add API call in `services/api.ts`
   - Create component in `features/kpi/components/`
   - Add to page component
   - Write component tests

3. **Testing**:
   - Backend: Write calculation unit test
   - Frontend: Write component test
   - Integration: Test end-to-end

4. **Documentation**:
   - Update API docs
   - Update architecture if structure changed
   - Add example in code comments

### Deploying a New Version

1. **Testing**: Run full test suite
2. **Building**: Build frontend assets
3. **Backup**: Create database backup
4. **Deploy**: Push to production using CI/CD
5. **Verify**: Test functionality
6. **Monitor**: Watch logs for errors

See [Deployment Guide](./DEPLOYMENT.md) for details.

---

## Troubleshooting

### Common Issues

**Backend won't start**
→ Check [Development Guide - Troubleshooting](./DEVELOPMENT.md#troubleshooting)

**API errors**
→ Check [API Documentation - Error Codes](./API.md#error-codes)

**Database issues**
→ Check [Database Schema - Troubleshooting](./DATABASE.md#maintenance)

**Deployment problems**
→ Check [Deployment Guide - Troubleshooting](./DEPLOYMENT.md#troubleshooting-deployment)

**Tests failing**
→ Check [Testing Guide](./TESTING.md) for test debugging

---

## Getting Help

### Quick References

- **API Endpoints**: [API.md](./API.md)
- **Database Queries**: [DATABASE.md](./DATABASE.md)
- **Setup Issues**: [DEVELOPMENT.md](./DEVELOPMENT.md)
- **Code Structure**: [architecture.md](./architecture.md)

### External Resources

- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [React Documentation](https://react.dev)
- [SQLAlchemy Documentation](https://docs.sqlalchemy.org/)
- [TypeScript Documentation](https://www.typescriptlang.org/)

---

## Contributing

1. Fork repository
2. Create feature branch
3. Follow development workflow in [DEVELOPMENT.md](./DEVELOPMENT.md)
4. Write tests using [TESTING.md](./TESTING.md)
5. Update documentation
6. Submit pull request

---

## Document Versions

- **Latest**: January 2025
- **Updated**: Regularly maintained
- **Archive**: See git history for previous versions

---

## Contact & Support

For questions or issues:

- Check documentation first
- Search existing GitHub issues
- Open new issue with detailed description
- Include error messages and logs

---

_Happy coding! 🚀_
