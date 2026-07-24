/**
 * Anomaly Detection sub-section within Advanced settings.
 */

import { AlertTriangle, Check } from 'lucide-react'
import { ANOMALY_TYPES } from '../types'
import type { LocalPrefs, LocalPrefKey } from '../types'
import { FieldLabel, FieldLegend, Toggle } from '../sectionPrimitives'
import { inputClass } from '../styles'

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
      <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 text-primary" />
        Anomaly Detection
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <FieldLabel htmlFor="expense-threshold">Expense Threshold (Std Devs)</FieldLabel>
          <input
            id="expense-threshold"
            type="number"
            inputMode="decimal"
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
          <FieldLegend>Enabled Types</FieldLegend>
          <div className="space-y-1.5">
            {ANOMALY_TYPES.map((type) => {
              const isEnabled = localPrefs.anomaly_types_enabled.includes(type.value)
              const controlId = `anomaly-type-${type.value}`
              return (
                <label
                  key={type.value}
                  htmlFor={controlId}
                  className="flex min-h-11 cursor-pointer items-center gap-2 sm:min-h-10"
                >
                  <input
                    id={controlId}
                    type="checkbox"
                    checked={isEnabled}
                    onChange={() => toggleAnomalyType(type.value)}
                    className="sr-only"
                  />
                  <span
                    aria-hidden="true"
                    className={`flex size-4 items-center justify-center rounded transition-colors ${
                      isEnabled
                        ? 'bg-primary text-on-accent'
                        : 'bg-[var(--overlay-2)] border border-border'
                    }`}
                  >
                    {isEnabled && <Check className="w-3 h-3" />}
                  </span>
                  <span className="text-sm text-foreground">{type.label}</span>
                </label>
              )
            })}
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between gap-4">
        <FieldLabel htmlFor="auto-dismiss-recurring-anomalies">
          Auto-dismiss recurring anomalies
        </FieldLabel>
        <Toggle
          id="auto-dismiss-recurring-anomalies"
          aria-label="Auto-dismiss recurring anomalies"
          checked={localPrefs.auto_dismiss_recurring_anomalies}
          onChange={(val) => updateLocalPref('auto_dismiss_recurring_anomalies', val)}
        />
      </div>
    </div>
  )
}
