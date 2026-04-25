/**
 * Spending Rule (50/30/20) fields sub-component for Financial Settings.
 */

import type { LocalPrefs, LocalPrefKey } from '../types'
import { FieldLabel, FieldHint } from '../sectionPrimitives'
import { inputClass } from '../styles'

interface Props {
  localPrefs: LocalPrefs
  updateLocalPref: <K extends LocalPrefKey>(key: K, value: LocalPrefs[K]) => void
}

export default function SpendingRuleFields({ localPrefs, updateLocalPref }: Readonly<Props>) {
  const sum =
    localPrefs.needs_target_percent +
    localPrefs.wants_target_percent +
    localPrefs.savings_target_percent

  return (
    <div className="md:col-span-2 lg:col-span-3">
      <FieldLabel>Spending Rule</FieldLabel>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label htmlFor="needs-percent" className="text-xs text-muted-foreground mb-1 block">
            Needs %
          </label>
          <input
            id="needs-percent"
            type="number"
            inputMode="decimal"
            min="0"
            max="100"
            value={localPrefs.needs_target_percent}
            onChange={(e) => updateLocalPref('needs_target_percent', Number(e.target.value))}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="wants-percent" className="text-xs text-muted-foreground mb-1 block">
            Wants %
          </label>
          <input
            id="wants-percent"
            type="number"
            inputMode="decimal"
            min="0"
            max="100"
            value={localPrefs.wants_target_percent}
            onChange={(e) => updateLocalPref('wants_target_percent', Number(e.target.value))}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="savings-percent" className="text-xs text-muted-foreground mb-1 block">
            Savings %
          </label>
          <input
            id="savings-percent"
            type="number"
            inputMode="decimal"
            min="0"
            max="100"
            value={localPrefs.savings_target_percent}
            onChange={(e) => updateLocalPref('savings_target_percent', Number(e.target.value))}
            className={inputClass}
          />
        </div>
      </div>
      {sum === 100 ? (
        <FieldHint>Default: 50 / 30 / 20</FieldHint>
      ) : (
        <p className="mt-1.5 text-xs text-app-yellow">Totals {sum}% (should be 100%)</p>
      )}
    </div>
  )
}
