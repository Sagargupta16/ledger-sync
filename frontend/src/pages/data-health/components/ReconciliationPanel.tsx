import { CircleCheck, CircleHelp, Scale, TriangleAlert } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import type { ReconciliationState, ReconciliationSummary } from '@/services/api/analyticsV2DataHealth'

interface ReconciliationPanelProps {
  readonly reconciliation: ReconciliationSummary
}

const STATE_META: Record<
  ReconciliationState,
  { readonly title: string; readonly detail: string; readonly icon: LucideIcon; readonly tone: string }
> = {
  reconciled: {
    title: 'Ledger agrees with the bank',
    detail: 'Every account you checked matches its statement balance and no bank alert is missing.',
    icon: CircleCheck,
    tone: 'text-app-green',
  },
  attention: {
    title: 'Ledger needs attention',
    detail:
      'Record a fresh balance check for each mismatched account and review the missing bank alerts below.',
    icon: TriangleAlert,
    tone: 'text-app-red',
  },
  unchecked: {
    title: 'Not checked yet',
    detail:
      'Record a balance check from a statement or banking app to see whether your ledger agrees with the bank.',
    icon: CircleHelp,
    tone: 'text-text-tertiary',
  },
}

/**
 * One verdict on whether the imported ledger matches what the bank says, built
 * from the balance checks and bank alerts the page already shows below it.
 */
export default function ReconciliationPanel({ reconciliation }: ReconciliationPanelProps) {
  const meta = STATE_META[reconciliation.state]
  const Icon = meta.icon
  const score = reconciliation.score_pct

  return (
    <section className="ledger-panel space-y-3 p-4" aria-label="Reconciliation">
      <div className="flex items-center gap-2">
        <Scale className="size-4 shrink-0 text-app-indigo" aria-hidden />
        <h2 className="text-sm font-semibold text-foreground">Reconciliation</h2>
        {score !== null && (
          <span className="ml-auto text-xs font-medium tabular-nums text-text-tertiary">
            {score}% of checked accounts match
          </span>
        )}
      </div>

      <div className="flex items-start gap-3">
        <Icon className={`mt-0.5 size-5 shrink-0 ${meta.tone}`} aria-hidden />
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">{meta.title}</p>
          <p className="mt-0.5 text-xs text-text-tertiary">{meta.detail}</p>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-4">
        <div className="min-w-0">
          <dt className="text-text-tertiary">Accounts matched</dt>
          <dd className="font-medium tabular-nums text-foreground">{reconciliation.accounts_matched}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-text-tertiary">Accounts mismatched</dt>
          <dd
            className={`font-medium tabular-nums ${reconciliation.accounts_mismatched > 0 ? 'text-app-red' : 'text-foreground'}`}
          >
            {reconciliation.accounts_mismatched}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-text-tertiary">Changed since check</dt>
          <dd className="font-medium tabular-nums text-foreground">{reconciliation.accounts_changed}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-text-tertiary">Missing bank alerts</dt>
          <dd
            className={`font-medium tabular-nums ${reconciliation.alerts_missing > 0 ? 'text-app-red' : 'text-foreground'}`}
          >
            {reconciliation.alerts_missing}
          </dd>
        </div>
      </dl>
    </section>
  )
}
