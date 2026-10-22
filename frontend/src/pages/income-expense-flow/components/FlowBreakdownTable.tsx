import { ChevronRight } from 'lucide-react'

import { formatCurrency, formatPercent } from '@/lib/formatters'

import type { DrillCrumb } from '../sankeyDrilldown'
import type { FlowNode } from '../sankeyDiagramData'

interface FlowBreakdownTableProps {
  /** The diagram's own nodes, so the table lists exactly what is drawn. */
  readonly nodes: readonly FlowNode[]
  readonly drillInto: (crumb: DrillCrumb) => void
}

/** The diagram's values as a table: the accessible, full-precision reading of the current view. */
export default function FlowBreakdownTable({ nodes, drillInto }: FlowBreakdownTableProps) {
  return (
    <details className="group mt-4 border-t border-border pt-2">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium text-foreground">
        View amounts and breakdowns
        <ChevronRight className="size-4 transition-transform group-open:rotate-90" aria-hidden="true" />
      </summary>
      <table className="w-full text-left text-sm">
        <caption className="sr-only">Values for the current cash flow view</caption>
        <thead>
          <tr className="border-b border-border text-xs text-muted-foreground">
            <th scope="col" className="py-3 font-medium">Category</th>
            <th scope="col" className="py-3 text-right font-medium">Amount</th>
            <th scope="col" className="py-3 pl-4 text-right font-medium">Share</th>
          </tr>
        </thead>
        <tbody>
          {nodes.map(({ id, label, meta }) => (
            <tr key={id} className="border-b border-border/60 last:border-0">
              <th scope="row" className="py-2 font-medium">
                {meta.drill ? (
                  <button
                    type="button"
                    className="inline-flex min-h-11 items-center gap-2 text-left text-foreground hover:text-primary"
                    onClick={() => { if (meta.drill) drillInto(meta.drill) }}
                  >
                    {label}<ChevronRight className="size-3.5 shrink-0" aria-hidden="true" />
                  </button>
                ) : label}
              </th>
              <td className="py-2 text-right font-mono text-xs tabular-nums">{formatCurrency(meta.value)}</td>
              <td className="py-2 pl-4 text-right font-mono text-xs tabular-nums text-muted-foreground">{formatPercent(meta.pct)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  )
}
