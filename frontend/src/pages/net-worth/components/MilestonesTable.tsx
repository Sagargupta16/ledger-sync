import { CheckCircle2, Circle, Target, TrendingUp } from 'lucide-react'

import EmptyState from '@/components/shared/EmptyState'
import { DataTable, type DataTableColumn } from '@/components/ui'
import { rawColors } from '@/constants/colors'
import { formatCurrency } from '@/lib/formatters'

import type { MilestoneRow } from '../netWorthProjection'

interface MilestonesTableProps {
  readonly rows: readonly MilestoneRow[]
  readonly currentNetWorth: number
  /** Average monthly net-worth change in rupees (linear model over cash flows). */
  readonly monthlyGrowth: number
}

/** "3mo" / "1y 2mo" / "2y" */
function formatMonthsAway(monthsAway: number): string {
  if (monthsAway < 1) return 'this month'
  if (monthsAway < 12) return `${Math.round(monthsAway)}mo`
  const years = Math.floor(monthsAway / 12)
  const rem = Math.round(monthsAway - years * 12)
  return rem > 0 ? `${years}y ${rem}mo` : `${years}y`
}

/** "Mar 2024" */
function formatMonthYear(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

function StatusCell({ row }: Readonly<{ row: MilestoneRow }>) {
  if (row.status === 'achieved' && row.stableSince !== null) {
    return (
      <span className="inline-flex items-center gap-1.5 text-app-green text-sm">
        <CheckCircle2 className="w-4 h-4" aria-hidden />
        Stable
      </span>
    )
  }
  if (row.status === 'achieved') {
    return (
      <span className="inline-flex items-center gap-1.5 text-app-yellow text-sm">
        <Circle className="w-4 h-4" aria-hidden />
        Reached
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-muted-foreground text-sm">
      <Target className="w-4 h-4" aria-hidden />
      Upcoming
    </span>
  )
}

function buildColumns(): DataTableColumn<MilestoneRow>[] {
  return [
    {
      key: 'label',
      header: 'Target',
      widthClass: 'w-28',
      mobilePrimary: true,
      cell: (row) => (
        <div>
          <div className="font-semibold text-foreground">{row.label}</div>
          <div className="ledger-figure text-xs text-muted-foreground">
            {formatCurrency(row.value)}
          </div>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      widthClass: 'w-32',
      mobileLabel: 'Status',
      cell: (row) => <StatusCell row={row} />,
    },
    {
      key: 'firstReached',
      header: 'First Reached',
      align: 'right',
      widthClass: 'w-36',
      mobileLabel: 'First reached',
      cell: (row) => {
        if (row.date === null || row.status !== 'achieved') {
          return <span className="text-muted-foreground">—</span>
        }
        return (
          <span className="text-sm font-medium" style={{ color: rawColors.app.green }}>
            {formatMonthYear(row.date)}
          </span>
        )
      },
    },
    {
      key: 'stableSince',
      header: 'Stable Since',
      align: 'right',
      widthClass: 'w-36',
      mobileLabel: 'Stable since',
      cell: (row) => {
        if (row.stableSince === null) {
          if (row.status === 'achieved') {
            return <span className="text-app-yellow text-xs">dipped below</span>
          }
          return <span className="text-muted-foreground">—</span>
        }
        return (
          <span className="text-sm font-medium" style={{ color: rawColors.app.green }}>
            {formatMonthYear(row.stableSince)}
          </span>
        )
      },
    },
    {
      key: 'expectedToReach',
      header: 'Expected to Reach',
      align: 'right',
      mobileLabel: 'Expected',
      cell: (row) => {
        if (row.status === 'achieved') {
          return <span className="text-muted-foreground">—</span>
        }
        if (row.date === null || row.distance === null) {
          return <span className="text-muted-foreground text-xs">need positive growth</span>
        }
        return (
          <div className="text-right">
            <div className="text-sm font-semibold" style={{ color: rawColors.app.blue }}>
              {formatMonthYear(row.date)}
            </div>
            <div className="text-xs text-muted-foreground">
              in {formatMonthsAway(row.distance)}
            </div>
          </div>
        )
      },
    },
  ]
}

export default function MilestonesTable({
  rows,
  currentNetWorth,
  monthlyGrowth,
}: MilestonesTableProps) {
  const stableCount = rows.filter((r) => r.stableSince !== null).length
  const reachedCount = rows.filter((r) => r.status === 'achieved').length
  const hasGrowth = monthlyGrowth > 0
  const columns = buildColumns()

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={TrendingUp}
        title="No milestones yet"
        description="Your first milestone (₹50k net worth) will appear here once you reach it."
        variant="compact"
      />
    )
  }

  return (
    <div className="space-y-4 [&_thead_button]:min-h-11">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-y border-[var(--hairline-1)] py-3 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-xs text-text-tertiary">Latest trend</dt>
          <dd className="ledger-figure break-words font-semibold text-foreground">
            {formatCurrency(currentNetWorth)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-text-tertiary">Average growth</dt>
          <dd
            className={`ledger-figure break-words font-semibold ${
              hasGrowth ? 'text-app-green' : 'text-app-red'
            }`}
          >
            {hasGrowth ? `+${formatCurrency(Math.round(monthlyGrowth))}/mo` : 'Stalled'}
            {!hasGrowth && (
              <span className="mt-0.5 block text-xs font-normal text-text-quaternary">
                Positive growth is needed to project.
              </span>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-text-tertiary">Reached</dt>
          <dd className="ledger-figure font-semibold text-foreground">{reachedCount}</dd>
        </div>
        <div>
          <dt className="text-xs text-text-tertiary">Stable</dt>
          <dd className="ledger-figure font-semibold text-app-green">
            {stableCount}
            {reachedCount > 0 && (
              <span className="ml-1 text-xs font-normal text-text-tertiary">
                of {reachedCount}
              </span>
            )}
          </dd>
        </div>
      </dl>

      <DataTable<MilestoneRow>
        columns={columns}
        rows={rows}
        rowKey={(row) => String(row.value)}
        rowClassName={(row) => {
          if (row.stableSince !== null) return 'opacity-100'
          if (row.status === 'achieved') return 'opacity-85'
          return 'opacity-75'
        }}
        ariaLabel="Net worth milestones"
        mobileCards
      />

      <p className="max-w-4xl text-xs leading-relaxed text-muted-foreground">
        <span className="text-app-green">Stable</span> means your net worth never dropped below
        that threshold after the crossing.{' '}
        <span className="text-app-yellow">Reached</span> means you crossed it but later dipped
        below. ETAs extrapolate your average monthly saving over the last 12 months. Figures are
        book value (cash flows in minus out) -- market gains on investments aren't tracked, so
        treat ETAs as conservative.
      </p>
    </div>
  )
}
