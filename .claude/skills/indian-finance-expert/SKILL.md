---
description: Expert knowledge of Indian personal finance, tax law (ITR-relevant), savings instruments (PPF/EPF/NPS/SSY/SCSS), capital gains taxation, and the practical rules a chartered accountant or fee-only investment adviser would apply. Loads when Claude works on tax/investment/savings-rate features. Use when checking calculation correctness, explaining a number to the user, naming things in the domain vocabulary, or extending finance features without reinventing rules.
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

The "what every CA, fee-only adviser, and finance-aware engineer would know" reference, applied to *this codebase*.

This is **not legal/tax/investment advice for the user**. It is the body of knowledge required to compute things correctly inside the app. When recommendations land in the UI, they should be framed as "your data shows X" not "you should do Y".

## 1. Tax regimes — old vs new (FY 2025-26 perspective)

**New regime is now the default** (Finance Act 2023). Users who don't elect old regime get new automatically. Code defaults to new in `UserPreferences.preferred_tax_regime`.

| Concept | Old regime | New regime (FY 2025-26+) |
|---|---|---|
| Slab 0% | up to ₹2.5L | up to ₹4L |
| Slab 5% | ₹2.5L – ₹5L | ₹4L – ₹8L |
| Slab 10% | — | ₹8L – ₹12L |
| Slab 15% | — | ₹12L – ₹16L |
| Slab 20% | ₹5L – ₹10L | ₹16L – ₹20L |
| Slab 25% | — | ₹20L – ₹24L |
| Slab 30% | above ₹10L | above ₹24L |
| 87A rebate ceiling | ₹5L (rebate up to ₹12,500) | ₹12L (rebate up to ₹60,000) |
| Standard deduction (salaried) | ₹75,000 | ₹75,000 |
| 80C / 80D / HRA / 24(b) deductions | **YES** | **NO** (only standard deduction + 80CCD(2)) |
| Surcharge max | 37% (>5Cr) | 25% (>2Cr) |

**Choose-which-regime rule of thumb** (encoded for the planner UI):
- Income < ~7.5L: new regime almost always wins
- Income 7.5L – 15L: depends on deductions; if 80C+80D+HRA+24(b) > ~3.5L, old wins
- Income > 15L: usually new (deductions can't catch up unless very large home loan + HRA + ELSS)
- Income > 5Cr: new regime wins because of 25% vs 37% surcharge cap

The app's regime comparator computes both and shows the difference; don't hardcode a recommendation.

## 2. Section reference (the deductions users care about)

Old regime allows; new regime allows only the starred ones.

| Section | What | Limit | Notes |
|---|---|---|---|
| **80C** | LIC, EPF, PPF, ELSS, NSC, SSY, principal of home loan, 5-yr FD, NPS Tier-I (employee) | ₹1.5L | One bucket — hits the cap fast |
| **80CCC** | Pension fund | within 80C | |
| **80CCD(1)** | NPS Tier-I (self) | within 80C OR up to 10% of salary | |
| **80CCD(1B)*** | NPS Tier-I additional | ₹50,000 | **OVER AND ABOVE** 80C — common miss |
| **80CCD(2)*** | NPS Tier-I (employer) | up to 14% of salary (govt) / 10% (private) | Allowed in BOTH regimes |
| **80D** | Health insurance premium | ₹25k self + ₹25k parents (₹50k each if senior) | |
| **80E** | Education loan interest | no cap | 8 years from start of repayment |
| **80EEA / 80EE** | Home loan interest, first-time buyer | ₹1.5L / ₹50k extra | Sunset rules apply |
| **80G** | Donations to approved charities | varies (50% / 100%, with/without limit) | Need 80G receipt |
| **80TTA / 80TTB*** | Savings interest / senior FD interest | ₹10k / ₹50k | TTB is for senior citizens only |
| **24(b)** | Home loan **interest** | ₹2L for self-occupied | Lossable from House Property income (capped −₹2L) |
| **HRA exemption** | Rent paid – 10% of salary; or actual HRA; or 50% (metro) / 40% (non-metro) of salary — whichever is least | — | Old regime only |
| **LTA** | Two trips per block of 4 years | — | Old regime only |

\* = also allowed in new regime.

## 3. Tax computation order (don't get this wrong)

```
Gross income
  − Standard deduction (₹75,000 if salaried)
  − Other deductions (old regime only)
= Taxable income (Total Income in ITR speak)

Apply slabs → Base tax

If taxable income > 50L:
  + Surcharge on base tax (10/15/25/37%)

If new regime ≤ ₹12L OR old regime ≤ ₹5L OR new FY24-25 ≤ ₹7L:
  − 87A rebate (full base tax up to cap)

= Tax after rebate

+ 4% Health & Education Cess (on tax after rebate + surcharge)

+ Professional tax flat (₹2,400/yr if salaried; varies by state)

= Total tax payable

− TDS already deducted
− Advance tax paid
= Self-assessment tax to pay
```

**Marginal relief:** if income just barely crosses 50L/1Cr/2Cr/5Cr surcharge thresholds, the surcharge is capped so the additional tax from the surcharge doesn't exceed the income above the threshold. Not currently encoded in the app — minor inaccuracy at exact threshold.

## 4. Capital gains taxation (the most-confused area)

**Two dimensions:** asset class (equity vs debt vs property) × holding period (short vs long).

### Equity (listed shares + equity MFs + equity-oriented hybrid MFs)

| Holding | Type | Tax (FY 2025-26) |
|---|---|---|
| ≤ 12 months | Short-Term Capital Gain (STCG) | **20%** flat (was 15% pre-Budget 2024) |
| > 12 months | Long-Term Capital Gain (LTCG) | **12.5%** (was 10% pre-Budget 2024); first ₹1.25L per FY exempt |

Section: **111A** for STCG, **112A** for LTCG.

### Debt MFs purchased ≥ 2023-04-01

**No LTCG benefit anymore** (Finance Act 2023). All gains taxed at slab rate, regardless of holding. Section **50AA**.

### Debt MFs purchased < 2023-04-01

Indexation benefit grandfathered. STCG at slab; LTCG at 20% with indexation if held > 36 months.

### Property / unlisted shares

| Holding | Tax |
|---|---|
| ≤ 24 months | STCG at slab rate |
| > 24 months | LTCG: **12.5% without indexation** OR **20% with indexation** (taxpayer's choice for property bought before 2024-07-23 only; otherwise no indexation) |

### Gold (physical / digital / SGB)

- Physical/digital: same as debt — slab if ≤ 24 mo, 12.5% (no indexation) if > 24 mo
- **Sovereign Gold Bonds (SGB)**: held to maturity (8 years) → fully exempt. Sold on exchange before maturity → equity-style 12.5% LTCG.

### Set-off rules (often missed)

- STCL can offset STCG and LTCG
- LTCL can offset only LTCG (NOT STCG)
- Unabsorbed losses carry forward 8 years (need ITR filed by due date)
- Losses from speculation (intra-day equity) can only set off speculation income

**This codebase does not compute capital gains today.** Aggregate inflow/outflow per investment account is tracked. Per-lot accounting would need ISIN-level data (bank statements don't have it).

## 5. Savings instruments — the canonical Indian set

### PPF (Public Provident Fund)

- Lock-in: **15 years** (extendable in 5-year blocks indefinitely)
- Annual contribution: **min ₹500, max ₹1.5L** (per individual, including HUF in name; not family pool)
- Interest: notified quarterly by Ministry of Finance (DEA), **currently 7.1%** (effective until 2026-06-30 per `instrument_rates.json`)
- Tax status: **EEE** — Exempt at contribution (80C), Exempt at growth, Exempt at maturity
- Partial withdrawal allowed from year 7
- **Open at any post office or designated bank**

Common miss: spouse + each minor child can each have a PPF; contributions count toward each individual's ₹1.5L cap, not collective.

### EPF (Employees' Provident Fund)

- Mandatory for salaried in firms with ≥20 employees
- Employee contribution: **12% of basic salary**
- Employer contribution: **12% of basic** (split: 3.67% to EPF, 8.33% to EPS)
- Wage ceiling for mandatory contribution: ₹15,000/month (so min EPF = 12% × ₹15k = ₹1,800/month). Above this, voluntary.
- **VPF (Voluntary PF)**: top up to total 12 + N% (employee can voluntarily add up to ~88% more); same EPF rate
- Interest: notified yearly by EPFO, **currently 8.25%** (FY 2024-25)
- Tax status: **EEE up to ₹2.5L/year contribution.** Above ₹2.5L, **interest** is taxable at slab (Finance Act 2021 cap; ₹5L if no employer contribution)
- Withdrawal: tax-free if 5+ years of continuous service; TDS otherwise

### NPS (National Pension System)

- Tier-I: lock-in until age 60. Tier-II: liquid (treated like a debt MF).
- Contribution: no upper cap; tax benefits up to (₹1.5L 80CCD(1) within 80C) + ₹50k 80CCD(1B) standalone + employer 10% (private) / 14% (govt) under 80CCD(2)
- Asset classes: E (equity, max 75% before age 50), C (corp bond), G (govt bond), A (alternative; small ceiling)
- Returns: market-linked. Historical averages encoded in `instrument_rates.json`: E 10%, C 8.5%, G 7.5%
- Maturity: at 60, **60% lump sum tax-free**, **40% mandatory annuity** (annuity income taxable at slab)
- **Common miss:** the 80CCD(1B) ₹50k is the only deduction (other than std + 80CCD(2)) allowed in new regime. Salaried users on new regime should max it.

### SSY (Sukanya Samriddhi Yojana)

- For girl child below age 10
- Lock-in until age 21 (or marriage after 18)
- Contribution: ₹250 min – ₹1.5L max per FY (counts under 80C)
- Interest: quarterly notified, currently ~8.2% (higher than PPF)
- Tax status: **EEE**

### SCSS (Senior Citizens' Savings Scheme)

- Age ≥ 60 (or 55 with VRS)
- Lock-in: 5 years (extendable by 3)
- Max ₹30L (raised from ₹15L in Budget 2023)
- Interest: paid quarterly, currently ~8.2%; **taxable at slab**
- 80C eligible up to ₹1.5L

### NSC (National Savings Certificate)

- 5-year lock-in
- Currently ~7.7%
- Annual interest reinvested counts as 80C deduction (years 1-4)
- Maturity interest: taxable at slab

### Tax-saving FDs

- 5-year lock-in
- Rate: bank-determined (typically 6.5–7.5%)
- 80C up to ₹1.5L
- Interest: taxable at slab
- **Worse than PPF in EEE comparison** unless you really need bank deposit insurance

## 6. ITR forms (which one applies)

| Form | Who |
|---|---|
| ITR-1 (Sahaj) | Resident, salary + 1 house property + interest, total ≤ ₹50L, no capital gains |
| ITR-2 | Capital gains, foreign income/assets, more than 1 house property, agricultural income > ₹5k |
| ITR-3 | Business / professional income (presumptive or full books) |
| ITR-4 (Sugam) | Presumptive 44AD/44ADA/44AE small business/professional, total ≤ ₹50L |
| ITR-5/6/7 | Firms / companies / trusts |

Most ledger-sync users are ITR-1 or ITR-2. The app helps with **input numbers** for ITR; it doesn't file.

## 7. Advance tax & TDS

**Advance tax** is required if total tax liability − TDS > ₹10,000/year (Sec 208).

Schedule (Sec 211):
| Date | Cumulative |
|---|---|
| 15 June | 15% |
| 15 September | 45% |
| 15 December | 75% |
| 15 March | 100% |

Underpayment → interest under **Sec 234B** (1%/month from April after FY) and **Sec 234C** (1%/month for the missed installment).

The app's `Advance Tax Schedule` panel computes these dates from projected annual liability. UI auto-highlights deadlines within 30 days.

**TDS basics relevant to salaried users:**
- Salary: as per slab (TDS deducted by employer on Form 16)
- Bank interest: 10% above ₹40k/year (₹50k for seniors); declared on Form 26AS
- FD interest: 10% above ₹40k (each branch separately, often a tax leak)
- Dividends: 10% above ₹5k/year
- Capital gains: paid at the time of sale via broker for listed equity STCG/LTCG

## 8. Indian fiscal calendar — dates that matter

| Event | Date |
|---|---|
| FY start | April 1 |
| FY end | March 31 |
| Advance tax instalments | 15 Jun / 15 Sep / 15 Dec / 15 Mar |
| ITR due date (individuals, no audit) | **31 July** of the assessment year |
| Belated/revised ITR due | **31 December** of the assessment year |
| Updated return (ITR-U) | up to 24 months after AY end (with extra tax) |
| Form 16 issuance by employer | by 15 June |
| AIS / 26AS available on income-tax portal | continuous; reconcile before filing |

**Assessment Year (AY)** = next year. Income earned in FY 2024-25 is filed in **AY 2025-26**.

## 9. Real-world rules of thumb (the stuff a CA tells clients)

These show up in the app's insights and recommendations:

- **Emergency fund: 6 months of expenses** in a liquid instrument. App's `Financial Health Score` uses this.
- **50/30/20 rule** as a starting frame: 50% needs, 30% wants, 20% savings. India-tuned: many advisers push 50/20/30 (savings before discretionary). Encoded thresholds in [healthScoreUtils.ts](frontend/src/components/analytics/health/healthScoreUtils.ts).
- **Equity allocation = 100 − age** is a US heuristic. India: more aggressive (longer working life, lower social security). Many advisers go to age 60-65 before tapering equity.
- **Buy term insurance for protection, not bundled ULIPs.** App doesn't sell anything; never recommend a specific product.
- **Old regime is dead for most.** Budget 2023's 87A rebate at ₹7L (now ₹12L in FY25-26) made it the default winner for most salaried Indians.
- **Real returns > nominal.** With CPI ~5–6%, a 7.1% PPF return ≈ 1–2% real. The app's FIRE calculator uses 6% real / 12% nominal as defaults.
- **TDS ≠ final tax.** Users with multiple income sources almost always have a self-assessment top-up.
- **"Section 80C" is NOT a sentence.** It's "the section 80C deduction" — pedantic but the codebase tries to be precise here.

## 10. What this codebase computes that *resembles* CA work — and where it stops

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

## 11. Numbers worth memorizing (for sanity-checking)

- A salaried person at ₹15L gross, new regime, no extras: total tax ≈ ₹1,40,000–1,50,000
- Same at ₹25L: ≈ ₹4,30,000–4,50,000
- Same at ₹50L: ≈ ₹12,40,000–12,60,000 (no surcharge yet)
- Same at ₹1Cr: ≈ ₹28,50,000–29,00,000 (10% surcharge band)
- ₹1.5L PPF for 15 years at 7.1% → maturity ≈ ₹40.7L
- ₹5,000/month NPS at 10% blended for 30 years → corpus ≈ ₹1.13Cr (60% lump-sum tax-free)
- ₹12% EPF + ₹12% employer on ₹50k basic, 30 years at 8.25% → corpus ≈ ₹2.5Cr

If a calculation in the codebase is producing numbers wildly different from these for similar inputs, **stop and check**. It's almost certainly a bug (likely one of the seven failure modes in the **debug-finance** skill).

## 12. Voice when surfacing this knowledge to the user

- **Show, don't prescribe.** "Your data shows X" not "you should do Y".
- **Cite the section** when relevant ("Section 87A rebate caps your tax at zero because taxable income ≤ ₹12L").
- **Round sensibly.** ₹1,42,837 in code → "₹1.43 L" or "₹1,42,800" in UI. Don't expose pseudo-precision.
- **Rupees and lakhs/crores** — use Indian numbering (`1,23,456` not `123,456`) at display layer. `formatCurrency()` already handles this.
- **Don't translate.** "PPF", "EPF", "NPS", "Section 80C", "ITR-2" stay in their canonical form. Don't say "Indian retirement account". Don't say "tax form 2" for ITR-2.

## 13. When you don't know, say so

Indian tax law has edge cases this skill doesn't cover (HUF, PoA holders, NRIs, presumptive taxation, exempt agricultural income, REIT distributions, ESOP perquisite valuation, RSU vesting tax mechanics in cross-border context). When working on code that touches one, **flag the gap** rather than guessing. Tax law is one place where "I'm not sure" is far cheaper than "I confidently produced wrong code".

The user is an engineer who wants the math right. They will catch confidently-wrong tax math; they appreciate honest "I don't know about this edge case, can you confirm".
