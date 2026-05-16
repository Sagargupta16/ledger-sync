---
description: Background knowledge of the ledger-sync frontend layout, page conventions, design system, and state model. Loads automatically when Claude reads or edits any frontend file. Use when navigating frontend/src/, deciding where new code lives, picking the right state mechanism, or understanding why a component is structured the way it is.
user-invocable: false
paths:
  - "frontend/**/*.ts"
  - "frontend/**/*.tsx"
  - "frontend/package.json"
  - "frontend/vite.config.ts"
  - "frontend/tailwind.config.*"
---

# Frontend atlas

React 19 + TypeScript 5.9 + Vite 7 + Tailwind 4 SPA, deployed to GitHub Pages at `sagargupta.online/ledger-sync/`. PWA-installable. Dark theme only (light theme is issue #79, not landed).

## Tree map (frontend/src/)

```
main.tsx           Mount point; suppresses harmless 3rd-party warnings
App.tsx            Routes, lazy imports, ProtectedRoute, OAuth callback
index.css          Tailwind layer + CSS custom properties (design tokens)
pages/             26 page components — see Pages convention below
components/        Organized by domain
  ├── analytics/   30+ chart/widget components, Recharts-heavy
  ├── chat/        ChatWidget, ChatPanel, ChatMessage, useChat hook
  ├── layout/      AppLayout, Sidebar, MobileTabBar (4-tab phone nav)
  ├── shared/      MetricCard, EmptyState, AuthModal, ProtectedRoute, …
  ├── transactions/  Filters, Table, Pagination
  ├── upload/      DropZone, UploadResults, AccountClassifier
  └── ui/          Primitives: Button, Card, ChartContainer, DataTable, PageHeader, …
hooks/             Custom React hooks
  ├── useAnalyticsTimeFilter.ts    Time filter state (view mode, range, FY)
  ├── useChartDimensions.ts
  └── api/                         TanStack Query wrappers (one per domain)
services/api/      Axios-based API clients
  ├── client.ts    Shared instance with JWT interceptor + 401-refresh mutex
  ├── auth.ts, transactions.ts, analytics.ts, analyticsV2.ts, …
  └── (one file per backend resource)
store/             Zustand stores
  ├── authStore.ts            Tokens, persist middleware
  ├── preferencesStore.ts     User settings, exchange rate cache
  ├── accountStore.ts
  ├── budgetStore.ts
  └── investmentAccountStore.ts
lib/               Pure functions — heavily tested
  ├── taxCalculator.ts + tax-config/   India tax with per-FY config
  ├── projectionCalculator.ts          Multi-year salary + RSU projection
  ├── fireCalculator.ts                FIRE / Coast / Lean / Barista / Fat
  ├── xirr.ts                          Money-weighted return
  ├── fileParser.ts                    SheetJS + crypto.subtle SHA-256
  ├── chatAdapters.ts                  OpenAI/Anthropic/Bedrock unified shape
  ├── chatContext.ts                   Builds compressed financial prompt
  ├── chatTools.ts                     Tool exec proxy
  ├── formatters.ts                    Currency/percent
  └── (gst, elasticity, lifestyleCreep, momentum, ageOfMoney, advanceTax)Calculator
constants/         Design tokens, classifiers
  ├── colors.ts            CSS-var-resolved + raw hex fallback
  ├── chartColors.ts
  ├── animations.ts        Framer Motion timings
  ├── columns.ts           Excel column mapping
  └── accountTypes.ts      Priority-ordered classifier (rewritten in 2.10.0)
types/             Shared TS interfaces (manually mirrored from backend Pydantic)
test/              vitest setup
```

## Pages convention (the single decision)

- **Single file, PascalCase, in `pages/`** when the page is <300 lines and has no sub-components. Examples: `DashboardPage.tsx`, `BudgetPage.tsx`, `TransactionsPage.tsx`, `MorePage.tsx`.
- **Kebab-case directory** when ≥300 lines OR has sub-components OR has a custom hook. Examples: [pages/tax-planning/](frontend/src/pages/tax-planning/), [pages/comparison/](frontend/src/pages/comparison/), [pages/year-in-review/](frontend/src/pages/year-in-review/).

Multi-file structure:
```
pages/<page-name>/
  <PageName>Page.tsx       Thin orchestrator (~100 lines)
  use<PageName>.ts         Hook owning state + data fetching
  types.ts                 Page-local types
  <page>Utils.ts           Pure helpers
  components/              1 component per file
```
Settings page is the exception — uses `sections/` instead of `components/` because "section" is the domain term. Don't carry that to other pages.

If you're unsure, start single-file and promote when the file crosses 300. Don't pre-split.

## State management decision matrix

| Use case | Tool | Why |
|---|---|---|
| Auth tokens persisted across reload | **Zustand + persist middleware** | localStorage rehydration; selectors avoid re-renders |
| User preferences, exchange rate cache | **Zustand** | Synchronous reads anywhere |
| Server data | **TanStack Query** with `staleTime: Infinity`, `gcTime: 1h` | Financial data only changes on upload |
| Page-local filters (date range, category) | **URL params** | Bookmarkable, shareable |
| Transient UI state (modal open, hover) | `useState` | No need to share |

`staleTime: Infinity` is deliberate — refreshing the dashboard shouldn't trigger refetches. Cache is invalidated explicitly on upload success.

## Design system invariants

- **All colors via CSS custom properties** in `index.css` (e.g. `var(--color-income)`, `var(--color-expense)`). **No raw hex anywhere** in components — always `rawColors.app.green` or similar. Linter doesn't catch this; convention does.
- **Charts wrap in `ChartContainer`** from `@/components/ui`. Recharts under the hood. Animations auto-disable above 500 points via `shouldAnimate`.
- **`PageHeader` for page titles** — already bakes `env(safe-area-inset-top)` for iOS notch. Don't reinvent.
- **`MetricCard` for KPIs**, `EmptyState` for no-data, `DataTable` for sortable flat tables, `ConfirmDialog` for destructive ops.
- **Dark theme only** — don't add `dark:` Tailwind prefixes; light theme is tracked as #79.
- **`h-dvh` not `h-screen`** in layouts — viewport height tracks iOS address-bar toggle.

## Mobile

- **`MobileTabBar.tsx`** — 4-tab fixed bottom nav (Home / Txns / Flow / More) below `lg` breakpoint
- **`MorePage.tsx`** — phone-only grid launcher for the other 22 pages
- Don't add a 5th tab to `MobileTabBar`; extend `MorePage` instead

## TypeScript invariants

- **No `any`.** Use `unknown` and narrow.
- **No `console.log`** in committed code (warn/error in error handlers only)
- **`@/` import alias** maps to `frontend/src/`. Never relative `../../`.

## Testing pattern

`vitest` + jsdom. **Test pure functions and hooks; render-only component tests are noise.** 12 test files cover taxCalculator, xirr, fireCalculator, projectionCalculator, fileParser, accountTypes, taxConfig, formatters, chatAdapters, plus DataTable, useAnalyticsTimeFilter, netWorthProjection. Add tests for new pure logic; skip tests for new visual components unless they have non-trivial interaction logic.

## Hard rules summary

1. **No `any`**, no raw hex, no `console.log`, no `dark:` prefix, no `h-screen`, no relative `../` imports
2. **No barrel `index.ts`** at page level — `App.tsx` lazy-imports the page entry directly
3. **Don't `axios.get()` directly** in components — go through `services/api/<resource>.ts`
4. **`staleTime: Infinity`** on TanStack Query unless you have a written reason to override

## Where things live (cheat sheet)

| Need to... | File |
|---|---|
| Add a page/route | Use new-page skill |
| Wire a new backend endpoint | Use new-data-hook skill |
| Add a chart | `components/analytics/<Name>.tsx`, wrap in `ChartContainer` |
| Add design token | CSS var in `index.css` + accessor in `constants/colors.ts` |
| Add tax/finance pure function | `lib/<name>.ts` + `lib/__tests__/<name>.test.ts` |
| Add Zustand store | `store/<name>Store.ts` — only for genuinely global state |
| Update column mapping for uploads | `constants/columns.ts` |
| Add an AI provider | Extend `lib/chatAdapters.ts` with a unified message shape |

## Detailed reference

- Page convention details + scaffolding: **new-page** skill
- TanStack Query patterns + V1 vs V2 picker: **new-data-hook** skill
- End-to-end data flows: **data-flow-atlas** skill
- Domain knowledge (Indian FY, currency): **domain-atlas** skill
- Component-level pre-existing examples: just `grep` — the codebase is consistent enough that finding a similar one and copying is faster than skill-driven scaffolding for visual components.
