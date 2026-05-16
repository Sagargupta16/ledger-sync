---
name: new-page
description: Use when adding a new page to the frontend (anything that gets a route or a sidebar entry). Enforces the kebab-case-multi-file vs PascalCase-single-file convention, lazy loading via React.lazy in App.tsx, sidebar registration, and the use of PageHeader / AnalyticsTimeFilter / EmptyState primitives. Trigger when the user says "new page", "add a route", "create a /<something> page", or asks to surface a feature in the UI.
---

# Adding a frontend page to ledger-sync

## The single decision: multi-file or single-file?

- **<300 lines, no sub-components:** single file, PascalCase, directly in `pages/`. Examples: `DashboardPage.tsx`, `BudgetPage.tsx`, `TransactionsPage.tsx`.
- **>=300 lines OR has sub-components OR has a custom hook:** kebab-case directory. Examples: [pages/tax-planning/](frontend/src/pages/tax-planning/), [pages/comparison/](frontend/src/pages/comparison/), [pages/year-in-review/](frontend/src/pages/year-in-review/).

If you're not sure, start single-file. Promote to a directory when the file crosses 300 lines — don't pre-split.

## Multi-file layout

```
pages/<page-name>/
  <PageName>Page.tsx       # thin orchestrator (~100 lines): hook + layout
  use<PageName>.ts         # hook owning state + data fetching
  types.ts                 # local types (page-scoped)
  <page>Utils.ts           # pure helpers (testable)
  components/
    SubComponent.tsx       # 1 component per file
    AnotherSubComponent.tsx
```

The Settings page is the exception — it uses `sections/` instead of `components/` because "section" is the domain term. Don't carry that over to other pages.

## Steps

1. **Create the file(s)** following the structure above.

2. **Page shell** — every page starts with `PageHeader`:
   ```tsx
   import { PageHeader } from '@/components/ui'

   export default function MyPage() {
     return (
       <>
         <PageHeader title="My Page" subtitle="Optional" />
         {/* content */}
       </>
     )
   }
   ```
   `PageHeader` already bakes `env(safe-area-inset-top)` for iOS notch — don't reinvent.

3. **Time-filtered analytics?** Use [hooks/useAnalyticsTimeFilter.ts](frontend/src/hooks/useAnalyticsTimeFilter.ts) and the `AnalyticsTimeFilter` component. This gives you view-mode (YTD / FY / range), date range, and FY consistently across all analytics pages.

4. **Empty states** — use `EmptyState` from `@/components/shared`. Don't write inline "No data yet" divs.

5. **Charts** — wrap in `ChartContainer`, use Recharts, pull colors from [constants/colors.ts](frontend/src/constants/colors.ts) via `rawColors`. **Never raw hex.** Animations auto-disable above 500 points if you import `shouldAnimate` from `@/components/ui`.

6. **Tables** — use `DataTable` from [components/ui](frontend/src/components/ui/) for sortable + flat tables. Hand-roll `<table>` only for genuinely different shapes (expandable groups, pivoted rows-as-columns) — and in that case open an issue rather than copy-pasting boilerplate.

7. **Lazy-import in [App.tsx](frontend/src/App.tsx):**
   ```tsx
   const MyPage = lazy(() => import('@/pages/<my-page>/MyPage'))
   // OR
   const MyPage = lazy(() => import('@/pages/MyPage'))
   ```
   **Do NOT use a barrel index** at `pages/<my-page>/index.ts` — App.tsx imports the entry file directly.

8. **Add the route** in `App.tsx` inside `<Routes>`. Wrap in `<ProtectedRoute>` if auth is required (almost always yes).

9. **Sidebar entry** — find where existing pages are listed (usually in a sidebar config near `Sidebar.tsx`) and add yours. If the page is mobile-secondary, also add to `MorePage.tsx` (the phone grid launcher).

10. **Mobile** — phone viewports get the bottom-tab bar. The 4 primary tabs (Home / Txns / Flow / More) are in [MobileTabBar.tsx](frontend/src/components/layout/MobileTabBar.tsx). Don't add a 5th — extend `MorePage` instead.

## Hard rules

- **No `console.log`** committed (warn / error in error handlers only).
- **No `any`** in TypeScript. Use `unknown` and narrow.
- **Use `@/` alias**, never `../../`.
- **No `dark:` Tailwind prefixes** — single dark theme until issue #79 lands light mode.
- **No raw inline hex** (`#ff0000`). Use design tokens.
- **No `h-screen`** in layouts — use `h-dvh` so iOS address-bar toggle doesn't break the layout.

## When the page exposes new server data

You probably need a hook in [hooks/api/](frontend/src/hooks/api/) and a service in [services/api/](frontend/src/services/api/) — see the **new-data-hook** skill.

## Definition of done

- [ ] PascalCase single file OR kebab-case directory (correctly chosen)
- [ ] Lazy-imported in App.tsx, route registered, sidebar entry added
- [ ] `PageHeader` + design tokens + `ChartContainer` (if charts) + `EmptyState`
- [ ] Mobile: visible via `MorePage` if not in the 4 primary tabs
- [ ] No `any`, no `console.log`, no raw hex, no `dark:` prefix, no `h-screen`
- [ ] If new server data: matching hook + service (see new-data-hook skill)
