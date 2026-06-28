import type { ReactNode } from 'react'

import { motion } from 'framer-motion'

import ProgressBar from '@/components/shared/ProgressBar'
import DataTable, { type DataTableColumn } from '@/components/ui/DataTable'
import { rawColors } from '@/constants/colors'
import { formatCurrency } from '@/lib/formatters'

import type { PeriodSummary, CategoryDelta } from '../types'
import { changeBadgeClass } from '../utils'
import { ChangeIcon } from './ChangeIcon'

interface CategorySectionProps {
  icon: ReactNode
  title: string
  deltas: CategoryDelta[]
  periodA: PeriodSummary
  periodB: PeriodSummary
  invertChange?: boolean
  delay: number
}

/**
 * Sortable category-comparison table. Each row shows period A vs B as PAIRED
 * mini progress bars (A faded above B solid, sharing one axis) plus a signed
 * %-change badge. Sortable by category name, either period total, or the
 * change magnitude so the user can surface the biggest movers either way.
 */
export function CategorySection({
  icon, title, deltas, periodA, periodB, invertChange, delay,
}: Readonly<CategorySectionProps>) {
  const axisMax = deltas.length > 0 ? Math.max(deltas[0].periodA, deltas[0].periodB, 1) : 1
  const color = rawColors.app.indigo

  const columns: DataTableColumn<CategoryDelta>[] = [
    {
      key: 'category',
      header: 'Category',
      sortable: true,
      sortType: 'text',
      sortValue: (d) => d.category,
      cell: (d) => <span className="text-sm font-medium text-white truncate block">{d.category}</span>,
    },
    {
      key: 'bars',
      header: `${periodA.label} vs ${periodB.label}`,
      widthClass: 'w-[42%]',
      cell: (d) => (
        <div className="space-y-1">
          <ProgressBar
            value={d.periodA}
            max={axisMax}
            color={color}
            height={6}
            className="opacity-40"
            ariaLabel={`${d.category} ${periodA.label}: ${formatCurrency(d.periodA)}`}
          />
          <ProgressBar
            value={d.periodB}
            max={axisMax}
            color={color}
            height={6}
            ariaLabel={`${d.category} ${periodB.label}: ${formatCurrency(d.periodB)}`}
          />
        </div>
      ),
    },
    {
      key: 'periodB',
      header: periodB.label,
      align: 'right',
      sortable: true,
      widthClass: 'w-24',
      sortValue: (d) => d.periodB,
      cell: (d) => (
        <div className="leading-tight">
          <p className="text-sm font-semibold text-white">{formatCurrency(d.periodB)}</p>
          <p className="text-caption text-text-tertiary">{periodA.label}: {formatCurrency(d.periodA)}</p>
        </div>
      ),
    },
    {
      key: 'change',
      header: 'Change',
      align: 'right',
      sortable: true,
      widthClass: 'w-24',
      sortValue: (d) => d.change,
      cell: (d) => {
        const isGood = invertChange ? d.change < 0 : d.change >= 0
        return (
          <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${changeBadgeClass(d.change, isGood)}`}>
            <ChangeIcon change={d.change} size="w-3 h-3" />
            {d.change > 0 ? '+' : ''}{d.change.toFixed(1)}%
          </span>
        )
      },
    },
  ]

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="glass rounded-2xl border border-border p-6"
    >
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          {icon}
          <h2 className="text-lg font-semibold">{title}</h2>
        </div>
        <span className="text-xs text-text-tertiary">{deltas.length} categories</span>
      </div>
      {deltas.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No {title.toLowerCase().replace(' categories', '')} data for selected periods.
        </p>
      ) : (
        <DataTable
          columns={columns}
          rows={deltas}
          rowKey={(d) => d.category}
          initialSort={{ key: 'periodB', dir: 'desc' }}
          ariaLabel={title}
          stickyHeader
          maxHeightClass="max-h-[300px] md:max-h-[400px] lg:max-h-[520px]"
        />
      )}
    </motion.div>
  )
}
