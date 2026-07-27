/**
 * Anomaly Detection sub-section within Advanced settings.
 *
 * Only `anomaly_expense_threshold` is here, because it is the only anomaly
 * preference the detection engine reads: `core/analytics/base.py` exposes it and
 * `core/analytics/anomalies.py` converts it into the modified-Z cutoff.
 *
 * Two controls were removed rather than completed:
 *
 *  - "Enabled Types" (an `anomaly_types_enabled` checkbox grid). Nothing under
 *    `backend/src/ledger_sync/core/` reads that field -- only
 *    `api/preferences.py` and `api/preferences_helpers.py`, which persist it and
 *    echo it back -- so `_detect_anomalies()` ran every detector regardless of
 *    what was ticked. It also listed four of the enum's seven members, so the
 *    tempting fix was to add three more checkboxes that equally do nothing.
 *  - "Auto-dismiss recurring anomalies" (`auto_dismiss_recurring_anomalies`),
 *    which has no reader either.
 *
 * Both columns still exist and are still round-tripped by the save call in
 * `AnomalyDetectionPanel`, so wiring them up server-side loses no stored data.
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
            Lower flags more months as unusually high. Applies to the high-expense and
            large-transaction detectors.
          </p>
        </div>
      </div>
    </div>
  )
}
