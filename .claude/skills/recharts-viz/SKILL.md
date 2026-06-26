---
description: How to build charts in ledger-sync with Recharts 3 — ChartContainer + ResponsiveContainer, design-token colors, NaN/empty-data guards, tooltips, and accessibility. Auto-loads when editing analytics/chart components. Use when adding or fixing any chart, sparkline, or visualization.
user-invocable: false
paths:
  - "frontend/src/components/analytics/**/*.tsx"
  - "frontend/src/components/analytics/**/*.ts"
  - "frontend/src/components/ui/ChartContainer*.tsx"
---

# Recharts visualizations

The app has 30+ Recharts components. Consistency and a few guards keep them from rendering blank boxes or off-palette colors.

## Wrap charts the project way

Use the shared `ChartContainer` (`components/ui/`) for the card frame, and Recharts `ResponsiveContainer` for sizing. Never hardcode pixel width/height on the chart itself — `ResponsiveContainer width="100%"` plus a fixed `height` (or aspect ratio) is the rule, so charts reflow on mobile.

```tsx
<ChartContainer title="Net Worth Trend">
  <ResponsiveContainer width="100%" height={300}>
    <AreaChart data={data}>…</AreaChart>
  </ResponsiveContainer>
</ChartContainer>
```

## Colors come from tokens, not hex literals

Pull series colors from `constants/colors.ts` / `constants/chartColors.ts` (`rawColors.app.green`, etc.) and the financial semantics: income = green, expense = red, savings = purple, transfer = teal, investment = blue. Don't write `fill="#8884d8"` or `text-green-400` in a chart — it drifts from the rest of the app (a real finding in CashFlowForecast/TaxSummaryCards). Recharts needs a resolved color string, so use the `rawColors.*` JS values (not the CSS-var class) for `fill`/`stroke`.

## Guard the data BEFORE it reaches the chart

Recharts renders an empty/blank box for `[]`, and renders nothing useful for `NaN`/`Infinity` values — these look like "the chart is broken" to users.

- Empty: branch to `ChartEmptyState` (keeps height so layout doesn't jump):
  ```tsx
  {data.length === 0 ? <ChartEmptyState height={300} /> : <ResponsiveContainer>…</ResponsiveContainer>}
  ```
- NaN/Infinity: never feed raw division into a chart. Guard the denominator (`total > 0 ? x / total : 0`) and coerce with a real default, not `|| 0` on a value that could legitimately be 0. A single `NaN` y-value can drop a whole line/area.
- Strings-as-numbers: amounts that arrive as strings (Decimal serialized by the backend) must be `Number(v)`-coerced before charting, or the axis scale breaks.

## Tooltips

Format values through the app formatters (`formatCurrency`, `formatPercent`) inside a custom tooltip or the `formatter` prop — raw numbers (`1234.5`) in a finance app read as unfinished. Custom tooltip components must return `null` when `!active` (don't render an empty shell).

## Accessibility

Recharts 3 enables the keyboard `accessibilityLayer` by default — keep it on. Give the chart a `title`/`aria-label` describing what it shows so it isn't an unlabeled SVG to screen readers. Remember charts are non-text contrast (3:1) — don't rely on near-identical hues to distinguish series; the semantic palette already separates them.

## Checklist
- [ ] `ResponsiveContainer width="100%"` + fixed height (no hardcoded px width).
- [ ] Colors from `rawColors.*` / semantic palette, no hex literals.
- [ ] Empty data → `ChartEmptyState`; denominators guarded; string amounts coerced.
- [ ] Values formatted via app formatters in tooltips/labels.
- [ ] Chart has an accessible name; `accessibilityLayer` left on.
