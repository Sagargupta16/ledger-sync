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
    <section className="ledger-panel p-4 sm:p-5" aria-labelledby="asset-allocation-title">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <PieChart className="size-5 text-app-blue" aria-hidden="true" />
          <h2 id="asset-allocation-title" className="text-base font-semibold text-foreground">
            Asset Allocation
          </h2>
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
        // No role="img" wrapper -- it would enclose the chart's sr-only data
        // table and ARIA presentational children would hide it again.
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
          ariaLabel="Donut chart breaking down portfolio value by asset class."
        />
      )}
    </section>
  )
}
