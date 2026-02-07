/**
 * Other Settings Tab
 *
 * Combines Fiscal Year, Display Preferences, Budget Defaults,
 * Anomaly Detection, and Recurring Transaction settings.
 */

import {
  Calendar,
  Settings2,
  PiggyBank,
  AlertTriangle,
  RefreshCw,
  Check,
} from 'lucide-react'
import type { LocalPrefs, LocalPrefKey } from './types'
import { MONTHS, TIME_RANGE_OPTIONS, ANOMALY_TYPES } from './types'

interface OtherSettingsTabProps {
  localPrefs: LocalPrefs
  updateLocalPref: <K extends LocalPrefKey>(key: K, value: LocalPrefs[K]) => void
}

export default function OtherSettingsTab({
  localPrefs,
  updateLocalPref,
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
