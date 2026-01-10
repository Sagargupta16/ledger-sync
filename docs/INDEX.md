# Documentation Index

Welcome to Ledger Sync documentation! This guide covers all aspects of the project.

## Quick Navigation

### Getting Started

- **[README](../README.md)** - Project overview and quick start
- **[Backend README](../backend/README.md)** - Backend-specific guide
- **[Frontend README](../frontend/README.md)** - Frontend-specific guide

### Comprehensive Guides

1. **[Architecture](./architecture.md)** - System design and components

   - High-level architecture
   - Backend layers (API, Business Logic, Data Access)
   - Frontend layers (Pages, Features, Components)
   - Data models and flow
   - Technology choices
   - Scalability considerations

2. **[API Documentation](./API.md)** - REST API reference

   - Base URL and authentication
   - Upload endpoints
   - Transaction endpoints
   - Analytics endpoints
   - Calculation endpoints
   - Error codes and rate limiting
   - Interactive API docs links

3. **[Database Schema](./DATABASE.md)** - Database design and operations

   - Database models (Transaction)
   - Create, Read, Update, Delete operations
   - Alembic migrations
   - Hash ID generation
   - Data integrity
   - Performance optimization
   - Backup and recovery
   - Future scaling to PostgreSQL

4. **[Development Guide](./DEVELOPMENT.md)** - Development environment and workflow

   - Setup instructions
   - Running the application
   - Creating new endpoints
   - Creating new components
   - API integration
   - Debugging techniques
   - IDE setup (VS Code)
   - Common development tasks

5. **[Testing Guide](./TESTING.md)** - Testing strategies and practices

   - Backend testing (pytest)
   - Frontend testing (Jest, React Testing Library)
   - Writing unit tests
   - Writing integration tests
   - Component testing
   - Mocking and fixtures
   - Code coverage
   - E2E testing (Cypress)
   - Test best practices

6. **[Deployment Guide](./DEPLOYMENT.md)** - Deployment to production
   - Pre-deployment checklist
   - Self-hosted deployment (VPS/Dedicated Server)
   - Docker deployment
   - Cloud deployments (Heroku, AWS, Digital Ocean)
   - Environment configuration
   - Database management
   - Performance optimization
   - Monitoring and logging
   - Security considerations
   - Scaling strategies
   - CI/CD pipeline
   - Disaster recovery

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
│   └── INDEX.md            # This file
├── backend/                 # Python FastAPI backend
│   ├── README.md
│   ├── src/
│   │   └── ledger_sync/
│   │       ├── api/
│   │       ├── core/
│   │       ├── db/
│   │       ├── ingest/
│   │       └── utils/
│   └── tests/
├── frontend/                # React TypeScript frontend
│   ├── README.md
│   ├── src/
│   │   ├── pages/
│   │   ├── features/
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── lib/
│   │   ├── services/
│   │   ├── store/
│   │   └── types/
│   └── tests/
└── README.md                # Main project README
```

---

## Technology Stack

### Backend

- **Language**: Python 3.11+
- **Framework**: FastAPI
- **ORM**: SQLAlchemy 2.0
- **Database**: SQLite (Development), PostgreSQL (Production)
- **Testing**: pytest
- **Migrations**: Alembic

### Frontend

- **Language**: TypeScript
- **Framework**: React 19
- **Build Tool**: Vite
- **Styling**: Tailwind CSS
- **Charts**: Chart.js
- **State Management**: Zustand
- **Testing**: Jest, React Testing Library

---

## Key Concepts

### Transaction Reconciliation

The system uses SHA-256 hashing to generate deterministic transaction IDs. This allows:

- Deduplication across multiple imports
- Idempotent uploads (same file twice = no changes)
- Deterministic tracking without central ID service

See [Architecture](./architecture.md#transaction-reconciliation) for details.

### Soft Deletes

Transactions are marked as deleted rather than removed:

- Maintains audit trail
- Allows recovery of accidentally deleted data
- Enables historical analysis

See [Database Schema](./DATABASE.md#delete-soft) for details.

### API Structure

Endpoints are organized into three main groups:

- **Upload**: File ingestion
- **Transactions**: Transaction data access
- **Analytics/Calculations**: Financial insights

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
