import { motion } from 'motion/react'
import { RotateCcw, SlidersHorizontal } from 'lucide-react'

import { Button, CollapsibleSection, Spinner } from '@/components/ui'
import { fadeUpItem } from '@/constants/animations'
import type { FIREInputDefaults } from '@/lib/fireCalculator'
import { formatCurrency } from '@/lib/formatters'

import { useMonteCarloPlan, type MonteCarloPlanState, type MonteCarloSession } from '../useMonteCarloPlan'
import MonteCarloPlanInputs from './MonteCarloPlanInputs'
import MonteCarloPotInputs from './MonteCarloPotInputs'
import MonteCarloResults from './MonteCarloResults'
import MonteCarloRunBar from './MonteCarloRunBar'

interface MonteCarloPanelProps {
  /** The page-level state that survives a tab switch. */
  readonly session: MonteCarloSession
  readonly measured: FIREInputDefaults
}

const SOURCE_LIST = new Intl.ListFormat('en', { style: 'long', type: 'conjunction' })

/** Where the pots start: today's net worth, or which source could not be read. */
function StartingPoint({ mc }: Readonly<{ mc: MonteCarloPlanState }>) {
  if (mc.seedLoading) return <Spinner size="sm" label="Reading your account balances" />
  if (mc.seedFailed.length > 0) {
    const sources = SOURCE_LIST.format(mc.seedFailed)
    return (
      <div role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-foreground">
        <span>
          Your {sources} did not load, so your net worth cannot be split into the pots below.
          The simulation can run once they load.
        </span>
        <Button variant="outline" size="sm" onClick={mc.retrySeed}>Try again</Button>
      </div>
    )
  }
  return (
    <p className="text-sm text-muted-foreground">
      {mc.netWorth > 0
        ? <>Starting from your net worth of <span className="font-mono font-semibold tabular-nums text-foreground">{formatCurrency(mc.netWorth)}</span> (book value), split into the pots below.</>
        : 'Your net worth is not positive today, so every pot starts at zero.'}
    </p>
  )
}

/** The Monte Carlo tab: the on-demand run up top, its results, then every assumption behind it. */
export default function MonteCarloPanel({ session, measured }: MonteCarloPanelProps) {
  const mc = useMonteCarloPlan(session, measured)
  return (
    <div role="tabpanel" id="montecarlo-panel" aria-labelledby="montecarlo-tab" className="space-y-6 md:space-y-8">
      <motion.section variants={fadeUpItem} className="ledger-panel space-y-4 p-4 sm:p-5" aria-labelledby="mc-title">
        <div>
          <h3 id="mc-title" className="text-lg font-semibold">Will the money last?</h3>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
            Each simulated lifetime draws a random return for every pot and a random inflation rate for every year,
            from your age today to the end age. A run fails in the first year the portfolio cannot pay that
            year&apos;s spending. The FIRE and Retirement tabs keep their fixed-rate numbers.
          </p>
        </div>
        <StartingPoint mc={mc} />
        <MonteCarloRunBar mc={mc} />
        <p className="text-xs text-text-tertiary">
          A computation aid built on the assumptions below, not a forecast or financial advice.
        </p>
      </motion.section>

      <MonteCarloResults mc={mc} />

      {/* Open until there is a result; back on the tab after a run, the results come first. */}
      <motion.div variants={fadeUpItem}>
        <CollapsibleSection title="Assumptions" icon={SlidersHorizontal} defaultExpanded={mc.result === null}>
          <div className="space-y-6">
            <MonteCarloPlanInputs mc={mc} measured={measured} />
            <MonteCarloPotInputs mc={mc} />
            {mc.hasEdits && (
              <Button variant="outline" size="sm" onClick={mc.reset} icon={<RotateCcw className="size-3.5" />}>
                Reset to my data and the defaults
              </Button>
            )}
          </div>
        </CollapsibleSection>
      </motion.div>
    </div>
  )
}
