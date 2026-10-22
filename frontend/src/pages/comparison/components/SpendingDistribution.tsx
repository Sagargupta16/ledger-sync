import { useMemo } from 'react'
import { motion } from 'motion/react'
import ProgressBar from '@/components/shared/ProgressBar'
import { chartDataTable } from '@/components/ui/chartDataTable'
import { useChartDimensions } from '@/hooks/useChartDimensions'
import { formatCurrency } from '@/lib/formatters'
import { colors } from '@/constants/colors'
import { SCROLL_FADE_UP } from '@/constants/animations'
import type { PeriodSummary } from '../types'
import { SpendingButterflyChart, type ButterflyRow } from './SpendingButterflyChart'

interface SpendingDistributionProps {
  periodA: PeriodSummary
  periodB: PeriodSummary
  distributionA: Array<{ name: string; value: number }>
  distributionB: Array<{ name: string; value: number }>
}

/** Merge both periods into butterfly rows: the top 15 categories by their larger side. */
function toButterflyRows(
  distributionA: SpendingDistributionProps['distributionA'],
  distributionB: SpendingDistributionProps['distributionB'],
): ButterflyRow[] {
  const categorySet = new Set([...distributionA.map((d) => d.name), ...distributionB.map((d) => d.name)])
  const aMap = Object.fromEntries(distributionA.map((d) => [d.name, d.value]))
  const bMap = Object.fromEntries(distributionB.map((d) => [d.name, d.value]))
  return Array.from(categorySet)
    .map((name) => {
      const a = aMap[name] || 0
      const b = bMap[name] || 0
      return {
        name,
        // Negative on the left bar so the chart extends in opposite directions.
        periodA: -a,
        periodB: b,
        // Highlight the winner of each row by colour intensity. The loser
        // gets a muted opacity so the eye lands on whichever side spent
        // more in that category.
        aWins: a >= b,
      }
    })
    .sort((a, b) => Math.max(Math.abs(b.periodA), b.periodB) - Math.max(Math.abs(a.periodA), a.periodB))
    .slice(0, 15) // top 15 categories
}

export function SpendingDistribution({
  periodA, periodB, distributionA, distributionB,
}: Readonly<SpendingDistributionProps>) {
  const dimensions = useChartDimensions()
  const butterflyData = useMemo(() => toButterflyRows(distributionA, distributionB), [distributionA, distributionB])
  if (distributionA.length === 0 && distributionB.length === 0) return null

  const maxVal = Math.max(
    ...butterflyData.map((d) => Math.abs(d.periodA)),
    ...butterflyData.map((d) => d.periodB),
    1,
  )

  return (
    <motion.div
      {...SCROLL_FADE_UP}
      className="ledger-panel min-w-0 p-4 sm:p-6"
    >
      <p className="ledger-meta mb-2 text-app-blue">Where spending shifted</p>
      <h2 className="text-xl font-semibold tracking-tight">Spending Distribution</h2>
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
        Category-by-category comparison -- longer side = higher spend that period. Top {butterflyData.length} categories.
      </p>
      <div className="my-5 grid grid-cols-1 gap-3 border-y border-border/60 py-3 min-[440px]:grid-cols-2">
        <div className="flex items-center gap-2 text-sm">
          <span className="size-2 shrink-0 rounded-sm bg-app-blue" aria-hidden="true" />
          <span className="font-medium text-foreground">{periodA.label}</span>
          <span className="text-xs text-muted-foreground">A / left</span>
        </div>
        <div className="flex items-center gap-2 text-sm min-[440px]:justify-end">
          <span className="size-2 shrink-0 rounded-sm bg-app-red" aria-hidden="true" />
          <span className="font-medium text-foreground">{periodB.label}</span>
          <span className="text-xs text-muted-foreground">B / right</span>
        </div>
      </div>
      {dimensions.breakpoint === 'mobile' ? (
        <ul
          className="divide-y divide-border"
          aria-label={`Spending by category for ${periodA.label} and ${periodB.label}`}
        >
          {butterflyData.map((datum) => (
            <li key={datum.name} className="py-4 first:pt-0 last:pb-0">
              <p className="mb-3 break-words text-sm font-medium text-foreground">
                {datum.name}
              </p>
              <div className="space-y-1.5">
                <div className="grid grid-cols-[1rem_minmax(0,1fr)_auto] items-center gap-2">
                  <span className="text-xs font-semibold text-app-blue" aria-hidden>A</span>
                  <ProgressBar
                    value={Math.abs(datum.periodA)}
                    max={maxVal}
                    color={colors.app.blue}
                    height={10}
                    className={datum.aWins ? '' : 'opacity-50'}
                    ariaLabel={`${datum.name}, ${periodA.label}: ${formatCurrency(Math.abs(datum.periodA))}`}
                  />
                  <span className="min-w-24 text-right font-mono text-xs tabular-nums text-foreground">
                    {formatCurrency(Math.abs(datum.periodA))}
                  </span>
                </div>
                <div className="grid grid-cols-[1rem_minmax(0,1fr)_auto] items-center gap-2">
                  <span className="text-xs font-semibold text-app-red" aria-hidden>B</span>
                  <ProgressBar
                    value={datum.periodB}
                    max={maxVal}
                    color={colors.app.red}
                    height={10}
                    className={datum.aWins ? 'opacity-50' : ''}
                    ariaLabel={`${datum.name}, ${periodB.label}: ${formatCurrency(datum.periodB)}`}
                  />
                  <span className="min-w-24 text-right font-mono text-xs tabular-nums text-foreground">
                    {formatCurrency(datum.periodB)}
                  </span>
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <SpendingButterflyChart
          rows={butterflyData}
          maxValue={maxVal}
          labelA={periodA.label}
          labelB={periodB.label}
          compact={dimensions.breakpoint === 'tablet'}
        />
      )}
      {chartDataTable(
        butterflyData,
        [
          { header: 'Category', rowHeader: true, value: (row) => row.name },
          { header: `A: ${periodA.label}`, value: (row) => formatCurrency(Math.abs(row.periodA)) },
          { header: `B: ${periodB.label}`, value: (row) => formatCurrency(row.periodB) },
        ],
        'Spending distribution by comparison period',
        (row) => row.name,
      )}
    </motion.div>
  )
}
