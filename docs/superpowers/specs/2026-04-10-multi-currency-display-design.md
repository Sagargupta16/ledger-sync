# Multi-Currency Display Conversion

**Date:** 2026-04-10
**Branch:** `feat/multi-currency-conversion`
**Status:** Design approved, pending implementation

## Problem

All transaction data is stored in INR (Indian Rupees). The user wants to view all analytics, dashboards, and financial data in other currencies (USD, GBP, EUR, etc.) using live exchange rates. This is a display-only conversion -- no changes to stored data.

## Decisions

| Question | Answer |
|----------|--------|
| Conversion type | Display-only. All data stays as INR in the database. |
| Conversion location | Frontend-only. Backend returns INR amounts unchanged. |
| Currency switcher placement | Both: Settings page for default + header quick-switch for temporary viewing |
| Exchange rate source | On-demand with 24h cache. Fetch when user switches, cache for 24 hours. |
| Supported currencies | Curated list of ~15 major currencies |
| Display style | Replace amounts with converted values + subtle indicator showing rate |
| Auto-derived preferences | Currency selection auto-drives number format, symbol, symbol position, and short format abbreviations |

## Architecture

### Conversion Pipeline

```
User selects display currency
  -> Frontend requests rate from backend proxy (if not cached)
  -> Rate cached in Zustand store (24h TTL via TanStack Query staleTime)
  -> formatCurrency/formatCurrencyCompact/formatCurrencyShort apply multiplier before display
```

### What Changes

| Layer | Change |
|-------|--------|
| Backend: new router | `api/exchange_rates.py` -- proxy to external rate API |
| Backend: preferences model | Add `display_currency` column to `user_preferences` |
| Backend: preferences API | Accept/return `display_currency` field |
| Frontend: constants | New `constants/currencies.ts` with currency metadata map |
| Frontend: formatters | `convertAmount()` helper + update all 3 format functions |
| Frontend: preferences store | Add `displayCurrency`, `exchangeRate`, `exchangeRateUpdatedAt` |
| Frontend: new hook | `useExchangeRate()` -- TanStack Query hook for rate fetching |
| Frontend: Sidebar | Currency quick-switcher in bottom icon bar |
| Frontend: Settings | Replace manual symbol/format/position with display currency dropdown |
| Alembic migration | Add `display_currency` column (default "INR") |

### What Does NOT Change

- Transaction storage, ingestion pipeline, hashing, deduplication
- All backend analytics endpoints (v1 and v2) -- still return INR
- Calculator, query_helpers, analytics_engine
- No new database tables
- No background jobs or cron

## Detailed Design

### 1. Currency Metadata Constants

New file: `frontend/src/constants/currencies.ts`

A `CURRENCIES` map keyed by ISO 4217 code. Each entry contains:

- `code`: ISO code (e.g., "USD")
- `name`: Display name (e.g., "US Dollar")
- `symbol`: Currency symbol (e.g., "$")
- `symbolPosition`: "before" or "after"
- `numberFormat`: "indian" (INR only) or "international" (all others)
- `locale`: Intl locale string for `toLocaleString()` (e.g., "en-US")
- `shortUnits`: Abbreviation tiers for `formatCurrencyShort()` (e.g., `["M", "K"]` for international, `["Cr", "L", "K"]` for INR)
- `decimals`: Fraction digits (default 2, 0 for JPY)

Curated list (~15):
INR, USD, EUR, GBP, JPY, CAD, AUD, CHF, SGD, AED, CNY, KRW, SEK, NZD, HKD

### 2. Auto-Derived Display Preferences

When the user selects a display currency, the following preferences are automatically derived from the `CURRENCIES` map -- not independently configured:

- `numberFormat` -> INR uses "indian", all others use "international"
- `currencySymbol` -> from currency metadata (e.g., "$" for USD)
- `currencySymbolPosition` -> from currency metadata
- `formatCurrencyShort()` abbreviations -> INR uses Cr/L/K, others use M/K

The existing `currency_symbol`, `number_format`, `currency_symbol_position` fields in the DB and preferences store continue to exist and are updated when `display_currency` changes. This means all existing code that reads these fields (formatters, components) works without modification.

The `display_currency` field is the source of truth. The others are derived.

### 3. Formatter Changes

File: `frontend/src/lib/formatters.ts`

New internal helper:

```
convertAmount(value: number): number
  - Reads displayCurrency and exchangeRate from preferences store
  - If displayCurrency === "INR" (base currency), returns value unchanged
  - Otherwise returns value * exchangeRate
```

Changes to existing functions:

- `formatCurrency(value)` -- calls `convertAmount(value)` before formatting
- `formatCurrencyCompact(value)` -- calls `convertAmount(value)` before formatting
- `formatCurrencyShort(value)` -- calls `convertAmount(value)` before formatting; switches abbreviation tiers based on display currency metadata (Cr/L/K for INR, M/K for others)
- `formatWithLocale()` -- reads locale from currency metadata instead of deriving from numberFormat alone

No changes to `formatPercent`, `percentChange`, `formatDateTick`, or other non-currency functions.

### 4. Backend Exchange Rate Proxy

New file: `backend/src/ledger_sync/api/exchange_rates.py`

Single endpoint:
- `GET /api/exchange-rates?base=INR`
- Requires JWT auth (consistent with all other endpoints)
- Calls `frankfurter.app/latest?from=INR` (free, no API key, ECB rates, open-source)
- Server-side in-memory cache: module-level dict `_rate_cache` with `fetched_at` timestamp
- Cache TTL: 24 hours. If cache is fresh, return cached data without external call.
- Response shape: `{ "base": "INR", "rates": { "USD": 0.01187, ... }, "fetched_at": "2026-04-10T12:00:00Z" }`
- Fallback: if external API call fails and cache is stale, return stale cache with a `"stale": true` flag. If no cache exists at all, return hardcoded approximate rates with `"fallback": true` flag.
- Rate limiting: inherits app-level rate limiting, no additional limits needed.

Router registered in `main.py` alongside existing routers.

### 5. Preferences Model Update

File: `backend/src/ledger_sync/db/models.py`

Add to `UserPreferences`:
- `display_currency = Column(String(3), default="INR", nullable=False)`

New Alembic migration:
- Add `display_currency` column with default "INR"
- All existing users get "INR" (matches current behavior exactly)

File: `backend/src/ledger_sync/api/preferences.py`

- Include `display_currency` in GET/PUT responses
- `PUT /preferences/display` accepts `display_currency` field

File: `backend/src/ledger_sync/schemas/`

- Add `display_currency` to relevant Pydantic models

### 6. Frontend Preferences Store

File: `frontend/src/store/preferencesStore.ts`

New fields in store:
- `displayCurrency: string` (default "INR")
- `exchangeRate: number | null` (the rate to multiply INR by, e.g., 0.01187 for USD)
- `exchangeRateUpdatedAt: string | null` (ISO timestamp)

New actions:
- `setDisplayCurrency(code: string)` -- sets displayCurrency AND auto-derives + sets displayPreferences (numberFormat, currencySymbol, currencySymbolPosition) from the CURRENCIES map
- `setExchangeRate(rate: number, updatedAt: string)` -- stores fetched rate

`hydrateFromApi()` updated to read `display_currency` from API response.

### 7. Exchange Rate Hook

New file: `frontend/src/hooks/api/useExchangeRate.ts`

- `useExchangeRate()` hook using TanStack Query
- `queryKey: ["exchange-rates"]`
- `staleTime: 24 * 60 * 60 * 1000` (24 hours)
- `enabled: displayCurrency !== "INR"` -- only fetches when conversion is needed
- On success, updates preferences store with rate and timestamp via `setExchangeRate()`
- Returns `{ rate, isLoading, error, updatedAt }`

**Dual storage pattern:** TanStack Query owns the fetch lifecycle (caching, refetching, stale detection). On success, it pushes the rate into the Zustand store. This is necessary because formatters (`convertAmount()`) are called synchronously outside of React components -- they cannot use hooks. Zustand's `getState()` gives synchronous access to the current rate.

### 8. UI: Currency Quick-Switcher (Sidebar)

Location: `frontend/src/components/layout/Sidebar/Sidebar.tsx`, bottom icon bar area

Component: `CurrencySwitcher` (new file in `components/layout/Sidebar/`)

- Small button showing current currency code (e.g., "INR" or "USD")
- Click opens a dropdown/popover listing all supported currencies with name + symbol
- Selecting a currency:
  1. Calls `setDisplayCurrency(code)` on preferences store (instant local update)
  2. Triggers `useExchangeRate()` to fetch rate if needed
  3. Saves `display_currency` to backend via `useUpdateDisplayPreferences()` mutation
- When `displayCurrency !== "INR"`, shows a subtle indicator pill below the switcher: `"USD @ 83.42"` with tooltip "Last updated: 2h ago"

### 9. UI: Settings Page Update

File: `frontend/src/pages/settings/DisplayPreferencesSection.tsx`

Replace the current manual fields:
- Remove: standalone currency symbol text input
- Remove: standalone number format dropdown
- Remove: standalone symbol position dropdown
- Add: **"Display Currency"** dropdown (list of ~15 currencies with name + symbol)

When a currency is selected:
- Symbol, number format, and position fields auto-populate and display as read-only (greyed out) below the dropdown, so the user can see what's derived
- This communicates that these values are controlled by the currency choice

Keep unchanged: Default Time Range, Earning Start Date, Theme.

## Edge Cases

| Scenario | Handling |
|----------|----------|
| External rate API is down | Return stale cache or hardcoded fallback rates |
| User has never selected a currency | Default "INR", no conversion, zero overhead |
| Rate is very stale (>48h) | Show warning in indicator pill: "Rate may be outdated" |
| Zero or negative amounts | `convertAmount()` handles all numbers; sign preserved |
| Switching currency while pages are mounted | Zustand store update triggers re-render via selectors; formatters read from store |
| User on Vercel serverless (no persistent memory) | In-memory cache resets on cold start; first request after cold start fetches fresh rate |
| JPY has 0 decimal places | Currency metadata includes `decimals` field; formatters respect it |

## Testing Plan

### Backend
- Unit test: exchange rate proxy endpoint (mock external API)
- Unit test: cache TTL behavior (fresh, stale, fallback)
- Unit test: preferences API returns/accepts `display_currency`
- Integration test: migration adds column with correct default

### Frontend
- Unit test: `convertAmount()` with various rates and edge cases (0, negative, null rate)
- Unit test: `formatCurrencyShort()` switches between Cr/L/K and M/K
- Unit test: `setDisplayCurrency()` auto-derives all display preferences
- Unit test: `useExchangeRate()` hook (only fetches when display !== base)
- Component test: CurrencySwitcher renders, selects, persists
- E2E consideration: switching currency and verifying dashboard amounts change (manual test)

## Files to Create

1. `frontend/src/constants/currencies.ts`
2. `backend/src/ledger_sync/api/exchange_rates.py`
3. `frontend/src/hooks/api/useExchangeRate.ts`
4. `frontend/src/components/layout/Sidebar/CurrencySwitcher.tsx`
5. Alembic migration for `display_currency` column
6. Backend tests for exchange rate endpoint
7. Frontend tests for formatters and hook

## Files to Modify

1. `frontend/src/lib/formatters.ts` -- add `convertAmount()`, update format functions
2. `frontend/src/store/preferencesStore.ts` -- add currency fields and actions
3. `frontend/src/pages/settings/DisplayPreferencesSection.tsx` -- replace manual fields with currency dropdown
4. `frontend/src/components/layout/Sidebar/Sidebar.tsx` -- add CurrencySwitcher
5. `backend/src/ledger_sync/db/models.py` -- add `display_currency` column
6. `backend/src/ledger_sync/api/preferences.py` -- include `display_currency`
7. `backend/src/ledger_sync/schemas/` -- add field to Pydantic models
8. `backend/src/ledger_sync/main.py` -- register exchange_rates router
9. `frontend/src/services/api/preferences.ts` -- add exchange rate API function
10. `frontend/src/hooks/api/usePreferences.ts` -- hydrate `display_currency`
11. `frontend/src/pages/settings/useSettingsState.ts` -- handle new currency field
