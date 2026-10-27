import { motion } from 'motion/react'
import { AlertTriangle, Dices, RefreshCw } from 'lucide-react'

import EmptyState from '@/components/shared/EmptyState'
import { Button, Spinner } from '@/components/ui'
import { fadeUpItem } from '@/constants/animations'
import { getActiveLocale } from '@/lib/formatters'

import { formatRunShare } from '../monteCarloFormat'
import type { MonteCarloPlanState } from '../useMonteCarloPlan'
import MonteCarloFanChart from './MonteCarloFanChart'
import MonteCarloSummary from './MonteCarloSummary'

/** The last run's cards and fan, a stale notice once the assumptions move on, or the first-run prompt. */
export default function MonteCarloResults({ mc }: Readonly<{ mc: MonteCarloPlanState }>) {
  const { result, resultInputs } = mc
  const locale = getActiveLocale()
  if (!result || !resultInputs) {
    if (mc.status === 'running') {
      return (
        <motion.div variants={fadeUpItem} className="ledger-panel p-8">
          <Spinner label={`Simulating ${mc.plan.runs.toLocaleString(locale)} lifetimes`} />
        </motion.div>
      )
    }
    return (
      <motion.div variants={fadeUpItem}>
        <EmptyState
          variant="card"
          icon={Dices}
          title={mc.status === 'error' ? 'The simulation did not finish' : 'No simulation yet'}
          description={mc.error ?? 'Run it to see the chance your money lasts, the median outcome and the ages at which failing runs ran out.'}
        />
      </motion.div>
    )
  }

  const out = result.fan.at(-1)?.depleted ?? 0
  return (
    <>
      {mc.status === 'error' && (
        <motion.p variants={fadeUpItem} role="alert" className="rounded-lg border border-app-red/30 bg-app-red/10 px-4 py-3 text-sm text-foreground">
          The last run did not finish: {mc.error}. The results below are from the run before it.
        </motion.p>
      )}
      {mc.isStale && (
        <motion.output
          variants={fadeUpItem}
          className="flex flex-col gap-3 rounded-lg border border-app-yellow/30 bg-app-yellow/10 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
        >
          <span className="flex items-start gap-2 text-foreground">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-app-yellow" aria-hidden />
            These results are from earlier assumptions.
          </span>
          <Button variant="secondary" size="sm" onClick={mc.run} disabled={!mc.canRun} icon={<RefreshCw className="size-3.5" />}>
            Run again
          </Button>
        </motion.output>
      )}
      <MonteCarloSummary result={result} inputs={resultInputs} />
      <motion.section variants={fadeUpItem} className="ledger-panel p-4 sm:p-5" aria-labelledby="mc-fan-title">
        <h3 id="mc-fan-title" className="text-lg font-semibold">Portfolio by age</h3>
        <p className="mb-4 mt-1 text-xs leading-5 text-muted-foreground">
          {result.runs.toLocaleString(locale)} simulated lifetimes in today&apos;s money. A band that reaches zero means
          those runs ran out of money; {formatRunShare(out)} had run out by age {resultInputs.endAge}.
        </p>
        <MonteCarloFanChart fan={result.fan} retireAge={resultInputs.retireAge} />
        <p className="mt-4 border-t border-border/70 pt-3 text-[11px] leading-5 text-muted-foreground">
          Returns are lognormal around each pot&apos;s expected return, inflation is normal around its average, and the
          pots are rebalanced every year; years, pots and inflation are drawn independently. No US market history is
          replayed.{resultInputs.equityDrawdown > 0 && " The stress test's equity fall is taken at the retirement age, so that age's balances already include it."}{' '}
          Estimates for planning, not a forecast or advice.
        </p>
      </motion.section>
    </>
  )
}
