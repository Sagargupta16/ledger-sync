/**
 * Spending Rule (50/30/20) fields sub-component for Financial Settings.
 *
 * The Savings % here is NOT the same target as the "Savings Goal (%)" field
 * above it in this section. This one is scored on the Budget Rule page against
 * the net change in the investment perimeter -- money actually moved into
 * SIP/PPF/EPF/NPS/stocks. Savings Goal is scored against income minus expenses,
 * which on the real ledger is roughly twice as large for the same period, so
 * clearing 20% here is a materially harder bar than clearing 20% there. Both
 * fields are surfaced with their numerators stated rather than reconciled; see
 * `lib/savingsRate.ts` for why the two definitions stay separate.
 */

import type { LocalPrefs, LocalPrefKey } from '../types'
import { FieldHint, FieldLegend } from '../sectionPrimitives'
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
      <FieldLegend>Spending Rule</FieldLegend>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
            Savings % (invested)
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
      <FieldHint>
        Scores the Budget Rule page. Savings % here means income moved into
        investment accounts, not income left over -- a harder bar at the same
        number. For the leftover-income target, use Savings Goal above.
      </FieldHint>
    </div>
  )
}
