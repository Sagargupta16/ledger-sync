import { BarChart3, Percent, Receipt } from 'lucide-react'
import { motion } from 'framer-motion'

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
      className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4 lg:gap-6"
    >
      <div className="glass rounded-2xl border border-border p-4 sm:p-6">
        <div className="flex items-center gap-3">
          <div className="p-2.5 sm:p-3 rounded-xl bg-app-red/20">
            <Receipt className="w-6 h-6 text-app-red" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-muted-foreground">Estimated GST Paid</p>
            <p className="text-kpi-value font-bold tabular-nums">{formatCurrency(data.totalGST)}</p>
            <p className="text-xs text-muted-foreground mt-1">
              on {formatCurrencyCompact(data.totalSpending)} total spending
            </p>
          </div>
        </div>
      </div>

      <div className="glass rounded-2xl border border-border p-4 sm:p-6">
        <div className="flex items-center gap-3">
          <div className="p-2.5 sm:p-3 rounded-xl bg-app-indigo/20">
            <Percent className="w-6 h-6 text-app-indigo" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-muted-foreground">Effective GST Rate</p>
            <p className="text-kpi-value font-bold tabular-nums">
              {data.effectiveRate.toFixed(1)}%
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Weighted average across categories
            </p>
          </div>
        </div>
      </div>

      <div className="glass rounded-2xl border border-border p-4 sm:p-6 col-span-2 sm:col-span-1">
        <div className="flex items-center gap-3">
          <div className="p-2.5 sm:p-3 rounded-xl bg-app-purple/20">
            <BarChart3 className="w-6 h-6 text-app-purple" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-muted-foreground">Top GST Category</p>
            <p className="text-kpi-value font-bold tabular-nums">
              {topCategory ? formatCurrency(topCategory.gstAmount) : '-'}
            </p>
            <p className="text-xs text-muted-foreground mt-1">{topCategory?.category ?? ''}</p>
          </div>
        </div>
      </div>
    </motion.div>
  )
}
