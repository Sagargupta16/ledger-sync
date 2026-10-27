/**
 * Anomaly Detection sub-section within Advanced settings: the expense threshold.
 *
 * `core/analytics/anomalies.py` turns `anomaly_expense_threshold` into the
 * modified-Z cutoff for high-expense months, large single expenses and unusual
 * category months. The per-check switches (`anomaly_types_enabled`) and
 * auto-dismiss (`auto_dismiss_recurring_anomalies`), which the engine now reads
 * through `core/analytics/anomaly_rules.py`, live with the findings in the
 * Anomaly Detection panel on /anomalies, which also edits the threshold.
 */

import { AlertTriangle } from 'lucide-react'
import type { LocalPrefs, LocalPrefKey } from '../types'
import { FieldLabel } from '../sectionPrimitives'
import { inputClass } from '../styles'

interface Props {
  localPrefs: LocalPrefs
  updateLocalPref: <K extends LocalPrefKey>(key: K, value: LocalPrefs[K]) => void
}

export default function AnomalyDetectionSubsection({
  localPrefs,
  updateLocalPref,
}: Readonly<Props>) {
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
          <p className="mt-1.5 text-xs text-muted-foreground">
            Lower flags more. Applies to high-expense months, large single expenses and
            unusual category months; turn checks on or off on Anomaly Review.
          </p>
        </div>
      </div>
    </div>
  )
}
