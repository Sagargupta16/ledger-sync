# Ledger Sync Frontend

React 19 and TypeScript 6 application for the Ledger Sync personal finance workspace.

## Stack

- React 19
- TypeScript 6
- Vite 8
- Tailwind CSS 4
- TanStack Query 5
- Zustand 5
- Recharts 3
- Framer Motion 12
- Vitest and Testing Library

## Run Locally

```bash
pnpm install
pnpm run dev
```

Other commands:

```bash
pnpm run lint
pnpm run type-check
pnpm test
pnpm run build
```

The dev server runs at `http://localhost:5173` and proxies `/api` to `http://localhost:8000`.

## Router and Pages

`src/App.tsx` defines 27 routed page components:

- 4 eager core pages: Home, Dashboard, Demo Entry, and OAuth Callback.
- 23 lazy workspace pages, prefetched during browser idle time.
- 3 public routes and 24 protected workspace routes.

The protected workspace is organized into:

```text
Core
  Dashboard
  Overview

Analytics
  Expense Analysis
  Income Analysis
  Cash Flow
  Comparison
  Year in Review

Wealth
  Net Worth
  Trends and Forecasts
  Investment Analytics
  Projections
  Returns Analysis

Commitments
  Recurring
  Bill Calendar

Planning
  Budget Rule
  Financial Goals
  FIRE Calculator
  Anomaly Review

Tax
  Income Tax
  Indirect Tax (GST)

Data
  Transactions
  Upload and Sync
  Settings

Mobile
  More
```

Multi-file pages use kebab-case directories with a page component, hook, helpers, types, and local components. Smaller pages remain single PascalCase files.

## Application Shell

- `AppLayout` owns the responsive workspace frame.
- `WorkspaceHeader` exposes the current page, search, notifications, and AI access.
- `Sidebar` groups desktop navigation by financial workflow.
- `MobileTabBar` exposes Dashboard, Transactions, Cash Flow, and More below `lg`.
- `MorePage` provides mobile access to every remaining route.
- `CommandPalette` handles workspace search.
- `ChatWidget` and `ChatPanel` provide the AI assistant.

Page bodies use shared `PageContainer` and `PageHeader` primitives. The global header handles safe-area placement; individual page headers remain in document flow.

## State and Data

### TanStack Query

Server state is cached with long stale times and invalidated after uploads or mutations. API hooks live in `src/hooks/api/`.

### Zustand

The stores in `src/store/` are:

- `authStore`
- `demoStore`
- `themeStore`
- `preferencesStore`
- `accountStore`
- `investmentAccountStore`
- `budgetStore`

### API client

`src/services/api/client.ts` attaches JWT access tokens, refreshes expired access tokens, blocks real mutations in demo mode, and uses `VITE_API_BASE_URL` only when configured.

## Upload Flow

1. `fileParser.ts` lazy-loads SheetJS and parses `.xlsx`, `.xls`, or `.csv`.
2. Flexible headers are mapped to the standard transaction shape.
3. The browser computes a SHA-256 file hash.
4. Validated rows are posted as JSON to `/api/upload`.
5. The frontend requests `/api/analytics/v2/refresh`.
6. Query caches are invalidated so the workspace reloads current data.

There is no multipart file upload and no post-parse mapping screen. The Upload page shows an inline drop zone, progress states, conflict handling, and a static expected-format example.

## AI Assistant

- The system prompt contains preferences, current date and fiscal-year context, and tool-use guidance.
- Financial data is fetched on demand through 15 read-only tools.
- OpenAI and Anthropic use browser-direct JSON requests.
- Bedrock uses the backend proxy.
- All provider adapters are non-streaming so tool calls can complete in bounded request rounds.
- App Bedrock mode works without a user key. BYOK mode supports configured providers and usage limits.

## Themes and Responsive Behavior

- `themeStore` persists Light, Dark, or System mode.
- `index.css` contains semantic color, surface, typography, chart, and control tokens.
- Charts resolve theme colors through `rawColors`.
- Wide shared tables can switch to mobile cards below `sm`.
- Primary phone controls target at least 44px.
- The service worker caches the application shell but excludes `/api/*`.

## Tests

The current frontend suite contains 287 tests in 23 files.

```bash
pnpm test
```

See [docs/TESTING.md](../docs/TESTING.md) and [docs/DEVELOPMENT.md](../docs/DEVELOPMENT.md).
