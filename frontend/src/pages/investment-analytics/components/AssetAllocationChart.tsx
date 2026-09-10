import { motion } from 'motion/react'

import StandardPieChart from '@/components/analytics/StandardPieChart'
import { ChartSkeleton } from '@/components/shared/LoadingSkeleton'
import { formatCurrency } from '@/lib/formatters'
import { useMotionStore } from '@/store/motionStore'

interface AssetAllocationChartProps {
  isLoading: boolean
  assetAllocation: Array<{ name: string; value: number; color: string; percentage: string }>
}

export function AssetAllocationChart({
  isLoading,
  assetAllocation,
}: Readonly<AssetAllocationChartProps>) {
  const total = assetAllocation.reduce((sum, item) => sum + item.value, 0)
  const motionEnabled = useMotionStore((state) => state.mode === 'full')
  const largestAllocation = assetAllocation.reduce<(typeof assetAllocation)[number] | undefined>(
    (largest, item) => !largest || item.value > largest.value ? item : largest,
    undefined,
  )
  const largestShare = total > 0 && largestAllocation
    ? ((largestAllocation.value / total) * 100).toFixed(1)
    : '0.0'

  return (
    <motion.section
      className="ledger-panel min-w-0 p-4 sm:p-6"
      aria-labelledby="asset-allocation-title"
      initial={motionEnabled ? { opacity: 0, y: 16 } : false}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.1 }}
      transition={{ duration: motionEnabled ? 0.45 : 0, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.14em] text-app-blue">
            Wealth / portfolio composition
          </p>
          <h2 id="asset-allocation-title" className="text-lg font-semibold tracking-tight text-foreground">
            Asset Allocation
          </h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">Where your invested book value sits.</p>
        </div>
        {!isLoading && assetAllocation.length > 0 && (
          <p className="rounded-md border border-border/70 px-2.5 py-1.5 font-mono text-[10px] tabular-nums text-muted-foreground">
            {assetAllocation.length} asset {assetAllocation.length === 1 ? 'class' : 'classes'}
          </p>
        )}
      </div>
      {isLoading ? (
        <ChartSkeleton />
      ) : (
        <>
          {/* Keep the chart's accessible data table outside any role="img" wrapper. */}
          <StandardPieChart
            data={assetAllocation.map((item) => ({
              name: item.name,
              value: item.value,
              color: item.color,
            }))}
            height={300}
            innerRadius="72%"
            outerRadius="90%"
            centerLabel="Book value"
            centerValue={formatCurrency(total)}
            maxSlices={0}
            tooltipFormatter={(value) => formatCurrency(value)}
            ariaLabel="Donut chart breaking down portfolio book value by asset class."
          />
          {largestAllocation && (
            <div className="mt-4 flex flex-wrap items-baseline justify-between gap-x-5 gap-y-2 border-t border-border/70 pt-3">
              <p className="text-xs leading-5 text-muted-foreground">
                Largest allocation <span className="font-medium text-foreground">{largestAllocation.name}</span>
              </p>
              <p className="flex flex-wrap items-baseline gap-2 font-mono text-xs tabular-nums">
                <span className="font-semibold text-foreground">{formatCurrency(largestAllocation.value)}</span>
                <span className="text-muted-foreground">{largestShare}% of shown allocation</span>
              </p>
            </div>
          )}
        </>
      )}
    </motion.section>
  )
}
