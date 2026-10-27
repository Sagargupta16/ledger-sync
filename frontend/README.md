# Ledger Sync Frontend

React 19 and TypeScript 7 application for the Ledger Sync personal finance workspace.

## Stack

- React 19
- TypeScript 7 (typescript-eslint keeps its own TypeScript 6 through `.pnpmfile.cjs`)
- Vite 8
- Tailwind CSS 4
- TanStack Query 5
- Zustand 5
- Motion 14 (`motion/react`)
- An in-house animated SVG chart kit (`src/components/charts/`), in place of a chart library
- Module Web Workers in `src/workers/`, which Vite bundles from `new Worker(new URL(...), { type: 'module' })` (the CSP allows `worker-src 'self'` and Workbox precaches the chunk). The FIRE Monte Carlo simulation runs in one, with a main-thread fallback
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

`src/App.tsx` defines 33 routed page components:

- 4 eager core pages: Home, Dashboard, Demo Entry, and OAuth Callback.
- 29 lazy workspace pages, each prefetched when an internal link to it is hovered, focused, or touched after authentication initializes.
- 3 public routes and 30 protected workspace routes.

The protected workspace is organized into:

```text
Top level
  Dashboard
  Overview
  Transactions

Analytics
  Expense Analysis
  Merchant Intelligence
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
  Budgets
  Financial Goals
  FIRE Calculator
  Anomaly Review
  Review Queue
  Data Health

Tax
  Income Tax
  Indirect Tax (GST)
  Foreign Assets
  AIS Import

Utility bar (below the groups)
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
- `motionStore`
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
5. The backend refreshes analytics as part of the upload. The frontend calls `/api/analytics/v2/refresh` only when the user retries a refresh that failed.
6. Query caches are invalidated so the workspace reloads current data.

The Upload page sends no multipart file and has no post-parse mapping screen. A Money Manager `.mmbak` backup is gzipped in the browser and posted to its own route, with a review of its repeat rules and budgets; the CAS PDF import on Investment Analytics is the one multipart upload. The Upload page shows an inline drop zone, progress states, conflict handling, read-only category suggestions for placeholder rows in the review, and a static expected-format example.

## AI Assistant

- The system prompt contains preferences, current date and fiscal-year context, and tool-use guidance.
- Financial data is fetched on demand through 15 read-only tools.
- OpenAI and Anthropic use browser-direct JSON requests.
- Bedrock uses the backend proxy.
- All provider adapters are non-streaming so tool calls can complete in bounded request rounds.
- App Bedrock mode works without a user key and runs Claude Haiku 5.5 by default. BYOK mode supports configured providers and usage limits.
- The Dashboard's Weekly recap Explain button sends one tool-free request through the same adapters (`services/api/weeklyRecap.ts`), with only the recap's figures.

## Themes and Responsive Behavior

- `themeStore` persists Light or Dark mode. New users start on the OS `prefers-color-scheme` value.
- `index.css` contains semantic color, surface, typography, chart, and control tokens.
- Chart chrome paints with the `--chart-*` CSS variables and series colors come from `rawColors` through `usePaletteSnapshot`, so a theme change repaints charts without a remount; route-local filters, tabs, searches, and forms remain mounted.
- Wide shared tables can switch to mobile cards below `sm`, with sortable tables exposing a compact mobile sort control.
- Primary phone controls target at least 44px.
- The service worker caches the application shell but excludes `/api/*`. It also handles `push` and `notificationclick` for opt-in alerts through `public/push-sw.js`, which the generated Workbox worker loads with `importScripts`.

## Tests

Current suite counts live in [docs/TESTING.md](../docs/TESTING.md).

Lint and test runs ignore `.claude/`. Local agent git worktrees are checked out there, and a second copy of this suite (or a second `tsconfig.json` root) otherwise inflates the test counts and fails `eslint .` across the whole tree. See `globalIgnores` in `eslint.config.js` and `exclude` in `vitest.config.ts`.

```bash
pnpm test
```

See [docs/TESTING.md](../docs/TESTING.md) and [docs/DEVELOPMENT.md](../docs/DEVELOPMENT.md).
