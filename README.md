# Ledger Sync — Your Personal Finance Dashboard

**See where every rupee goes — and ask why.**
Import bank statements, get instant analytics, then chat with your finances using GPT-4 / Claude. Self-hosted, multi-currency, zero subscriptions.

[![Version](https://img.shields.io/github/package-json/v/Sagargupta16/ledger-sync?filename=frontend%2Fpackage.json&label=version&color=brightgreen&cacheSeconds=86400)](CHANGELOG.md)
[![CI](https://github.com/Sagargupta16/ledger-sync/actions/workflows/ci.yml/badge.svg)](https://github.com/Sagargupta16/ledger-sync/actions/workflows/ci.yml)
[![SonarCloud](https://sonarcloud.io/api/project_badges/measure?project=Sagargupta16_ledger-sync&metric=alert_status)](https://sonarcloud.io/dashboard?id=Sagargupta16_ledger-sync)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
![Last commit](https://img.shields.io/github/last-commit/Sagargupta16/ledger-sync?cacheSeconds=86400)
[![Stars](https://img.shields.io/github/stars/Sagargupta16/ledger-sync?style=social&cacheSeconds=86400)](https://github.com/Sagargupta16/ledger-sync)

---

## Why this exists

Mint shut down. YNAB costs $14.99/mo and doesn't understand Indian bank statements. This is what I built for myself: bring your own data, run it on your own server, no subscription, no ads, no data harvesting. Indian fiscal year, multi-currency, 50/30/20 + tax + FIRE analytics out of the box.

**Just want to try it?** → [Live demo](https://sagargupta.online/ledger-sync/) — click "Try Demo" (no signup, sample data)

**Want to use it for real?** → [Sign in to the hosted version](https://sagargupta.online/ledger-sync/) (free, your data stays yours)

**Want to run it yourself?** → [Self-hosting guide](docs/DEPLOYMENT.md) — or one-click:
[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FSagargupta16%2Fledger-sync)

## Features

### AI Finance Chatbot

- Floating chat widget — ask any question about your spending, trends, tax, or goals
- Tool calling (15 read-only tools) across OpenAI, Anthropic, and AWS Bedrock; the LLM is user-scoped at the FastAPI dependency level
- App mode (free, rate-limited to 10 messages/day) or BYOK mode (your key, unlimited; encrypted at rest with AES-256-GCM, per-user token caps)

### Demo Mode

- Try before you sign up — full dashboard with ~500 sample transactions (Indian household model)
- All 23 pages render with pre-computed analytics, zero backend calls
- Mutations gracefully blocked with toast notifications

### Smart Upload & Sync

- Drag-and-drop Excel (.xlsx, .xls) and CSV uploads
- Client-side parsing via SheetJS — files never leave your browser, only structured data is sent to the server
- SHA-256 hashing for duplicate detection — re-upload anytime without duplicates

### Spending Analysis

- 50/30/20 Budget Rule (Needs / Wants / Savings)
- Category and subcategory treemaps
- Year-over-year spending comparisons
- Recurring transaction detection

### Investment Portfolio

- 4 categories: FD/Bonds, Mutual Funds, PPF/EPF, Stocks
- Inflows + outflows + net investment per category
- Asset allocation visualization

### Cash Flow Visualization

- Interactive Sankey diagrams
- Income → Expenses / Savings breakdown
- Monthly and yearly views

### Tax & Retirement Planning

- **India FY tax estimation** — old vs new regime, slab breakdown, surcharge, cess
- **Salary projections** — CTC structure + RSU + growth → multi-year tax liability
- **FIRE Calculator** — Lean / Barista / Standard / Fat variants, adjustable SWR, real return, retirement horizon, part-time-income slider
- **Retirement corpus** — inflation-adjusted, monthly SIP, lump-sum alternative

### Analytics & Insights

- Financial Health Score (8 metrics across 4 pillars: Spend, Save, Borrow, Plan)
- Income vs expense forecasting
- Net Worth tracking across all accounts
- Anomaly detection
- Budget tracking and goals

### Multi-Currency Display

- 15 currencies (USD, EUR, GBP, JPY, CAD, AUD, CHF, SGD, AED, …)
- Live ECB rates via frankfurter.app, cached 24h
- Quick-switch from sidebar; auto-derives format, symbol, and position

### Smart Defaults

- **Account classification** — priority-ordered (credit-card > investment > loan > deposit) with word-boundary regex; 20+ Indian banks normalized
- **Income classification** — auto-assigns Salary/Freelance to Taxable, Dividends/Interest to Investment Returns
- **Investment mappings** — configurable per user; defaults shipped empty (no leaked names)

### Mobile

- Responsive layouts; dedicated mobile tab bar for the most-used pages

## Get Started

### Prerequisites

- Node 20+
- [pnpm 10](https://pnpm.io/installation)
- Python 3.11+
- [uv](https://docs.astral.sh/uv/getting-started/installation/)

### Installation

```bash
git clone https://github.com/Sagargupta16/ledger-sync.git
cd ledger-sync

pnpm install              # root deps
pnpm run setup            # backend + frontend deps in parallel
pnpm run dev              # both servers
```

### Access

- Frontend: http://localhost:5173
- Backend API: http://localhost:8000
- API Docs: http://localhost:8000/docs

### Configuration

Backend env in `backend/.env`:

```env
LEDGER_SYNC_DATABASE_URL=sqlite:///./ledger_sync.db    # local dev
LEDGER_SYNC_ENVIRONMENT=development                     # development | production
LEDGER_SYNC_FRONTEND_URL=http://localhost:5173          # OAuth redirect base
# Optional OAuth providers:
LEDGER_SYNC_GOOGLE_CLIENT_ID=...
LEDGER_SYNC_GOOGLE_CLIENT_SECRET=...
LEDGER_SYNC_GITHUB_CLIENT_ID=...
LEDGER_SYNC_GITHUB_CLIENT_SECRET=...
```

Frontend env:

```env
VITE_API_BASE_URL=http://localhost:8000
```

For OAuth setup (Google + GitHub) and production deployment, see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Usage

1. Sign in with Google or GitHub
2. Drag a bank-statement Excel file (.xlsx, .xls, or .csv) onto the upload zone
3. Browse — start with Dashboard, then Cash Flow, Net Worth, and Income Tax Planning
4. Configure account types, tax preferences, and categories in Settings
5. Ask the AI chatbot any question about your data

For a tour without signing up, visit `/demo`.

## Tech Stack

| Layer            | Technology                                                                     |
| ---------------- | ------------------------------------------------------------------------------ |
| **Frontend**     | React 19, TypeScript 6, Vite 8, Tailwind CSS 4, Recharts 3, Framer Motion 12   |
| **Backend**      | Python 3.11+, FastAPI, SQLAlchemy 2, Alembic                                   |
| **Database**     | SQLite (dev), Neon PostgreSQL 17 (prod)                                        |
| **State**        | TanStack Query 5, Zustand 5                                                    |
| **Deployment**   | GitHub Pages (frontend), Vercel (backend), Neon (database)                     |
| **CI/CD**        | GitHub Actions (lint, type-check, build, deploy)                               |
| **Package Mgmt** | pnpm 10 (frontend), uv (backend)                                               |

## Architecture

<p align="center">
  <img src="docs/images/system-overview.svg" alt="System architecture" width="100%"/>
</p>

For detailed architecture docs, see [docs/architecture.md](docs/architecture.md).

<details>
<summary>More diagrams (Upload Pipeline, Auth Flow, Backend Layers)</summary>

### Upload & Sync Pipeline

<p align="center">
  <img src="docs/images/upload-pipeline.svg" alt="Upload pipeline" width="100%"/>
</p>

### Authentication Flow

<p align="center">
  <img src="docs/images/auth-flow.svg" alt="Authentication flow" width="100%"/>
</p>

### Backend Layer Architecture

<p align="center">
  <img src="docs/images/backend-layers.svg" alt="Backend layers" width="100%"/>
</p>

Diagrams generated from `.mmd` files in `docs/images/`:

```bash
npx -y @mermaid-js/mermaid-cli -i docs/images/<name>.mmd -o docs/images/<name>.svg -b transparent
```

</details>

## Pages

Every page focuses on a specific question you'd ask about your money. The **[Complete Handbook](docs/HANDBOOK.md)** walks through every page card-by-card — what each metric, chart, and setting shows, with the exact formula and data source for each. For the shorter **data catalog** version, see **[docs/PAGES.md](docs/PAGES.md)**.

| Page | Answers |
| --- | --- |
| **Home / Dashboard** | "What happened this month at a glance?" |
| **Transactions** | "Give me the raw ledger." |
| **Cash Flow (Sankey)** | "Where did my income actually go?" |
| **Expense Analysis** | "Am I overspending, and on what?" (50/30/20, treemap, top merchants) |
| **Income Analysis** | "Where does my money come from?" (by tax bucket) |
| **Comparison** | "How does this month / FY compare to last?" |
| **Year in Review** | "Full-year retrospective" (Spotify-Wrapped-style) |
| **Net Worth** | "What am I actually worth today?" (assets vs liabilities, trend) |
| **Trends & Forecasts** | "Where is my wealth trending?" (regression + projection) |
| **Investment Analytics** | "How is my portfolio doing?" (across 8 investment types) |
| **SIP Projections** | "What will my SIPs be worth later?" |
| **Returns Analysis** | "Which holdings are winners?" (XIRR + CAGR ranking) |
| **Recurring / Subscriptions** | "What's auto-draining my account?" (detected + user-confirmed) |
| **Bill Calendar** | "What's due when?" (month grid with paid/missed indicators) |
| **Budgets** | "Am I staying within limits this month?" |
| **Goals** | "How close am I to my savings goals?" |
| **FIRE Calculator** | "When can I retire?" (Lean / Barista / Standard / Fat variants) |
| **Anomaly Review** | "Did anything weird happen?" |
| **Income Tax Planning** | "What will I owe this FY?" (Old vs New regime, multi-year projection) |
| **GST Analysis** | "What indirect tax did I pay?" |
| **Upload & Sync** | "How do I add more data?" |
| **Settings** | "Configure the app." (11 sections; all collapsed by default) |

## Deployment

Free-tier across three services:

| Service | Platform | Details |
|---------|----------|---------|
| Frontend | GitHub Pages | Auto-deploys on push via GitHub Actions |
| Backend | Vercel (serverless) | FastAPI via Mangum; ~400 ms median, up to ~20 s after long idle (Neon free-tier branch archival) |
| Database | Neon PostgreSQL | Free tier, 0.5 GB, Singapore region |

See [Deployment Guide](docs/DEPLOYMENT.md) for full setup.

## Project Structure

```
ledger-sync/
├── backend/      # Python FastAPI backend (api/, core/, db/, ingest/, schemas/)
├── frontend/     # React + TypeScript frontend (pages/, components/, hooks/, lib/)
├── docs/         # Architecture, API, calculations, deployment guides
└── .github/      # CI workflows
```

For deeper navigation, browse the [repo](https://github.com/Sagargupta16/ledger-sync) directly.

## Documentation

- [Changelog](CHANGELOG.md) — version history with release notes
- [Architecture](docs/architecture.md) — system design and data flow
- [Calculations & Data Processing](docs/CALCULATIONS.md) — every metric, chart, and derived number
- [API Reference](docs/API.md) — REST endpoints
- [Database Schema](docs/DATABASE.md) — models and migrations
- [Development Guide](docs/DEVELOPMENT.md) — setup and workflow
- [Testing Guide](docs/TESTING.md) — test strategies
- [Deployment Guide](docs/DEPLOYMENT.md) — production deployment

## Contributing

Contributions welcome! Please read the [Development Guide](docs/DEVELOPMENT.md) first.

## License

MIT — see [LICENSE](LICENSE) for details.
