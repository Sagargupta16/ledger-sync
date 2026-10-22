import { usePrinting } from '@/components/charts/usePrinting'
import { cn } from '@/lib/cn'

interface LegendItem {
  readonly key: string
  readonly label: string
  readonly color: string
  readonly value?: string
}

interface ChartSeriesLegendProps {
  readonly items: readonly LegendItem[]
  readonly caption?: string
  /** Keys of the series switched off; read only together with `onToggle`. */
  readonly hidden?: ReadonlySet<string>
  /**
   * Makes each item a toggle button, pressed while its series is drawn, that
   * reports its key. The one series left shown is locked on.
   */
  readonly onToggle?: (key: string) => void
}

/** The pills' padding hangs outside the list, so swatches keep the static list's left edge and 24px spacing. */
const TOGGLE_LIST = '-mx-2.5 flex min-w-0 flex-wrap gap-x-1'

/** Keep series names and current readings outside the plot's measuring area. */
export default function ChartSeriesLegend({ items, caption, hidden, onToggle }: ChartSeriesLegendProps) {
  // Paper hides every button (overrides.css), so a printout lists the drawn series as plain text.
  const printing = usePrinting()
  const shown = onToggle ? items.filter((item) => !hidden?.has(item.key)) : items
  return (
    <div className="mb-4 flex min-w-0 flex-wrap items-start justify-between gap-x-6 gap-y-3">
      {onToggle && !printing ? (
        <ul aria-label="Show or hide chart series" className={TOGGLE_LIST}>
          {items.map((item) => {
            const on = !hidden?.has(item.key)
            return (
              <li key={item.key} className="min-w-0">
                <SeriesToggle item={item} shown={on} locked={on && shown.length === 1} onToggle={onToggle} />
              </li>
            )
          })}
        </ul>
      ) : (
        <ul aria-label="Chart series" className="flex min-w-0 flex-wrap gap-x-6 gap-y-3">
          {shown.map((item) => (
            <li key={item.key} className="min-w-0">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span
                  className="h-0.5 w-3 shrink-0 rounded-full"
                  style={{ backgroundColor: item.color }}
                  aria-hidden="true"
                />
                <span className="break-words">{item.label}</span>
              </div>
              {item.value !== undefined && (
                <p className="mt-1 pl-5 font-mono text-sm font-medium tabular-nums text-foreground">
                  {item.value}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
      {caption && (
        <p className="pt-0.5 font-mono text-[10px] tabular-nums text-muted-foreground">
          {caption}
        </p>
      )}
    </div>
  )
}

interface SeriesToggleProps {
  readonly item: LegendItem
  readonly shown: boolean
  /** The last series still drawn: it stays on, so the plot never empties. */
  readonly locked: boolean
  readonly onToggle: (key: string) => void
}

/** A legend entry as a pill toggle; off, its swatch fades and its name and reading go muted, the name struck. */
function SeriesToggle({ item, shown, locked, onToggle }: SeriesToggleProps) {
  const hover = !locked && 'group-hover:text-foreground'
  return (
    <button
      type="button"
      aria-pressed={shown}
      aria-disabled={locked || undefined}
      onClick={locked ? undefined : () => onToggle(item.key)}
      className={cn(
        'group flex min-h-11 max-w-full touch-manipulation flex-col justify-center rounded-md px-2.5 py-1 text-left transition-colors lg:pointer-fine:min-h-8',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        !locked && 'hover:bg-[var(--ledger-control-bg-hover)]',
      )}
    >
      <span className={cn('flex items-center gap-2 text-xs text-muted-foreground transition-colors', hover)}>
        <span
          className={cn('h-0.5 w-3 shrink-0 rounded-full transition-opacity', !shown && 'opacity-40')}
          style={{ backgroundColor: item.color }}
          aria-hidden="true"
        />
        <span className={cn('break-words', !shown && 'line-through')}>{item.label}</span>
      </span>
      {item.value !== undefined && (
        <>
          {/* Separates name and reading in the button's accessible name; a flex container drops it from layout. */}
          {' '}
          <span
            className={cn(
              'mt-1 block pl-5 font-mono text-sm font-medium tabular-nums transition-colors',
              shown ? 'text-foreground' : 'text-muted-foreground',
              hover,
            )}
          >
            {item.value}
          </span>
        </>
      )}
    </button>
  )
}
