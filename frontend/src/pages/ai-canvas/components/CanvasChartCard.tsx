import { memo } from 'react'
import { X } from 'lucide-react'
import { motion } from 'motion/react'

import { Button } from '@/components/ui'
import { fadeUpItem } from '@/constants/animations'

import type { CanvasChart as CanvasChartData } from '../chartSpec'
import CanvasChart from './CanvasChart'

interface Props {
  readonly chart: CanvasChartData
  readonly onRemove: (id: string) => void
}

const TIME_FORMAT = new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit' })

function CanvasChartCard({ chart, onRemove }: Props) {
  const { spec } = chart
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
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">{spec.title}</h2>
          {spec.subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{spec.subtitle}</p>}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onRemove(chart.id)}
          className="-mr-2 -mt-1 shrink-0 p-0"
          aria-label={`Remove ${spec.title}`}
          title="Remove chart"
        >
          <X className="size-4" aria-hidden="true" />
        </Button>
      </header>
      <div className="min-w-0">
        <CanvasChart spec={spec} />
      </div>
      {chart.prompt && (
        <footer className="flex items-baseline justify-between gap-3 border-t border-[var(--hairline-1)] pt-2 text-xs text-muted-foreground">
          <p className="min-w-0 truncate" title={chart.prompt}>
            Asked: {chart.prompt}
          </p>
          <time className="shrink-0 tabular-nums" dateTime={chart.createdAt}>
            {TIME_FORMAT.format(new Date(chart.createdAt))}
          </time>
        </footer>
      )}
    </motion.article>
  )
}

export default memo(CanvasChartCard)
