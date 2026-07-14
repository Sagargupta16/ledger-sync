# Ledger Sync

Self-hosted personal finance workspace for importing bank statements, reconciling a ledger, exploring analytics, and asking an AI assistant questions about your own data.

[![Version](https://img.shields.io/github/package-json/v/Sagargupta16/ledger-sync?filename=frontend%2Fpackage.json&label=version&color=brightgreen&cacheSeconds=86400)](CHANGELOG.md)
[![CI](https://github.com/Sagargupta16/ledger-sync/actions/workflows/ci.yml/badge.svg)](https://github.com/Sagargupta16/ledger-sync/actions/workflows/ci.yml)
[![SonarCloud](https://sonarcloud.io/api/project_badges/measure?project=Sagargupta16_ledger-sync&metric=alert_status)](https://sonarcloud.io/dashboard?id=Sagargupta16_ledger-sync)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![Last commit](https://img.shields.io/github/last-commit/Sagargupta16/ledger-sync?cacheSeconds=86400)
[![Stars](https://img.shields.io/github/stars/Sagargupta16/ledger-sync?style=social&cacheSeconds=86400)](https://github.com/Sagargupta16/ledger-sync)

## Why

Ledger Sync is built for people who want useful personal finance analysis without handing over direct bank access or paying a recurring subscription. It supports Indian fiscal years and tax planning, multi-currency display, transaction organization, investments, goals, recurring commitments, and FIRE planning.

- [Open the hosted app](https://sagargupta.online/ledger-sync/)
- [Explore demo data](https://sagargupta.online/ledger-sync/demo)
- [Read the deployment guide](docs/DEPLOYMENT.md)

## Highlights

### Import and reconciliation

- Accepts `.xlsx`, `.xls`, and `.csv` statements.
- Parses files in the browser with SheetJS.
- Sends validated JSON rows to the API instead of uploading the source file.
- Uses deterministic SHA-256 transaction IDs plus occurrence counters so repeated imports remain idempotent without collapsing legitimate duplicate rows.
- Soft-deletes rows no longer present in the latest import and refreshes analytics after reconciliation.

### Financial workspace

- Dashboard and fixed Overview for quick financial status.
- Server-paginated transaction ledger with search, filters, tags, saved views, sorting, and CSV export.
- Expense, income, cash flow, period comparison, year review, forecasting, and net worth analysis.
- Investment analytics, SIP projections, XIRR/CAGR returns, and instrument projections.
- 50/30/20 budget analysis, goals, recurring commitments, bill calendar, and anomaly review.
- Indian income tax, RSU vesting, projected TDS, GST estimation, and FIRE planning.

### AI assistant

- Fifteen read-only, user-scoped financial tools.
- App-provided Bedrock mode with a daily message limit.
- BYOK configuration for supported providers with configurable token limits.
- AES-256-GCM encrypted key storage. Current ciphertexts use HKDF-SHA256 with `LEDGER_SYNC_ENCRYPTION_KEY`; legacy PBKDF2 ciphertexts remain readable during migration.
- Financial data is fetched through tools when needed instead of being copied into a large prompt.

### Responsive UI

- Compact desktop workspace with grouped navigation, search, notifications, theme control, and AI access.
- Phone bottom navigation plus a complete More page.
- Light, dark, and system themes.
- Mobile card layouts for wide data tables and 44px touch targets for primary controls.
- Installable PWA that never caches API responses.

## Application Map

The router contains 3 public routes and 24 protected workspace pages.

| Area | Pages |
| --- | --- |
| Public | Home, demo entry, OAuth callback |
| Core | Dashboard, Overview |
| Analytics | Expense Analysis, Income Analysis, Cash Flow, Comparison, Year in Review |
| Wealth | Net Worth, Trends and Forecasts, Investment Analytics, Projections, Returns Analysis |
| Commitments | Recurring, Bill Calendar |
| Planning | Budget Rule, Financial Goals, FIRE Calculator, Anomaly Review |
| Tax | Income Tax, Indirect Tax (GST) |
| Data | Transactions, Upload and Sync, Settings |
| Mobile | More |

See [docs/PAGES.md](docs/PAGES.md) for the route and data-source catalog and [docs/HANDBOOK.md](docs/HANDBOOK.md) for the user workflow guide.

## Quick Start

### Prerequisites

- Node.js 22+
- pnpm 11
- Python 3.13+
- [uv](https://docs.astral.sh/uv/getting-started/installation/)

### Install and run

```bash
git clone https://github.com/Sagargupta16/ledger-sync.git
cd ledger-sync
pnpm install
pnpm run setup
pnpm run dev
```

Local services:

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:8000`
- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`

### Configuration

Copy the required `LEDGER_SYNC_*` entries from [.env.example](.env.example) into `backend/.env`.

```env
LEDGER_SYNC_ENVIRONMENT=development
LEDGER_SYNC_DATABASE_URL=sqlite:///./ledger_sync.db
LEDGER_SYNC_FRONTEND_URL=http://localhost:5173
LEDGER_SYNC_JWT_SECRET_KEY=replace-with-at-least-32-random-characters
LEDGER_SYNC_ENCRYPTION_KEY=replace-with-a-separate-random-key

# Configure at least one provider for real sign-in.
LEDGER_SYNC_GOOGLE_CLIENT_ID=...
LEDGER_SYNC_GOOGLE_CLIENT_SECRET=...
LEDGER_SYNC_GITHUB_CLIENT_ID=...
LEDGER_SYNC_GITHUB_CLIENT_SECRET=...
```

Local frontend development uses Vite's same-origin `/api` proxy. Set `VITE_API_BASE_URL` only when the built frontend and API are hosted on different origins.

## Common Commands

```bash
pnpm run dev       # Start backend and frontend
pnpm run check     # Lint, type-check, and test both stacks
pnpm run build     # Production frontend build
pnpm run format    # Format both stacks
```

Backend migrations:

```bash
cd backend
uv run alembic upgrade head
```

## Tech Stack

| Layer | Technology |
| --- | --- |
| Frontend | React 19, TypeScript 6, Vite 8, Tailwind CSS 4, Recharts 3, Framer Motion 12 |
| Backend | Python 3.13+, FastAPI, SQLAlchemy 2, Alembic, Pydantic 2 |
| Database | SQLite for development, Neon PostgreSQL 17 for production |
| State | TanStack Query 5, Zustand 5 |
| Deployment | GitHub Pages, Vercel, Neon |
| Tooling | pnpm 11, uv, Vitest, pytest, Ruff, mypy, ESLint |

## Architecture

<p align="center">
  <img src="docs/images/system-overview.svg" alt="Ledger Sync system architecture" width="100%"/>
</p>

The web import path is:

```text
Excel or CSV
  -> browser parser and validation
  -> authenticated JSON upload
  -> normalization and reconciliation
  -> PostgreSQL or SQLite
  -> analytics refresh
  -> TanStack Query cache invalidation
```

See [docs/architecture.md](docs/architecture.md) for component and data-flow details.

## Deployment

The hosted installation uses:

| Service | Platform |
| --- | --- |
| Frontend | GitHub Pages |
| Backend | Vercel serverless through Mangum |
| Database | Neon PostgreSQL 17 with PgBouncer |

Frontend and backend deployments run from `main`. Database migrations run through the dedicated GitHub Actions workflow when migration or model files change. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) before changing production configuration.

## Documentation

- [Complete Handbook](docs/HANDBOOK.md)
- [Page and Route Catalog](docs/PAGES.md)
- [API Reference](docs/API.md)
- [Architecture](docs/architecture.md)
- [Calculations](docs/CALCULATIONS.md)
- [Database](docs/DATABASE.md)
- [Development](docs/DEVELOPMENT.md)
- [Testing](docs/TESTING.md)
- [Deployment](docs/DEPLOYMENT.md)
- [Changelog](CHANGELOG.md)
- [Contributing](CONTRIBUTING.md)

`docs/AUDIT.md` and `docs/plans/` are dated historical records. Their status headers identify the snapshot or implementation state.

## License

MIT. See [LICENSE](LICENSE).
