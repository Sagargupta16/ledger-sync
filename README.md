# Ledger Sync -- Your Personal Finance Dashboard

**See where every rupee goes.** Import your bank statements, get instant insights, and finally understand your money -- all from a single, self-hosted dashboard you actually own.

No subscriptions. No data harvesting. Just a focused set of analytics pages built from your own Excel exports, running on your own infrastructure.

![Version](https://img.shields.io/badge/version-2.9.0-green.svg)
![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Python](https://img.shields.io/badge/python-3.11+-blue.svg)
![React](https://img.shields.io/badge/react-19-blue.svg)
![TypeScript](https://img.shields.io/badge/typescript-5.9-blue.svg)

**Live:** [sagargupta.online/ledger-sync](https://sagargupta.online/ledger-sync/) | **Demo:** [Try it now](https://sagargupta.online/ledger-sync/demo) | **API:** [ledger-sync-api.vercel.app](https://ledger-sync-api.vercel.app/docs)

## Features

### AI Finance Chatbot (tool-calling, app or BYOK)

- **Chat with your financial data** -- floating widget in the bottom-right corner, ask any question about your spending, trends, tax, or goals
- **Two modes:**
  - **App mode (default)** -- zero setup, works immediately for every new user. Uses the server's shared Bedrock key, rate-limited to 10 messages/day (configurable via `LEDGER_SYNC_AI_DAILY_MESSAGE_LIMIT`)
  - **BYOK mode** -- paste your own OpenAI / Anthropic / AWS Bedrock key in Settings for unlimited use; your key is encrypted at rest with AES-256-GCM and per-user daily/monthly token caps are available
- **Tool calling (not context stuffing)** -- the bot has 15 read-only tools (`search_transactions`, `get_monthly_summary`, `get_net_worth`, `get_fy_summary`, `get_category_spending`, `list_recurring`, `list_goals`, `get_investment_holdings`, and more) and picks what to call based on your question. Works across OpenAI, Anthropic, and Bedrock with a shared tool schema
- **Latest models** -- OpenAI (O3, O4 Mini, GPT-4.1, GPT-4o), Anthropic (Claude Opus 4.7, Sonnet 4.6, Haiku 4.5), AWS Bedrock (same Claude models)
- **Usage tracking** -- every round-trip is logged (tokens in/out, estimated USD); today / month-to-date / all-time rollups visible in the chat widget badge
- **User-scoped** -- every tool is enforced at the FastAPI dependency level with `CurrentUser`; the LLM cannot see another user's data
- **Hidden in demo mode** -- chat widget only appears when you're logged in

### Demo Mode

- **Try before you sign up** - Click "Try Demo" on the landing page or visit `/demo` directly
- Explore the full dashboard with ~500 realistic sample transactions (Indian household model)
- All 23 pages render with pre-computed analytics data, zero backend calls
- Floating banner with quick sign-up and exit options
- Mutations (upload, settings, budgets, goals) are gracefully blocked with toast notifications

### Smart Upload & Sync

- Drag-and-drop Excel (.xlsx, .xls) and CSV uploads with beautiful hero UI
- Client-side parsing via SheetJS -- files never leave your browser, only structured data is sent to the server
- Browser-native SHA-256 hashing for intelligent duplicate detection
- Idempotent syncing -- re-upload anytime without duplicates
- Four-phase upload UX: Parsing (client) -> Processing (server) -> Uploading -> Computing Analytics
- Real-time toast notifications for upload status

### Spending Analysis

- **50/30/20 Budget Rule** - Track Needs (50%), Wants (30%), and Savings (20%)
- Category and subcategory breakdown with treemaps
- Year-over-year spending comparisons
- Recurring transaction detection

### Investment Portfolio

- **4 Investment Categories**: FD/Bonds, Mutual Funds, PPF/EPF, Stocks
- Track both inflows (investments) and outflows (redemptions)
- Net investment calculations per category
- Asset allocation visualization

### Cash Flow Visualization

- Interactive Sankey diagrams showing money flow
- Income to Expenses/Savings breakdown
- Monthly and yearly views

### Tax & Retirement Planning

- **India FY tax estimation** -- old vs new regime comparison, slab breakdown, surcharge, cess
- **Salary-based projections** -- input your CTC structure, RSU grants, and growth assumptions to project multi-year tax liability
- **FIRE Calculator** -- compute FIRE number, Coast FIRE, years to FIRE, and savings rate from your actual spending data; Lean / **Barista** / Standard / Fat FIRE variants with adjustable SWR, real return, retirement horizon, and part-time-income slider (for soft-landing planning)
- **Retirement corpus calculator** -- inflation-adjusted corpus, monthly SIP needed, lump-sum alternative, with projection chart

### Analytics & Insights

- Financial Health Score with 8 metrics across 4 pillars (Spend, Save, Borrow, Plan)
- Income vs Expense trends and forecasting
- Net Worth tracking across all accounts
- Anomaly detection and review
- Budget tracking and goals

### Multi-Currency Display

- **15 supported currencies** -- USD, EUR, GBP, JPY, CAD, AUD, CHF, SGD, AED, and more
- Live exchange rates from the European Central Bank (via frankfurter.app), cached 24 hours
- Quick-switch currency from the sidebar or set a default in Settings
- All amounts convert instantly across every page -- no reload needed
- Auto-derives number format, symbol, and symbol position from your currency choice

### Smart Defaults

- **Account classification** - Automatically categorizes accounts by keyword (EPF/PPF/MF/FD/Stocks to Investments, HDFC/SBI/ICICI to Bank Accounts, etc.)
- **Income classification** - Auto-assigns Salary/Freelance to Taxable, Dividends/Interest to Investment Returns, Cashbacks to Non-taxable
- **Investment mapping** - Auto-maps investment accounts to types (Groww MF to Mutual Funds, PPF Account to PPF/EPF, etc.)

## Tech Stack

| Layer            | Technology                                                                   |
| ---------------- | ---------------------------------------------------------------------------- |
| **Frontend**     | React 19, TypeScript 5.9, Vite 7, Tailwind CSS 4, Recharts 3, Framer Motion 12 |
| **Auth**         | OAuth 2.0 (Google, GitHub), JWT tokens (PyJWT)                              |
| **Backend**      | Python 3.11+, FastAPI, SQLAlchemy 2, Alembic                                |
| **Database**     | SQLite (dev), Neon PostgreSQL 17 (prod)                                      |
| **State**        | TanStack Query 5, Zustand 5                                                 |
| **Deployment**   | GitHub Pages (frontend), Vercel (backend), Neon (database)                   |
| **CI/CD**        | GitHub Actions (lint, type-check, build, deploy)                             |
| **Package Mgmt** | pnpm 10 (frontend), uv (backend)                                            |

## Architecture

### System Overview

<p align="center">
  <img src="docs/images/system-overview.svg" alt="System Architecture" width="100%"/>
</p>

### Upload & Sync Pipeline

<p align="center">
  <img src="docs/images/upload-pipeline.svg" alt="Upload Pipeline" width="100%"/>
</p>

### Authentication Flow

<p align="center">
  <img src="docs/images/auth-flow.svg" alt="Authentication Flow" width="100%"/>
</p>

### Backend Layer Architecture

<p align="center">
  <img src="docs/images/backend-layers.svg" alt="Backend Layers" width="100%"/>
</p>

<details>
<summary>View Mermaid source (for editing)</summary>

Diagrams generated from `.mmd` files in `docs/images/` using:

```bash
npx -y @mermaid-js/mermaid-cli -i docs/images/<name>.mmd -o docs/images/<name>.svg -b transparent
```

</details>

For detailed architecture docs, see [docs/architecture.md](docs/architecture.md).

## Quick Start

```bash
# Clone the repository
git clone https://github.com/Sagargupta16/ledger-sync.git
cd ledger-sync

# Install root dependencies
pnpm install

# Setup backend + frontend in parallel
pnpm run setup

# Start both servers
pnpm run dev
```

**Access the app:**

- Frontend: http://localhost:5173
- Backend API: http://localhost:8000
- API Docs: http://localhost:8000/docs

## Project Structure

```
ledger-sync/
├── backend/                # Python FastAPI backend
│   ├── src/ledger_sync/    # Main application
│   │   ├── api/            # REST endpoints
│   │   ├── core/           # Business logic (reconciler, sync, analytics)
│   │   ├── db/             # Database models & session
│   │   ├── ingest/         # Excel/CSV processing (CLI path; web uploads parsed client-side)
│   │   └── schemas/        # Pydantic request/response models
│   └── tests/              # pytest tests
├── frontend/               # React + TypeScript frontend
│   └── src/
│       ├── pages/          # 23 page components (split into subdirectories)
│       │   ├── settings/       # Settings sections (21 files, incl. SalaryStructureSection)
│       │   ├── goals/          # Goals sub-components (13 files)
│       │   ├── comparison/     # Comparison sub-components (13 files)
│       │   └── subscription-tracker/  # Subscription sub-components (3 files)
│       ├── components/     # UI & analytics components (60+)
│       ├── hooks/          # React Query hooks & custom hooks
│       ├── constants/      # Colors, chart tokens, animations, column mappings
│       ├── store/          # Zustand global stores
│       ├── services/       # API client (Axios)
│       ├── lib/            # Utility functions (file parser, formatters, tax/projection calculators)
│       │   └── demo/          # Demo mode (data generators, cache seeder)
│       └── types/          # Shared TypeScript types
├── .github/workflows/      # CI pipeline
└── CHANGELOG.md            # Version history
```

## Pages

Every page focuses on a specific question you'd ask about your money. A one-line summary is below; for the **detailed data catalog** -- what each page shows, where the numbers come from, and what decisions it helps you make -- see **[docs/PAGES.md](docs/PAGES.md)**.

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

The app is deployed for free using three services:

| Service | Platform | Details |
|---------|----------|---------|
| Frontend | GitHub Pages | Auto-deploys on push via GitHub Actions |
| Backend | Vercel (serverless) | FastAPI via Mangum adapter, zero cold starts |
| Database | Neon PostgreSQL | Free tier, 0.5 GB, Singapore region (Vercel integration) |

See [Deployment Guide](docs/DEPLOYMENT.md) for full setup instructions.

## Authentication

Ledger Sync uses **OAuth 2.0** for authentication - no passwords to manage.

- **Google Sign-In** and **GitHub Sign-In** buttons on the login page
- Backend exchanges OAuth codes for user info, then issues JWT tokens
- OAuth providers are configurable via environment variables
- Buttons only appear for providers that are configured

### Setting Up OAuth (Local Dev)

1. Create OAuth apps at [Google Cloud Console](https://console.cloud.google.com/apis/credentials) and/or [GitHub Developer Settings](https://github.com/settings/developers)
2. Set redirect URIs to `http://localhost:5173/auth/callback/google` and `http://localhost:5173/auth/callback/github`
3. Add credentials to `backend/.env`:

```env
LEDGER_SYNC_GOOGLE_CLIENT_ID=your-google-client-id
LEDGER_SYNC_GOOGLE_CLIENT_SECRET=your-google-secret
LEDGER_SYNC_GITHUB_CLIENT_ID=your-github-client-id
LEDGER_SYNC_GITHUB_CLIENT_SECRET=your-github-secret
LEDGER_SYNC_FRONTEND_URL=http://localhost:5173
```

## Configuration

### Backend Environment (`backend/.env`)

```env
LEDGER_SYNC_DATABASE_URL=sqlite:///./ledger_sync.db    # Local dev (SQLite)
LEDGER_SYNC_ENVIRONMENT=development                     # development | production
LEDGER_SYNC_GOOGLE_CLIENT_ID=...                        # OAuth (optional)
LEDGER_SYNC_GOOGLE_CLIENT_SECRET=...
LEDGER_SYNC_GITHUB_CLIENT_ID=...
LEDGER_SYNC_GITHUB_CLIENT_SECRET=...
LEDGER_SYNC_FRONTEND_URL=http://localhost:5173          # OAuth redirect base URL
```

### Frontend Environment

```env
VITE_API_BASE_URL=http://localhost:8000                # Set in GitHub Actions variable for production
```

## Documentation

- [Changelog](CHANGELOG.md) - Version history with granular release notes
- [Architecture](docs/architecture.md) - System design and data flow
- [Calculations & Data Processing](docs/CALCULATIONS.md) - How every metric, chart, and derived number is computed
- [API Reference](docs/API.md) - REST endpoint documentation
- [Database Schema](docs/DATABASE.md) - Models and migrations
- [Development Guide](docs/DEVELOPMENT.md) - Setup and workflow
- [Testing Guide](docs/TESTING.md) - Test strategies
- [Deployment Guide](docs/DEPLOYMENT.md) - Production deployment

## Contributing

Contributions are welcome! Please read the [Development Guide](docs/DEVELOPMENT.md) first.

## License

MIT License - see [LICENSE](LICENSE) for details.
