---
description: How to render TanStack Query data safely in ledger-sync — loading vs empty vs error states, and guarding against undefined/partial API data so a page never blanks or crashes. Auto-loads when editing frontend pages, hooks, or components. Use when adding a page/widget that reads a query, when a page renders blank/NaN, or when wiring an EmptyState.
user-invocable: false
paths:
  - "frontend/src/pages/**/*.tsx"
  - "frontend/src/pages/**/*.ts"
  - "frontend/src/hooks/**/*.ts"
  - "frontend/src/components/**/*.tsx"
  - "frontend/src/services/api/**/*.ts"
---

# Query states — render data without blanking or crashing

This codebase has been bitten repeatedly by two bugs: pages that **crash** on undefined API data, and pages that **show a loading skeleton forever** for users with no data. Both are preventable with one discipline: handle the four states **loading → error → empty → success** in that order, and never read a nested field off data you haven't guarded.

Real incidents this skill encodes:
- SIP Projections white-screened on `rates.ppf.rate_pct` (data undefined).
- Settings rendered blank on `usage.limits.app_daily_messages` (partial payload).
- Year in Review showed `PageSkeleton` forever because `transactions.length === 0` was checked **without** an `isLoading` gate, and the query uses `staleTime: Infinity` (the empty array is cached, so the skeleton never resolves).

## The order is not optional

Always branch in this exact order. Skipping or reordering is the bug.

```tsx
const { data = [], isLoading, isError } = useThing()

if (isLoading) return <PageSkeleton />          // 1. still fetching
if (isError)   return <ErrorState onRetry={refetch} /> // 2. fetch failed
if (data.length === 0) return <EmptyState ... /> // 3. fetched, genuinely empty
return <RealContent data={data} />               // 4. success
```

Why the order matters: with `staleTime: Infinity` (this repo's default — see `lib/queryClient.ts`), a successful-but-empty result is cached permanently. If you check emptiness **before** loading, a fresh load that happens to be empty-so-far renders your empty state too early; and a genuinely-empty result that you route to `<PageSkeleton/>` (the Year-in-Review bug) spins forever. `isLoading` first, then empty.

`isLoading` vs `isPending`: in v5, `isLoading === isPending && isFetching`. Use **`isLoading`** for the "first fetch in flight, no data yet" spinner gate. `isPending` alone can be true while not fetching (e.g. a disabled query), which would hang the UI.

## Always default the destructure

A query's `data` is `undefined` until it resolves, on every error, and in demo mode where some queries 401/404. Default it at the destructure so `.length` / `.map` never throw:

```tsx
const { data: transactions = [] } = useTransactions()   // never undefined
const { data: prefs } = usePreferences()                 // object: guard reads with ?.
```

## Never read a nested field off unguarded data

This is the crash class. The fixes that shipped:

- **Hook/service normalizes the shape** (best — fixes every consumer at once):
  - `useInstrumentRates` deep-merges the response over `FALLBACK_RATES` so `.epf/.ppf/.nps` always exist.
  - `aiUsageService.get()` spreads `limits` over `DEFAULT_LIMITS` so `usage.limits.app_daily_messages` is always present.
- **Consumer guards** when you can't touch the source: `usage?.limits?.app_daily_messages ?? 10`, `goal.target_date ? new Date(goal.target_date) : null`.

Rule: if you write `a.b.c` where `a` came from a query, either the hook guarantees the shape or you write `a?.b?.c ?? fallback`. No exceptions — a single unguarded chain blanks the whole route.

## Empty states teach, they don't apologize

Use the shared `EmptyState` component (`components/shared/EmptyState.tsx`) — never raw text (the Investment Analytics page used to). Give it an icon, a title, a description that says what to do, and an action:

```tsx
<EmptyState
  icon={Flame}
  title="No transaction data yet"
  description="Upload your bank statements to see your annual review."
  actionLabel="Upload Data"
  actionHref="/upload"
  variant="card"
/>
```

For a single empty chart inside an otherwise-populated page, use `ChartEmptyState` (keeps the chart's height so the layout doesn't jump).

## After a mutation, invalidate — don't rely on staleTime

Because `staleTime: Infinity`, data will NOT refetch on its own. After a create/update/delete, call `queryClient.invalidateQueries({ queryKey: [...] })` for every affected key, or the UI shows stale numbers. (See `useChat`/upload flow for the pattern.)

## Checklist before you commit a data-driven view
- [ ] `isLoading` gate is first.
- [ ] `isError` handled (not silently blank).
- [ ] Genuinely-empty success routes to an `EmptyState`/`ChartEmptyState`, not a skeleton or `null`.
- [ ] `data` defaulted at the destructure; every nested read is guarded or shape-guaranteed by the hook.
- [ ] Mutations invalidate the right query keys.
