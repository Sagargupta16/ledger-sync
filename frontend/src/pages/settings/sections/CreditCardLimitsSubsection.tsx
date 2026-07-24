/**
 * Credit Card Limits sub-section within Advanced settings.
 */

import { CreditCard } from 'lucide-react'
import { formatCurrency } from '@/lib/formatters'
import type { LocalPrefs, LocalPrefKey } from '../types'
import { FieldHint } from '../sectionPrimitives'

interface Props {
  localPrefs: LocalPrefs
  creditCardAccounts: string[]
  updateLocalPref: <K extends LocalPrefKey>(key: K, value: LocalPrefs[K]) => void
}

export default function CreditCardLimitsSubsection({
  localPrefs,
  creditCardAccounts,
  updateLocalPref,
}: Readonly<Props>) {
  return (
    <div className="pt-4 border-t border-border space-y-3">
      <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
        <CreditCard className="w-4 h-4 text-primary" />
        Credit Card Limits
      </h3>
      {creditCardAccounts.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No credit card accounts. Classify accounts as &quot;Credit Cards&quot; above.
        </p>
      ) : (
        <div className="space-y-2">
          {creditCardAccounts.map((card) => (
            <div key={card} className="flex items-center gap-3">
              <span className="text-sm text-foreground min-w-0 flex-1 truncate" title={card}>
                {card.replace(' Credit Card', '')}
              </span>
              <div className="flex items-center gap-2 shrink-0">
                 <span className="text-xs text-muted-foreground">Limit:</span>
                 <input
                   id={`credit-limit-${encodeURIComponent(card)}`}
                   type="number"
                  inputMode="decimal"
                  aria-label={`Credit limit for ${card.replace(' Credit Card', '')}`}
                  min="0"
                  step="10000"
                  value={localPrefs.credit_card_limits[card] ?? 100000}
                  onChange={(e) => {
                    const n = Number(e.target.value)
                    updateLocalPref('credit_card_limits', {
                      ...localPrefs.credit_card_limits,
                      [card]: Number.isFinite(n) ? Math.max(0, n) : 0,
                    })
                  }}
                   className="ledger-control min-h-11 w-32 rounded-lg border border-border px-2 py-1.5 text-sm text-foreground focus:border-primary focus:outline-none sm:min-h-10"
                />
              </div>
            </div>
          ))}
          <FieldHint>Default: {formatCurrency(100000)} per card</FieldHint>
        </div>
      )}
    </div>
  )
}
