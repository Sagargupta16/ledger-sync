# Multi-Currency Display Conversion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users view all financial data in any of ~15 major currencies, with live exchange rates, by converting amounts at the display layer only.

**Architecture:** Frontend-only conversion. A single backend proxy endpoint fetches exchange rates from frankfurter.app and caches them for 24h. The frontend stores the rate in Zustand and applies it inside the existing `formatCurrency*()` functions -- the single point of control for all 23 pages. A new `display_currency` preference drives number format, symbol, and position automatically.

**Tech Stack:** FastAPI (backend proxy), httpx (HTTP client), Alembic (migration), React + TypeScript + Zustand + TanStack Query (frontend), Recharts (charts), Tailwind CSS (styling), Lucide icons

---

## File Map

### New Files
| File | Purpose |
|------|---------|
| `frontend/src/constants/currencies.ts` | Currency metadata map (symbol, locale, format, short units) |
| `backend/src/ledger_sync/api/exchange_rates.py` | Exchange rate proxy endpoint with 24h in-memory cache |
| `frontend/src/hooks/api/useExchangeRate.ts` | TanStack Query hook for fetching/caching exchange rates |
| `frontend/src/components/layout/Sidebar/CurrencySwitcher.tsx` | Quick-switch dropdown in sidebar bottom bar |
| `backend/src/ledger_sync/db/migrations/versions/20260410_1200_add_display_currency.py` | Alembic migration adding `display_currency` column |
| `backend/tests/unit/test_exchange_rates.py` | Tests for exchange rate endpoint |
| `frontend/src/lib/__tests__/formatters.test.ts` | Tests for currency conversion in formatters |

### Modified Files
| File | Change |
|------|--------|
| `backend/src/ledger_sync/db/models.py:1237` | Add `display_currency` column to UserPreferences |
| `backend/src/ledger_sync/api/preferences.py` | Add `display_currency` to Pydantic models and reset handler |
| `backend/src/ledger_sync/api/main.py:18,248` | Import and register exchange_rates router |
| `frontend/src/constants/currencies.ts` | (new file -- listed above) |
| `frontend/src/store/preferencesStore.ts` | Add `displayCurrency`, `exchangeRate`, `exchangeRateUpdatedAt`, `setDisplayCurrency`, `setExchangeRate` |
| `frontend/src/lib/formatters.ts` | Add `convertAmount()`, update `formatCurrency*()` and `formatCurrencyShort()` |
| `frontend/src/services/api/preferences.ts` | Add `display_currency` to types + exchange rate API function |
| `frontend/src/hooks/api/usePreferences.ts` | Hydrate `displayCurrency` from API |
| `frontend/src/pages/settings/DisplayPreferencesSection.tsx` | Replace manual symbol/format/position with currency dropdown |
| `frontend/src/components/layout/Sidebar/Sidebar.tsx` | Add CurrencySwitcher to bottom bar |

---

## Task 1: Currency Metadata Constants

**Files:**
- Create: `frontend/src/constants/currencies.ts`

- [ ] **Step 1: Create the currency constants file**

```typescript
// frontend/src/constants/currencies.ts

export interface CurrencyMeta {
  code: string
  name: string
  symbol: string
  symbolPosition: 'before' | 'after'
  numberFormat: 'indian' | 'international'
  locale: string
  shortUnits: { threshold: number; suffix: string; divisor: number }[]
  decimals: number
}

const INDIAN_SHORT_UNITS = [
  { threshold: 10_000_000, suffix: 'Cr', divisor: 10_000_000 },
  { threshold: 100_000, suffix: 'L', divisor: 100_000 },
  { threshold: 1_000, suffix: 'K', divisor: 1_000 },
]

const INTL_SHORT_UNITS = [
  { threshold: 1_000_000_000, suffix: 'B', divisor: 1_000_000_000 },
  { threshold: 1_000_000, suffix: 'M', divisor: 1_000_000 },
  { threshold: 1_000, suffix: 'K', divisor: 1_000 },
]

export const CURRENCIES: Record<string, CurrencyMeta> = {
  INR: { code: 'INR', name: 'Indian Rupee', symbol: '\u20B9', symbolPosition: 'before', numberFormat: 'indian', locale: 'en-IN', shortUnits: INDIAN_SHORT_UNITS, decimals: 2 },
  USD: { code: 'USD', name: 'US Dollar', symbol: '$', symbolPosition: 'before', numberFormat: 'international', locale: 'en-US', shortUnits: INTL_SHORT_UNITS, decimals: 2 },
  EUR: { code: 'EUR', name: 'Euro', symbol: '\u20AC', symbolPosition: 'before', numberFormat: 'international', locale: 'de-DE', shortUnits: INTL_SHORT_UNITS, decimals: 2 },
  GBP: { code: 'GBP', name: 'British Pound', symbol: '\u00A3', symbolPosition: 'before', numberFormat: 'international', locale: 'en-GB', shortUnits: INTL_SHORT_UNITS, decimals: 2 },
  JPY: { code: 'JPY', name: 'Japanese Yen', symbol: '\u00A5', symbolPosition: 'before', numberFormat: 'international', locale: 'ja-JP', shortUnits: INTL_SHORT_UNITS, decimals: 0 },
  CAD: { code: 'CAD', name: 'Canadian Dollar', symbol: 'CA$', symbolPosition: 'before', numberFormat: 'international', locale: 'en-CA', shortUnits: INTL_SHORT_UNITS, decimals: 2 },
  AUD: { code: 'AUD', name: 'Australian Dollar', symbol: 'A$', symbolPosition: 'before', numberFormat: 'international', locale: 'en-AU', shortUnits: INTL_SHORT_UNITS, decimals: 2 },
  CHF: { code: 'CHF', name: 'Swiss Franc', symbol: 'CHF', symbolPosition: 'before', numberFormat: 'international', locale: 'de-CH', shortUnits: INTL_SHORT_UNITS, decimals: 2 },
  SGD: { code: 'SGD', name: 'Singapore Dollar', symbol: 'S$', symbolPosition: 'before', numberFormat: 'international', locale: 'en-SG', shortUnits: INTL_SHORT_UNITS, decimals: 2 },
  AED: { code: 'AED', name: 'UAE Dirham', symbol: 'AED', symbolPosition: 'before', numberFormat: 'international', locale: 'ar-AE', shortUnits: INTL_SHORT_UNITS, decimals: 2 },
  CNY: { code: 'CNY', name: 'Chinese Yuan', symbol: '\u00A5', symbolPosition: 'before', numberFormat: 'international', locale: 'zh-CN', shortUnits: INTL_SHORT_UNITS, decimals: 2 },
  KRW: { code: 'KRW', name: 'South Korean Won', symbol: '\u20A9', symbolPosition: 'before', numberFormat: 'international', locale: 'ko-KR', shortUnits: INTL_SHORT_UNITS, decimals: 0 },
  SEK: { code: 'SEK', name: 'Swedish Krona', symbol: 'kr', symbolPosition: 'after', numberFormat: 'international', locale: 'sv-SE', shortUnits: INTL_SHORT_UNITS, decimals: 2 },
  NZD: { code: 'NZD', name: 'New Zealand Dollar', symbol: 'NZ$', symbolPosition: 'before', numberFormat: 'international', locale: 'en-NZ', shortUnits: INTL_SHORT_UNITS, decimals: 2 },
  HKD: { code: 'HKD', name: 'Hong Kong Dollar', symbol: 'HK$', symbolPosition: 'before', numberFormat: 'international', locale: 'en-HK', shortUnits: INTL_SHORT_UNITS, decimals: 2 },
}

export const CURRENCY_CODES = Object.keys(CURRENCIES)

export const BASE_CURRENCY = 'INR'

export function getCurrencyMeta(code: string): CurrencyMeta {
  return CURRENCIES[code] ?? CURRENCIES[BASE_CURRENCY]
}
```

- [ ] **Step 2: Export from constants index**

Check if `frontend/src/constants/index.ts` exists. If it does, add the export. If not, skip -- other constants files (like `colors.ts`) are imported directly.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/constants/currencies.ts
git commit -m "feat: add currency metadata constants for multi-currency display"
```

---

## Task 2: Backend -- Alembic Migration + Model Update

**Files:**
- Modify: `backend/src/ledger_sync/db/models.py:1237-1253`
- Create: `backend/src/ledger_sync/db/migrations/versions/20260410_1200_add_display_currency.py`

- [ ] **Step 1: Add `display_currency` column to UserPreferences model**

In `backend/src/ledger_sync/db/models.py`, after line 1253 (after `default_time_range`), add:

```python
    display_currency: Mapped[str] = mapped_column(
        String(3),
        nullable=False,
        default="INR",
    )
```

- [ ] **Step 2: Create the Alembic migration file**

Create `backend/src/ledger_sync/db/migrations/versions/20260410_1200_add_display_currency.py`:

```python
"""add display_currency to user_preferences

Revision ID: a1b2c3d4e5f6
Revises: d2a3b4c5e6f7
Create Date: 2026-04-10 12:00:00.000000

Changes:
- Add display_currency column to user_preferences table
- Defaults to 'INR' for all existing users
"""

import sqlalchemy as sa
from alembic import op

revision = "a1b2c3d4e5f6"
down_revision = "d2a3b4c5e6f7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "user_preferences",
        sa.Column("display_currency", sa.String(3), nullable=False, server_default="INR"),
    )


def downgrade() -> None:
    pass
```

- [ ] **Step 3: Run migration locally to verify**

```bash
cd backend && uv run alembic upgrade head
```

Expected: migration applies successfully, `display_currency` column exists.

- [ ] **Step 4: Commit**

```bash
git add backend/src/ledger_sync/db/models.py backend/src/ledger_sync/db/migrations/versions/20260410_1200_add_display_currency.py
git commit -m "feat: add display_currency column to user_preferences"
```

---

## Task 3: Backend -- Exchange Rate Proxy Endpoint

**Files:**
- Create: `backend/src/ledger_sync/api/exchange_rates.py`
- Modify: `backend/src/ledger_sync/api/main.py`

- [ ] **Step 1: Create the exchange rate router**

Create `backend/src/ledger_sync/api/exchange_rates.py`:

```python
"""Exchange rate proxy endpoint.

Fetches rates from frankfurter.app (free, no API key, ECB data) and
caches them in-memory for 24 hours. Falls back to stale cache or
hardcoded rates if the external API is unavailable.
"""

from __future__ import annotations

import time
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException

from ledger_sync.api.deps import CurrentUser

router = APIRouter(prefix="/exchange-rates", tags=["exchange-rates"])

_CACHE_TTL = 86400  # 24 hours in seconds
_FRANKFURTER_URL = "https://api.frankfurter.app/latest"

# In-memory cache: { "rates": {...}, "fetched_at": float }
_rate_cache: dict[str, Any] = {}

# Approximate fallback rates (INR -> X) as of 2026-04
_FALLBACK_RATES: dict[str, float] = {
    "USD": 0.01187, "EUR": 0.01092, "GBP": 0.00940,
    "JPY": 1.7800, "CAD": 0.01620, "AUD": 0.01830,
    "CHF": 0.01050, "SGD": 0.01590, "AED": 0.04360,
    "CNY": 0.08620, "KRW": 16.300, "SEK": 0.1230,
    "NZD": 0.02010, "HKD": 0.09260,
}


def _cache_is_fresh() -> bool:
    fetched_at = _rate_cache.get("fetched_at")
    if fetched_at is None:
        return False
    return (time.time() - fetched_at) < _CACHE_TTL


async def _fetch_rates(base: str) -> dict[str, float]:
    """Fetch latest rates from frankfurter.app."""
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(_FRANKFURTER_URL, params={"from": base})
        resp.raise_for_status()
        data = resp.json()
        return data.get("rates", {})


@router.get("")
async def get_exchange_rates(
    _current_user: CurrentUser,
    base: str = "INR",
) -> dict[str, Any]:
    """Return exchange rates for the given base currency.

    Uses a 24-hour in-memory cache. Falls back to stale cache or
    hardcoded approximate rates if the external API is unreachable.
    """
    if _cache_is_fresh() and _rate_cache.get("base") == base:
        return {
            "base": base,
            "rates": _rate_cache["rates"],
            "fetched_at": _rate_cache["fetched_at"],
        }

    try:
        rates = await _fetch_rates(base)
        _rate_cache["rates"] = rates
        _rate_cache["base"] = base
        _rate_cache["fetched_at"] = time.time()
        return {
            "base": base,
            "rates": rates,
            "fetched_at": _rate_cache["fetched_at"],
        }
    except Exception:
        # Return stale cache if available
        if _rate_cache.get("rates") and _rate_cache.get("base") == base:
            return {
                "base": base,
                "rates": _rate_cache["rates"],
                "fetched_at": _rate_cache.get("fetched_at"),
                "stale": True,
            }
        # Last resort: hardcoded fallback
        if base == "INR":
            return {
                "base": "INR",
                "rates": _FALLBACK_RATES,
                "fetched_at": None,
                "fallback": True,
            }
        raise HTTPException(
            status_code=502,
            detail=f"Unable to fetch exchange rates for base={base}",
        )
```

- [ ] **Step 2: Register the router in main.py**

In `backend/src/ledger_sync/api/main.py`, add import after line 30 (after the reports import):

```python
from ledger_sync.api.exchange_rates import router as exchange_rates_router
```

Add router registration after line 248 (after upload_router):

```python
app.include_router(exchange_rates_router)
```

- [ ] **Step 3: Verify the endpoint starts**

```bash
cd backend && uv run uvicorn ledger_sync.api.main:app --host 127.0.0.1 --port 8000
```

Expected: server starts without import errors. Hit `http://localhost:8000/docs` and verify `/exchange-rates` appears.

- [ ] **Step 4: Commit**

```bash
git add backend/src/ledger_sync/api/exchange_rates.py backend/src/ledger_sync/api/main.py
git commit -m "feat: add exchange rate proxy endpoint with 24h cache"
```

---

## Task 4: Backend -- Preferences API Update

**Files:**
- Modify: `backend/src/ledger_sync/api/preferences.py`

- [ ] **Step 1: Add `display_currency` to Pydantic models**

In `preferences.py`, add to `DisplayPreferencesConfig` (after line 96):

```python
    display_currency: str = Field(
        default="INR",
        min_length=3,
        max_length=3,
        description="ISO 4217 currency code for display conversion",
    )
```

Add to `UserPreferencesResponse` (after line 203, after `default_time_range`):

```python
    display_currency: str = "INR"
```

Add to `UserPreferencesUpdate` (after line 281, after `default_time_range`):

```python
    display_currency: str | None = None
```

- [ ] **Step 2: Update `_model_to_response` to include `display_currency`**

In the `_model_to_response` function (after line 359, after `default_time_range=prefs.default_time_range,`):

```python
        display_currency=prefs.display_currency,
```

- [ ] **Step 3: Update `reset_preferences` to reset `display_currency`**

In the `reset_preferences` function (after line 490, after `prefs.default_time_range = "all_time"`):

```python
    prefs.display_currency = "INR"
```

- [ ] **Step 4: Verify existing tests still pass**

```bash
cd backend && uv run pytest tests/ -v --timeout=30
```

Expected: all existing tests pass.

- [ ] **Step 5: Commit**

```bash
git add backend/src/ledger_sync/api/preferences.py
git commit -m "feat: add display_currency to preferences API"
```

---

## Task 5: Frontend -- Preferences Store Update

**Files:**
- Modify: `frontend/src/store/preferencesStore.ts`
- Modify: `frontend/src/services/api/preferences.ts`

- [ ] **Step 1: Add `display_currency` to the API types**

In `frontend/src/services/api/preferences.ts`, add to the `UserPreferences` interface after `default_time_range: string` (line 44):

```typescript
  display_currency: string
```

Add to `DisplayPreferencesConfig` interface after `default_time_range: string` (line 128):

```typescript
  display_currency: string
```

Add a new exchange rate function at the bottom of the `preferencesService` object (after line 202):

```typescript
  async getExchangeRates(base: string = 'INR'): Promise<{
    base: string
    rates: Record<string, number>
    fetched_at: number | null
    stale?: boolean
    fallback?: boolean
  }> {
    const response = await apiClient.get('/exchange-rates', { params: { base } })
    return response.data
  },
```

- [ ] **Step 2: Update the Zustand store**

In `frontend/src/store/preferencesStore.ts`:

Add import at top (after line 2):

```typescript
import { CURRENCIES, BASE_CURRENCY, getCurrencyMeta } from '@/constants/currencies'
```

Add fields to `PreferencesState` interface (after `displayPreferences: DisplayPreferences`, around line 31):

```typescript
  displayCurrency: string
  exchangeRate: number | null
  exchangeRateUpdatedAt: string | null
```

Add actions to `PreferencesState` interface (after `setDisplayPreferences`, around line 58):

```typescript
  setDisplayCurrency: (code: string) => void
  setExchangeRate: (rate: number, updatedAt: string) => void
```

Add defaults in the store creation (after `displayPreferences` defaults, around line 93):

```typescript
      displayCurrency: BASE_CURRENCY,
      exchangeRate: null,
      exchangeRateUpdatedAt: null,
```

Add actions in the store creation (after `setDisplayPreferences` action, around line 157):

```typescript
      setDisplayCurrency: (code) => {
        const meta = getCurrencyMeta(code)
        set({
          displayCurrency: code,
          displayPreferences: {
            numberFormat: meta.numberFormat,
            currencySymbol: meta.symbol,
            currencySymbolPosition: meta.symbolPosition,
            defaultTimeRange: usePreferencesStore.getState().displayPreferences.defaultTimeRange,
          },
          // Clear rate when switching back to base
          ...(code === BASE_CURRENCY ? { exchangeRate: null, exchangeRateUpdatedAt: null } : {}),
        })
      },

      setExchangeRate: (rate, updatedAt) =>
        set({ exchangeRate: rate, exchangeRateUpdatedAt: updatedAt }),
```

Update `hydrateFromApi` to include `display_currency` (add to the `apiPrefs` parameter type):

```typescript
    display_currency: string
```

In the `hydrateFromApi` body `set()` call, add:

```typescript
          displayCurrency: typeof apiPrefs.display_currency === 'string' && apiPrefs.display_currency in CURRENCIES
            ? apiPrefs.display_currency : BASE_CURRENCY,
```

Also update `partialize` to include `displayCurrency` (in the `persist` config):

```typescript
        displayCurrency: state.displayCurrency,
```

- [ ] **Step 3: Add selectors**

At the bottom of the store file (after existing selectors):

```typescript
export const selectDisplayCurrency = (state: PreferencesState) =>
  state.displayCurrency

export const selectExchangeRate = (state: PreferencesState) =>
  state.exchangeRate
```

- [ ] **Step 4: Verify frontend compiles**

```bash
cd frontend && pnpm run type-check
```

Expected: no type errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/store/preferencesStore.ts frontend/src/services/api/preferences.ts
git commit -m "feat: add display currency and exchange rate to preferences store"
```

---

## Task 6: Frontend -- Exchange Rate Hook

**Files:**
- Create: `frontend/src/hooks/api/useExchangeRate.ts`

- [ ] **Step 1: Create the exchange rate hook**

```typescript
// frontend/src/hooks/api/useExchangeRate.ts

import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { preferencesService } from '@/services/api/preferences'
import { usePreferencesStore } from '@/store/preferencesStore'
import { useAuthStore } from '@/store/authStore'
import { BASE_CURRENCY } from '@/constants/currencies'

const EXCHANGE_RATE_KEY = ['exchange-rates']
const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000

export function useExchangeRate() {
  const displayCurrency = usePreferencesStore((s) => s.displayCurrency)
  const setExchangeRate = usePreferencesStore((s) => s.setExchangeRate)
  const accessToken = useAuthStore((s) => s.accessToken)

  const needsConversion = displayCurrency !== BASE_CURRENCY

  const query = useQuery({
    queryKey: [...EXCHANGE_RATE_KEY, displayCurrency],
    queryFn: () => preferencesService.getExchangeRates(BASE_CURRENCY),
    enabled: !!accessToken && needsConversion,
    staleTime: TWENTY_FOUR_HOURS,
    gcTime: TWENTY_FOUR_HOURS,
  })

  // Push fetched rate into Zustand for synchronous access by formatters
  useEffect(() => {
    if (query.data?.rates && displayCurrency !== BASE_CURRENCY) {
      const rate = query.data.rates[displayCurrency]
      if (rate != null) {
        const updatedAt = query.data.fetched_at
          ? new Date(query.data.fetched_at * 1000).toISOString()
          : new Date().toISOString()
        setExchangeRate(rate, updatedAt)
      }
    }
  }, [query.data, displayCurrency, setExchangeRate])

  return {
    rate: query.data?.rates?.[displayCurrency] ?? null,
    isLoading: query.isLoading,
    error: query.error,
    isStale: query.data?.stale === true,
    isFallback: query.data?.fallback === true,
    updatedAt: query.data?.fetched_at
      ? new Date(query.data.fetched_at * 1000).toISOString()
      : null,
  }
}
```

- [ ] **Step 2: Wire into AppLayout so the hook runs globally**

The hook needs to be called somewhere persistent. The best place is `AppLayout.tsx`. Add to `frontend/src/components/layout/AppLayout.tsx`:

Import at top:
```typescript
import { useExchangeRate } from '@/hooks/api/useExchangeRate'
```

Inside the component body (before the return):
```typescript
  // Fetch exchange rate when display currency changes (pushes to store for formatters)
  useExchangeRate()
```

- [ ] **Step 3: Verify frontend compiles**

```bash
cd frontend && pnpm run type-check
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/hooks/api/useExchangeRate.ts frontend/src/components/layout/AppLayout.tsx
git commit -m "feat: add useExchangeRate hook with 24h caching"
```

---

## Task 7: Frontend -- Formatter Conversion Logic

**Files:**
- Modify: `frontend/src/lib/formatters.ts`

- [ ] **Step 1: Add `convertAmount()` and update formatters**

Replace the entire `formatters.ts` content. Key changes:
- New `convertAmount()` reads rate from store
- `formatCurrency()`, `formatCurrencyCompact()` call `convertAmount()` before formatting
- `formatCurrencyShort()` uses currency metadata for short unit tiers
- `formatWithLocale()` uses locale from currency metadata

In `frontend/src/lib/formatters.ts`, replace the import and helper section (lines 1-41) with:

```typescript
/**
 * Currency formatting utilities for consistent display across the application
 *
 * These formatters use the preferences store for:
 * - Display currency (drives symbol, format, locale)
 * - Exchange rate (for conversion from base currency)
 *
 * Usage:
 * - formatCurrency(value)        -> "$1,502.34" (2 decimal places, for display)
 * - formatCurrencyCompact(value) -> "$1,502" (rounded, for charts/cards)
 * - formatCurrencyShort(value)   -> "$1.5K" (abbreviated, for chart axes)
 */

import { usePreferencesStore } from '@/store/preferencesStore'
import { getCurrencyMeta, BASE_CURRENCY } from '@/constants/currencies'

// Get current preferences (for non-React contexts)
const getPrefs = () => usePreferencesStore.getState().displayPreferences
const getDisplayCurrency = () => usePreferencesStore.getState().displayCurrency
const getExchangeRate = () => usePreferencesStore.getState().exchangeRate

/**
 * Convert an amount from base currency (INR) to the display currency.
 * Returns the original value if display currency equals base currency or no rate available.
 */
const convertAmount = (value: number): number => {
  const displayCurrency = getDisplayCurrency()
  if (displayCurrency === BASE_CURRENCY) return value
  const rate = getExchangeRate()
  if (rate == null) return value
  return value * rate
}

/**
 * Get the CurrencyMeta for the current display currency.
 */
const getActiveCurrencyMeta = () => getCurrencyMeta(getDisplayCurrency())

/**
 * Format a number with the appropriate locale
 */
const formatWithLocale = (
  value: number,
  options: Intl.NumberFormatOptions = {}
): string => {
  const meta = getActiveCurrencyMeta()
  return value.toLocaleString(meta.locale, options)
}

/**
 * Add currency symbol based on current display currency metadata
 */
const addCurrencySymbol = (formatted: string): string => {
  const meta = getActiveCurrencyMeta()
  return meta.symbolPosition === 'before'
    ? `${meta.symbol}${formatted}`
    : `${formatted}${meta.symbol}`
}
```

Replace `formatCurrency` (lines 48-54) with:

```typescript
export const formatCurrency = (value: number): string => {
  const meta = getActiveCurrencyMeta()
  const converted = convertAmount(value)
  const formatted = formatWithLocale(converted, {
    minimumFractionDigits: meta.decimals,
    maximumFractionDigits: meta.decimals,
  })
  return addCurrencySymbol(formatted)
}
```

Replace `formatCurrencyCompact` (lines 61-66) with:

```typescript
export const formatCurrencyCompact = (value: number): string => {
  const converted = convertAmount(value)
  const formatted = formatWithLocale(Math.round(converted), {
    maximumFractionDigits: 0,
  })
  return addCurrencySymbol(formatted)
}
```

Replace `formatCurrencyShort` (lines 73-96) with:

```typescript
export const formatCurrencyShort = (value: number): string => {
  const meta = getActiveCurrencyMeta()
  const converted = convertAmount(value)
  const absValue = Math.abs(converted)
  const sign = converted < 0 ? '-' : ''

  let formatted: string
  let matched = false
  for (const unit of meta.shortUnits) {
    if (absValue >= unit.threshold) {
      formatted = `${(absValue / unit.divisor).toFixed(1)}${unit.suffix}`
      matched = true
      break
    }
  }
  if (!matched) {
    formatted = `${Math.round(absValue)}`
  }

  return meta.symbolPosition === 'before'
    ? `${sign}${meta.symbol}${formatted!}`
    : `${sign}${formatted!}${meta.symbol}`
}
```

Leave all other functions (`formatPercent`, `percentChange`, `formatDateTick`, `getOrdinalSuffix`, `parseStringArray`) unchanged.

- [ ] **Step 2: Verify frontend compiles**

```bash
cd frontend && pnpm run type-check
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/formatters.ts
git commit -m "feat: add currency conversion to formatters via display currency"
```

---

## Task 8: Frontend -- Currency Switcher Component

**Files:**
- Create: `frontend/src/components/layout/Sidebar/CurrencySwitcher.tsx`
- Modify: `frontend/src/components/layout/Sidebar/Sidebar.tsx`

- [ ] **Step 1: Create CurrencySwitcher component**

```typescript
// frontend/src/components/layout/Sidebar/CurrencySwitcher.tsx

import { useState, useRef, useEffect } from 'react'
import { ChevronDown } from 'lucide-react'
import { usePreferencesStore } from '@/store/preferencesStore'
import { CURRENCIES, BASE_CURRENCY, type CurrencyMeta } from '@/constants/currencies'
import { useUpdatePreferences } from '@/hooks/api/usePreferences'
import { cn } from '@/lib/cn'

const currencyList = Object.values(CURRENCIES)

export default function CurrencySwitcher() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const displayCurrency = usePreferencesStore((s) => s.displayCurrency)
  const exchangeRate = usePreferencesStore((s) => s.exchangeRate)
  const exchangeRateUpdatedAt = usePreferencesStore((s) => s.exchangeRateUpdatedAt)
  const setDisplayCurrency = usePreferencesStore((s) => s.setDisplayCurrency)
  const updatePreferences = useUpdatePreferences()

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const handleSelect = (meta: CurrencyMeta) => {
    setDisplayCurrency(meta.code)
    setOpen(false)
    // Persist to backend
    updatePreferences.mutate({
      display_currency: meta.code,
      number_format: meta.numberFormat,
      currency_symbol: meta.symbol,
      currency_symbol_position: meta.symbolPosition,
    })
  }

  const isConverted = displayCurrency !== BASE_CURRENCY

  // Format "time ago" for the rate indicator
  const timeAgo = exchangeRateUpdatedAt
    ? (() => {
        const diff = Date.now() - new Date(exchangeRateUpdatedAt).getTime()
        const hours = Math.floor(diff / 3_600_000)
        if (hours < 1) return 'just now'
        return `${hours}h ago`
      })()
    : null

  // Inverse rate for display (e.g., "1 USD = 84.25 INR")
  const inverseRate = exchangeRate ? (1 / exchangeRate).toFixed(2) : null

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          'flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors',
          isConverted
            ? 'bg-ios-blue/15 text-ios-blue hover:bg-ios-blue/25'
            : 'text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.06]',
        )}
        title={`Display currency: ${displayCurrency}`}
      >
        <span>{displayCurrency}</span>
        <ChevronDown size={12} />
      </button>

      {/* Rate indicator pill */}
      {isConverted && exchangeRate && (
        <div
          className="absolute left-1/2 -translate-x-1/2 mt-1 px-2 py-0.5 rounded-full bg-ios-blue/10 text-[10px] text-ios-blue whitespace-nowrap"
          title={timeAgo ? `Rate updated ${timeAgo}` : 'Exchange rate'}
        >
          1 {displayCurrency} = {BASE_CURRENCY} {inverseRate}
        </div>
      )}

      {/* Dropdown */}
      {open && (
        <div className="absolute bottom-full left-0 mb-2 w-56 max-h-72 overflow-y-auto rounded-xl bg-zinc-900 border border-white/10 shadow-xl z-50">
          {currencyList.map((meta) => (
            <button
              key={meta.code}
              type="button"
              onClick={() => handleSelect(meta)}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2 text-sm transition-colors',
                meta.code === displayCurrency
                  ? 'bg-ios-blue/15 text-white'
                  : 'text-zinc-400 hover:bg-white/[0.06] hover:text-white',
              )}
            >
              <span className="w-6 text-center font-medium text-xs">{meta.symbol}</span>
              <span className="flex-1 text-left">{meta.name}</span>
              <span className="text-xs text-zinc-500">{meta.code}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Add CurrencySwitcher to Sidebar bottom bar**

In `frontend/src/components/layout/Sidebar/Sidebar.tsx`:

Add import at top (after existing imports):
```typescript
import CurrencySwitcher from './CurrencySwitcher'
```

In the bottom icon bar `<div>` (the one at ~line 299 with `className="flex items-center justify-center gap-1"`), add `<CurrencySwitcher />` as the first child, before `<NotificationCenter />`:

```tsx
<CurrencySwitcher />
```

- [ ] **Step 3: Verify frontend compiles and renders**

```bash
cd frontend && pnpm run type-check && pnpm run build
```

Expected: builds without errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/layout/Sidebar/CurrencySwitcher.tsx frontend/src/components/layout/Sidebar/Sidebar.tsx
git commit -m "feat: add currency switcher to sidebar for quick currency change"
```

---

## Task 9: Frontend -- Settings Page Update

**Files:**
- Modify: `frontend/src/pages/settings/DisplayPreferencesSection.tsx`

- [ ] **Step 1: Replace manual fields with currency dropdown**

Replace the entire content of `DisplayPreferencesSection.tsx`:

```typescript
/**
 * Display & Preferences section - display currency, time range, appearance.
 *
 * Currency selection auto-derives number format, symbol, and position
 * from the CURRENCIES metadata map.
 */

import { Settings2, Palette } from 'lucide-react'
import { CURRENCIES, getCurrencyMeta } from '@/constants/currencies'
import { TIME_RANGE_OPTIONS } from './types'
import type { LocalPrefs, LocalPrefKey } from './types'
import { Section, FieldLabel, FieldHint } from './components'
import { selectClass } from './styles'

interface Props {
  index: number
  localPrefs: LocalPrefs
  theme: 'dark' | 'system'
  setTheme: (t: 'dark' | 'system') => void
  updateLocalPref: <K extends LocalPrefKey>(key: K, value: LocalPrefs[K]) => void
}

const currencyList = Object.values(CURRENCIES)

export default function DisplayPreferencesSection({
  index,
  localPrefs,
  theme,
  setTheme,
  updateLocalPref,
}: Readonly<Props>) {
  const handleCurrencyChange = (code: string) => {
    const meta = getCurrencyMeta(code)
    updateLocalPref('display_currency', code)
    updateLocalPref('number_format', meta.numberFormat)
    updateLocalPref('currency_symbol', meta.symbol)
    updateLocalPref('currency_symbol_position', meta.symbolPosition)
  }

  const selectedMeta = getCurrencyMeta(localPrefs.display_currency ?? 'INR')

  return (
    <Section
      index={index}
      icon={Settings2}
      title="Display & Preferences"
      description="Display currency, time ranges, and appearance"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {/* Display Currency */}
        <div>
          <FieldLabel htmlFor="display-currency">Display Currency</FieldLabel>
          <select
            id="display-currency"
            value={localPrefs.display_currency ?? 'INR'}
            onChange={(e) => handleCurrencyChange(e.target.value)}
            className={selectClass}
          >
            {currencyList.map((c) => (
              <option key={c.code} value={c.code} className="bg-background">
                {c.symbol} {c.name} ({c.code})
              </option>
            ))}
          </select>
          <FieldHint>
            All amounts will be converted using live exchange rates
          </FieldHint>
        </div>

        {/* Derived preferences (read-only) */}
        <div>
          <FieldLabel>Format (auto)</FieldLabel>
          <div className="px-3 py-2 bg-white/[0.03] border border-border/50 rounded-lg text-sm text-zinc-400">
            {selectedMeta.numberFormat === 'indian' ? 'Indian (1,00,000)' : 'International (100,000)'}
            {' '}&middot;{' '}
            Symbol: {selectedMeta.symbol} ({selectedMeta.symbolPosition})
          </div>
        </div>

        {/* Default Time Range */}
        <div>
          <FieldLabel htmlFor="time-range">Default Time Range</FieldLabel>
          <select
            id="time-range"
            value={localPrefs.default_time_range}
            onChange={(e) => updateLocalPref('default_time_range', e.target.value)}
            className={selectClass}
          >
            {TIME_RANGE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value} className="bg-background">
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Earning Start Date */}
        <div className="md:col-span-2">
          <FieldLabel htmlFor="earning-start-date">Earning Start Date</FieldLabel>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <input
              id="earning-start-date"
              type="date"
              value={localPrefs.earning_start_date ?? ''}
              onChange={(e) => updateLocalPref('earning_start_date', e.target.value || null)}
              className={`${selectClass} w-auto`}
            />
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={localPrefs.use_earning_start_date}
                disabled={!localPrefs.earning_start_date}
                onChange={(e) => updateLocalPref('use_earning_start_date', e.target.checked)}
                className="w-4 h-4 rounded bg-white/5 border-border text-primary focus:ring-primary disabled:opacity-40"
              />
              <span className="text-sm text-white">Use as analytics start</span>
            </label>
          </div>
          {localPrefs.use_earning_start_date && localPrefs.earning_start_date && (
            <p className="mt-1.5 text-xs text-ios-green">
              Analytics from{' '}
              {new Date(localPrefs.earning_start_date + 'T00:00:00').toLocaleDateString(
                'en-IN',
                { day: 'numeric', month: 'long', year: 'numeric' },
              )}
            </p>
          )}
        </div>

        {/* Appearance */}
        <div className="lg:col-span-3">
          <FieldLabel>Appearance</FieldLabel>
          <div className="flex gap-2">
            {(['dark', 'system'] as const).map((t) => (
              <label
                key={t}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg cursor-pointer transition-colors border text-sm ${
                  theme === t
                    ? 'bg-primary/15 border-primary text-white font-medium'
                    : 'bg-white/5 border-border text-muted-foreground hover:text-white'
                }`}
              >
                <input
                  type="radio"
                  name="theme"
                  value={t}
                  checked={theme === t}
                  onChange={() => {
                    setTheme(t)
                    try {
                      localStorage.setItem('ledger-sync-theme', t)
                    } catch (e) {
                      console.warn('[DisplayPreferencesSection] Failed to write localStorage:', e)
                    }
                  }}
                  className="sr-only"
                />
                <Palette className="w-4 h-4" />
                {t === 'system' ? 'System (Auto)' : 'Dark'}
              </label>
            ))}
          </div>
          {theme === 'system' && (
            <FieldHint>
              <span className="text-ios-yellow">
                Light theme coming soon. Currently defaults to dark.
              </span>
            </FieldHint>
          )}
        </div>
      </div>
    </Section>
  )
}
```

- [ ] **Step 2: Verify frontend compiles**

```bash
cd frontend && pnpm run type-check
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/settings/DisplayPreferencesSection.tsx
git commit -m "feat: replace manual currency fields with display currency dropdown"
```

---

## Task 10: Backend Tests

**Files:**
- Create: `backend/tests/unit/test_exchange_rates.py`

- [ ] **Step 1: Write tests for the exchange rate endpoint**

```python
"""Tests for exchange rate proxy endpoint."""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest
from httpx import HTTPStatusError, Request, Response

from ledger_sync.api.exchange_rates import (
    _FALLBACK_RATES,
    _rate_cache,
    get_exchange_rates,
)


@pytest.fixture(autouse=True)
def _clear_cache():
    """Clear the module-level rate cache before each test."""
    _rate_cache.clear()
    yield
    _rate_cache.clear()


class FakeUser:
    id = 1


@pytest.mark.asyncio
async def test_fetch_and_cache_rates():
    """Should fetch rates from external API and cache them."""
    mock_rates = {"USD": 0.01187, "EUR": 0.01092}
    with patch(
        "ledger_sync.api.exchange_rates._fetch_rates",
        new_callable=AsyncMock,
        return_value=mock_rates,
    ):
        result = await get_exchange_rates(_current_user=FakeUser(), base="INR")
    assert result["base"] == "INR"
    assert result["rates"] == mock_rates
    assert result["fetched_at"] is not None
    assert "stale" not in result
    assert "fallback" not in result


@pytest.mark.asyncio
async def test_returns_cached_rates():
    """Should return cached rates without hitting external API."""
    import time

    _rate_cache["rates"] = {"USD": 0.012}
    _rate_cache["base"] = "INR"
    _rate_cache["fetched_at"] = time.time()  # fresh

    with patch(
        "ledger_sync.api.exchange_rates._fetch_rates",
        new_callable=AsyncMock,
    ) as mock_fetch:
        result = await get_exchange_rates(_current_user=FakeUser(), base="INR")
    mock_fetch.assert_not_called()
    assert result["rates"]["USD"] == 0.012


@pytest.mark.asyncio
async def test_stale_cache_on_api_failure():
    """Should return stale cache when API fails."""
    import time

    _rate_cache["rates"] = {"USD": 0.011}
    _rate_cache["base"] = "INR"
    _rate_cache["fetched_at"] = time.time() - 100000  # stale

    with patch(
        "ledger_sync.api.exchange_rates._fetch_rates",
        new_callable=AsyncMock,
        side_effect=Exception("API down"),
    ):
        result = await get_exchange_rates(_current_user=FakeUser(), base="INR")
    assert result["stale"] is True
    assert result["rates"]["USD"] == 0.011


@pytest.mark.asyncio
async def test_fallback_rates_when_no_cache():
    """Should return hardcoded fallback when API fails and no cache exists."""
    with patch(
        "ledger_sync.api.exchange_rates._fetch_rates",
        new_callable=AsyncMock,
        side_effect=Exception("API down"),
    ):
        result = await get_exchange_rates(_current_user=FakeUser(), base="INR")
    assert result["fallback"] is True
    assert result["rates"] == _FALLBACK_RATES
```

- [ ] **Step 2: Run the tests**

```bash
cd backend && uv run pytest tests/unit/test_exchange_rates.py -v
```

Expected: all 4 tests pass.

- [ ] **Step 3: Commit**

```bash
git add backend/tests/unit/test_exchange_rates.py
git commit -m "test: add exchange rate proxy endpoint tests"
```

---

## Task 11: Frontend Tests

**Files:**
- Create: `frontend/src/lib/__tests__/formatters.test.ts`

- [ ] **Step 1: Write formatter tests**

```typescript
// frontend/src/lib/__tests__/formatters.test.ts

import { describe, it, expect, beforeEach } from 'vitest'
import { usePreferencesStore } from '@/store/preferencesStore'
import { formatCurrency, formatCurrencyCompact, formatCurrencyShort } from '../formatters'

describe('formatters with currency conversion', () => {
  beforeEach(() => {
    // Reset to defaults (INR, no conversion)
    usePreferencesStore.setState({
      displayCurrency: 'INR',
      exchangeRate: null,
      exchangeRateUpdatedAt: null,
      displayPreferences: {
        numberFormat: 'indian',
        currencySymbol: '\u20B9',
        currencySymbolPosition: 'before',
        defaultTimeRange: 'all_time',
      },
    })
  })

  describe('no conversion (INR)', () => {
    it('formatCurrency returns INR formatted value', () => {
      const result = formatCurrency(123456.78)
      expect(result).toContain('\u20B9')
      expect(result).toContain('123')
    })

    it('formatCurrencyCompact rounds to integer', () => {
      const result = formatCurrencyCompact(123456.78)
      expect(result).toContain('\u20B9')
      expect(result).not.toContain('.')
    })

    it('formatCurrencyShort uses Lakhs and Crores', () => {
      expect(formatCurrencyShort(10000000)).toContain('Cr')
      expect(formatCurrencyShort(100000)).toContain('L')
      expect(formatCurrencyShort(5000)).toContain('K')
    })
  })

  describe('with conversion (USD)', () => {
    beforeEach(() => {
      usePreferencesStore.setState({
        displayCurrency: 'USD',
        exchangeRate: 0.01187,
        exchangeRateUpdatedAt: new Date().toISOString(),
        displayPreferences: {
          numberFormat: 'international',
          currencySymbol: '$',
          currencySymbolPosition: 'before',
          defaultTimeRange: 'all_time',
        },
      })
    })

    it('formatCurrency converts and formats as USD', () => {
      // 100000 INR * 0.01187 = 1187 USD
      const result = formatCurrency(100000)
      expect(result).toContain('$')
      expect(result).toContain('1,187')
    })

    it('formatCurrencyShort uses M and K instead of Cr and L', () => {
      // 1 billion INR * 0.01187 = 11.87M USD
      const result = formatCurrencyShort(1000000000)
      expect(result).toContain('M')
      expect(result).not.toContain('Cr')
      expect(result).not.toContain('L')
    })

    it('formatCurrencyShort uses K for thousands', () => {
      // 10M INR * 0.01187 = 118.7K USD
      const result = formatCurrencyShort(10000000)
      expect(result).toContain('K')
    })
  })

  describe('edge cases', () => {
    it('handles zero', () => {
      expect(formatCurrency(0)).toContain('0')
    })

    it('handles negative values', () => {
      const result = formatCurrency(-5000)
      expect(result).toContain('-')
    })

    it('no conversion when rate is null', () => {
      usePreferencesStore.setState({
        displayCurrency: 'USD',
        exchangeRate: null,
      })
      // Should return unconverted value with USD symbol
      const result = formatCurrency(100000)
      expect(result).toContain('100,000')
    })
  })
})
```

- [ ] **Step 2: Run the tests**

```bash
cd frontend && pnpm test -- src/lib/__tests__/formatters.test.ts
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/__tests__/formatters.test.ts
git commit -m "test: add currency conversion formatter tests"
```

---

## Task 12: Full Validation

- [ ] **Step 1: Run backend lint, type check, and tests**

```bash
cd backend && uv run ruff check . && uv run mypy src/ && uv run pytest tests/ -v --timeout=30
```

- [ ] **Step 2: Run frontend lint, type check, and tests**

```bash
cd frontend && pnpm run lint && pnpm run type-check && pnpm test
```

- [ ] **Step 3: Run full project check**

```bash
cd .. && pnpm run check
```

Expected: all checks pass.

- [ ] **Step 4: Fix any issues found and commit fixes**

- [ ] **Step 5: Final commit if any fixes were needed**

```bash
git add -A && git commit -m "fix: resolve lint and type issues from currency feature"
```
