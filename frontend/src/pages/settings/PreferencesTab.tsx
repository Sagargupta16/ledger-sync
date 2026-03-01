/**
 * Preferences Tab (Grouped)
 *
 * Combines six sections under collapsible panels:
 * 1. Display Preferences (from OtherSettingsTab)
 * 2. Fiscal Year (from OtherSettingsTab)
 * 3. Earning Start Date (from OtherSettingsTab)
 * 4. Notifications (from NotificationPreferencesTab)
 * 5. Anomaly Detection (from OtherSettingsTab)
 * 6. Recurring Transactions (from OtherSettingsTab)
 */

import { useState } from 'react'
import {
  Settings2,
  Calendar,
  Briefcase,
  Bell,
  AlertTriangle,
  RefreshCw,
  Receipt,
  Clock,
  Check,
  Palette,
  LayoutGrid,
} from 'lucide-react'
import CollapsibleSection from '@/components/ui/CollapsibleSection'
import type { LocalPrefs, LocalPrefKey } from './types'
import { MONTHS, TIME_RANGE_OPTIONS, ANOMALY_TYPES } from './types'

// Dashboard widget names for visibility toggles
const DASHBOARD_WIDGETS = [
  { key: 'savings_rate', label: 'Savings Rate' },
  { key: 'top_spending', label: 'Top Spending Category' },
  { key: 'top_income', label: 'Top Income Source' },
  { key: 'cashback', label: 'Net Cashback Earned' },
  { key: 'total_transactions', label: 'Total Transactions' },
  { key: 'biggest_transaction', label: 'Biggest Transaction' },
  { key: 'median_transaction', label: 'Median Transaction' },
  { key: 'daily_spending', label: 'Average Daily Spending' },
  { key: 'weekend_spending', label: 'Weekend Spending' },
  { key: 'peak_day', label: 'Peak Spending Day' },
  { key: 'burn_rate', label: 'Monthly Burn Rate' },
  { key: 'spending_diversity', label: 'Spending Diversity' },
  { key: 'avg_transaction', label: 'Avg Transaction Amount' },
  { key: 'total_transfers', label: 'Total Internal Transfers' },
] as const

function getStoredWidgets(): string[] {
  try {
    const raw = localStorage.getItem('ledger-sync-visible-widgets')
    if (raw) return JSON.parse(raw)
  } catch { /* use defaults */ }
  return DASHBOARD_WIDGETS.map((w) => w.key)
}

function getStoredTheme(): 'dark' | 'system' {
  return (localStorage.getItem('ledger-sync-theme') as 'dark' | 'system') || 'dark'
}

interface PreferencesTabProps {
  localPrefs: LocalPrefs
  updateLocalPref: <K extends LocalPrefKey>(key: K, value: LocalPrefs[K]) => void
}

const DAYS_AHEAD_OPTIONS = [
  { value: 3, label: '3 days' },
  { value: 5, label: '5 days' },
  { value: 7, label: '7 days' },
  { value: 14, label: '14 days' },
]

interface ToggleRowProps {
  readonly id: string
  readonly icon: React.ElementType
  readonly label: string
  readonly description: string
  readonly checked: boolean
  readonly onChange: (checked: boolean) => void
}

function ToggleRow({ id, icon: Icon, label, description, checked, onChange }: ToggleRowProps) {
  return (
    <div className="flex items-center justify-between gap-4 py-4 border-b border-border last:border-b-0">
      <div className="flex items-start gap-3">
        <Icon className="w-5 h-5 text-primary mt-0.5" />
        <div>
          <label htmlFor={id} className="text-sm font-medium text-white cursor-pointer">
            {label}
          </label>
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        </div>
      </div>
      <button
        id={id}
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
          checked ? 'bg-primary' : 'bg-white/20'
        }`}
      >
        <span
          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg transition-transform ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  )
}

export default function PreferencesTab({
  localPrefs,
  updateLocalPref,
}: Readonly<PreferencesTabProps>) {
  const [theme, setTheme] = useState<'dark' | 'system'>(getStoredTheme)
  const [visibleWidgets, setVisibleWidgets] = useState<string[]>(getStoredWidgets)
  const toggleAnomalyType = (type: string) => {
    const enabled = localPrefs.anomaly_types_enabled.includes(type)
    updateLocalPref(
      'anomaly_types_enabled',
      enabled
        ? localPrefs.anomaly_types_enabled.filter((t) => t !== type)
        : [...localPrefs.anomaly_types_enabled, type],
    )
  }

  return (
    <div className="space-y-4">
      {/* Section 1: Display Preferences */}
      <CollapsibleSection title="Display Preferences" icon={Settings2} defaultExpanded={true}>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label
              htmlFor="number-format"
              className="block text-sm font-medium text-foreground mb-2"
            >
              Number Format
            </label>
            <select
              id="number-format"
              value={localPrefs.number_format}
              onChange={(e) =>
                updateLocalPref('number_format', e.target.value as 'indian' | 'international')
              }
              className="w-full px-3 py-2 bg-white/5 border border-border-strong rounded-lg text-white text-sm focus:border-primary"
            >
              <option value="indian" className="bg-background">
                Indian (1,00,000)
              </option>
              <option value="international" className="bg-background">
                International (100,000)
              </option>
            </select>
          </div>
          <div>
            <label
              htmlFor="currency-symbol"
              className="block text-sm font-medium text-foreground mb-2"
            >
              Currency Symbol
            </label>
            <input
              id="currency-symbol"
              type="text"
              value={localPrefs.currency_symbol}
              onChange={(e) => updateLocalPref('currency_symbol', e.target.value)}
              className="w-full px-3 py-2 bg-white/5 border border-border-strong rounded-lg text-white text-sm focus:border-primary"
            />
          </div>
          <div>
            <label
              htmlFor="symbol-position"
              className="block text-sm font-medium text-foreground mb-2"
            >
              Symbol Position
            </label>
            <select
              id="symbol-position"
              value={localPrefs.currency_symbol_position}
              onChange={(e) =>
                updateLocalPref('currency_symbol_position', e.target.value as 'before' | 'after')
              }
              className="w-full px-3 py-2 bg-white/5 border border-border-strong rounded-lg text-white text-sm focus:border-primary"
            >
              <option value="before" className="bg-background">
                Before ({localPrefs.currency_symbol}100)
              </option>
              <option value="after" className="bg-background">
                After (100{localPrefs.currency_symbol})
              </option>
            </select>
          </div>
          <div>
            <label
              htmlFor="time-range"
              className="block text-sm font-medium text-foreground mb-2"
            >
              Default Time Range
            </label>
            <select
              id="time-range"
              value={localPrefs.default_time_range}
              onChange={(e) => updateLocalPref('default_time_range', e.target.value)}
              className="w-full px-3 py-2 bg-white/5 border border-border-strong rounded-lg text-white text-sm focus:border-primary"
            >
              {TIME_RANGE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value} className="bg-background">
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </CollapsibleSection>

      {/* Section 2: Fiscal Year */}
      <CollapsibleSection title="Fiscal Year" icon={Calendar} defaultExpanded={true}>
        <div className="max-w-sm">
          <label
            htmlFor="fiscal-month"
            className="block text-sm font-medium text-foreground mb-2"
          >
            Fiscal Year Starts In
          </label>
          <select
            id="fiscal-month"
            value={localPrefs.fiscal_year_start_month}
            onChange={(e) =>
              updateLocalPref('fiscal_year_start_month', Number(e.target.value))
            }
            className="w-full px-4 py-2 bg-white/5 border border-border-strong rounded-lg text-white focus:border-primary"
          >
            {MONTHS.map((month) => (
              <option key={month.value} value={month.value} className="bg-background">
                {month.label}
              </option>
            ))}
          </select>
          <p className="mt-2 text-xs text-muted-foreground">Default: April (India FY)</p>
        </div>
      </CollapsibleSection>

      {/* Section 3: Earning Start Date */}
      <CollapsibleSection title="Earning Start Date" icon={Briefcase} defaultExpanded={true}>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Set the date when you started earning. When enabled, all analytics and stats will only
            include transactions from this date onwards.
          </p>
          <div className="flex flex-col sm:flex-row items-start sm:items-end gap-4">
            <div>
              <label
                htmlFor="earning-start-date"
                className="block text-sm font-medium text-foreground mb-2"
              >
                Start Date
              </label>
              <input
                id="earning-start-date"
                type="date"
                value={localPrefs.earning_start_date ?? ''}
                onChange={(e) =>
                  updateLocalPref('earning_start_date', e.target.value || null)
                }
                className="w-56 px-3 py-2 bg-white/5 border border-border-strong rounded-lg text-white text-sm focus:border-primary"
              />
            </div>
            <label className="flex items-center gap-3 cursor-pointer pb-0.5">
              <input
                type="checkbox"
                checked={localPrefs.use_earning_start_date}
                disabled={!localPrefs.earning_start_date}
                onChange={(e) => updateLocalPref('use_earning_start_date', e.target.checked)}
                className="w-4 h-4 rounded bg-white/5 border-border-strong text-primary focus:ring-primary disabled:opacity-40"
              />
              <span className="text-sm text-white">Use as analytics start date</span>
            </label>
          </div>
          {localPrefs.use_earning_start_date && localPrefs.earning_start_date && (
            <p className="mt-3 text-xs text-ios-green">
              All analytics will show data from{' '}
              {new Date(localPrefs.earning_start_date + 'T00:00:00').toLocaleDateString('en-IN', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}{' '}
              onwards.
            </p>
          )}
        </div>
      </CollapsibleSection>

      {/* Section 4: Notifications */}
      <CollapsibleSection title="Notifications" icon={Bell} defaultExpanded={false}>
        <div className="space-y-6">
          {/* Toggle Switches */}
          <div>
            <h3 className="text-sm font-semibold text-white mb-2">Alerts & Notifications</h3>
            <p className="text-xs text-muted-foreground mb-3">
              Choose which notifications you want to receive.
            </p>
            <div className="divide-y divide-border">
              <ToggleRow
                id="notify-budget-alerts"
                icon={Receipt}
                label="Budget Alerts"
                description="Notify when spending approaches or exceeds your budget thresholds."
                checked={localPrefs.notify_budget_alerts ?? true}
                onChange={(val) => updateLocalPref('notify_budget_alerts', val)}
              />
              <ToggleRow
                id="notify-anomalies"
                icon={AlertTriangle}
                label="Anomaly Alerts"
                description="Notify when unusual spending patterns or anomalies are detected."
                checked={localPrefs.notify_anomalies ?? true}
                onChange={(val) => updateLocalPref('notify_anomalies', val)}
              />
              <ToggleRow
                id="notify-upcoming-bills"
                icon={Clock}
                label="Upcoming Bills"
                description="Notify before recurring bills and fixed expenses are due."
                checked={localPrefs.notify_upcoming_bills ?? true}
                onChange={(val) => updateLocalPref('notify_upcoming_bills', val)}
              />
            </div>
          </div>

          {/* Days Ahead */}
          <div>
            <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
              <Clock className="w-4 h-4 text-primary" />
              Bill Reminder Timing
            </h3>
            <div className="max-w-sm space-y-3">
              <label
                htmlFor="notify-days-ahead"
                className="block text-sm font-medium text-foreground"
              >
                Notify Before Due Date
              </label>
              <select
                id="notify-days-ahead"
                value={localPrefs.notify_days_ahead ?? 7}
                onChange={(e) => updateLocalPref('notify_days_ahead', Number(e.target.value))}
                className="w-full px-4 py-2 bg-white/5 border border-border-strong rounded-lg text-white focus:border-primary"
              >
                {DAYS_AHEAD_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value} className="bg-background">
                    {opt.label}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                How many days before a recurring bill is due should you be notified. Default: 7
                days
              </p>
            </div>
          </div>
        </div>
      </CollapsibleSection>

      {/* Section 5: Anomaly Detection */}
      <CollapsibleSection title="Anomaly Detection" icon={AlertTriangle} defaultExpanded={false}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div>
              <label
                htmlFor="expense-threshold"
                className="block text-sm font-medium text-foreground mb-2"
              >
                Expense Threshold (Std Devs)
              </label>
              <input
                id="expense-threshold"
                type="number"
                min="1"
                max="10"
                step="0.5"
                value={localPrefs.anomaly_expense_threshold}
                onChange={(e) =>
                  updateLocalPref('anomaly_expense_threshold', Number(e.target.value))
                }
                className="w-full px-3 py-2 bg-white/5 border border-border-strong rounded-lg text-white text-sm focus:border-primary"
              />
            </div>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={localPrefs.auto_dismiss_recurring_anomalies}
                onChange={(e) =>
                  updateLocalPref('auto_dismiss_recurring_anomalies', e.target.checked)
                }
                className="w-4 h-4 rounded bg-white/5 border-border-strong text-primary focus:ring-primary"
              />
              <span className="text-sm text-white">Auto-dismiss recurring anomalies</span>
            </label>
          </div>
          <div>
            <span className="block text-sm font-medium text-foreground mb-2">
              Enabled Anomaly Types
            </span>
            <div className="space-y-2">
              {ANOMALY_TYPES.map((type) => (
                <label key={type.value} className="flex items-center gap-3 cursor-pointer">
                  <button
                    type="button"
                    onClick={() => toggleAnomalyType(type.value)}
                    className={`w-4 h-4 rounded flex items-center justify-center transition-colors ${
                      localPrefs.anomaly_types_enabled.includes(type.value)
                        ? 'bg-primary text-white'
                        : 'bg-white/5 border border-border-strong'
                    }`}
                  >
                    {localPrefs.anomaly_types_enabled.includes(type.value) && (
                      <Check className="w-3 h-3" />
                    )}
                  </button>
                  <span className="text-sm text-white">{type.label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      </CollapsibleSection>

      {/* Section 6: Appearance */}
      <CollapsibleSection title="Appearance" icon={Palette} defaultExpanded={false}>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">Choose your preferred theme. Dark mode is optimized for OLED screens.</p>
          <div className="flex gap-3">
            {(['dark', 'system'] as const).map((t) => (
              <label
                key={t}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg cursor-pointer transition-colors border ${
                  theme === t
                    ? 'bg-primary/15 border-primary text-white'
                    : 'bg-white/5 border-border-strong text-muted-foreground hover:text-white'
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
                <span className="text-sm font-medium capitalize">{t === 'system' ? 'System (Auto)' : 'Dark'}</span>
              </label>
            ))}
          </div>
          {theme === 'system' && (
            <p className="text-xs text-ios-yellow">Light theme coming soon. Currently defaults to dark.</p>
          )}
        </div>
      </CollapsibleSection>

      {/* Section 7: Dashboard Widgets */}
      <CollapsibleSection title="Dashboard Widgets" icon={LayoutGrid} defaultExpanded={false}>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">Choose which Quick Insight cards appear on your Dashboard.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {DASHBOARD_WIDGETS.map((widget) => {
              const isVisible = visibleWidgets.includes(widget.key)
              return (
                <label
                  key={widget.key}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
                    isVisible ? 'bg-white/5 hover:bg-white/10' : 'opacity-50 hover:opacity-75'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      const next = isVisible
                        ? visibleWidgets.filter((w) => w !== widget.key)
                        : [...visibleWidgets, widget.key]
                      setVisibleWidgets(next)
                      localStorage.setItem('ledger-sync-visible-widgets', JSON.stringify(next))
                    }}
                    className={`w-5 h-5 rounded flex items-center justify-center shrink-0 transition-colors ${
                      isVisible
                        ? 'bg-primary/20 text-primary border border-primary/50'
                        : 'bg-white/5 border border-border-strong'
                    }`}
                  >
                    {isVisible && <Check className="w-3 h-3" />}
                  </button>
                  <span className="text-sm text-white">{widget.label}</span>
                </label>
              )
            })}
          </div>
          <button
            type="button"
            onClick={() => {
              const all = DASHBOARD_WIDGETS.map((w) => w.key)
              setVisibleWidgets(all)
              localStorage.setItem('ledger-sync-visible-widgets', JSON.stringify(all))
            }}
            className="text-xs text-primary hover:underline"
          >
            Show all widgets
          </button>
        </div>
      </CollapsibleSection>

      {/* Section 8: Recurring Transactions */}
      <CollapsibleSection
        title="Recurring Transactions"
        icon={RefreshCw}
        defaultExpanded={false}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label
              htmlFor="min-confidence"
              className="block text-sm font-medium text-foreground mb-2"
            >
              Minimum Confidence (%)
            </label>
            <input
              id="min-confidence"
              type="number"
              min="0"
              max="100"
              value={localPrefs.recurring_min_confidence}
              onChange={(e) =>
                updateLocalPref('recurring_min_confidence', Number(e.target.value))
              }
              className="w-full px-3 py-2 bg-white/5 border border-border-strong rounded-lg text-white text-sm focus:border-primary"
            />
          </div>
          <div>
            <label
              htmlFor="auto-confirm"
              className="block text-sm font-medium text-foreground mb-2"
            >
              Auto-confirm After (occurrences)
            </label>
            <input
              id="auto-confirm"
              type="number"
              min="2"
              max="12"
              value={localPrefs.recurring_auto_confirm_occurrences}
              onChange={(e) =>
                updateLocalPref('recurring_auto_confirm_occurrences', Number(e.target.value))
              }
              className="w-full px-3 py-2 bg-white/5 border border-border-strong rounded-lg text-white text-sm focus:border-primary"
            />
          </div>
        </div>
      </CollapsibleSection>
    </div>
  )
}
