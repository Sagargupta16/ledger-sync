import { useState, useRef, useEffect, useMemo } from 'react'
import { ChevronDown } from 'lucide-react'
import { usePreferencesStore } from '@/store/preferencesStore'
import {
  BASE_CURRENCY,
  effectiveCurrencyCode,
  selectableCurrencies,
  type CurrencyMeta,
} from '@/constants/currencies'
import { useExchangeRate } from '@/hooks/api/useExchangeRate'
import { useUpdatePreferences } from '@/hooks/api/usePreferences'
import { cn } from '@/lib/cn'

export default function CurrencySwitcher() {
  const [open, setOpen] = useState(false)
  const [currentTime, setCurrentTime] = useState(() => Date.now())
  const ref = useRef<HTMLDivElement>(null)
  const displayCurrency = usePreferencesStore((s) => s.displayCurrency)
  const exchangeRate = usePreferencesStore((s) => s.exchangeRate)
  const exchangeRateUpdatedAt = usePreferencesStore((s) => s.exchangeRateUpdatedAt)
  const setDisplayCurrency = usePreferencesStore((s) => s.setDisplayCurrency)
  const updatePreferences = useUpdatePreferences()
  // Shares AppLayout's query (same key), so this adds no request.
  const { ratedCodes, isLoading: ratesLoading } = useExchangeRate()

  // Offer only what the served rates can actually price, plus the base currency.
  // Listing the whole `CURRENCIES` catalogue is what let a user pick AED, which
  // the live ECB feed does not carry -- see `selectableCurrencies`.
  const currencyList = useMemo(() => selectableCurrencies(ratedCodes), [ratedCodes])

  // What the money on screen is really denominated in. Diverges from
  // `displayCurrency` when the selection cannot be priced (an unsupported code
  // persisted from before this was enforced, or rates still loading/failed), in
  // which case the formatters render base currency and this must say so.
  const renderCurrency = effectiveCurrencyCode(displayCurrency, exchangeRate)
  // A fetch still in flight is not evidence the currency is unsupported, so the
  // warning waits for the payload. The label meanwhile shows the base currency,
  // which is what the amounts genuinely are until a rate lands.
  const isUnpriced = renderCurrency !== displayCurrency && !ratesLoading

  // Update current time every minute for "time ago" display
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(Date.now()), 60_000)
    return () => clearInterval(interval)
  }, [])

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

  // Highlight the control only when conversion is genuinely in effect. Keying
  // this off the selection alone painted the "converted" accent over figures
  // that were still plain rupees.
  const isConverted = renderCurrency !== BASE_CURRENCY

  // Format "time ago" for the rate indicator
  const timeAgo = useMemo(() => {
    if (!exchangeRateUpdatedAt) return null
    const diff = currentTime - new Date(exchangeRateUpdatedAt).getTime()
    const hours = Math.floor(diff / 3_600_000)
    if (hours < 1) return 'just now'
    return `${hours}h ago`
  }, [exchangeRateUpdatedAt, currentTime])

  // Inverse rate for display (e.g., "1 USD = 92.68 INR")
  const inverseRate = exchangeRate && exchangeRate > 0 ? (1 / exchangeRate).toFixed(2) : null

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          'ledger-control flex min-h-11 items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition-colors lg:min-h-8',
          isConverted
            ? 'bg-app-blue/15 text-app-blue hover:bg-app-blue/25'
            : 'text-text-tertiary hover:text-foreground hover:bg-[var(--overlay-3)]',
        )}
        title={
          isUnpriced
            ? `No exchange rate for ${displayCurrency} -- showing amounts in ${BASE_CURRENCY}`
            : `Display currency: ${displayCurrency}`
        }
        aria-label={
          isUnpriced
            ? `Change display currency (no rate for ${displayCurrency}, showing ${BASE_CURRENCY})`
            : `Change display currency (currently ${displayCurrency})`
        }
        aria-expanded={open}
        aria-controls="display-currency-options"
      >
        {/* The code shown is the one the amounts are actually in, so the sidebar
            label can never contradict the figures beside it. */}
        <span>{renderCurrency}</span>
        <ChevronDown size={12} />
      </button>

      {/* No rate for the stored selection: say so rather than let the fallback to
          base currency pass unexplained. Unlike the old silent behaviour, the
          amounts really are rupees now, so this only names what is on screen. */}
      {isUnpriced && (
        // Native <output>, not role="status" (S6819) -- it carries the live-region
        // semantics itself, matching StaleDataBadge and PartialPeriodNotice. The
        // `block` is explicit because <output> is inline by default; `absolute`
        // already blockifies it, so this only pins the intent.
        <output className="absolute left-1/2 mt-1 block -translate-x-1/2 whitespace-nowrap rounded-full border border-warning/20 bg-warning/10 px-2 py-0.5 text-[10px] text-warning">
          No {displayCurrency} rate -- in {BASE_CURRENCY}
        </output>
      )}

      {/* Rate indicator pill */}
      {isConverted && exchangeRate && (
        <div
          className="absolute left-1/2 -translate-x-1/2 mt-1 px-2 py-0.5 rounded-full bg-app-blue/10 text-[10px] text-app-blue whitespace-nowrap"
          title={timeAgo ? `Rate updated ${timeAgo}` : 'Exchange rate'}
        >
          1 {displayCurrency} = {BASE_CURRENCY} {inverseRate}
        </div>
      )}

      {/* Dropdown */}
      {open && (
        <ul
          id="display-currency-options"
          aria-label="Display currency"
          className="absolute bottom-full left-0 z-50 m-0 mb-2 max-h-72 w-56 list-none overflow-y-auto rounded-lg border border-border bg-surface-dropdown p-0 shadow-[var(--glass-shadow-strong)]"
        >
          {currencyList.map((meta) => (
            <li key={meta.code}>
              <button
                type="button"
                aria-pressed={meta.code === displayCurrency}
                onClick={() => handleSelect(meta)}
                className={cn(
                  'flex min-h-11 w-full items-center gap-3 px-3 py-2 text-sm transition-colors',
                  meta.code === displayCurrency
                    ? 'bg-app-blue/15 text-foreground'
                    : 'text-muted-foreground hover:bg-[var(--overlay-3)] hover:text-foreground',
                )}
              >
                <span className="w-6 text-center font-medium text-xs">{meta.symbol}</span>
                <span className="flex-1 text-left">{meta.name}</span>
                <span className="text-xs text-text-tertiary">{meta.code}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
