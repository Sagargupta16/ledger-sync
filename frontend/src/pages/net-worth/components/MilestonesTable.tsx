import { CheckCircle2, Target, TrendingUp } from 'lucide-react'

import EmptyState from '@/components/shared/EmptyState'
import { DataTable, type DataTableColumn } from '@/components/ui'
import { rawColors } from '@/constants/colors'
import { formatCurrency } from '@/lib/formatters'

import type { MilestoneRow } from '../netWorthProjection'

interface MilestonesTableProps {
  readonly rows: readonly MilestoneRow[]
  readonly currentNetWorth: number
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

/** "Mar 2024" style */
function formatMonthYear(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

function buildColumns(currentNetWorth: number): DataTableColumn<MilestoneRow>[] {
  return [
    {
      key: 'label',
      header: 'Target',
      widthClass: 'w-24',
      cell: (row) => <span className="font-semibold text-white">{row.label}</span>,
    },
    {
      key: 'value',
      header: 'Amount',
      align: 'right',
      cell: (row) => <span className="text-muted-foreground">{formatCurrency(row.value)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      cell: (row) => {
        if (row.status === 'achieved' && row.date !== null) {
          return (
            <span className="inline-flex items-center gap-1.5 text-app-green text-sm">
              <CheckCircle2 className="w-4 h-4" aria-hidden />
              Achieved
            </span>
          )
        }
        if (row.date !== null && row.distance !== null) {
          return (
            <span className="inline-flex items-center gap-1.5 text-app-blue text-sm">
              <Target className="w-4 h-4" aria-hidden />
              Upcoming
            </span>
          )
        }
        return (
          <span className="inline-flex items-center gap-1.5 text-muted-foreground text-sm">
            <Target className="w-4 h-4" aria-hidden />
            Upcoming
          </span>
        )
      },
    },
    {
      key: 'when',
      header: 'When',
      align: 'right',
      cell: (row) => {
        const isAchieved = row.status === 'achieved'
        const color = isAchieved ? rawColors.app.green : rawColors.app.blue
        if (row.date === null) return <span className="text-muted-foreground text-sm">—</span>
        return (
          <span className="text-sm font-semibold" style={{ color }}>
            {formatMonthYear(row.date)}
          </span>
        )
      },
    },
    {
      key: 'notes',
      header: 'Notes',
      align: 'right',
      cell: (row) => {
        let notes: string
        if (row.status === 'achieved' && row.date !== null) {
          notes = 'Crossed'
        } else if (row.date !== null && row.distance !== null) {
          notes = `in ${formatMonthsAway(row.distance)} · gap ${formatCurrency(row.value - currentNetWorth)}`
        } else {
          notes = 'Need positive growth to project'
        }
        return <span className="text-muted-foreground text-xs">{notes}</span>
      },
    },
  ]
}

export default function MilestonesTable({
  rows,
  currentNetWorth,
  monthlyGrowth,
}: MilestonesTableProps) {
  const achievedCount = rows.filter((r) => r.status === 'achieved').length
  const hasGrowth = monthlyGrowth > 0
  const columns = buildColumns(currentNetWorth)

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
          Current net worth:{' '}
          <span className="text-white font-semibold">{formatCurrency(currentNetWorth)}</span>
        </span>
        <span className="text-muted-foreground">
          Avg monthly growth:{' '}
          <span
            className={hasGrowth ? 'text-app-green font-semibold' : 'text-app-red font-semibold'}
          >
            {hasGrowth ? '+' : ''}
            {formatCurrency(Math.round(monthlyGrowth))}
          </span>
        </span>
        <span className="text-muted-foreground">
          Achieved:{' '}
          <span className="text-white font-semibold">
            {achievedCount} / {rows.length}
          </span>
        </span>
      </div>

      <DataTable<MilestoneRow>
        columns={columns}
        rows={rows}
        rowKey={(row) => String(row.value)}
        rowClassName={(row) => (row.status === 'achieved' ? 'opacity-95' : 'opacity-80')}
        ariaLabel="Net worth milestones"
      />

      <p className="text-xs text-muted-foreground">
        ETAs assume your average monthly growth over the last 12 months continues. A bad month,
        windfall, or market swing will shift these dates.
      </p>
    </div>
  )
}
