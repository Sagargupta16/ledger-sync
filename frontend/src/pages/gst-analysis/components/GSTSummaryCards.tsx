import { BarChart3, Percent, Receipt } from 'lucide-react'
import { motion } from 'motion/react'

import { fadeUpItem } from '@/constants/animations'
import { formatCurrency, formatCurrencyCompact } from '@/lib/formatters'
import type { GSTSummary } from '@/lib/gstCalculator'

interface Props {
  data: GSTSummary
}

export default function GSTSummaryCards({ data }: Readonly<Props>) {
  const topCategory = data.categoryBreakdown[0]

  return (
    <motion.div
      variants={fadeUpItem}
      className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4"
    >
      <div className="ledger-panel min-w-0 p-3 sm:p-5">
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
          <div className="rounded-md bg-app-red/15 p-2.5">
            <Receipt className="size-5 text-app-red" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-muted-foreground">Estimated GST Paid</p>
            <p className="break-words text-xl font-bold tabular-nums sm:text-kpi-value">
              {formatCurrency(data.totalGST)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              on {formatCurrencyCompact(data.totalSpending)} total spending
            </p>
          </div>
        </div>
      </div>

      <div className="ledger-panel min-w-0 p-3 sm:p-5">
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
          <div className="rounded-md bg-app-indigo/15 p-2.5">
            <Percent className="size-5 text-app-indigo" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-muted-foreground">Effective GST Rate</p>
            <p className="break-words text-xl font-bold tabular-nums sm:text-kpi-value">
              {data.effectiveRate.toFixed(1)}%
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Weighted average across categories
            </p>
          </div>
        </div>
      </div>

      <div className="ledger-panel col-span-2 min-w-0 p-3 sm:col-span-1 sm:p-5">
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
          <div className="rounded-md bg-app-purple/15 p-2.5">
            <BarChart3 className="size-5 text-app-purple" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-muted-foreground">Top GST Category</p>
            <p className="break-words text-xl font-bold tabular-nums sm:text-kpi-value">
              {topCategory ? formatCurrency(topCategory.gstAmount) : '-'}
            </p>
            <p className="text-xs text-muted-foreground mt-1">{topCategory?.category ?? ''}</p>
          </div>
        </div>
      </div>
    </motion.div>
  )
}
