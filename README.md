# Ledger Sync

A full-stack personal finance management application that processes Excel exports from Money Manager Pro and provides comprehensive financial insights through an interactive dashboard.

## Features

- 📊 Upload Excel files from Money Manager Pro
- 🔄 Automatic data reconciliation and synchronization
- 📈 Comprehensive financial analytics and insights
- 💳 Investment tracking, tax planning, and budget management
- 📉 Interactive charts and visualizations
- 🎯 Smart insights and recommendations

## Tech Stack

**Backend:** Python 3.11+ • FastAPI • SQLAlchemy • SQLite  
**Frontend:** React 19 • TypeScript • Vite • Tailwind CSS • Chart.js

## Quick Start

```powershell
# Install dependencies and start both backend and frontend
npm run dev
```

**Servers:**

- Backend: http://localhost:8000
- Frontend: http://localhost:3000
- API Docs: http://localhost:8000/docs

## Project Structure

```
ledger-sync/
├── backend/          # Python FastAPI backend
├── frontend/         # React + TypeScript frontend
└── docs/            # Documentation
```

See [backend/README.md](backend/README.md) and [frontend/README.md](frontend/README.md) for details.

## Setup

### Prerequisites

- Python 3.11+
- Node.js 18+
- npm

### Installation

```powershell
# Clone repository
git clone https://github.com/Sagargupta16/ledger-sync.git
cd ledger-sync

# Install all dependencies
npm install

# Setup backend
cd backend
pip install -r requirements.txt
alembic upgrade head
cd ..

# Setup frontend
cd frontend
npm install
cd ..
```

## License

MIT
