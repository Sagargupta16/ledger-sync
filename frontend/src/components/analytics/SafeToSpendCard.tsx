/**
 * Dashboard hero: what is safe to spend until the next payday, per day, how
 * this cycle's spending is pacing, and the first account the 30-day projection
 * sees running low. The projection chart loads only when opened, so the chart
 * kit stays off the Dashboard's first load.
 */

import { lazy, Suspense, useState } from 'react'

import { ChevronDown, Wallet } from 'lucide-react'
import { motion } from 'motion/react'

import EmptyState from '@/components/shared/EmptyState'
import ErrorState from '@/components/shared/ErrorState'
import { ChartSkeleton, PanelSkeleton } from '@/components/shared/LoadingSkeleton'
import { ROUTES } from '@/constants'
import { DURATION, EASING } from '@/constants/animations'
import { useLowBalanceThreshold, useSafeToSpend } from '@/hooks/api/useSafeToSpend'
import { useAnimatedValue } from '@/hooks/useAnimatedValue'
import { cn } from '@/lib/cn'
import { addDaysToKey } from '@/lib/dateUtils'
import { formatCurrencyCompact, formatDate } from '@/lib/formatters'
import type { PayCycle, SafeToSpend } from '@/services/api/safeToSpend'
import { useMotionStore } from '@/store/motionStore'

import { CardNotes, LowBalanceNotice, PaceBar, SafeToSpendBreakdown } from './safeToSpendParts'

const BalanceProjectionChart = lazy(() => import('@/components/analytics/BalanceProjectionChart'))

const dayLabel = (key: string) => formatDate(key, { weekday: 'short', month: 'short', day: 'numeric' })
const days = (count: number) => `${count} day${count === 1 ? '' : 's'}`

function cycleLabel(cycle: PayCycle): string {
  const left = `${days(cycle.days_left)} left`
  if (cycle.basis === 'month_end') return `Until the month ends on ${dayLabel(addDaysToKey(cycle.next_payday, -1))}, ${left}`
  return `Until payday on ${dayLabel(cycle.next_payday)}, ${left}`
}

function headline(data: SafeToSpend): string {
  if (data.liquid.net < 0) return 'Card dues and overdrafts already come to more than your cash, bank and wallet balances.'
  if (data.safe_to_spend < 0) {
    const net = data.liquid.liabilities > 0 ? ' less card dues and overdrafts' : ''
    return `Bills and reserves before payday come to more than your cash, bank and wallet balances${net}.`
  }
  const typical = data.typical_daily_spend > 0 ? ` A typical day costs ${formatCurrencyCompact(data.typical_daily_spend)}.` : ''
  return `${formatCurrencyCompact(data.per_day)} a day for ${days(data.cycle.days_left)}.${typical}`
}

export default function SafeToSpendCard() {
  const [threshold] = useLowBalanceThreshold()
  const query = useSafeToSpend(threshold)
  const [showProjection, setShowProjection] = useState(false)
  const reduceMotion = useMotionStore((state) => state.mode === 'reduced')
  const data = query.data
  const safe = data?.safe_to_spend ?? 0
  // Hooks run before every early return; the count-up settles on this exact text.
  const figure = useAnimatedValue(safe < 0 ? `Short by ${formatCurrencyCompact(-safe)}` : formatCurrencyCompact(safe))

  if (query.isLoading) return <PanelSkeleton blocks={2} blockClassName="h-16" />
  if (query.isError || !data) {
    return (
      <ErrorState
        variant="card"
        title="Safe to spend is unavailable"
        message="The figure could not be loaded. Try again."
        onRetry={() => void query.refetch()}
      />
    )
  }
  // No cash, bank or wallet balance at all usually means nothing is classified yet.
  if (data.liquid.spendable_accounts === 0 && (data.liquid.unclassified_accounts > 0 || data.bill_count === 0)) {
    return (
      <EmptyState
        icon={Wallet}
        title="Safe to spend needs your accounts classified"
        description="No cash, bank or wallet balance was found. Classify your accounts in Settings and this card works out what you can spend until payday."
        actionLabel="Classify accounts"
        actionHref={ROUTES.SETTINGS}
        variant="card"
      />
    )
  }

  return (
    <motion.section
      aria-labelledby="safe-to-spend-title"
      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduceMotion ? 0 : DURATION.quick, ease: EASING.cinematic }}
      className="ledger-panel space-y-4 p-4 sm:p-5"
    >
      <div className="min-w-0">
        <h2 id="safe-to-spend-title" className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Wallet aria-hidden="true" className="size-4 text-app-green" />
          Safe to spend
        </h2>
        <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{cycleLabel(data.cycle)}</p>
      </div>

      <div className="min-w-0">
        <motion.output
          aria-live="polite"
          className={cn(
            'ledger-figure block max-w-full text-3xl font-semibold leading-tight tracking-tight tabular-nums [overflow-wrap:anywhere] sm:text-4xl',
            safe < 0 ? 'text-app-red' : 'text-foreground',
          )}
        >
          {figure}
        </motion.output>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">{headline(data)}</p>
      </div>

      {data.low_balance && <LowBalanceNotice warning={data.low_balance} threshold={data.threshold} />}
      <SafeToSpendBreakdown data={data} />
      {data.pace && <PaceBar pace={data.pace} />}
      <CardNotes data={data} />

      <div className="border-t border-[var(--hairline-1)] pt-1">
        <button
          type="button"
          aria-expanded={showProjection}
          aria-controls="balance-projection"
          onClick={() => setShowProjection((open) => !open)}
          className="inline-flex min-h-11 items-center gap-1.5 text-xs font-medium text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
        >
          <ChevronDown
            aria-hidden="true"
            className={cn('size-3.5 transition-transform duration-200', showProjection && 'rotate-180')}
          />
          {showProjection ? 'Hide' : 'Show'} the 30-day balance projection
        </button>
        {showProjection && (
          <div id="balance-projection" className="pt-2">
            <Suspense fallback={<ChartSkeleton height="h-72" />}>
              <BalanceProjectionChart embedded />
            </Suspense>
          </div>
        )}
      </div>
    </motion.section>
  )
}
