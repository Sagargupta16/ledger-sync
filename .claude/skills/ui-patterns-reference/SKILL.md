---
description: Cross-system UI/UX principles distilled from the canonical design systems everyone copies (shadcn/ui, Radix, Material 3, GitHub Primer, Tailwind/Refactoring UI, Nielsen heuristics, WAI-ARIA APG), tuned for a React 19 + Tailwind 4 financial dashboard. Auto-loads when editing frontend components/pages/styles. Use when designing a new view, judging visual hierarchy/polish, building tables/forms/dashboards, or deciding how tokens/components should be structured.
user-invocable: false
paths:
  - "frontend/src/**/*.tsx"
  - "frontend/src/**/*.css"
---

# UI patterns reference

Principles the most-copied design systems agree on, filtered to "does this help a dark, data-dense, React 19 + Tailwind 4 financial dashboard?" The 5 sibling skills (query-states, accessible-ui, recharts-viz, react-patterns, design-system-ui) are the *tactics*; this is the *why* behind them. Sources cited inline so claims are checkable, not vibes.

## Semantic token architecture (shadcn/ui, Primer, Material)

Every serious system themes via **semantic** CSS variables, not literal colors. shadcn's set is the reference: `background`/`foreground`, `card`/`card-foreground`, `primary`, `muted`/`muted-foreground`, `accent`, `destructive`, `border`, `input`, `ring`, plus `chart-1..5`. Components reference the role (`bg-card`, `text-muted-foreground`); changing one variable re-skins everything.

- ledger-sync already does this (`app-green`, `text-text-tertiary`, `--color-*`). Keep extending the token set rather than reaching for `text-red-400` — that drift was an 83-instance cleanup.
- Modern systems define color in **OKLCH** (perceptually uniform — equal lightness steps look equal). When adding/adjusting tokens, prefer OKLCH over hex/HSL.
- A **foreground paired with every background** is the invariant that guarantees contrast: never put text on a surface without a matching `*-foreground` token.

## Visual hierarchy (Refactoring UI — Schoger/Wathan)

The single highest-leverage skill. Establish hierarchy with **size, weight, and color**, not size alone:
- De-emphasize secondary text with a **lighter color or weight**, not just smaller size. Three weights/two colors usually beats five font sizes.
- Don't use grey text on colored backgrounds — drop the opacity of white text or hand-pick a tint of the bg instead.
- **Labels are a last resort.** "Total: ₹4,32,000" with the value bold and the label small/muted beats a rigid label-value table. Combine label into value where the format makes it obvious (₹, %, dates).
- Emphasize the primary action; make secondary actions quieter (ghost/outline), not equally loud.

## Spacing & layout (Refactoring UI, Material)

- **Start with too much whitespace, then remove.** Cramped reads as low-quality; generous spacing reads as premium (ledger-sync's OLED card style depends on this).
- Use a **spacing scale** (Tailwind's 4px base) — never arbitrary `13px`. Related elements close, unrelated elements far (proximity = grouping, a Gestalt principle Material formalizes).
- Responsive = **window-size classes**, not device guesses: compact (<600 ≈ phone) / medium / expanded. ledger-sync's `<lg` sidebar→tab-bar swap is exactly this.

## Depth without clutter (Refactoring UI)

- Prefer **shadow / different background / spacing** over borders to separate regions — too many hairlines read busy. ledger-sync's `glass` cards do this; reserve `border-border` for where a real edge is needed.
- Elevation is meaning: a raised surface (shadow) signals "above/interactive"; flat signals "inline." Don't drop-shadow everything — then nothing reads as elevated.

## Tables & data (WAI-ARIA APG, Primer)

- **Use a native `<table>`** whenever the data is static — it's accessible for free. Only reach for `role="grid"` when cells are interactive widgets (then it becomes one composite tab-stop instead of N). ledger-sync's `DataTable` is the right home for flat sortable tables.
- Sortable columns: put `aria-sort="ascending|descending|none"` on the `<th>` (columnheader), and the sort control must be keyboard-operable.
- Right-align numbers, use **tabular figures** (`tabular-nums`) so digits line up column-to-column — non-negotiable for money. Left-align text.
- Dense financial tables: zebra or hover row highlight aids scanning; keep row height tight but ≥ the 44px tap target on touch.

## Forms (Material, Nielsen #5 error prevention)

- Label every field (visible label preferred; placeholder is not a label — it vanishes on type). Mark required, validate inline, and **prevent** bad input (`min`, `type`, disabled submit) rather than only erroring after.
- Show pending/disabled state on submit so users don't double-submit. Confirm destructive actions (ledger-sync's `ConfirmDialog`).
- One clear primary action per form.

## Nielsen's 10 heuristics (the UX baseline)

The 1994 list that still governs: 1) **visibility of system status** (loading/empty/error states — see query-states), 2) match the real world (plain language, ₹/FY conventions), 3) **user control** (undo, cancel, escape), 4) consistency & standards, 5) **error prevention**, 6) recognition over recall (show options, don't make users remember), 7) flexibility (shortcuts — ⌘K palette), 8) **aesthetic & minimalist** (every extra element competes), 9) good error messages (plain, actionable), 10) help/docs. When a view feels "off," it usually violates one of these — name which.

## Motion & feel (Material, modern systems)

Animate **transform/opacity** (compositor-cheap), never layout (width/top — janks). Respect `prefers-reduced-motion` at the root (`MotionConfig reducedMotion="user"`). Motion should clarify state change (enter/exit, where a thing came from), not decorate.

## What NOT to copy from trend-chasing
Generic "AI dashboard" tells: rainbow gradient everything, glassmorphism on every surface, neon glows, busy mesh/particle backdrops, custom cursors, 6-color charts. The canonical systems are **restrained** — a tight palette, one accent, lots of neutral, hierarchy from type not decoration. ledger-sync's OLED-dark restraint already aligns; keep it.

## Sources
shadcn/ui docs (theming, CSS variables), WAI-ARIA Authoring Practices (table pattern), Nielsen Norman Group (10 usability heuristics), Refactoring UI (Schoger & Wathan), Material 3 foundations, GitHub Primer. Fetched 2026-06-27.
