---
description: Background knowledge of the financial-domain rules baked into ledger-sync — Indian fiscal year (April-March), multi-currency display contract, instrument rate sources of truth (EPF/PPF/NPS), category vocabulary, and account-classification semantics. Loads automatically when Claude works on tax, FY, currency, instrument, or classification code. Use when a calculation looks "off-by-one", when wondering why FY isn't calendar year, or when extending finance vocabulary.
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
  - "frontend/src/pages/spending-analysis/**"
  - "frontend/src/pages/year-in-review/**"
  - "frontend/src/pages/comparison/**"
  - "frontend/src/constants/accountTypes.ts"
  - "frontend/src/constants/currencies.ts"
  - "backend/src/ledger_sync/api/rates.py"
  - "backend/src/ledger_sync/api/exchange_rates.py"
  - "backend/src/ledger_sync/config/instrument_rates.json"
  - "backend/src/ledger_sync/core/analytics/fy_summaries.py"
  - "backend/src/ledger_sync/api/analytics*.py"
---

# Domain atlas — finance rules baked into ledger-sync

This codebase is **India-first**. Defaults assume Indian FY, INR base, Indian tax law. International users are a "good if it works" target, not a contract.

For deeper Indian tax / investment / CA-level domain knowledge, see the **indian-finance-expert** skill. This atlas covers the *codebase contract* — how the rules are encoded.

## Indian fiscal year (April-March)

**FY starts April 1, ends March 31** of the next calendar year. So "FY 2025-26" = April 2025 → March 2026.

| Calendar date | Belongs to FY |
|---|---|
| 2025-04-01 | FY 2025-26 |
| 2026-01-15 | FY 2025-26 (still!) |
| 2026-03-31 | FY 2025-26 |
| 2026-04-01 | FY 2026-27 |

**The off-by-one trap.** January 2026 is in FY **2025-26**, not "FY 2026". Code that does `date.year` directly is using calendar year, which is almost certainly wrong for any tax/FY analytics.

**Backend correct way:**
```python
fy_year = date.year if date.month >= fy_start_month else date.year - 1
# fy_start_month comes from UserPreferences (defaults to 4 = April)
```
See `core/analytics/fy_summaries.py` for canonical implementation. `core/analytics/base.py` exposes `fiscal_year_start_month` from preferences.

**Frontend correct way:** call `getFYFromDate()` or `parseFYStartYear()` from `lib/taxCalculator.ts`. Don't reimplement.

**FY label format:** `"FY 2025-26"` (space, hyphen, two-digit suffix). Sortable lexicographically. Don't write "FY25" or "2025-2026" — user-facing strings everywhere use the canonical form.

## Tax rules — data, not code

Tax slabs, surcharge bands, 87A rebate, standard deduction, cess rate, professional tax all live in [frontend/src/lib/tax-config/index.ts](frontend/src/lib/tax-config/index.ts) as **per-FY blocks** (2023-24, 2024-25, 2025-26+). `taxCalculator.ts` consumes them via `getTaxConfig(fyStartYear)`.

**When Budget YYYY drops:** add a new entry in `tax-config/index.ts` with the new slabs + `source` field referencing the Budget notification. The calculator code does not change. The lookup falls back newest-first for unknown future years and oldest-first for ancient years, so existing FYs always resolve correctly.

**Order of operations** (don't get this wrong, it changes the number):
1. Slab tax on (income − standard deduction)
2. Surcharge on **base tax** (NOT post-rebate)
3. 87A rebate caps tax (not surcharge) at zero if eligible
4. Cess on (tax-after-rebate + surcharge)
5. Add professional tax flat

For the actual rates and section reference, see the **indian-finance-expert** skill.

## Multi-currency

**Base is always INR.** Display can be one of 14 currencies (USD, EUR, GBP, JPY, CAD, AUD, CHF, SGD, AED, CNY, KRW, SEK, NZD, HKD).

**Storage rule:** transaction `amount` is always in the original transaction's currency (carried in the `currency` column, defaults to INR). Aggregation/analytics convert to display currency at the formatter layer, not in the database. **Never store converted amounts.** When the FX rate changes, all charts reflect the new rate immediately.

**FX source priority** (`api/exchange_rates.py`):
1. Live: frankfurter.dev (free, ECB-backed, no API key)
2. Stale-cache: previous successful fetch (24h cache)
3. Hardcoded fallback rates with `fallback_as_of` date — UI shows a stale-warning banner

**Frontend reading:** `useExchangeRate()` hook → `preferencesStore.exchangeRate` → `formatters.ts` for display. **Don't fetch FX in components; always go through the store.**

**Indian numbering on display.** `1,23,456` not `123,456`. `formatCurrency()` already handles this — don't reinvent.

## Instrument rates (EPF / PPF / NPS)

**Source of truth:** [backend/src/ledger_sync/config/instrument_rates.json](backend/src/ledger_sync/config/instrument_rates.json). Served via `GET /api/rates/instruments`.

**Why a JSON file, not an API:** there is no reliable public JSON API for Indian EPF/PPF rates. EPFO publishes EPF via PDF notification yearly. Ministry of Finance (DEA) publishes PPF quarterly via press release. NPS returns are user-tunable based on PFM choice. Updating a rate is a one-line PR.

**Update cadence:**
- EPF: yearly (FY rate notified ~April–May for previous FY)
- PPF: quarterly (DEA notification)
- NPS: rarely — historical averages, user can override via Settings

**Frontend consumption:** `useInstrumentRates()` hook with compiled-in fallback. The `InstrumentProjections` chart renders zero-network using the fallback while the live fetch resolves.

## Account classification

**Priority-ordered rules** in [frontend/src/constants/accountTypes.ts](frontend/src/constants/accountTypes.ts), rewritten 2.10.0:

| Priority | Type | Examples |
|---|---|---|
| 1 (highest) | `credit_card` | "HDFC CC", "Visa", "Amex", "Diners", "Rupay Credit" |
| 2 | `investment` | "Demat", "MF", "PPF", "NPS", "RSUs", "Zerodha", "Groww" |
| 3 | `loan` | "Home Loan", "EMI", "Personal Loan", "Gold Loan" |
| 4 | `deposit` | "Savings", "FD", "RD", "Wallet", "Paytm", "Cash" |

**Word-boundary regex, case-insensitive.** Critical: "HDFC CC" → credit_card, "HDFC Bank" → deposit, "HDFC Stocks" → investment. The classifier doesn't look at HDFC; it looks at the trailing token.

**Why priority matters:** ambiguous names like "ICICI Investment Account" or "HDFC Credit Card Loan". Without priority, both rules match. With priority, `investment` beats `bank`, `credit_card` beats `loan`.

**Bank name canonicalization** (backend `ingest/normalizer.py`): "HDFC", "SBI", "ICICI", "Axis", "Kotak", "Yes", "IDFC First", "IndusInd", "PNB", "BOB", "BOI", "Canara", "Union", "Federal", "RBL", "IDBI", "Citi", "HSBC", "Standard Chartered", "DBS", "AU Small Finance" — 20+ banks. Case-insensitive, word-boundary, longest-match-first ("IDFC First" before "IDFC"). Does NOT match "axis" inside "taxis".

## Investment account mappings

`UserPreferences.investment_account_mappings` is a JSON map of `{ account_name: instrument_type }` where `instrument_type ∈ {stocks, mutual_funds, fixed_deposits, ppf_epf, ...}`.

**Default is `{}`** since 2.10.0. Empty default by design — previously shipped with the maintainer's personal account names which leaked into every user's install.

**User must configure** via Settings → Account Classifications. If a user's investment dashboard is empty, this is almost certainly why.

## Category vocabulary

**Normalized labels** the system tries to converge on (from `ingest/normalizer.py` typo corrections):
- `Food & Dining` (variants: "food and dining", "food&dining", "food & dinning")
- `Entertainment & Recreations` (variants: "entertianment", "entertainment", "entertainments")
- `Transportation` (variants: "transport")
- `Healthcare` (variants: "health", "health care")
- `Utilities` (variants: "utilites")
- `Education` (variants: "educaton")
- `Personal Care` (variants: "personalcare")
- `Charity` (variants: "donation", "donations")

**Income subcategories** (taxable, in `taxable_income_categories`):
- `Employment Income::Salary`
- `Employment Income::Bonuses`
- `Employment Income::RSUs`
- `Business/Self Employment Income::Gig Work Income`
- `Investment Income::Dividends`
- `Investment Income::Interest`
- `Investment Income::F&O Income`
- `Investment Income::Stock Market Profits`

**Essential categories** (for budget/health-score scoring): `Housing`, `Healthcare`, `Transportation`, `Food & Dining`, `Education`, `Family`, `Utilities`. User-overrideable via `UserPreferences.essential_categories`.

## Recurring transaction frequency bands

`backend/src/ledger_sync/core/analytics/recurring.py` — contiguous bands, post-2.10.0 fix:
- WEEKLY: 4-10 days
- BIWEEKLY: 11-19 days
- MONTHLY: 20-49 days
- BIMONTHLY: 50-79 days
- QUARTERLY: 80-129 days
- SEMIANNUAL: 130-269 days
- YEARLY: 270-400 days

**No gaps.** Pre-2.10.0 had dead zones at 19, 78, 130, 220 days that silently dropped recurring detections.

## Anti-knowledge — things this codebase does NOT do

- **Does not file taxes.** It estimates and helps planning. Real ITR filing is out of scope.
- **Does not advise.** It calculates. The user owns the financial decisions.
- **Does not handle multi-state professional tax.** Flat ₹200/month assumed.
- **Does not validate GST.** GST analysis exists as a "scale-of-spending" estimate; it is not a filing tool.
- **Does not compute capital gains by FIFO/LIFO** for individual investments. It tracks aggregate inflow/outflow per account.
- **Does not connect to broker APIs.** Pure self-hosted Excel-import flow.
