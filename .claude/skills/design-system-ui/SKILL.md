---
description: ledger-sync design-system rules — use CSS design tokens (not hardcoded colors), Tailwind 4 conventions, mobile-first responsive + 44px touch targets, h-dvh not h-screen, and banned AI-slop patterns (side-stripe borders, gradient text, dark-mode prefixes). Auto-loads when editing frontend components, pages, or styles. Use when styling anything, building a layout, or reviewing visual consistency.
user-invocable: false
paths:
  - "frontend/src/**/*.tsx"
  - "frontend/src/**/*.css"
---

# Design system & styling

Dark-theme-only, iOS-inspired OLED palette, hairline borders. Tailwind 4 with design tokens defined in `index.css`. These rules keep new UI consistent with the existing 25 pages and avoid the generic-AI look.

## Colors: tokens only, never raw hex/named Tailwind colors

Use the semantic CSS custom properties / `app-*` utilities, not `text-green-400`, `#8884d8`, or `rgb(...)`:

- Financial semantics: income = `app-green`, expense = `app-red`, savings = `app-purple`, transfer = `app-teal`, investment = `app-blue`.
- Text tiers: `text-text-primary` / `secondary` / `tertiary` (`#7c7c80`, contrast-safe) / `quaternary` (disabled/decorative only).
- In Tailwind classes use the token utilities (`text-app-green`, `bg-app-red/10`). In JS that needs a resolved string (Recharts `fill`, framer `animate`), use `rawColors.app.*` from `constants/colors.ts`.

Hardcoded `green-400`/`red-400` drifted from the palette in CashFlowForecast/TaxSummaryCards — a real finding. Tailwind 4 generates `app-*` utilities from `@theme`/token vars, so the utility always matches the token.

## Spacing, radius, shadows: follow the scale

Use the spacing scale (`p-4`, `gap-6`) not arbitrary `p-[13px]`. Card frame is `glass rounded-2xl border border-border`; don't invent new radii/shadow combos per component. Don't nest cards in cards.

## Mobile-first + real touch targets

Most users are on phones. Tailwind is mobile-first: style unprefixed for mobile, layer `sm:`/`md:`/`lg:` for larger. `<lg` (<1024px) is the phone breakpoint that swaps the sidebar for the bottom `MobileTabBar`.

- Interactive controls need ≥ **44px** touch height on phone. Compact desktop pills (`py-1.5`, ~32px) must bump up on mobile (`py-2.5 sm:py-1.5`) — the time-filter pills were 32px everywhere; fixed to ~44px on phone.
- Grids must collapse: `grid-cols-2 md:grid-cols-4`, never a bare `grid-cols-4` that overflows phones.
- Wrap wide tables in `overflow-x-auto` (not `overflow-hidden`, which clips); long text gets `truncate`/`break-words`.

## Forbidden: h-screen, and the AI-slop tells

- **`h-screen` is banned in layout** — use `h-dvh` so height tracks the mobile address-bar toggle. (`AppLayout` uses `h-dvh`.)
- **No `dark:` prefixes** — the app is dark-only; `dark:` variants are dead code.
- **No gradient text** (`background-clip: text` + gradient) — solid color only; use weight/size for emphasis.
- **Side-stripe borders** (`border-l-4` colored accent) are an over-used AI tell. A few exist in this codebase; don't add more. Prefer a full hairline border, a leading icon, or a background tint. If you must match an existing striped card, match its width (4px) for consistency rather than introducing a third weight.
- No glassmorphism-everywhere, no decorative drop-shadowed rounded rectangles for their own sake.

## Sticky headers + safe areas

`PageHeader` is `sticky top-0` and bakes `env(safe-area-inset-*)` into its padding so titles clear the iOS notch. Its horizontal padding scales with the breakout margins so the title aligns with page content (don't override `paddingLeft` with a flat inline value — that caused a 16px title/content misalignment). In demo mode the fixed banner needs top clearance on phone (`<main>` gets `pt-14 sm:pt-0`).

## Motion (visible by default, respectful when asked)

ledger-sync uses framer-motion heavily and motion is **wanted** — fade-up reveals, hover lifts, stagger. Keep it. Two rules borrowed from the sibling kalchar repo make it polished without dulling anything:

- **Reduced-motion is handled at the library level**, not per-component: `<MotionConfig reducedMotion="user">` wraps the app, so motion stays full for everyone *except* users whose OS sets `prefers-reduced-motion: reduce` (vestibular/accessibility need). That's WCAG 2.3.3 with zero cost to normal viewing — don't hand-gate every animation.
- **Named motion tokens, no magic timings.** Reuse the variants in `constants/animations.ts` (`fadeUpItem`, `staggerContainer`, …) rather than inlining `duration: 0.37`. Animate compositor-friendly props (opacity/transform), never layout (width/top/height) — that janks.
- Desktop-only hover springs should gate on `@media (hover:hover) and (pointer:fine)` so phones don't pay for motion they can't trigger.

## Checklist
- [ ] Colors via tokens/`app-*` / `rawColors.*` — no hex or raw `green-400`.
- [ ] Spacing on-scale; standard `glass rounded-2xl border` card; no nested cards.
- [ ] Mobile-first; grids collapse; tables scroll; touch targets ≥44px on phone.
- [ ] `h-dvh` not `h-screen`; no `dark:`, no gradient text, no new side-stripes.
- [ ] Motion reuses animation tokens + transform/opacity only; reduced-motion left to the root `MotionConfig`.
