import { motion } from 'motion/react'

import { sliceClickTarget, type PieSliceDatum } from './pieSlices'

interface PieChartLedgerProps {
  readonly data: readonly (PieSliceDatum & { fill: string })[]
  readonly total: number
  readonly formatValue: (value: number) => string
  readonly activeName: string | null
  readonly onActiveChange: (name: string | null) => void
  readonly onSliceClick?: (name: string) => void
  readonly animate: boolean
  readonly focusRingClass?: string
}

/** The allocation's exact values remain readable without aiming at a wedge. */
export default function PieChartLedger({
  data,
  total,
  formatValue,
  activeName,
  onActiveChange,
  onSliceClick,
  animate,
  focusRingClass = 'focus-visible:ring-app-blue/50',
}: PieChartLedgerProps) {
  const ranked = [...data]
  ranked.sort((a, b) =>
    Number(Boolean(a.isOther)) - Number(Boolean(b.isOther)) || b.value - a.value,
  )

  return (
    <div className="min-w-0">
      <div className="mb-1 flex justify-between gap-4 border-b border-border/60 pb-2 font-mono text-[10px] text-muted-foreground">
        <span>Allocation</span>
        <span>Amount / share</span>
      </div>
      <ol aria-label="Chart categories" className="min-w-0">
        {ranked.map((slice, index) => {
          const share = total > 0 ? slice.value / total : 0
          const target = sliceClickTarget(slice)
          const clickable = onSliceClick !== undefined && target !== null
          const active = activeName === slice.name
          const dimmed = activeName !== null && !active
          const content = (
            <>
              <span className="pt-0.5 font-mono text-[10px] tabular-nums text-muted-foreground" aria-hidden="true">
                {slice.isOther ? '+' : String(index + 1).padStart(2, '0')}
              </span>
              <span className="flex min-w-0 items-baseline gap-2">
                <span
                  className="size-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: slice.fill }}
                  aria-hidden="true"
                />
                <span className="break-words text-xs leading-5 text-foreground" title={slice.name}>
                  {slice.name}
                </span>
              </span>
              <span className="min-w-0 text-right">
                <span className="block break-words font-mono text-xs font-medium tabular-nums text-foreground">
                  {formatValue(slice.value)}
                </span>
                <span className="mt-0.5 block font-mono text-[10px] tabular-nums text-muted-foreground">
                  {(share * 100).toFixed(1)}%
                </span>
              </span>
              <span className="absolute inset-x-2 bottom-0 h-px overflow-hidden bg-border/50" aria-hidden="true">
                <motion.span
                  className="absolute inset-0 origin-left"
                  style={{ backgroundColor: slice.fill }}
                  initial={animate ? { scaleX: 0 } : false}
                  animate={{ scaleX: share }}
                  transition={{ duration: animate ? 0.45 : 0, delay: animate ? Math.min(index, 6) * 0.035 : 0 }}
                />
              </span>
            </>
          )
          const rowClass = 'relative grid min-h-12 w-full grid-cols-[1.25rem_minmax(0,1fr)_minmax(0,auto)] items-start gap-x-2 rounded-md px-2 py-2.5 text-left'
          const rowStyle = {
            opacity: dimmed ? 0.55 : 1,
            transition: animate ? 'opacity 160ms ease-out' : 'none',
          }

          return (
            <motion.li
              key={slice.name}
              initial={animate ? { opacity: 0, y: 6 } : false}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: animate ? 0.22 : 0, delay: animate ? Math.min(index, 6) * 0.035 : 0 }}
              onMouseEnter={() => onActiveChange(slice.name)}
              onMouseLeave={() => onActiveChange(null)}
              onFocus={() => onActiveChange(slice.name)}
              onBlur={() => onActiveChange(null)}
            >
              {clickable ? (
                <button
                  type="button"
                  className={`${rowClass} hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 ${focusRingClass}`}
                  style={rowStyle}
                  onClick={() => onSliceClick(target)}
                >
                  {content}
                </button>
              ) : (
                <div className={`${rowClass} ${active ? 'bg-muted/40' : ''}`} style={rowStyle}>
                  {content}
                </div>
              )}
            </motion.li>
          )
        })}
      </ol>
    </div>
  )
}
