/**
 * Anomaly Detection sub-section within Advanced settings.
 */

import { AlertTriangle, Check } from 'lucide-react'
import { ANOMALY_TYPES } from './types'
import type { LocalPrefs, LocalPrefKey } from './types'
import { FieldLabel } from './components'
import { inputClass } from './styles'

interface Props {
  localPrefs: LocalPrefs
  updateLocalPref: <K extends LocalPrefKey>(key: K, value: LocalPrefs[K]) => void
}

export default function AnomalyDetectionSubsection({
  localPrefs,
  updateLocalPref,
}: Readonly<Props>) {
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
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-white flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 text-primary" />
        Anomaly Detection
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <FieldLabel htmlFor="expense-threshold">Expense Threshold (Std Devs)</FieldLabel>
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
            className={inputClass}
          />
        </div>
        <div>
          <FieldLabel>Enabled Types</FieldLabel>
          <div className="space-y-1.5">
            {ANOMALY_TYPES.map((type) => {
              const isEnabled = localPrefs.anomaly_types_enabled.includes(type.value)
              return (
                <label key={type.value} className="flex items-center gap-2 cursor-pointer">
                  <button
                    type="button"
                    onClick={() => toggleAnomalyType(type.value)}
                    className={`w-4 h-4 rounded flex items-center justify-center transition-colors ${
                      isEnabled
                        ? 'bg-primary text-white'
                        : 'bg-white/5 border border-border'
                    }`}
                  >
                    {isEnabled && <Check className="w-3 h-3" />}
                  </button>
                  <span className="text-sm text-white">{type.label}</span>
                </label>
              )
            })}
          </div>
        </div>
      </div>
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={localPrefs.auto_dismiss_recurring_anomalies}
          onChange={(e) =>
            updateLocalPref('auto_dismiss_recurring_anomalies', e.target.checked)
          }
          className="w-4 h-4 rounded bg-white/5 border-border text-primary focus:ring-primary"
        />
        <span className="text-sm text-white">Auto-dismiss recurring anomalies</span>
      </label>
    </div>
  )
}
