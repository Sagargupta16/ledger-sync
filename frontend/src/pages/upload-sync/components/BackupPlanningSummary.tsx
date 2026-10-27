import { CalendarClock, Wallet, type LucideIcon } from 'lucide-react'

import type { BackupPlanning, BackupPlanningCounts } from '@/services/api/moneyManagerBackup'

import { countSkipped, formatCount, SKIP_REASON_LABELS } from '../moneyManagerUtils'

interface Kind {
  readonly label: string
  readonly target: string
  readonly icon: LucideIcon
  readonly counts: BackupPlanningCounts | null
}

type PresentKind = Kind & { readonly counts: BackupPlanningCounts }

/** Backups carry both tables even when empty; a kind with nothing found, removed or skipped is left out. */
const hasNews = (counts: BackupPlanningCounts | null) =>
  counts !== null && (counts.found > 0 || counts.removed > 0 || countSkipped(counts) > 0)

function describeCounts({ found, added, updated, unchanged, kept }: BackupPlanningCounts): string {
  const parts = [
    [added, 'new'],
    [updated, 'changed'],
    [unchanged, 'unchanged'],
    [kept, 'kept as you edited them here'],
  ] as const
  const listed = parts.filter(([count]) => count > 0).map(([count, what]) => `${formatCount(count)} ${what}`)
  return `${formatCount(found)} in this backup${listed.length > 0 ? `: ${listed.join(', ')}` : ''}.`
}

function describeSkips(counts: BackupPlanningCounts): string | null {
  if (countSkipped(counts) === 0) return null
  const reasons = Object.entries(counts.skipped)
    .filter(([, count]) => count > 0)
    .map(([reason, count]) => `${formatCount(count)} ${SKIP_REASON_LABELS[reason] ?? reason.replaceAll('_', ' ')}`)
  return `Not imported: ${reasons.join('; ')}.`
}

/** The dry run's counts for the backup's repeat rules and budgets. */
export default function BackupPlanningSummary({ planning }: { readonly planning: BackupPlanning }) {
  const kinds: Kind[] = [
    { label: 'Repeat rules', target: 'as scheduled payments', icon: CalendarClock, counts: planning.repeat_rules },
    { label: 'Budgets', target: 'as monthly category budgets', icon: Wallet, counts: planning.budgets },
  ]
  const present = kinds.filter((kind): kind is PresentKind => hasNews(kind.counts))
  if (present.length === 0) return null

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-foreground">Repeat rules and budgets</h3>
      <ul className="divide-y divide-border rounded-md border border-border">
        {present.map(({ label, target, icon: Icon, counts }) => {
          const skips = describeSkips(counts)
          return (
            <li key={label} className="flex min-w-0 gap-3 p-3">
              <Icon className="mt-1 size-4 shrink-0 text-primary" aria-hidden="true" />
              <div className="min-w-0 space-y-1 text-sm leading-6">
                <p className="font-medium text-foreground">
                  {label} <span className="font-normal text-muted-foreground">{target}</span>
                </p>
                <p className="tabular-nums text-foreground">{describeCounts(counts)}</p>
                {counts.removed > 0 && (
                  <p className="tabular-nums text-foreground">
                    {formatCount(counts.removed)} no longer imported from Money Manager will be
                    turned off.
                  </p>
                )}
                {skips && <p className="text-xs leading-5 text-muted-foreground">{skips}</p>}
              </div>
            </li>
          )
        })}
      </ul>
      <p className="text-xs leading-5 text-muted-foreground">
        Imported items follow Money Manager until you edit them here. Items you created in Ledger
        Sync are never changed.
      </p>
    </div>
  )
}
