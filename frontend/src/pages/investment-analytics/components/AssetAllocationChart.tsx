import StandardPieChart from '@/components/analytics/StandardPieChart'
import { ChartSkeleton } from '@/components/shared/LoadingSkeleton'
import ChartSection from '@/components/ui/ChartSection'
import { formatCurrency } from '@/lib/formatters'

interface AssetAllocationChartProps {
  isLoading: boolean
  assetAllocation: Array<{ name: string; value: number; color: string; percentage: string }>
}

export function AssetAllocationChart({
  isLoading,
  assetAllocation,
}: Readonly<AssetAllocationChartProps>) {
  const total = assetAllocation.reduce((sum, item) => sum + item.value, 0)
  const largestAllocation = assetAllocation.reduce<(typeof assetAllocation)[number] | undefined>(
    (largest, item) => !largest || item.value > largest.value ? item : largest,
    undefined,
  )
  const largestShare = total > 0 && largestAllocation
    ? ((largestAllocation.value / total) * 100).toFixed(1)
    : '0.0'

  return (
    <ChartSection
      titleId="asset-allocation-title"
      eyebrow="Wealth / portfolio composition"
      title="Asset Allocation"
      description="Where your invested book value sits."
      headerClassName="mb-5 flex flex-wrap items-start justify-between gap-3"
      action={!isLoading && assetAllocation.length > 0 && (
        <p className="rounded-md border border-border/70 px-2.5 py-1.5 font-mono text-[10px] tabular-nums text-muted-foreground">
          {assetAllocation.length} asset {assetAllocation.length === 1 ? 'class' : 'classes'}
        </p>
      )}
    >
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
    </ChartSection>
  )
}
