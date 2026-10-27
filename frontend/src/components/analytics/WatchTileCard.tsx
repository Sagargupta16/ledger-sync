import { motion } from 'motion/react'
import { AlertTriangle, ArrowLeftRight, ChevronLeft, ChevronRight, PinOff, ShoppingBag, Wallet } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import MetricCard from '@/components/shared/MetricCard'
import Sparkline from '@/components/shared/Sparkline'
import { Button } from '@/components/ui'
import { usePaletteSnapshot } from '@/hooks/usePaletteSnapshot'
import { formatMonthKey } from '@/lib/dateUtils'
import { formatCurrency, formatCurrencyShort, formatDate } from '@/lib/formatters'
import type { WatchMeasure, WatchPeriod, WatchTile } from '@/services/api/watchTiles'
import { useMotionStore } from '@/store/motionStore'
import { DURATION, EASING } from '@/constants/animations'
import { rawColors, type MetricColor } from '@/constants/colors'

/** What a rise in the figure means: worse (red badge), better (green badge), or neither. */
type Rise = 'worse' | 'better' | 'neutral'

const MEASURES: Record<WatchMeasure, {
  verb: string
  rows: string
  icon: LucideIcon
  color: 'red' | 'green' | 'teal'
  rise: Rise
}> = {
  expense: { verb: 'Spent', rows: 'expense', icon: ShoppingBag, color: 'red', rise: 'worse' },
  income: { verb: 'Received', rows: 'income', icon: Wallet, color: 'green', rise: 'better' },
  // Money moved between your own accounts is neither good nor bad, so no colored badge.
  transfer: { verb: 'Moved', rows: 'transfer', icon: ArrowLeftRight, color: 'teal', rise: 'neutral' },
}

/** "Oct 1-27", or "Oct 1" on the first of the month. */
function dayRange(start: string, end: string): string {
  const first = formatDate(start, { month: 'short', day: 'numeric' })
  return start === end ? first : `${first}-${Number(end.slice(8, 10))}`
}

/** The comparison in words where no change badge carries it. */
function comparisonText(change: number | null, rise: Rise, previous: string): string | null {
  if (change === null) return `none in ${previous}`
  if (rise !== 'neutral') return null
  if (change === 0) return `same as ${previous}`
  return `${Math.abs(change)}% ${change > 0 ? 'more' : 'less'} than ${previous}`
}

interface WatchTileCardProps {
  tile: WatchTile
  period: WatchPeriod
  editing: boolean
  isFirst: boolean
  isLast: boolean
  busy: boolean
  /** Changes when the tile order does, so the layout animation measures only then. */
  orderKey: string
  onMove: (direction: -1 | 1) => void
  onUnpin: () => void
}

/** One pinned saved view: month to date, the same days last month, six complete months behind it. */
export default function WatchTileCard({
  tile, period, editing, isFirst, isLast, busy, orderKey, onMove, onUnpin,
}: Readonly<WatchTileCardProps>) {
  const palette = usePaletteSnapshot(rawColors.app)
  const reduceMotion = useMotionStore((state) => state.mode === 'reduced')
  const measure = MEASURES[tile.measure]
  const current = dayRange(period.month_start, period.today)
  const previous = dayRange(period.previous_start, period.previous_end)
  const amounts = tile.trend.map((point) => point.amount)
  const trendLabel = tile.trend
    .map((point) => `${formatMonthKey(point.month)} ${formatCurrencyShort(point.amount)}`)
    .join(', ')
  const color: MetricColor = tile.filters_valid ? measure.color : 'orange'
  const change = tile.change_pct === null ? null : Math.round(tile.change_pct)
  const facts = [
    `${measure.verb} ${current}`,
    comparisonText(change, measure.rise, previous),
    tile.has_date_range ? "view's dates apply" : null,
  ].filter(Boolean).join(', ')

  const card = tile.filters_valid ? (
    <MetricCard
      title={tile.name}
      value={formatCurrency(tile.month_to_date)}
      icon={measure.icon}
      color={color}
      change={change === null || measure.rise === 'neutral' ? undefined : change}
      invertChange={measure.rise === 'worse'}
      changeLabel={`vs ${previous}`}
      subtitle={tile.other_types_present
        ? `${facts}. Counts expenses only; this view also lists income or transfers.`
        : facts}
      titleInfo={`${tile.name}: this saved view's ${measure.rows} rows from ${current}, against ${previous}. Background line: the last 6 complete months. A computation aid, not advice.`}
      trend={amounts.some((amount) => amount > 0) ? (
        <Sparkline
          data={amounts}
          color={palette[measure.color]}
          height={44}
          showTooltip={false}
          ariaLabel={`${tile.name}, last 6 complete months: ${trendLabel}`}
        />
      ) : undefined}
    />
  ) : (
    <MetricCard
      title={tile.name}
      value="Check filters"
      icon={AlertTriangle}
      color={color}
      subtitle="Its saved filters are invalid or too long. Edit and save the view again on Transactions."
    />
  )

  return (
    <motion.li
      layout="position"
      layoutDependency={orderKey}
      transition={{ duration: reduceMotion ? 0 : DURATION.quick, ease: EASING.cinematic }}
      className="flex min-w-0 flex-col gap-1"
    >
      {card}
      {editing && (
        <div role="group" aria-label={`Arrange ${tile.name}`} className="flex items-center justify-end gap-1">
          <Button
            variant="ghost"
            size="sm"
            disabled={isFirst || busy}
            onClick={() => onMove(-1)}
            aria-label={`Move ${tile.name} earlier`}
            icon={<ChevronLeft className="size-4" />}
          />
          <Button
            variant="ghost"
            size="sm"
            disabled={isLast || busy}
            onClick={() => onMove(1)}
            aria-label={`Move ${tile.name} later`}
            icon={<ChevronRight className="size-4" />}
          />
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={onUnpin}
            aria-label={`Unpin ${tile.name} from the Dashboard`}
            className="text-app-red hover:bg-app-red/10 hover:text-app-red"
            icon={<PinOff className="size-4" />}
          />
        </div>
      )}
    </motion.li>
  )
}
