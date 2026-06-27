/**
 * Budget Defaults sub-section within Financial Settings.
 */

import { PiggyBank } from 'lucide-react'
import type { LocalPrefs, LocalPrefKey } from '../types'
import { FieldLabel, Toggle } from '../sectionPrimitives'
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
        <div className="flex items-center gap-3 pt-6">
          <Toggle
            id="auto-create-budgets"
            checked={localPrefs.auto_create_budgets}
            onChange={(val) => updateLocalPref('auto_create_budgets', val)}
          />
          <label htmlFor="auto-create-budgets" className="text-sm text-white cursor-pointer">
            Auto-create budgets
          </label>
        </div>
        <div className="flex items-center gap-3 pt-6">
          <Toggle
            id="budget-rollover-enabled"
            checked={localPrefs.budget_rollover_enabled}
            onChange={(val) => updateLocalPref('budget_rollover_enabled', val)}
          />
          <label htmlFor="budget-rollover-enabled" className="text-sm text-white cursor-pointer">
            Budget rollover
          </label>
        </div>
      </div>
    </div>
  )
}
