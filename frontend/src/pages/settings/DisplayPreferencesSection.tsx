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
