/**
 * Recurring Transactions sub-section within Advanced settings.
 */

import { RefreshCw } from 'lucide-react'
import type { LocalPrefs, LocalPrefKey } from './types'
import { FieldLabel } from './components'
import { inputClass } from './styles'

interface Props {
  localPrefs: LocalPrefs
  updateLocalPref: <K extends LocalPrefKey>(key: K, value: LocalPrefs[K]) => void
}

export default function RecurringTransactionsSubsection({
  localPrefs,
  updateLocalPref,
}: Readonly<Props>) {
  return (
    <div className="pt-4 border-t border-border space-y-3">
      <h3 className="text-sm font-medium text-white flex items-center gap-2">
        <RefreshCw className="w-4 h-4 text-primary" />
        Recurring Transactions
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <FieldLabel htmlFor="min-confidence">Min Confidence (%)</FieldLabel>
          <input
            id="min-confidence"
            type="number"
            min="0"
            max="100"
            value={localPrefs.recurring_min_confidence}
            onChange={(e) =>
              updateLocalPref('recurring_min_confidence', Number(e.target.value))
            }
            className={inputClass}
          />
        </div>
        <div>
          <FieldLabel htmlFor="auto-confirm">Auto-confirm After</FieldLabel>
          <div className="flex items-center gap-2">
            <input
              id="auto-confirm"
              type="number"
              min="2"
              max="12"
              value={localPrefs.recurring_auto_confirm_occurrences}
              onChange={(e) =>
                updateLocalPref('recurring_auto_confirm_occurrences', Number(e.target.value))
              }
              className={inputClass}
            />
            <span className="text-xs text-muted-foreground whitespace-nowrap">occurrences</span>
          </div>
        </div>
      </div>
    </div>
  )
}
