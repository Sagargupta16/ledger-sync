import { motion } from 'motion/react'

import { formatCurrencyShort } from '@/lib/formatters'
import { useMotionStore } from '@/store/motionStore'

const RANGE_OPTIONS = [
  { label: '50L', value: 5000000 },
  { label: '1Cr', value: 10000000 },
  { label: '2Cr', value: 20000000 },
  { label: '5Cr', value: 50000000 },
  { label: '10Cr', value: 100000000 },
]

interface EffectiveTaxRateFooterProps {
  readonly newRegimeAvailable: boolean
  readonly showCrossover: boolean
  /** Legend text for the user's marker, such as "You, old (24.26%)"; null without an income. */
  readonly youLabel: string | null
  readonly maxIncome: number
  readonly onMaxIncomeChange: (value: number) => void
}

/** The curve and marker legend beside the income-range buttons, under EffectiveTaxRateChart. */
export default function EffectiveTaxRateFooter({
  newRegimeAvailable,
  showCrossover,
  youLabel,
  maxIncome,
  onMaxIncomeChange,
}: EffectiveTaxRateFooterProps) {
  const reduced = useMotionStore((state) => state.mode === 'reduced')
  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-3 pt-3 border-t border-border">
      <div className="flex w-full min-w-0 flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground sm:w-auto">
        {newRegimeAvailable && (
          <div className="flex items-center gap-1.5">
            <div className="w-4 h-0.5 rounded bg-app-orange" />
            <span>New Regime</span>
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-0.5 rounded border-dashed border-t-2 border-app-blue" />
          <span>Old Regime</span>
        </div>
        {showCrossover && (
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-app-purple" />
            <span>Crossover</span>
          </div>
        )}
        {youLabel !== null && (
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-app-green" />
            <span>{youLabel}</span>
          </div>
        )}
      </div>
      <fieldset className="min-w-0">
        <legend className="mb-1.5 text-xs text-muted-foreground">Income range</legend>
        <div className="ledger-control flex flex-wrap rounded-md border p-1">
          {RANGE_OPTIONS.map(({ label, value }) => (
            <motion.button
              key={value}
              type="button"
              onClick={() => onMaxIncomeChange(value)}
              aria-pressed={maxIncome === value}
              aria-label={`Income up to ${formatCurrencyShort(value)}`}
              whileTap={reduced ? undefined : { scale: 0.94 }}
              transition={{ duration: 0.15 }}
              className={`min-h-11 min-w-11 rounded px-2.5 py-1 font-mono text-xs font-medium tabular-nums transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary lg:pointer-fine:min-h-8 lg:pointer-fine:min-w-0 ${
                maxIncome === value
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {label}
            </motion.button>
          ))}
        </div>
      </fieldset>
    </div>
  )
}
