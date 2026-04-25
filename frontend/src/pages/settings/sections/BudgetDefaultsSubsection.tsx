/**
 * Budget Defaults sub-section within Financial Settings.
 */

import { PiggyBank } from 'lucide-react'
import type { LocalPrefs, LocalPrefKey } from '../types'
import { FieldLabel } from '../sectionPrimitives'
import { inputClass } from '../styles'

interface Props {
  localPrefs: LocalPrefs
  updateLocalPref: <K extends LocalPrefKey>(key: K, value: LocalPrefs[K]) => void
}

export default function BudgetDefaultsSubsection({
  localPrefs,
  updateLocalPref,
}: Readonly<Props>) {
  return (
    <div className="pt-3 border-t border-border">
      <h3 className="text-sm font-medium text-white mb-3 flex items-center gap-2">
        <PiggyBank className="w-4 h-4 text-primary" />
        Budget Defaults
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-start">
        <div>
          <FieldLabel htmlFor="alert-threshold">Alert Threshold (%)</FieldLabel>
          <input
            id="alert-threshold"
            type="number"
            inputMode="decimal"
            min="0"
            max="100"
            value={localPrefs.default_budget_alert_threshold}
            onChange={(e) =>
              updateLocalPref('default_budget_alert_threshold', Number(e.target.value))
            }
            className={inputClass}
          />
        </div>
        <label className="flex items-center gap-3 cursor-pointer pt-6">
          <input
            type="checkbox"
            checked={localPrefs.auto_create_budgets}
            onChange={(e) => updateLocalPref('auto_create_budgets', e.target.checked)}
            className="w-4 h-4 rounded bg-white/5 border-border text-primary focus:ring-primary"
          />
          <span className="text-sm text-white">Auto-create budgets</span>
        </label>
        <label className="flex items-center gap-3 cursor-pointer pt-6">
          <input
            type="checkbox"
            checked={localPrefs.budget_rollover_enabled}
            onChange={(e) => updateLocalPref('budget_rollover_enabled', e.target.checked)}
            className="w-4 h-4 rounded bg-white/5 border-border text-primary focus:ring-primary"
          />
          <span className="text-sm text-white">Budget rollover</span>
        </label>
      </div>
    </div>
  )
}
