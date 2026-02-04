# 🏦 Ledger Sync

**Your personal finance command center** — Transform messy Excel exports into a beautiful, insightful financial dashboard.

Ledger Sync is a self-hosted personal finance application that syncs your transaction data from Excel files (exported from Money Manager Pro or similar apps) and provides comprehensive analytics for your financial life.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Python](https://img.shields.io/badge/python-3.11+-blue.svg)
![React](https://img.shields.io/badge/react-18-blue.svg)
![TypeScript](https://img.shields.io/badge/typescript-5.0-blue.svg)

## ✨ Features

### 📤 Smart Upload & Sync

- Drag-and-drop Excel uploads with beautiful hero UI
- Intelligent duplicate detection using SHA-256 hashing
- Idempotent syncing — re-upload anytime without duplicates
- Real-time toast notifications for upload status

### 📊 Spending Analysis

- **50/30/20 Budget Rule** — Track Needs (50%), Wants (30%), and Savings (20%)
- Category and subcategory breakdown with treemaps
- Year-over-year spending comparisons
- Recurring transaction detection

### 💼 Investment Portfolio

- **4 Investment Categories**: FD/Bonds, Mutual Funds, PPF/EPF, Stocks
- Track both inflows (investments) and outflows (redemptions)
- Net investment calculations per category
- Asset allocation visualization

### 💸 Cash Flow Visualization

- Interactive Sankey diagrams showing money flow
- Income → Expenses/Savings breakdown
- Monthly and yearly views

### 📈 Analytics & Insights

- Financial Health Score with 6 key metrics
- Income vs Expense trends and forecasting
- Tax planning for India FY (April-March)
- Net Worth tracking across all accounts

## 🛠️ Tech Stack

| Layer            | Technology                                                        |
| ---------------- | ----------------------------------------------------------------- |
| **Frontend**     | React 18, TypeScript, Vite, TailwindCSS, Recharts, TanStack Query |
| **Backend**      | Python 3.11+, FastAPI, SQLAlchemy, Alembic                        |
| **Database**     | SQLite (default), PostgreSQL ready                                |
| **Architecture** | Monorepo with pnpm workspaces                                     |

## 🚀 Quick Start

```bash
# Clone the repository
git clone https://github.com/Sagargupta16/ledger-sync.git
cd ledger-sync

# Install all dependencies
pnpm install

# Setup backend (one-time)
pnpm run setup

# Start both frontend and backend
pnpm run dev
```

**Access the app:**

- 🌐 Frontend: http://localhost:3000
- 🔧 Backend API: http://localhost:8000
- 📚 API Docs: http://localhost:8000/docs

## 📁 Project Structure

```
ledger-sync/
├── backend/              # Python FastAPI backend
│   ├── src/ledger_sync/  # Main application
│   │   ├── api/          # REST endpoints
│   │   ├── core/         # Business logic (reconciler, sync)
│   │   ├── db/           # Database models & session
│   │   └── ingest/       # Excel processing pipeline
│   └── tests/            # pytest tests
├── frontend/             # React + TypeScript frontend
│   └── src/
│       ├── pages/        # 13 page components
│       ├── components/   # UI & analytics components
│       ├── hooks/        # React Query hooks
│       └── services/     # API client
└── docs/                 # Documentation
```

## 📊 Pages & Features

| Page                       | Description                                    |
| -------------------------- | ---------------------------------------------- |
| **Dashboard**              | Overview with KPIs, charts, and quick insights |
| **Upload & Sync**          | Beautiful upload UI with sample format preview |
| **Transactions**           | Full transaction list with filters and search  |
| **Spending Analysis**      | 50/30/20 rule, category breakdown, trends      |
| **Income Analysis**        | Income sources, growth tracking                |
| **Cash Flow**              | Sankey diagram of money flow                   |
| **Investment Analytics**   | Portfolio across 4 categories                  |
| **Mutual Fund Projection** | SIP calculator and projections                 |
| **Tax Planning**           | India FY-based tax insights                    |
| **Net Worth**              | Complete financial picture                     |
| **Settings**               | Preferences, account mappings                  |

## 🔧 Configuration

### Backend Environment (`.env`)

```env
LEDGER_SYNC_DATABASE_URL=sqlite:///./ledger_sync.db
LEDGER_SYNC_LOG_LEVEL=INFO
```

### Frontend Environment (`.env`)

```env
VITE_API_URL=http://localhost:8000
```

## 📖 Documentation

- [Architecture](docs/architecture.md) — System design and data flow
- [API Reference](docs/API.md) — REST endpoint documentation
- [Database Schema](docs/DATABASE.md) — Models and migrations
- [Development Guide](docs/DEVELOPMENT.md) — Setup and workflow
- [Testing Guide](docs/TESTING.md) — Test strategies
- [Deployment Guide](docs/DEPLOYMENT.md) — Production deployment

## 🤝 Contributing

Contributions are welcome! Please read the [Development Guide](docs/DEVELOPMENT.md) first.

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

---

<p align="center">
  Made with ❤️ for personal finance enthusiasts
</p>
