import { useRef } from 'react'
import { useInView } from 'motion/react'

import { useMotionStore } from '@/store/motionStore'

import { SampleBadge } from './SampleBadge'
import { SampleCashflowChart } from './SampleCashflowChart'
import { SampleKpis } from './SampleKpis'

/** Sample KPI tiles plus a monthly chart; both animate in once, on first view. */
export function SampleWorkspacePanel() {
  const reduce = useMotionStore((state) => state.mode === 'reduced')
  const ref = useRef<HTMLDivElement>(null)
  const entered = useInView(ref, { once: true, amount: 0.3 })
  const show = reduce || entered

  return (
    <div ref={ref} className="ledger-panel overflow-hidden">
      <div className="flex items-start justify-between gap-4 border-b border-border px-4 py-4 sm:px-5">
        <div className="min-w-0">
          <p className="ledger-meta text-muted-foreground">Sample workspace</p>
          <p className="mt-1 text-sm text-muted-foreground">
            A preview of what your own ledger turns into
          </p>
        </div>
        <SampleBadge />
      </div>

      <SampleKpis show={show} reduce={reduce} />

      <div className="px-4 pt-4 sm:px-5 sm:pt-5">
        <SampleCashflowChart show={show} reduce={reduce} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 text-xs text-muted-foreground sm:px-5">
        <span>Latest synced snapshot</span>
        <span>Duplicate-safe import</span>
      </div>
    </div>
  )
}
