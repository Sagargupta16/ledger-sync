import { CheckCircle2, Circle, Target, TrendingUp } from 'lucide-react'

import EmptyState from '@/components/shared/EmptyState'
import { DataTable, type DataTableColumn } from '@/components/ui'
import { rawColors } from '@/constants/colors'
import { formatCurrency } from '@/lib/formatters'

import type { MilestoneRow } from '../netWorthProjection'

interface MilestonesTableProps {
  readonly rows: readonly MilestoneRow[]
  readonly currentNetWorth: number
  /** Compound monthly growth rate (decimal). 0.01 = 1 %/month (~12.7 % annualized). */
  readonly monthlyGrowthRate: number
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
      cell: (row) => (
        <div>
          <div className="font-semibold text-white">{row.label}</div>
          <div className="text-xs text-muted-foreground">{formatCurrency(row.value)}</div>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      widthClass: 'w-32',
      cell: (row) => <StatusCell row={row} />,
    },
    {
      key: 'firstReached',
      header: 'First Reached',
      align: 'right',
      widthClass: 'w-36',
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
  monthlyGrowthRate,
}: MilestonesTableProps) {
  const stableCount = rows.filter((r) => r.stableSince !== null).length
  const reachedCount = rows.filter((r) => r.status === 'achieved').length
  const hasGrowth = monthlyGrowthRate > 0
  // Derive a human-readable annualized % from the compound monthly rate.
  // ((1 + r)^12 - 1) * 100 -- e.g. 1 %/month -> 12.68 % annualized.
  const annualizedPercent = hasGrowth ? (((1 + monthlyGrowthRate) ** 12) - 1) * 100 : 0
  // And the approximate absolute monthly rupee gain at the CURRENT net worth.
  // Shown alongside the % so the number is concrete, not just academic.
  const approxMonthlyRupees = hasGrowth ? currentNetWorth * monthlyGrowthRate : 0
  const columns = buildColumns()

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={TrendingUp}
        title="No milestones yet"
        description="Your first milestone (₹1L net worth) will appear here once you reach it."
        variant="compact"
      />
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-6 text-sm flex-wrap">
        <span className="text-muted-foreground">
          Current:{' '}
          <span className="text-white font-semibold">{formatCurrency(currentNetWorth)}</span>
        </span>
        <span className="text-muted-foreground">
          Growth rate:{' '}
          <span
            className={hasGrowth ? 'text-app-green font-semibold' : 'text-app-red font-semibold'}
            title={
              hasGrowth
                ? `~${formatCurrency(Math.round(approxMonthlyRupees))}/mo at current net worth`
                : 'Need positive growth to project forward'
            }
          >
            {hasGrowth ? `+${annualizedPercent.toFixed(1)}%/yr` : 'stalled'}
          </span>
        </span>
        <span className="text-muted-foreground">
          Stable:{' '}
          <span className="text-app-green font-semibold">
            {stableCount} / {rows.length}
          </span>
        </span>
        <span className="text-muted-foreground">
          Reached:{' '}
          <span className="text-white font-semibold">
            {reachedCount} / {rows.length}
          </span>
        </span>
      </div>

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
      />

      <p className="text-xs text-muted-foreground">
        <span className="text-app-green">Stable</span> means your net worth never dropped below
        that threshold after the crossing.{' '}
        <span className="text-app-yellow">Reached</span> means you crossed it but later dipped
        below. ETAs extrapolate your last 12 months of growth forward at a compound rate -- same
        way a SIP or PPF/EPF balance actually grows.
      </p>
    </div>
  )
}
