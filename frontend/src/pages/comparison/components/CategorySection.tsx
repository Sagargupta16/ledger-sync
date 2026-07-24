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

interface CategoryColumnsOptions {
  axisMax: number
  color: string
  periodA: PeriodSummary
  periodB: PeriodSummary
  invertChange?: boolean
}

function buildCategoryColumns({
  axisMax,
  color,
  periodA,
  periodB,
  invertChange,
}: Readonly<CategoryColumnsOptions>): DataTableColumn<CategoryDelta>[] {
  return [
    {
      key: 'category',
      header: 'Category',
      sortable: true,
      sortType: 'text',
      sortValue: (delta) => delta.category,
      mobilePrimary: true,
      cell: (delta) => (
        <span className="text-sm font-medium text-foreground truncate block">{delta.category}</span>
      ),
    },
    {
      key: 'bars',
      header: `${periodA.label} vs ${periodB.label}`,
      widthClass: 'w-[42%]',
      mobileLabel: `${periodA.label} vs ${periodB.label}`,
      cell: (delta) => (
        <div className="space-y-1">
          <ProgressBar
            value={delta.periodA}
            max={axisMax}
            color={color}
            height={6}
            className="opacity-40"
            ariaLabel={`${delta.category} ${periodA.label}: ${formatCurrency(delta.periodA)}`}
          />
          <ProgressBar
            value={delta.periodB}
            max={axisMax}
            color={color}
            height={6}
            ariaLabel={`${delta.category} ${periodB.label}: ${formatCurrency(delta.periodB)}`}
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
      mobileLabel: `${periodA.label} / ${periodB.label}`,
      sortValue: (delta) => delta.periodB,
      cell: (delta) => (
        <div className="leading-tight">
          <p className="text-sm font-semibold text-foreground">{formatCurrency(delta.periodB)}</p>
          <p className="text-caption text-text-tertiary">
            {periodA.label}: {formatCurrency(delta.periodA)}
          </p>
        </div>
      ),
    },
    {
      key: 'change',
      header: 'Change',
      align: 'right',
      sortable: true,
      widthClass: 'w-24',
      mobileLabel: 'Change',
      sortValue: (delta) => delta.change,
      cell: (delta) => {
        const isGood = invertChange ? delta.change < 0 : delta.change >= 0
        return (
          <span
            className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${changeBadgeClass(delta.change, isGood)}`}
          >
            <ChangeIcon change={delta.change} size="w-3 h-3" />
            {delta.change > 0 ? '+' : ''}
            {delta.change.toFixed(1)}%
          </span>
        )
      },
    },
  ]
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
  const columns = buildCategoryColumns({ axisMax, color, periodA, periodB, invertChange })

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
          mobileCards
          maxHeightClass="max-h-[300px] md:max-h-[400px] lg:max-h-[520px]"
        />
      )}
    </motion.div>
  )
}
