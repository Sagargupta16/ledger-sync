import { motion } from 'framer-motion'
import { PieChart } from 'lucide-react'
import { Cell, Legend, Pie, PieChart as RechartsPie, Tooltip } from 'recharts'

import ChartEmptyState from '@/components/shared/ChartEmptyState'
import { ChartContainer, LEGEND_DEFAULTS, chartTooltipProps } from '@/components/ui'
import { formatCurrency } from '@/lib/formatters'

interface AssetAllocationChartProps {
  isLoading: boolean
  assetAllocation: Array<{ name: string; value: number; color: string; percentage: string }>
}

export function AssetAllocationChart({
  isLoading,
  assetAllocation,
}: Readonly<AssetAllocationChartProps>) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.4 }}
      className="glass rounded-2xl border border-border p-4 md:p-6"
    >
      <div className="flex items-center gap-3 mb-6">
        <PieChart className="w-5 h-5 text-app-blue" />
        <h3 className="text-lg font-semibold text-white">Asset Allocation</h3>
      </div>
      {isLoading && (
        <div className="h-80 flex items-center justify-center">
          <div className="animate-pulse text-muted-foreground">Loading chart...</div>
        </div>
      )}
      {!isLoading &&
        (assetAllocation.length === 0 ? (
          <ChartEmptyState height={320} />
        ) : (
          <ChartContainer height={320}>
            <RechartsPie>
              <Pie
                data={assetAllocation}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, payload }) => `${name} (${payload.percentage}%)`}
                outerRadius={100}
                strokeWidth={0}
                paddingAngle={2}
                dataKey="value"
              >
                {assetAllocation.map((entry) => (
                  <Cell key={`cell-${entry.name}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                {...chartTooltipProps}
                formatter={(value: number | undefined) =>
                  value === undefined ? '' : formatCurrency(value)
                }
              />
              <Legend {...LEGEND_DEFAULTS} />
            </RechartsPie>
          </ChartContainer>
        ))}
    </motion.div>
  )
}
