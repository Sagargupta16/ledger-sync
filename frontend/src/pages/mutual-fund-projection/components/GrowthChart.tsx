import { useId } from 'react'
import { motion } from 'motion/react'

import ChartEmptyState from '@/components/shared/ChartEmptyState'
import ChartSection from '@/components/ui/ChartSection'
import { chartDataTable } from '@/components/ui/chartDataTable'
import { formatCurrency } from '@/lib/formatters'
import { useMotionStore } from '@/store/motionStore'

import type { ChartDataPoint } from '../types'
import GrowthPlot from './GrowthPlot'

const PRESETS = [
  { label: '1Y', years: 1 },
  { label: '3Y', years: 3 },
  { label: '5Y', years: 5 },
  { label: '10Y', years: 10 },
  { label: '20Y', years: 20 },
  { label: '30Y', years: 30 },
] as const

interface GrowthChartProps {
  chartData: ChartDataPoint[]
  projectionYears: number
  onProjectionYearsChange: (years: number) => void
}

interface GrowthChartContentProps {
  chartData: ChartDataPoint[]
  projectionYears: number
  motionEnabled: boolean
  hasExpected: boolean
}

function GrowthChartContent(props: Readonly<GrowthChartContentProps>) {
  const { chartData, projectionYears, motionEnabled, hasExpected } = props
  const lastPoint = chartData.at(-1)
  const firstProjection = chartData.find((point) => !point.isHistorical)

  return (
    <>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4 border-y border-border/70 py-4">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{firstProjection ? 'Projected portfolio value' : 'Latest allocated portfolio value'}</p>
          <motion.p
            key={lastPoint?.value}
            initial={motionEnabled ? { opacity: 0, y: 8 } : false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: motionEnabled ? 0.25 : 0 }}
            className="mt-1 break-words font-mono text-2xl font-semibold tracking-tight tabular-nums text-app-blue sm:text-3xl"
          >
            {formatCurrency(lastPoint?.value ?? 0)}
          </motion.p>
          <p className="mt-1 font-mono text-[10px] text-muted-foreground">{lastPoint?.month}</p>
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{firstProjection ? 'Contributed principal at horizon' : 'Contributed principal'}</p>
          <p className="mt-1 break-words font-mono text-lg font-semibold tabular-nums text-foreground">{formatCurrency(lastPoint?.invested ?? 0)}</p>
          {firstProjection && <p className="mt-1 text-[11px] text-muted-foreground">{projectionYears}-year scenario</p>}
        </div>
      </div>
      <GrowthPlot chartData={chartData} hasExpected={hasExpected} />
      <p className="mt-4 border-t border-border/70 pt-3 text-[11px] leading-5 text-muted-foreground">
        Historical portfolio values are allocated across contributions. The dashed path and tinted region show estimates using your selected assumptions, not observed market values.
      </p>
      {chartDataTable(
        chartData,
        [
          { header: 'Month', rowHeader: true, value: (point) => point.month },
          { header: 'Basis', value: (point) => point.isHistorical ? 'Contribution history; allocated portfolio value' : 'Projection estimate' },
          { header: 'Invested Amount', value: (point) => formatCurrency(point.invested) },
          { header: 'Portfolio Value', value: (point) => formatCurrency(point.value) },
          ...(hasExpected ? [{ header: 'Expected (at assumed return)', value: (point: ChartDataPoint) => point.expectedValue === undefined ? 'Not applicable' : formatCurrency(point.expectedValue) }] : []),
        ],
        'Investment growth path. Future values are scenario estimates.',
        (point, index) => `${point.month}-${index}`,
      )}
    </>
  )
}

export function GrowthChart(props: Readonly<GrowthChartProps>) {
  const { chartData, projectionYears, onProjectionYearsChange } = props
  const motionEnabled = useMotionStore((state) => state.mode === 'full')

  const hasExpected = chartData.some((d) => d.expectedValue !== undefined)
  const periodId = useId()

  return (
    <ChartSection
      titleId="investment-growth-title"
      eyebrow="Wealth / scenario planner"
      title="Investment Growth Path"
      description="Historical contributions and portfolio value with the selected projection scenario"
      headerClassName="mb-4 flex flex-col gap-4 md:flex-row md:items-center md:justify-between"
      action={(
        <fieldset className="ledger-control m-0 grid w-full grid-cols-3 gap-1 rounded-md border p-1 sm:w-auto sm:grid-cols-6">
          <legend className="sr-only">Projection period presets</legend>
          {PRESETS.map((preset) => (
            <motion.button
              type="button"
              key={preset.years}
              onClick={() => onProjectionYearsChange(preset.years)}
              aria-pressed={projectionYears === preset.years}
              whileTap={motionEnabled ? { scale: 0.95 } : undefined}
              className={`relative isolate min-h-11 min-w-11 rounded px-3 font-mono text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] ${projectionYears === preset.years
                  ? 'text-app-blue'
                  : 'text-muted-foreground hover:bg-[var(--overlay-2)] hover:text-foreground'
                }`}
            >
              {projectionYears === preset.years && (
                <motion.span
                  layoutId={`${periodId}-period`}
                  className="absolute inset-0 -z-10 rounded bg-app-blue/15"
                  transition={{ duration: motionEnabled ? 0.22 : 0, ease: [0.22, 1, 0.36, 1] }}
                  aria-hidden="true"
                />
              )}
              {preset.label}
            </motion.button>
          ))}
        </fieldset>
      )}
    >
      {chartData.length === 0 ? (
        <ChartEmptyState
          height={384}
          message="No SIP transactions found. Transfer data to a mutual fund account to see projections."
        />
      ) : (
        <GrowthChartContent
          chartData={chartData}
          projectionYears={projectionYears}
          motionEnabled={motionEnabled}
          hasExpected={hasExpected}
        />
      )}
    </ChartSection>
  )
}
