import { BarChart3, LineChart, ListOrdered, PieChart, Sparkles, TrendingUp, type LucideIcon } from 'lucide-react'
import { motion } from 'motion/react'

import { fadeUpItem, staggerFast } from '@/constants/animations'

/** One starter per chart family, each answerable from the read-only data tools. */
const SUGGESTIONS: ReadonlyArray<{ icon: LucideIcon; prompt: string }> = [
  { icon: BarChart3, prompt: 'Monthly income vs spending for the last 12 months' },
  { icon: ListOrdered, prompt: 'My top 10 expense categories this financial year' },
  { icon: LineChart, prompt: 'My savings rate each month for the last 6 months' },
  { icon: PieChart, prompt: 'Where my money went last month, as a donut' },
  { icon: TrendingUp, prompt: 'How my income flowed into spending this year, as a sankey' },
  { icon: Sparkles, prompt: 'A 10,000 monthly SIP at 12% for 15 years' },
]

interface Props {
  readonly onPick: (prompt: string) => void
  readonly disabled: boolean
}

export default function CanvasEmpty({ onPick, disabled }: Props) {
  return (
    <div className="ledger-panel flex h-full flex-col items-center justify-center gap-4 px-4 py-8 text-center sm:px-8">
      <div className="flex size-11 items-center justify-center rounded-md border border-[var(--hairline-1)] bg-[var(--overlay-2)]">
        <Sparkles className="size-5 text-app-purple" aria-hidden="true" />
      </div>
      <div className="max-w-md space-y-1">
        <h2 className="text-base font-semibold text-foreground">Ask for any chart of your money</h2>
        <p className="text-sm text-muted-foreground">
          The assistant looks up your real numbers with read-only tools, then draws the chart here.
          Try one of these, or describe your own.
        </p>
      </div>
      <motion.ul
        variants={staggerFast}
        initial="hidden"
        animate="visible"
        className="grid w-full max-w-xl gap-2 sm:grid-cols-2"
      >
        {SUGGESTIONS.map(({ icon: Icon, prompt }) => (
          <motion.li key={prompt} variants={fadeUpItem}>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onPick(prompt)}
              className="ledger-control flex min-h-11 w-full items-center gap-2.5 rounded-md border px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-[var(--overlay-2)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Icon className="size-4 shrink-0 text-app-blue" aria-hidden="true" />
              {prompt}
            </button>
          </motion.li>
        ))}
      </motion.ul>
    </div>
  )
}
