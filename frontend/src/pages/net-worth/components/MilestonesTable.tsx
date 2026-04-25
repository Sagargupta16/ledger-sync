import type { ReactNode } from 'react'

import { motion } from 'framer-motion'
import { CheckCircle2, Target, TrendingUp } from 'lucide-react'

import EmptyState from '@/components/shared/EmptyState'
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

export default function MilestonesTable({
  rows,
  currentNetWorth,
  monthlyGrowth,
}: MilestonesTableProps) {
  const achievedCount = rows.filter((r) => r.status === 'achieved').length
  const hasGrowth = monthlyGrowth > 0

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

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-3 px-4 text-sm font-semibold text-muted-foreground w-24">
                Target
              </th>
              <th className="text-right py-3 px-4 text-sm font-semibold text-muted-foreground">
                Amount
              </th>
              <th className="text-left py-3 px-4 text-sm font-semibold text-muted-foreground">
                Status
              </th>
              <th className="text-right py-3 px-4 text-sm font-semibold text-muted-foreground">
                When
              </th>
              <th className="text-right py-3 px-4 text-sm font-semibold text-muted-foreground">
                Notes
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <MilestoneRowView
                key={row.value}
                row={row}
                index={i}
                currentNetWorth={currentNetWorth}
              />
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground">
        ETAs assume your average monthly growth over the last 12 months continues. A bad month,
        windfall, or market swing will shift these dates.
      </p>
    </div>
  )
}

interface MilestoneRowViewProps {
  readonly row: MilestoneRow
  readonly index: number
  readonly currentNetWorth: number
}

function MilestoneRowView({ row, index, currentNetWorth }: MilestoneRowViewProps) {
  const isAchieved = row.status === 'achieved'

  let statusCell: ReactNode
  let whenCell: string
  let notesCell: string

  if (isAchieved && row.date !== null) {
    statusCell = (
      <span className="inline-flex items-center gap-1.5 text-app-green">
        <CheckCircle2 className="w-4 h-4" aria-hidden />
        Achieved
      </span>
    )
    whenCell = formatMonthYear(row.date)
    notesCell = 'Crossed'
  } else if (row.date !== null && row.distance !== null) {
    statusCell = (
      <span className="inline-flex items-center gap-1.5 text-app-blue">
        <Target className="w-4 h-4" aria-hidden />
        Upcoming
      </span>
    )
    whenCell = formatMonthYear(row.date)
    notesCell = `in ${formatMonthsAway(row.distance)} · gap ${formatCurrency(row.value - currentNetWorth)}`
  } else {
    statusCell = (
      <span className="inline-flex items-center gap-1.5 text-muted-foreground">
        <Target className="w-4 h-4" aria-hidden />
        Upcoming
      </span>
    )
    whenCell = '—'
    notesCell = 'Need positive growth to project'
  }

  return (
    <motion.tr
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.03, 0.25) }}
      className={`border-b border-border hover:bg-white/5 transition-colors ${
        isAchieved ? 'opacity-95' : 'opacity-80'
      }`}
    >
      <td className="py-3 px-4 font-semibold text-white">{row.label}</td>
      <td className="py-3 px-4 text-right text-muted-foreground">{formatCurrency(row.value)}</td>
      <td className="py-3 px-4 text-sm">{statusCell}</td>
      <td
        className="py-3 px-4 text-right text-sm font-semibold"
        style={{ color: isAchieved ? rawColors.app.green : rawColors.app.blue }}
      >
        {whenCell}
      </td>
      <td className="py-3 px-4 text-right text-muted-foreground text-xs">{notesCell}</td>
    </motion.tr>
  )
}
