import { useState, useMemo } from 'react'
import { motion } from 'motion/react'
import { TrendingUp } from 'lucide-react'

import { CategoryAxis, ValueAxis } from '@/components/charts/Axis'
import CartesianChart, { type SeriesSpec } from '@/components/charts/CartesianChart'
import CartesianTooltip from '@/components/charts/CartesianTooltip'
import Crosshair from '@/components/charts/Crosshair'
import Grid from '@/components/charts/Grid'
import LineSeries from '@/components/charts/LineSeries'
import { ReferenceDot, ReferenceLine } from '@/components/charts/References'
import ChartEmptyState from '@/components/shared/ChartEmptyState'
import { chartDataTable } from '@/components/ui/chartDataTable'
import { useIsMobile } from '@/hooks/useIsMobile'
import { usePaletteSnapshot } from '@/hooks/usePaletteSnapshot'
import { formatFYLabel } from '@/lib/dateUtils'
import { buildTaxRateCurve, effectiveTaxRate, type TaxRateCurvePoint } from '@/lib/finance/taxRateCurve'
import { formatCurrencyShort, formatPercent } from '@/lib/formatters'
import { shareOfIncomePercent } from '@/lib/savingsRate'
import type { TaxSlab } from '@/lib/taxCalculator'
import { fadeUpItem } from '@/constants/animations'
import { rawColors } from '@/constants/colors'

import EffectiveTaxRateFooter from './EffectiveTaxRateFooter'
import { findCrossoverIncome, nearestCurveIncome, taxRateTooltipSeries } from './effectiveTaxRateModel'

interface EffectiveTaxRateChartProps {
  taxSlabs?: TaxSlab[]
  isNewRegime?: boolean
  fyYear: number
  currentIncome?: number
  currentTax?: number
  hasEmploymentIncome?: boolean
  /** 1-indexed FY start month; labels a January year "FY 2024". */
  fiscalYearStartMonth?: number
}

const BOTH_REGIMES: readonly SeriesSpec[] = [{ key: 'oldRegimeRate' }, { key: 'newRegimeRate' }]
const OLD_REGIME: readonly SeriesSpec[] = [{ key: 'oldRegimeRate' }]
const RATE_DOMAIN = [0, 'auto'] as const
/** Headroom above the plot for the "You" label over its line. */
const MARGIN = { top: 24 }
/**
 * The curve is 101 evenly spaced rows, so labelling every 20th row (every 25th
 * on phones) puts each tick on a round income: 0, 10L, 20L... of the 50L range.
 */
const TICK_INTERVAL = { desktop: 19, mobile: 24 } as const
const NO_VALUES: readonly number[] = []

const percentTick = (value: number) => `${value}%`
const incomeTick = (key: string) => formatCurrencyShort(Number(key))
const incomeHeading = (key: string) => `Income: ${formatCurrencyShort(Number(key))}`

export default function EffectiveTaxRateChart({
  fyYear,
  isNewRegime = true,
  currentIncome = 0,
  currentTax,
  hasEmploymentIncome = true,
  fiscalYearStartMonth = 4,
}: Readonly<EffectiveTaxRateChartProps>) {
  const [maxIncome, setMaxIncome] = useState(5000000)
  const isMobile = useIsMobile()
  // A theme-scoped copy of the in-place palette: a toggle re-renders and re-colours the curves.
  const palette = usePaletteSnapshot(rawColors.app)

  // Regime availability follows the same tax plan as the page's selector.
  const { points: chartData, newRegimeAvailable } = useMemo(
    () => buildTaxRateCurve(maxIncome, fyYear, hasEmploymentIncome),
    [maxIncome, fyYear, hasEmploymentIncome],
  )
  const selectedNewRegime = isNewRegime && newRegimeAvailable

  // Find crossover point where old regime becomes better
  const crossoverIncome = useMemo(() => findCrossoverIncome(chartData), [chartData])

  const currentPoint = useMemo(() => {
    if (currentIncome <= 0) return null
    const regime = selectedNewRegime ? 'new' : 'old'
    const rate = currentTax === undefined
      ? effectiveTaxRate(currentIncome, fyYear, regime, hasEmploymentIncome)
      : shareOfIncomePercent(currentTax, currentIncome)
    return {
      income: currentIncome,
      effectiveRate: Number(rate.toFixed(2)),
    }
  }, [currentIncome, currentTax, fyYear, selectedNewRegime, hasEmploymentIncome])

  // Reference marks sit on curve rows, so the "You" marker uses the row nearest the income.
  const marker = useMemo(() => {
    if (!currentPoint || currentPoint.income > maxIncome) return null
    const income = nearestCurveIncome(chartData, currentPoint.income)
    return income === null ? null : { key: String(income), rate: currentPoint.effectiveRate }
  }, [chartData, currentPoint, maxIncome])
  // The left axis must reach the marker even when a supplied estimate sits above both curves.
  const markerValues = useMemo(() => (marker ? [marker.rate] : NO_VALUES), [marker])

  return (
    <motion.div
      variants={fadeUpItem}
      className="ledger-panel p-4 sm:p-5"
    >
      <div className="mb-5 flex min-w-0 flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 max-w-lg">
          <div className="mb-1 flex items-center gap-2">
            <h3 className="text-base font-semibold">Effective tax rate</h3>
            <TrendingUp aria-hidden="true" className="size-4 shrink-0 text-app-orange" />
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {hasEmploymentIncome
              ? 'Full-year employment-income curves, including standard deduction and professional tax.'
              : 'Non-employment income curves, without salary deductions or professional tax.'}
            {' '}Your marker uses the estimate shown above.
          </p>
          {fyYear !== 0 && (
            <p className="mt-2 font-mono text-[11px] tabular-nums text-muted-foreground">
              {formatFYLabel(fyYear, fiscalYearStartMonth)}
            </p>
          )}
        </div>
        {fyYear !== 0 && currentPoint && (
          <div className="min-w-0">
            <p className="ledger-meta text-muted-foreground">Your effective rate</p>
            <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-foreground">
              {currentPoint.effectiveRate.toFixed(2)}<span className="ml-1 text-sm text-muted-foreground">%</span>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {selectedNewRegime ? 'New' : 'Old'} regime at {formatCurrencyShort(currentPoint.income)}
            </p>
          </div>
        )}
      </div>

      {fyYear === 0 ? (
        <ChartEmptyState height={320} message="Select a financial year to view effective tax rates" />
      ) : (
        <CartesianChart
          data={chartData}
          categoryKey="income"
          series={newRegimeAvailable ? BOTH_REGIMES : OLD_REGIME}
          categoryKind="point"
          valueDomain={RATE_DOMAIN}
          extraValues={markerValues}
          margin={MARGIN}
          height={320}
          mobileHeight={260}
          ariaLabel={newRegimeAvailable
            ? 'Effective tax rate by income for the new and old regimes, with regime-crossover and your-income markers'
            : 'Effective tax rate by income for the old regime, with your-income marker'}
          tooltip={(
            <CartesianTooltip
              series={taxRateTooltipSeries({ old: palette.blue, new: palette.orange }, newRegimeAvailable)}
              formatLabel={incomeHeading}
            />
          )}
        >
          <Grid />
          <Crosshair />
          <ValueAxis tickFormatter={percentTick} />
          <CategoryAxis tickFormatter={incomeTick} interval={isMobile ? TICK_INTERVAL.mobile : TICK_INTERVAL.desktop} />
          {/* Linear segments keep the slab kinks and the rebate cliff sharp; smoothing would blur them.
              The old regime is dashed with no fill, so its crossover with the new curve stays crisp. */}
          <g data-series="oldRegimeRate">
            <LineSeries dataKey="oldRegimeRate" color={palette.blue} dash="6 3" curve="linear" />
          </g>
          {newRegimeAvailable && (
            <g data-series="newRegimeRate">
              <LineSeries dataKey="newRegimeRate" color={palette.orange} strokeWidth={2.5} curve="linear" seriesIndex={1} />
            </g>
          )}
          {crossoverIncome !== null && (
            <ReferenceLine
              category={String(crossoverIncome)}
              color={palette.purple}
              dash="4 4"
              label={`Old lower near ${formatCurrencyShort(crossoverIncome)}`}
              labelColor={palette.purple}
            />
          )}
          {marker && (
            <>
              <ReferenceLine category={marker.key} color={palette.green} dash="3 3" label="You" labelColor={palette.green} labelPosition="end" />
              <g data-marker="you">
                <ReferenceDot category={marker.key} value={marker.rate} r={5} color={palette.green} />
              </g>
            </>
          )}
        </CartesianChart>
      )}

      <EffectiveTaxRateFooter
        newRegimeAvailable={newRegimeAvailable}
        showCrossover={crossoverIncome !== null}
        youLabel={currentPoint && `You, ${selectedNewRegime ? 'new' : 'old'} (${currentPoint.effectiveRate}%)`}
        maxIncome={maxIncome}
        onMaxIncomeChange={setMaxIncome}
      />
      {fyYear !== 0 && chartDataTable(
        chartData,
        [
          { header: 'Annual income', rowHeader: true, value: (row) => formatCurrencyShort(row.income) },
          ...(newRegimeAvailable ? [{
            header: 'New regime effective rate',
            value: (row: TaxRateCurvePoint) => row.newRegimeRate === undefined ? '' : formatPercent(row.newRegimeRate, false, 2),
          }] : []),
          { header: 'Old regime effective rate', value: (row) => formatPercent(row.oldRegimeRate, false, 2) },
        ],
        `Effective tax rates for financial year ${fyYear}-${String(fyYear + 1).slice(-2)}`,
        (row) => String(row.income),
      )}
    </motion.div>
  )
}
