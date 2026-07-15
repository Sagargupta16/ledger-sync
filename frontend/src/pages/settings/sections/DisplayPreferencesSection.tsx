/**
 * Display & Preferences section - display currency, time range, appearance.
 *
 * Currency selection auto-derives number format, symbol, and position
 * from the CURRENCIES metadata map.
 */

import { Settings2, Sun, Moon, type LucideIcon } from 'lucide-react'
import { CURRENCIES, getCurrencyMeta } from '@/constants/currencies'
import { useThemeStore } from '@/store/themeStore'
import type { ThemeMode } from '@/lib/theme'
import { TIME_RANGE_OPTIONS } from '../types'
import type { LocalPrefs, LocalPrefKey } from '../types'
import { Section, FieldLabel, FieldHint } from '../sectionPrimitives'
import { selectClass } from '../styles'

interface Props {
  index: number
  localPrefs: LocalPrefs
  updateLocalPref: <K extends LocalPrefKey>(key: K, value: LocalPrefs[K]) => void
}

const currencyList = Object.values(CURRENCIES)

const THEME_OPTIONS: { value: ThemeMode; label: string; Icon: LucideIcon }[] = [
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
]

export default function DisplayPreferencesSection({
  index,
  localPrefs,
  updateLocalPref,
}: Readonly<Props>) {
  const themeMode = useThemeStore((s) => s.mode)
  const setThemeMode = useThemeStore((s) => s.setMode)
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
          <div className="px-3 py-2 bg-[var(--overlay-2)] border border-border/50 rounded-lg text-sm text-muted-foreground">
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
            <label className="flex min-h-11 cursor-pointer items-center gap-2 sm:min-h-10">
              <input
                type="checkbox"
                checked={localPrefs.use_earning_start_date}
                disabled={!localPrefs.earning_start_date}
                onChange={(e) => updateLocalPref('use_earning_start_date', e.target.checked)}
                className="w-4 h-4 rounded bg-[var(--overlay-2)] border-border text-primary focus:ring-primary disabled:opacity-40"
              />
              <span className="text-sm text-foreground">Use as analytics start</span>
            </label>
          </div>
          {localPrefs.use_earning_start_date && localPrefs.earning_start_date && (
            <p className="mt-1.5 text-xs text-app-green">
              Analytics from{' '}
              {new Date(localPrefs.earning_start_date + 'T00:00:00').toLocaleDateString(
                'en-IN',
                { day: 'numeric', month: 'long', year: 'numeric' },
              )}
            </p>
          )}
        </div>

        {/* Appearance -- applied immediately (not part of the staged Save). */}
        <div className="lg:col-span-3">
          <FieldLabel>Appearance</FieldLabel>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Theme">
            {THEME_OPTIONS.map(({ value, label, Icon }) => (
              <label
                key={value}
                className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-4 py-2.5 text-sm transition-colors sm:min-h-10 ${
                  themeMode === value
                    ? 'bg-primary/15 border-primary text-foreground font-medium'
                    : 'bg-surface-hover border-border text-muted-foreground hover:text-foreground'
                }`}
              >
                <input
                  type="radio"
                  name="theme"
                  value={value}
                  checked={themeMode === value}
                  onChange={() => setThemeMode(value)}
                  className="sr-only"
                />
                <Icon className="w-4 h-4" />
                {label}
              </label>
            ))}
          </div>
          <FieldHint>New users start on their device's light/dark preference.</FieldHint>
        </div>
      </div>
    </Section>
  )
}
