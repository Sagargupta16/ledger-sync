import { motion } from 'motion/react'
import {
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  LabelList,
  Rectangle,
  ReferenceLine,
  type BarShapeProps,
} from 'recharts'
import ProgressBar from '@/components/shared/ProgressBar'
import { useChartDimensions } from '@/hooks/useChartDimensions'
import { formatCurrency, formatCurrencyShort } from '@/lib/formatters'
import { rawColors } from '@/constants/colors'
import { chartTooltipProps, ChartContainer, GRID_DEFAULTS, xAxisDefaults } from '@/components/ui'
import { chartDataTable } from '@/components/ui/chartDataTable'
import ChartTooltipContent from '@/components/ui/ChartTooltipContent'
import { useChartPresentation } from '@/components/ui/useChartPresentation'
import { SCROLL_FADE_UP } from '@/constants/animations'
import { getChartAxisColor } from '@/constants/chartColors'
import type { PeriodSummary } from '../types'

interface SpendingDistributionProps {
  periodA: PeriodSummary
  periodB: PeriodSummary
  distributionA: Array<{ name: string; value: number }>
  distributionB: Array<{ name: string; value: number }>
}

/**
 * Dim the side that spent less in this row so the eye lands on the winner.
 *
 * A `shape` render prop rather than `<Cell>` children -- Cell is deprecated and
 * removed in Recharts 4.0. It cannot be a datum-carried `fillOpacity` either:
 * both bars read the same row, and each needs the opposite opacity. The renderer
 * reads `aWins` off `payload`, so the row and its paint can never come apart
 * (Cell children were matched against the RENDERED bar list, which drops
 * zero-width bars -- and a zero-spend category is exactly what this chart has).
 */
function renderSideShape(color: string, isPeriodA: boolean) {
  return function SideShape(props: BarShapeProps) {
    const aWins = Boolean((props.payload as { aWins?: boolean } | undefined)?.aWins)
    const wins = isPeriodA ? aWins : !aWins
    return <Rectangle {...props} fill={color} fillOpacity={wins ? 0.95 : 0.45} />
  }
}

export function SpendingDistribution({
  periodA, periodB, distributionA, distributionB,
}: Readonly<SpendingDistributionProps>) {
  const dimensions = useChartDimensions()
  const { animate } = useChartPresentation(distributionA.length + distributionB.length)
  const axisColor = getChartAxisColor()
  if (distributionA.length === 0 && distributionB.length === 0) return null

  // Merge both periods into butterfly chart data
  const categorySet = new Set([...distributionA.map((d) => d.name), ...distributionB.map((d) => d.name)])
  const aMap = Object.fromEntries(distributionA.map((d) => [d.name, d.value]))
  const bMap = Object.fromEntries(distributionB.map((d) => [d.name, d.value]))
  const butterflyData = Array.from(categorySet)
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
                    color={rawColors.app.blue}
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
                    color={rawColors.app.red}
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
        <div style={{ height: Math.max(360, butterflyData.length * 44) }}>
          <ChartContainer ariaLabel={`Spending distribution butterfly chart -- ${periodA.label} bars extend left, ${periodB.label} bars extend right, one diverging row per category`}>
            <BarChart data={butterflyData} layout="vertical" stackOffset="sign" margin={{ top: 12, right: 16, bottom: 12, left: 0 }} barSize={14}>
              <CartesianGrid {...GRID_DEFAULTS} horizontal={false} vertical={true} />
              <XAxis
                {...xAxisDefaults()}
                type="number"
                domain={[-maxVal * 1.25, maxVal * 1.25]}
                ticks={[-maxVal, -maxVal / 2, 0, maxVal / 2, maxVal]}
                tickFormatter={(v: number) => formatCurrencyShort(Math.abs(v))}
              />
              <YAxis
                type="category"
                dataKey="name"
                width={dimensions.breakpoint === 'tablet' ? 152 : 188}
                tick={{ fill: axisColor, fontSize: 12, width: dimensions.breakpoint === 'tablet' ? 140 : 176 }}
                tickLine={false}
                axisLine={false}
                interval={0}
                tickMargin={12}
              />
              <ReferenceLine x={0} stroke={rawColors.chart.referenceLineStrong} strokeWidth={1.5} />
              <Tooltip
                {...chartTooltipProps}
                content={<ChartTooltipContent />}
                formatter={(value) => typeof value === 'number' ? formatCurrency(Math.abs(value)) : ''}
                labelFormatter={(label) => label}
              />
              <Bar
                dataKey="periodA"
                name={periodA.label}
                fill={rawColors.app.blue}
                stackId="stack"
                radius={[4, 0, 0, 4]}
                shape={renderSideShape(rawColors.app.blue, true)}
                isAnimationActive={animate}
                animationDuration={700}
                animationEasing="ease-out"
              >
                <LabelList
                  dataKey="periodA"
                  position="left"
                  fill={rawColors.text.secondary}
                  fontSize={11}
                  fontFamily="var(--font-mono)"
                  formatter={(v: unknown) => {
                    const n = Math.abs(v as number)
                    return n === 0 ? '' : formatCurrencyShort(n)
                  }}
                />
              </Bar>
              <Bar
                dataKey="periodB"
                name={periodB.label}
                fill={rawColors.app.red}
                stackId="stack"
                radius={[0, 4, 4, 0]}
                shape={renderSideShape(rawColors.app.red, false)}
                isAnimationActive={animate}
                animationDuration={700}
                animationEasing="ease-out"
              >
                <LabelList
                  dataKey="periodB"
                  position="right"
                  fill={rawColors.text.secondary}
                  fontSize={11}
                  fontFamily="var(--font-mono)"
                  formatter={(v: unknown) => {
                    const n = v as number
                    return n === 0 ? '' : formatCurrencyShort(n)
                  }}
                />
              </Bar>
            </BarChart>
          </ChartContainer>
        </div>
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
