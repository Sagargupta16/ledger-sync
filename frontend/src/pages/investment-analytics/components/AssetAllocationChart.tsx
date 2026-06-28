import { motion } from 'framer-motion'
import { PieChart } from 'lucide-react'

import StandardPieChart from '@/components/analytics/StandardPieChart'
import { ChartSkeleton } from '@/components/shared/LoadingSkeleton'
import { formatCurrency, formatCurrencyShort } from '@/lib/formatters'

interface AssetAllocationChartProps {
  isLoading: boolean
  assetAllocation: Array<{ name: string; value: number; color: string; percentage: string }>
}

export function AssetAllocationChart({
  isLoading,
  assetAllocation,
}: Readonly<AssetAllocationChartProps>) {
  const total = assetAllocation.reduce((sum, item) => sum + item.value, 0)

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.4 }}
      className="glass rounded-2xl border border-border p-4 md:p-6"
    >
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <PieChart className="w-5 h-5 text-app-blue" />
          <h3 className="text-lg font-semibold text-white">Asset Allocation</h3>
        </div>
        {!isLoading && assetAllocation.length > 0 && (
          <p className="text-xs text-text-tertiary">
            {assetAllocation.length} asset {assetAllocation.length === 1 ? 'class' : 'classes'}
          </p>
        )}
      </div>
      {isLoading ? (
        <ChartSkeleton />
      ) : (
        <div role="img" aria-label="Donut chart breaking down portfolio value by asset class.">
          <StandardPieChart
            data={assetAllocation.map((item) => ({
              name: item.name,
              value: item.value,
              color: item.color,
            }))}
            height={340}
            centerLabel="Total"
            centerValue={formatCurrencyShort(total)}
            tooltipFormatter={(value) => formatCurrency(value)}
          />
        </div>
      )}
    </motion.div>
  )
}
