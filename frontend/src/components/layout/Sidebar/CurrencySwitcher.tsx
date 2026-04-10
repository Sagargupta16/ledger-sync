import { useState, useRef, useEffect, useMemo } from 'react'
import { ChevronDown } from 'lucide-react'
import { usePreferencesStore } from '@/store/preferencesStore'
import { CURRENCIES, BASE_CURRENCY, type CurrencyMeta } from '@/constants/currencies'
import { useUpdatePreferences } from '@/hooks/api/usePreferences'
import { cn } from '@/lib/cn'

const currencyList = Object.values(CURRENCIES)

export default function CurrencySwitcher() {
  const [open, setOpen] = useState(false)
  const [currentTime, setCurrentTime] = useState(() => Date.now())
  const ref = useRef<HTMLDivElement>(null)
  const displayCurrency = usePreferencesStore((s) => s.displayCurrency)
  const exchangeRate = usePreferencesStore((s) => s.exchangeRate)
  const exchangeRateUpdatedAt = usePreferencesStore((s) => s.exchangeRateUpdatedAt)
  const setDisplayCurrency = usePreferencesStore((s) => s.setDisplayCurrency)
  const updatePreferences = useUpdatePreferences()

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

  const isConverted = displayCurrency !== BASE_CURRENCY

  // Format "time ago" for the rate indicator
  const timeAgo = useMemo(() => {
    if (!exchangeRateUpdatedAt) return null
    const diff = currentTime - new Date(exchangeRateUpdatedAt).getTime()
    const hours = Math.floor(diff / 3_600_000)
    if (hours < 1) return 'just now'
    return `${hours}h ago`
  }, [exchangeRateUpdatedAt, currentTime])

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
