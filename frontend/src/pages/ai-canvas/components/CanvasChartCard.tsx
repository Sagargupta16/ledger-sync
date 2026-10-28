import { memo, useState } from 'react'
import { ChevronDown, CornerDownRight, X } from 'lucide-react'
import { motion } from 'motion/react'

import { Button } from '@/components/ui'
import { fadeUpItem } from '@/constants/animations'

import { followUps } from '../chartFormat'
import type { CanvasChart as CanvasChartData } from '../chartSpec'
import CanvasChart from './CanvasChart'
import CanvasChartTable from './CanvasChartTable'

interface Props {
  readonly chart: CanvasChartData
  readonly onRemove: (id: string) => void
  readonly onAsk: (prompt: string) => void
  readonly busy: boolean
}

type View = 'chart' | 'table'

const TIME_FORMAT = new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit' })

function ViewSwitch({ view, onChange }: Readonly<{ view: View; onChange: (view: View) => void }>) {
  return (
    <div role="group" aria-label="Show as" className="inline-flex rounded-md border border-[var(--hairline-1)] p-0.5">
      {(['chart', 'table'] as const).map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={view === option}
          onClick={() => onChange(option)}
          className={`min-h-11 rounded px-3 text-xs capitalize transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] lg:pointer-fine:min-h-7 ${
            view === option ? 'bg-[var(--overlay-5)] text-foreground' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {option}
        </button>
      ))}
    </div>
  )
}

function CanvasChartCard({ chart, onRemove, onAsk, busy }: Props) {
  const { spec } = chart
  const [view, setView] = useState<View>('chart')
  const asks = followUps(spec)
  return (
    <motion.article
      layout
      variants={fadeUpItem}
      initial="hidden"
      animate="visible"
      exit={{ opacity: 0, scale: 0.97 }}
      className="ledger-panel flex min-w-0 flex-col gap-3 p-4"
      aria-label={spec.title}
    >
      {/* On a narrow card the controls wrap under the title instead of squeezing it. */}
      <header className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1 basis-48">
          <h2 className="text-sm font-semibold text-foreground">{spec.title}</h2>
          {spec.subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{spec.subtitle}</p>}
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <ViewSwitch view={view} onChange={setView} />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onRemove(chart.id)}
            className="-mr-2 p-0"
            aria-label={`Remove ${spec.title}`}
            title="Remove chart"
          >
            <X className="size-4" aria-hidden="true" />
          </Button>
        </div>
      </header>

      <div className="min-w-0">{view === 'chart' ? <CanvasChart spec={spec} /> : <CanvasChartTable spec={spec} />}</div>

      {asks.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Follow-ups">
          {asks.map((ask) => (
            <li key={ask}>
              <button
                type="button"
                disabled={busy}
                onClick={() => onAsk(ask)}
                className="ledger-control inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3 text-xs text-muted-foreground transition-colors hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-60 lg:pointer-fine:min-h-8"
              >
                <CornerDownRight className="size-3" aria-hidden="true" />
                {ask.replace(`Redraw "${spec.title}" `, '')}
              </button>
            </li>
          ))}
        </ul>
      )}

      <footer className="space-y-2 border-t border-[var(--hairline-1)] pt-2 text-xs text-muted-foreground">
        <div className="flex items-baseline justify-between gap-3">
          <p className="min-w-0 truncate" title={chart.prompt}>
            Asked: {chart.prompt || 'a follow-up'}
          </p>
          <time className="shrink-0 tabular-nums" dateTime={chart.createdAt}>
            {TIME_FORMAT.format(new Date(chart.createdAt))}
          </time>
        </div>
        {chart.sources.length > 0 && (
          <details className="group">
            <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1 text-foreground/80 hover:text-foreground lg:pointer-fine:min-h-7">
              <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" aria-hidden="true" />
              How this was made
            </summary>
            <ol className="ml-5 list-decimal space-y-1 pb-1">
              {chart.sources.map((source) => (
                <li key={source}>{source}</li>
              ))}
              <li>Drew the values above exactly as those look-ups returned them</li>
            </ol>
          </details>
        )}
      </footer>
    </motion.article>
  )
}

export default memo(CanvasChartCard)
