import { Play, Shuffle, TrendingDown } from 'lucide-react'

import { Button } from '@/components/ui'
import { getActiveLocale } from '@/lib/formatters'

import { RUN_CHOICES } from '../monteCarloPlan'
import type { MonteCarloPlanState } from '../useMonteCarloPlan'
import SliderInput from './SliderInput'

/** Run count, the retirement-crash stress test, and the on-demand run with its seed. */
export default function MonteCarloRunBar({ mc }: Readonly<{ mc: MonteCarloPlanState }>) {
  const { plan, setField } = mc
  const locale = getActiveLocale()
  const running = mc.status === 'running'
  const runLabel = mc.result && mc.isStale
    ? 'Run again with these assumptions'
    : `Run ${plan.runs.toLocaleString(locale)} simulations`
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <fieldset className="m-0 min-w-0 border-0 p-0">
          <legend className="mb-1 text-xs font-medium text-muted-foreground">Simulated lifetimes</legend>
          <div className="grid grid-cols-3 gap-2">
            {RUN_CHOICES.map((runs) => (
              <Button
                key={runs}
                variant={plan.runs === runs ? 'secondary' : 'outline'}
                aria-pressed={plan.runs === runs}
                onClick={() => setField('runs', runs)}
              >
                {runs.toLocaleString(locale)}
              </Button>
            ))}
          </div>
        </fieldset>
        <div className="min-w-0 space-y-3">
          <p className="mb-1 text-xs font-medium text-muted-foreground">Stress test</p>
          <Button
            variant={plan.stress ? 'secondary' : 'outline'}
            aria-pressed={plan.stress}
            onClick={() => setField('stress', !plan.stress)}
            icon={<TrendingDown className="size-4" />}
            className="w-full"
          >
            Equity falls as you retire
          </Button>
          {plan.stress && (
            <SliderInput
              id="mc-drawdown"
              label="Fall in the equity pot, once"
              value={plan.drawdownPct}
              min={10}
              max={60}
              step={5}
              unit="%"
              valueText={`${plan.drawdownPct} percent`}
              onChange={(v) => setField('drawdownPct', v)}
            />
          )}
        </div>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button
          onClick={mc.run}
          isLoading={running}
          disabled={!mc.canRun}
          icon={<Play className="size-4" />}
          className="w-full sm:w-auto"
        >
          {runLabel}
        </Button>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-tertiary">
          <span>Seed {plan.seed}: the same inputs always give the same fan.</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={mc.reshuffle}
            disabled={running || !mc.canRun}
            icon={<Shuffle className="size-3.5" />}
          >
            New seed
          </Button>
        </div>
      </div>
    </div>
  )
}
