---
description: Expert knowledge of Indian personal finance, tax law (ITR-relevant), savings instruments (PPF/EPF/NPS/SSY/SCSS), capital gains taxation, and the practical rules a chartered accountant or fee-only investment adviser would apply. Loads when Claude works on tax/investment/savings-rate features. Triggers on phrasings like "tax slab", "80C deduction", "87A rebate", "capital gains", "LTCG", "STCG", "PPF rate", "EPF interest", "NPS tier", "ITR-1/2/3", "advance tax", "fiscal year", "old vs new regime", "section 24(b)", "HRA exemption", "FY 2024-25", "FY 2025-26". Use when checking calculation correctness, explaining a number to the user, naming things in the domain vocabulary, or extending finance features without reinventing rules.
user-invocable: false
paths:
  - "frontend/src/lib/tax*.ts"
  - "frontend/src/lib/tax-config/**"
  - "frontend/src/lib/projection*.ts"
  - "frontend/src/lib/fire*.ts"
  - "frontend/src/lib/instrumentCalculators.ts"
  - "frontend/src/lib/gst*.ts"
  - "frontend/src/lib/advanceTax*.ts"
  - "frontend/src/pages/tax-planning/**"
  - "frontend/src/pages/income-analysis/**"
  - "frontend/src/pages/returns-analysis/**"
  - "frontend/src/pages/mutual-fund-projection/**"
  - "frontend/src/pages/net-worth/**"
  - "frontend/src/pages/goals/**"
  - "backend/src/ledger_sync/config/instrument_rates.json"
  - "backend/src/ledger_sync/api/rates.py"
  - "backend/src/ledger_sync/core/analytics/fy_summaries.py"
---

# Indian personal finance — domain expert reference

The "what every CA, fee-only adviser, and finance-aware engineer would know" reference, applied to **this codebase**.

> **Not legal/tax/investment advice for the user.** This is the body of knowledge required to compute things correctly inside the app. When recommendations land in the UI, frame as "your data shows X" not "you should do Y".

## How to use this skill

The lookup-heavy data (sections, slabs, rebate ceilings, surcharge bands, capital-gains rates, instrument specs, ITR forms, tax dates, sanity-check numbers) lives in CSVs queried via a stdlib-only Python script. Narrative knowledge (computation order, real-world rules, voice, scope) is below.

### Quick lookups (run these instead of guessing from memory)

```bash
# Section reference: limits, regime applicability, common misses
python .claude/skills/indian-finance-expert/scripts/search.py --section "80CCD(1B)"
python .claude/skills/indian-finance-expert/scripts/search.py --section "HRA"

# Tax slabs for a specific FY + regime
python .claude/skills/indian-finance-expert/scripts/search.py --slabs --fy 2025 --regime new
python .claude/skills/indian-finance-expert/scripts/search.py --slabs --fy 2024 --regime old

# 87A rebate ceiling + amount
python .claude/skills/indian-finance-expert/scripts/search.py --rebate --fy 2025 --regime new

# Surcharge bands (>=50L, >=1Cr, >=2Cr, >=5Cr)
python .claude/skills/indian-finance-expert/scripts/search.py --surcharge --fy 2025 --regime new

# Capital gains: equity / debt MF (pre/post 2023) / property / SGB / gold
python .claude/skills/indian-finance-expert/scripts/search.py --capital-gains --asset listed_equity
python .claude/skills/indian-finance-expert/scripts/search.py --capital-gains          # all

# Savings instruments
python .claude/skills/indian-finance-expert/scripts/search.py --instrument PPF
python .claude/skills/indian-finance-expert/scripts/search.py --instrument NPS_Tier1

# ITR forms
python .claude/skills/indian-finance-expert/scripts/search.py --itr ITR-2
python .claude/skills/indian-finance-expert/scripts/search.py --itr               # all

# Indian tax-calendar dates (advance-tax, ITR due, TDS thresholds, 234B/C)
python .claude/skills/indian-finance-expert/scripts/search.py --dates
python .claude/skills/indian-finance-expert/scripts/search.py --dates --filter advance_tax

# Sanity-check numbers (what should a typical 25L salary owe?)
python .claude/skills/indian-finance-expert/scripts/search.py --sanity "25L"
```

Output is JSON. Each query returns one or more rows from the relevant CSV. **Run the lookup before claiming a number** — the LLM is wrong about Indian tax limits often enough that the rule is "if there's a CSV row for it, query".

### Data files (in `data/`)

| File | Rows | Use when... |
|---|---|---|
| `sections.csv` | 17 | Looking up Section 80C/80D/80CCD/24(b)/HRA/LTA/Standard-Deduction limits and regime applicability |
| `slabs.csv` | 27 | Reading FY-specific tax slab thresholds + rates |
| `rebate_87a.csv` | 6 | Looking up 87A rebate ceiling for a specific FY/regime |
| `surcharge.csv` | 7 | Looking up surcharge bands |
| `capital_gains.csv` | 12 | LTCG/STCG rates, holding-period thresholds, exemptions, sections (111A/112A/50AA) |
| `instruments.csv` | 10 | PPF/EPF/VPF/NPS-I/NPS-II/SSY/SCSS/NSC/Tax-FD/ELSS rates, lock-ins, tax status |
| `itr_forms.csv` | 7 | Picking ITR-1/2/3/4/5/6/7 for a given user profile |
| `dates.csv` | 15 | Advance-tax instalment dates, ITR due dates, TDS thresholds, 234B/C interest rates |
| `sanity_numbers.csv` | 7 | Cross-checking computed totals against memorized typical scenarios |

### Updating data (when rules change)

A new Budget or rate notification = edit the relevant CSV and bump the `effective_from` style fields. The **frontend tax-config module** ([frontend/src/lib/tax-config/](frontend/src/lib/tax-config/)) and the **backend instrument-rates JSON** ([backend/src/ledger_sync/config/instrument_rates.json](backend/src/ledger_sync/config/instrument_rates.json)) should stay in sync with these CSVs — they're consumers of the same facts. When you change one, grep for the other and update together.

## Tax computation order (the only narrative algorithm — keep here, not in CSV)

```
Gross income
  − Standard deduction (₹75,000 if salaried)
  − Other deductions (old regime only; query --section)
= Taxable income (Total Income in ITR speak)

Apply slabs (--slabs --fy --regime) → Base tax

If taxable income > 50L:
  + Surcharge on base tax (--surcharge --fy --regime)

If taxable income ≤ 87A ceiling for that regime/FY (--rebate --fy --regime):
  − 87A rebate (full base tax up to cap)

= Tax after rebate

+ 4% Health & Education Cess (on tax after rebate + surcharge)

+ Professional tax flat (₹2,400/yr if salaried; varies by state)

= Total tax payable

− TDS already deducted
− Advance tax paid
= Self-assessment tax to pay
```

**Marginal relief:** if income just barely crosses a surcharge threshold (50L/1Cr/2Cr/5Cr), the surcharge is capped so additional tax from the surcharge doesn't exceed the income above the threshold. Not currently encoded in the app — minor inaccuracy at exact threshold.

## Choose-which-regime rule of thumb (the planner UI uses these)

- Income < ~7.5L: new regime almost always wins
- Income 7.5L – 15L: depends on deductions; if 80C+80D+HRA+24(b) > ~3.5L, old wins
- Income > 15L: usually new (deductions can't catch up unless very large home loan + HRA + ELSS)
- Income > 5Cr: new regime wins because of 25% vs 37% surcharge cap

The app's regime comparator computes both and shows the difference. **Don't hardcode a recommendation.**

## Capital-gains set-off rules (often missed; not in CSV because they're predicates not values)

- STCL can offset STCG **and** LTCG
- LTCL can offset **only** LTCG (NOT STCG)
- Unabsorbed losses carry forward 8 years (need ITR filed by due date)
- Losses from speculation (intra-day equity) can only set off speculation income

**This codebase does not compute capital gains today.** Aggregate inflow/outflow per investment account is tracked. Per-lot accounting would need ISIN-level data (bank statements don't have it).

## Real-world rules of thumb (the stuff a CA tells clients)

These show up in the app's insights and recommendations. They're judgement, not law — keep here.

- **Emergency fund: 6 months of expenses** in a liquid instrument. App's `Financial Health Score` uses this.
- **50/30/20 rule** as a starting frame: 50% needs, 30% wants, 20% savings. India-tuned: many advisers push 50/20/30 (savings before discretionary). Encoded thresholds in [healthScoreUtils.ts](frontend/src/components/analytics/health/healthScoreUtils.ts).
- **Equity allocation = 100 − age** is a US heuristic. India: more aggressive (longer working life, lower social security). Many advisers go to age 60-65 before tapering equity.
- **Buy term insurance for protection, not bundled ULIPs.** App doesn't sell anything; never recommend a specific product.
- **Old regime is dead for most.** Budget 2023's 87A rebate at ₹7L (now ₹12L in FY25-26) made it the default winner for most salaried Indians.
- **Real returns > nominal.** With CPI ~5–6%, a 7.1% PPF return ≈ 1–2% real. The app's FIRE calculator uses 6% real / 12% nominal as defaults.
- **TDS ≠ final tax.** Users with multiple income sources almost always have a self-assessment top-up.
- **"Section 80C" is NOT a sentence.** It's "the section 80C deduction" — pedantic but the codebase tries to be precise here.

## Scope: what this codebase computes vs what it doesn't

| Doable in app | Not doable in app |
|---|---|
| FY income/expense aggregation from bank statements | E-filing ITR (need Income Tax portal) |
| Old-vs-new regime side-by-side estimate | Reading actual Form 16 / 26AS / AIS |
| Multi-year salary projection with growth + RSU vesting | True per-lot capital gains (need ISIN data) |
| FIRE / Coast / Lean / Barista / Fat scenarios | Goal-tagged investment portfolio (need positions, not flows) |
| Tax-saving deduction sliders for old regime | Validating 80G receipts |
| Advance tax schedule + 234B/C estimate | TDS reconciliation against 26AS |
| Net worth tracking via account balances | Real-time portfolio NAV (no broker integration) |
| GST on spending (rough estimate, lifestyle-scale) | GST filing |

## Voice when surfacing this knowledge to the user

- **Show, don't prescribe.** "Your data shows X" not "you should do Y".
- **Cite the section** when relevant ("Section 87A rebate caps your tax at zero because taxable income ≤ ₹12L").
- **Round sensibly.** ₹1,42,837 in code → "₹1.43 L" or "₹1,42,800" in UI. Don't expose pseudo-precision.
- **Rupees and lakhs/crores** — use Indian numbering (`1,23,456` not `123,456`) at display layer. `formatCurrency()` already handles this.
- **Don't translate.** "PPF", "EPF", "NPS", "Section 80C", "ITR-2" stay in their canonical form. Don't say "Indian retirement account". Don't say "tax form 2" for ITR-2.

## When you don't know, say so

Indian tax law has edge cases not in these CSVs (HUF, PoA holders, NRIs, presumptive taxation, exempt agricultural income, REIT distributions, ESOP perquisite valuation, RSU vesting tax mechanics in cross-border context). When working on code that touches one, **flag the gap** rather than guessing. Tax law is one place where "I'm not sure" is far cheaper than "I confidently produced wrong code".

The user is an engineer who wants the math right. They will catch confidently-wrong tax math; they appreciate honest "I don't know about this edge case, can you confirm".
