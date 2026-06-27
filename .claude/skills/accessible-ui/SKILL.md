---
description: Accessibility rules for ledger-sync UI — accessible names for icon-only controls, modal dialog semantics + focus, label/input association, color contrast, and color-as-only-signal. Auto-loads when editing frontend components/pages. Use when adding a button, modal, form input, icon control, or any interactive element.
user-invocable: false
paths:
  - "frontend/src/components/**/*.tsx"
  - "frontend/src/pages/**/*.tsx"
---

# Accessible UI

A static audit found accessibility was this app's biggest defect cluster (9 of 20 findings): icon-only buttons with no accessible name, modals missing dialog semantics, filter inputs not associated with labels, and low-contrast helper text. These are mostly one-attribute fixes — do them as you write, not in a later sweep.

## Every interactive element needs an accessible name

An icon-only button labelled only with `title` is invisible to screen readers and gives mobile users no tooltip at all. Add `aria-label` (keep `title` too if you want the desktop tooltip):

```tsx
<button onClick={signOut} title="Sign out" aria-label="Sign out">
  <LogOut size={18} />
</button>
```

Applies to: sidebar utility/logout buttons, CurrencySwitcher, chat send/textarea, any `<button>`/`<Link>` whose only child is an icon. Decorative icons that sit next to visible text need no label (the text is the name); mark them `aria-hidden` if anything.

For a dropdown trigger also add `aria-haspopup` + `aria-expanded={open}`.

## Modals: dialog semantics + focus + Escape

Per the ARIA Authoring Practices, a modal needs ALL of:

```tsx
<div
  role="dialog"            // or "alertdialog" for confirm/destructive
  aria-modal="true"
  aria-labelledby="x-title"   // points at the visible heading
  aria-describedby="x-desc"   // optional; omit for complex content
>
  <h3 id="x-title">…</h3>
  <p id="x-desc">…</p>
</div>
```

Plus behavior: **Escape closes**, focus **moves into** the dialog on open and **returns to the trigger** on close, and Tab is **trapped** inside. `ConfirmDialog` already does Escape + overlay-click close; `AuthModal`/`ProfileModal` carry the ARIA attrs. When the backdrop is a *separate* sibling element, mark it `aria-hidden="true"`. Only set `aria-modal` if the dialog truly blocks outside interaction — the APG warns marking a non-modal as modal is worse than not.

## Associate every input with a label

Either wire `htmlFor`/`id`, or give the control an `aria-label`. A placeholder is **not** a label — it vanishes the moment the user types (the create-goal form bug). Prefer a real visible label; use `aria-label` only for genuinely compact controls.

```tsx
<label htmlFor="filter-min-amount">Min Amount</label>
<input id="filter-min-amount" type="number" />
// or, compact:
<input type="text" placeholder="Goal name *" aria-label="Goal name" />
```

## Color contrast (WCAG 2.2 AA)

- Normal text ≥ **4.5:1** against its background.
- Large text (≥ 24px, or ≥ 18.5px bold) ≥ **3:1**.
- UI component boundaries / meaningful graphics ≥ **3:1** (1.4.11).

This app is dark-only. The dim grays bite: `--color-text-tertiary` was lifted to `#7c7c80` for readable helper text. Don't use `text-text-quaternary` (`#48484a`) for anything a user must read — it's for disabled/decorative only. When in doubt, step one tier lighter.

## Don't encode meaning in color alone

Income-green vs expense-red is fine as *reinforcement*, but never the *only* signal (1.4.1) — a red/green colorblind user can't tell them apart. Pair color with a sign (`+`/`-`), an icon (arrow up/down), or a label. Most amounts in this app already carry a sign; keep it that way.

## Quick checklist
- [ ] Icon-only control has `aria-label`.
- [ ] Modal: `role` + `aria-modal` + labelled + Escape + focus return.
- [ ] Input has `htmlFor`/`id` or `aria-label`; placeholder is not the label.
- [ ] Readable text clears 4.5:1 (3:1 for large/UI).
- [ ] Meaning isn't carried by color alone.
