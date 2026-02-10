/**
 * Other Settings Tab
 *
 * Combines Fiscal Year, Display Preferences, Budget Defaults,
 * Anomaly Detection, and Recurring Transaction settings.
 */

import {
  Briefcase,
  Calendar,
  Settings2,
  PiggyBank,
  AlertTriangle,
  RefreshCw,
  Check,
  CreditCard,
  Target,
} from 'lucide-react'
import type { LocalPrefs, LocalPrefKey } from './types'
import { MONTHS, TIME_RANGE_OPTIONS, ANOMALY_TYPES } from './types'
import { formatCurrency } from '@/lib/formatters'

interface OtherSettingsTabProps {
  localPrefs: LocalPrefs
  updateLocalPref: <K extends LocalPrefKey>(key: K, value: LocalPrefs[K]) => void
  creditCardAccounts: string[]
}

export default function OtherSettingsTab({
  localPrefs,
  updateLocalPref,
  creditCardAccounts,
}: OtherSettingsTabProps) {
  const toggleAnomalyType = (type: string) => {
    const enabled = localPrefs.anomaly_types_enabled.includes(type)
    updateLocalPref(
      'anomaly_types_enabled',
      enabled
        ? localPrefs.anomaly_types_enabled.filter((t) => t !== type)
        : [...localPrefs.anomaly_types_enabled, type]
    )
  }

  return (
    <div className="space-y-8">
      <h2 className="text-xl font-semibold text-white">Other Settings</h2>

      {/* Earning Start Date Section */}
      <div className="glass rounded-lg p-5 border border-white/10">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Briefcase className="w-5 h-5 text-primary" />
          Earning Start Date
        </h3>
        <p className="text-sm text-gray-400 mb-4">
          Set the date when you started earning. When enabled, all analytics and stats will only
          include transactions from this date onwards.
        </p>
        <div className="flex flex-col sm:flex-row items-start sm:items-end gap-4">
          <div>
            <label htmlFor="earning-start-date" className="block text-sm font-medium text-gray-300 mb-2">
              Start Date
            </label>
            <input
              id="earning-start-date"
              type="date"
              value={localPrefs.earning_start_date ?? ''}
              onChange={(e) =>
                updateLocalPref('earning_start_date', e.target.value || null)
              }
              className="w-56 px-3 py-2 bg-white/5 border border-white/20 rounded-lg text-white text-sm focus:border-primary"
            />
          </div>
          <label className="flex items-center gap-3 cursor-pointer pb-0.5">
            <input
              type="checkbox"
              checked={localPrefs.use_earning_start_date}
              disabled={!localPrefs.earning_start_date}
              onChange={(e) => updateLocalPref('use_earning_start_date', e.target.checked)}
              className="w-4 h-4 rounded bg-white/5 border-white/20 text-primary focus:ring-primary disabled:opacity-40"
            />
            <span className="text-sm text-white">Use as analytics start date</span>
          </label>
        </div>
        {localPrefs.use_earning_start_date && localPrefs.earning_start_date && (
          <p className="mt-3 text-xs text-green-400">
            All analytics will show data from {new Date(localPrefs.earning_start_date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })} onwards.
          </p>
        )}
      </div>

      {/* Fiscal Year Section */}
      <div className="glass rounded-lg p-5 border border-white/10">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Calendar className="w-5 h-5 text-primary" />
          Fiscal Year
        </h3>
        <div className="max-w-sm">
          <label htmlFor="fiscal-month" className="block text-sm font-medium text-gray-300 mb-2">
            Fiscal Year Starts In
          </label>
          <select
            id="fiscal-month"
            value={localPrefs.fiscal_year_start_month}
            onChange={(e) => updateLocalPref('fiscal_year_start_month', Number(e.target.value))}
            className="w-full px-4 py-2 bg-white/5 border border-white/20 rounded-lg text-white focus:border-primary"
          >
            {MONTHS.map((month) => (
              <option key={month.value} value={month.value} className="bg-gray-900">
                {month.label}
              </option>
            ))}
          </select>
          <p className="mt-2 text-xs text-gray-400">Default: April (India FY)</p>
        </div>
      </div>

      {/* Display Preferences Section */}
      <div className="glass rounded-lg p-5 border border-white/10">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Settings2 className="w-5 h-5 text-primary" />
          Display Preferences
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label htmlFor="number-format" className="block text-sm font-medium text-gray-300 mb-2">
              Number Format
            </label>
            <select
              id="number-format"
              value={localPrefs.number_format}
              onChange={(e) =>
                updateLocalPref('number_format', e.target.value as 'indian' | 'international')
              }
              className="w-full px-3 py-2 bg-white/5 border border-white/20 rounded-lg text-white text-sm focus:border-primary"
            >
              <option value="indian" className="bg-gray-900">
                Indian (1,00,000)
              </option>
              <option value="international" className="bg-gray-900">
                International (100,000)
              </option>
            </select>
          </div>
          <div>
            <label htmlFor="currency-symbol" className="block text-sm font-medium text-gray-300 mb-2">
              Currency Symbol
            </label>
            <input
              id="currency-symbol"
              type="text"
              value={localPrefs.currency_symbol}
              onChange={(e) => updateLocalPref('currency_symbol', e.target.value)}
              className="w-full px-3 py-2 bg-white/5 border border-white/20 rounded-lg text-white text-sm focus:border-primary"
            />
          </div>
          <div>
            <label htmlFor="symbol-position" className="block text-sm font-medium text-gray-300 mb-2">
              Symbol Position
            </label>
            <select
              id="symbol-position"
              value={localPrefs.currency_symbol_position}
              onChange={(e) =>
                updateLocalPref(
                  'currency_symbol_position',
                  e.target.value as 'before' | 'after'
                )
              }
              className="w-full px-3 py-2 bg-white/5 border border-white/20 rounded-lg text-white text-sm focus:border-primary"
            >
              <option value="before" className="bg-gray-900">
                Before ({localPrefs.currency_symbol}100)
              </option>
              <option value="after" className="bg-gray-900">
                After (100{localPrefs.currency_symbol})
              </option>
            </select>
          </div>
          <div>
            <label htmlFor="time-range" className="block text-sm font-medium text-gray-300 mb-2">
              Default Time Range
            </label>
            <select
              id="time-range"
              value={localPrefs.default_time_range}
              onChange={(e) => updateLocalPref('default_time_range', e.target.value)}
              className="w-full px-3 py-2 bg-white/5 border border-white/20 rounded-lg text-white text-sm focus:border-primary"
            >
              {TIME_RANGE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value} className="bg-gray-900">
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Budget Defaults Section */}
      <div className="glass rounded-lg p-5 border border-white/10">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <PiggyBank className="w-5 h-5 text-primary" />
          Budget Defaults
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
          <div>
            <label htmlFor="alert-threshold" className="block text-sm font-medium text-gray-300 mb-2">
              Alert Threshold (%)
            </label>
            <input
              id="alert-threshold"
              type="number"
              min="0"
              max="100"
              value={localPrefs.default_budget_alert_threshold}
              onChange={(e) =>
                updateLocalPref('default_budget_alert_threshold', Number(e.target.value))
              }
              className="w-full px-3 py-2 bg-white/5 border border-white/20 rounded-lg text-white text-sm focus:border-primary"
            />
          </div>
          <label className="flex items-center gap-3 cursor-pointer pt-7">
            <input
              type="checkbox"
              checked={localPrefs.auto_create_budgets}
              onChange={(e) => updateLocalPref('auto_create_budgets', e.target.checked)}
              className="w-4 h-4 rounded bg-white/5 border-white/20 text-primary focus:ring-primary"
            />
            <span className="text-sm text-white">Auto-create budgets</span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer pt-7">
            <input
              type="checkbox"
              checked={localPrefs.budget_rollover_enabled}
              onChange={(e) => updateLocalPref('budget_rollover_enabled', e.target.checked)}
              className="w-4 h-4 rounded bg-white/5 border-white/20 text-primary focus:ring-primary"
            />
            <span className="text-sm text-white">Budget rollover</span>
          </label>
        </div>
      </div>

      {/* Anomaly Detection Section */}
      <div className="glass rounded-lg p-5 border border-white/10">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-primary" />
          Anomaly Detection
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div>
              <label
                htmlFor="expense-threshold"
                className="block text-sm font-medium text-gray-300 mb-2"
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
                className="w-full px-3 py-2 bg-white/5 border border-white/20 rounded-lg text-white text-sm focus:border-primary"
              />
            </div>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={localPrefs.auto_dismiss_recurring_anomalies}
                onChange={(e) =>
                  updateLocalPref('auto_dismiss_recurring_anomalies', e.target.checked)
                }
                className="w-4 h-4 rounded bg-white/5 border-white/20 text-primary focus:ring-primary"
              />
              <span className="text-sm text-white">Auto-dismiss recurring anomalies</span>
            </label>
          </div>
          <div>
            <span className="block text-sm font-medium text-gray-300 mb-2">
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
                        : 'bg-white/5 border border-white/20'
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
      </div>

      {/* Spending Rule Targets Section */}
      <div className="glass rounded-lg p-5 border border-white/10">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Target className="w-5 h-5 text-primary" />
          Spending Rule (Needs / Wants / Savings)
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label htmlFor="needs-target" className="block text-sm font-medium text-gray-300 mb-2">
              Needs Target (%)
            </label>
            <input
              id="needs-target"
              type="number"
              min="0"
              max="100"
              value={localPrefs.needs_target_percent}
              onChange={(e) =>
                updateLocalPref('needs_target_percent', Number(e.target.value))
              }
              className="w-full px-3 py-2 bg-white/5 border border-white/20 rounded-lg text-white text-sm focus:border-primary"
            />
          </div>
          <div>
            <label htmlFor="wants-target" className="block text-sm font-medium text-gray-300 mb-2">
              Wants Target (%)
            </label>
            <input
              id="wants-target"
              type="number"
              min="0"
              max="100"
              value={localPrefs.wants_target_percent}
              onChange={(e) =>
                updateLocalPref('wants_target_percent', Number(e.target.value))
              }
              className="w-full px-3 py-2 bg-white/5 border border-white/20 rounded-lg text-white text-sm focus:border-primary"
            />
          </div>
          <div>
            <label htmlFor="savings-target" className="block text-sm font-medium text-gray-300 mb-2">
              Savings Target (%)
            </label>
            <input
              id="savings-target"
              type="number"
              min="0"
              max="100"
              value={localPrefs.savings_target_percent}
              onChange={(e) =>
                updateLocalPref('savings_target_percent', Number(e.target.value))
              }
              className="w-full px-3 py-2 bg-white/5 border border-white/20 rounded-lg text-white text-sm focus:border-primary"
            />
          </div>
        </div>
        {(() => {
          const sum = localPrefs.needs_target_percent + localPrefs.wants_target_percent + localPrefs.savings_target_percent
          if (sum !== 100) {
            return (
              <p className="mt-3 text-xs text-yellow-400">
                Targets sum to {sum}% — they should add up to 100%.
              </p>
            )
          }
          return <p className="mt-3 text-xs text-gray-400">Default: 50% Needs / 30% Wants / 20% Savings</p>
        })()}
      </div>

      {/* Credit Card Limits Section */}
      <div className="glass rounded-lg p-5 border border-white/10">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <CreditCard className="w-5 h-5 text-primary" />
          Credit Card Limits
        </h3>
        {creditCardAccounts.length === 0 ? (
          <p className="text-sm text-gray-400">
            No credit card accounts found. Classify accounts as "Credit Cards" in the Account Types tab to set limits.
          </p>
        ) : (
          <div className="space-y-3">
            {creditCardAccounts.map((card) => (
              <div key={card} className="flex items-center gap-4">
                <span className="text-sm text-white min-w-48 truncate" title={card}>
                  {card.replace(' Credit Card', '')}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">Limit:</span>
                  <input
                    type="number"
                    min="0"
                    step="10000"
                    value={localPrefs.credit_card_limits[card] ?? 100000}
                    onChange={(e) => {
                      const newLimits = { ...localPrefs.credit_card_limits, [card]: Number(e.target.value) }
                      updateLocalPref('credit_card_limits', newLimits)
                    }}
                    className="w-36 px-3 py-1.5 bg-white/5 border border-white/20 rounded-lg text-white text-sm focus:border-primary"
                  />
                  <span className="text-xs text-gray-400">
                    ({formatCurrency(localPrefs.credit_card_limits[card] ?? 100000)})
                  </span>
                </div>
              </div>
            ))}
            <p className="mt-2 text-xs text-gray-400">Default: {formatCurrency(100000)} per card</p>
          </div>
        )}
      </div>

      {/* Recurring Transaction Settings Section */}
      <div className="glass rounded-lg p-5 border border-white/10">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <RefreshCw className="w-5 h-5 text-primary" />
          Recurring Transactions
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label
              htmlFor="min-confidence"
              className="block text-sm font-medium text-gray-300 mb-2"
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
              className="w-full px-3 py-2 bg-white/5 border border-white/20 rounded-lg text-white text-sm focus:border-primary"
            />
          </div>
          <div>
            <label
              htmlFor="auto-confirm"
              className="block text-sm font-medium text-gray-300 mb-2"
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
              className="w-full px-3 py-2 bg-white/5 border border-white/20 rounded-lg text-white text-sm focus:border-primary"
            />
          </div>
        </div>
      </div>
    </div>
  )
}
