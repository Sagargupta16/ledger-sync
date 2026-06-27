---
description: React 19.2 correctness patterns for ledger-sync — useEffectEvent for non-reactive effect logic, stable list keys, avoiding stale state/dates, lazy-load + Suspense, and the project's lint rules (no setState-in-effect, no index keys on reorderable lists). Auto-loads when editing frontend hooks/components/pages. Use when writing an effect, a list, a hook, or wiring a route.
user-invocable: false
paths:
  - "frontend/src/**/*.tsx"
  - "frontend/src/hooks/**/*.ts"
---

# React 19.2 patterns

The app is on React 19.2 with `eslint-plugin-react-hooks` v7 (flat config, strict). These are the patterns that keep the linter quiet AND the UI correct.

## useEffectEvent for non-reactive effect logic

When an effect must re-run on some deps but only *read* others without reacting, extract the non-reactive part into a `useEffectEvent` instead of a ref shim + `eslint-disable exhaustive-deps`. This is already used in `TransactionFilters` (debounced search reads the latest `filters`/`onFilterChange` without re-subscribing).

```tsx
const onApply = useEffectEvent((q: string) => {
  setFilters({ ...filters, query: q })   // reads latest filters, non-reactively
  onFilterChange({ ...filters, query: q })
})
useEffect(() => { onApply(debouncedQuery) }, [debouncedQuery]) // ✅ event NOT in deps
```

Rules (enforced): only call Effect Events **inside effects**, **never** list them in a dep array, **never** pass them to other components/hooks, and don't use them to silence a dependency that *should* re-run the effect. If a value should trigger re-sync, keep it a real dependency.

## List keys: stable id, never index on reorderable lists

Use a stable unique field (`item.id`, `item.name` when unique) as the key. An index key — or `${name}-${index}` — remounts rows when the list re-sorts/filters, flashing animations and stranding state on the wrong row (the AccountsTable re-sort bug). Index keys are only acceptable on a list that never reorders, filters, or has items inserted/removed.

```tsx
{rows.map((r) => <Row key={r.id} … />)}      // ✅
{rows.map((r, i) => <Row key={i} … />)}      // 🔴 on any sortable/filterable list
```

## Don't read stale captured values

`useMemo(() => new Date(), [])` freezes "now" at mount; a "Go to today" handler then navigates to the wrong day on a long-open tab (the bill-calendar bug). For a value that must be current at the moment of an action, read it fresh inside the handler (`const today = new Date()`), not from a mount-time memo. Same for any time/random value.

## No setState in effect / no setState during render

The v7 linter flags both (`react-hooks/set-state-in-effect`). To derive/seed state from props or query data, prefer the "adjust state during render" pattern with a guard, not an effect:

```tsx
const [synced, setSynced] = useState<number | null>(null)
if (prefs && !userInteracted && synced !== prefs.fyStartMonth) {
  setSynced(prefs.fyStartMonth)
  setCurrentFY(getCurrentFY(prefs.fyStartMonth))   // runs during render, no effect, no cascade
}
```

Don't read a ref's `.current` during render either (also flagged) — gate on state, not refs.

## Memo deps must list every value used

`useMemo`/`useCallback` whose callback reads a value not in its deps produces stale UI. Don't suppress `exhaustive-deps` to "fix" a re-render — either add the dep, wrap the offending value in `useEffectEvent` (effects only), or restructure. Suppression hides the bug.

## Lazy pages + Suspense

Every page is `React.lazy`-imported in `App.tsx` and wrapped in `Suspense`/`ChunkErrorBoundary`. New pages follow suit (lazy import, never eager). A crash inside a route is contained by the page-scoped `ErrorBoundary` in `AppLayout` (keyed on pathname) so the sidebar/nav survive — don't add a second app-level boundary around a page.

## Checklist
- [ ] Effect deps are honest; non-reactive reads use `useEffectEvent` (not in deps, effects only).
- [ ] List keys are stable ids, not index, on anything that reorders.
- [ ] "Current" values (now/today) read fresh in handlers, not mount-time memos.
- [ ] No setState in render/effect except the guarded adjust-during-render pattern.
- [ ] New pages are lazy-imported with Suspense.
