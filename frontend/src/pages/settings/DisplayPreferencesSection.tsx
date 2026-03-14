/**
 * Display & Preferences section - formats, currency, time range, appearance.
 */

import { Settings2, Palette } from 'lucide-react'
import { TIME_RANGE_OPTIONS } from './types'
import type { LocalPrefs, LocalPrefKey } from './types'
import { Section, FieldLabel, FieldHint } from './components'
import { inputClass, selectClass } from './styles'

interface Props {
  index: number
  localPrefs: LocalPrefs
  theme: 'dark' | 'system'
  setTheme: (t: 'dark' | 'system') => void
  updateLocalPref: <K extends LocalPrefKey>(key: K, value: LocalPrefs[K]) => void
}

export default function DisplayPreferencesSection({
  index,
  localPrefs,
  theme,
  setTheme,
  updateLocalPref,
}: Readonly<Props>) {
  return (
    <Section
      index={index}
      icon={Settings2}
      title="Display & Preferences"
      description="Number formats, currency, time ranges, and appearance"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {/* Number Format */}
        <div>
          <FieldLabel htmlFor="number-format">Number Format</FieldLabel>
          <select
            id="number-format"
            value={localPrefs.number_format}
            onChange={(e) =>
              updateLocalPref('number_format', e.target.value as 'indian' | 'international')
            }
            className={selectClass}
          >
            <option value="indian" className="bg-background">Indian (1,00,000)</option>
            <option value="international" className="bg-background">International (100,000)</option>
          </select>
        </div>

        {/* Currency Symbol */}
        <div>
          <FieldLabel htmlFor="currency-symbol">Currency Symbol</FieldLabel>
          <input
            id="currency-symbol"
            type="text"
            value={localPrefs.currency_symbol}
            onChange={(e) => updateLocalPref('currency_symbol', e.target.value)}
            className={inputClass}
          />
        </div>

        {/* Symbol Position */}
        <div>
          <FieldLabel htmlFor="symbol-position">Symbol Position</FieldLabel>
          <select
            id="symbol-position"
            value={localPrefs.currency_symbol_position}
            onChange={(e) =>
              updateLocalPref('currency_symbol_position', e.target.value as 'before' | 'after')
            }
            className={selectClass}
          >
            <option value="before" className="bg-background">
              Before ({localPrefs.currency_symbol}100)
            </option>
            <option value="after" className="bg-background">
              After (100{localPrefs.currency_symbol})
            </option>
          </select>
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
              className={`${inputClass} w-auto`}
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
                    localStorage.setItem('ledger-sync-theme', t)
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
