# Frontend - Ledger Sync

React + TypeScript financial dashboard with comprehensive analytics and visualizations.

## Features

- 📤 File upload with drag & drop
- 📊 Interactive charts and visualizations
- 💰 Financial KPIs and metrics
- 📈 Income/expense tracking
- 💳 Investment performance tracking
- 📋 Tax planning dashboard
- 🏠 Family & housing management
- 🍔 Lifestyle optimizer
- 🎯 Budget and goals management
- 📉 Advanced analytics and forecasting

## Tech Stack

- React 19 - UI framework
- TypeScript - Type safety
- Vite - Build tool
- Tailwind CSS - Styling
- Chart.js - Data visualization
- Zustand - State management
- React Router - Routing

## Quick Start

```powershell
# Install dependencies
npm install

# Start development server
npm run dev
```

Frontend will be available at http://localhost:3000

## Project Structure

```
frontend/
├── src/
│   ├── app/                  # Application shell
│   │   └── App.tsx          # Main app component
│   ├── pages/               # Page components
│   │   ├── OverviewPage/    # Dashboard overview
│   │   ├── IncomeExpensePage/ # Income/expense analysis
│   │   ├── CategoryAnalysisPage/ # Category breakdown
│   │   ├── TrendsForecastsPage/ # Trends & predictions
│   │   └── TransactionsPage/ # Transaction table
│   ├── features/            # Feature modules
│   │   ├── analytics/       # Investment, tax, housing
│   │   ├── budget/          # Budget & goals
│   │   ├── charts/          # Chart components
│   │   ├── kpi/            # KPI cards
│   │   └── transactions/    # Transaction components
│   ├── components/          # Shared components
│   │   ├── FileUpload.tsx   # File upload
│   │   └── ui/             # UI components
│   ├── hooks/              # Custom React hooks
│   ├── lib/                # Utilities
│   │   ├── analytics/      # Analytics calculations
│   │   ├── calculations/   # Financial calculations
│   │   └── formatters.ts   # Data formatting
│   ├── services/           # API services
│   │   └── api.ts          # Backend API client
│   ├── store/              # State management
│   └── types/              # TypeScript types
├── public/                 # Static assets
└── package.json           # Dependencies
```

## Available Scripts

```powershell
# Development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Lint code
npm run lint

# Format code
npm run format

# Type check
npm run type-check
```

## Features Overview

### Pages

1. **Overview** - Dashboard with KPIs, account balances, and insights
2. **Income & Expense** - Detailed income/expense analysis with charts
3. **Category Analysis** - Deep dive into spending categories
4. **Trends & Forecasts** - Historical trends and future predictions
5. **Patterns** - Recurring payments and advanced analytics
6. **Transactions** - Searchable transaction table
7. **Budget & Goals** - Budget tracking and goal management

### Special Features

- **Investment Tracker** - Stock performance, P&L, fees, insights
- **Tax Planning** - Income tax calculator with deductions
- **Family Manager** - Family expenses and HRA benefits
- **Lifestyle Optimizer** - Credit card rewards and spending patterns

## Configuration

Create `.env` file:

```env
VITE_API_URL=http://localhost:8000
```

## Development

### Adding New Charts

1. Create component in `src/features/charts/components/`
2. Import and use in relevant page
3. Add chart ref to `App.tsx` if needed

### Adding New API Calls

1. Add function to `src/services/api.ts`
2. Create custom hook in `src/hooks/` if needed
3. Use in components

### State Management

Global state is managed with Zustand:

- `src/store/transactionStore.ts` - Transaction data
- Component-level state with React hooks

## API Integration

Backend API base URL: `http://localhost:8000`

Main endpoints used:

- `/api/transactions` - Get transactions
- `/api/upload` - Upload Excel file
- `/api/analytics/*` - Analytics data
- `/api/calculations/*` - Financial calculations

## TypeScript

The frontend is fully typed with TypeScript. Main type definitions in:

- `src/types/index.ts` - Core types
- Component props - Inline interfaces

## Styling

- Tailwind CSS for utility-first styling
- Custom color scheme in `tailwind.config.js`
- Dark theme optimized

## License

MIT
