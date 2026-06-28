import type { ReactNode } from 'react'
import { useMemo, useState } from 'react'

import { motion } from 'framer-motion'

import { useIsMobile } from '@/hooks/useIsMobile'

type Align = 'left' | 'right' | 'center'
type SortDir = 'asc' | 'desc'

export interface DataTableColumn<T> {
  /** Unique key. Used for sort state, React keys, and (if the row is a plain object) default sortValue via `row[key]`. */
  readonly key: string
  readonly header: ReactNode
  readonly align?: Align
  /** Tailwind width class, e.g. `w-24`. Applied to both `<th>` and cells. */
  readonly widthClass?: string
  readonly sortable?: boolean
  /**
   * Value type, used to pick the first-click sort direction: numeric/date
   * columns default to descending (largest first — the usual intent for
   * amounts), text columns to ascending (A→Z). Defaults to `'number'`.
   */
  readonly sortType?: 'number' | 'text'
  /** Override the value used for comparison. Default: `row[key]` when row is a string-keyed object. */
  readonly sortValue?: (row: T) => number | string
  readonly cell: (row: T, index: number) => ReactNode
  /** Per-row className override for this column (e.g. color based on sign of the value). */
  readonly cellClassName?: (row: T, index: number) => string
  /**
   * Label shown beside this column's value in the mobile card-stack layout
   * (when `mobileCards` is on). Defaults to the `header` if it's a string.
   * Set to `''` to render the value with no label (e.g. a primary name row).
   */
  readonly mobileLabel?: string
  /**
   * In mobile card mode, treat this column as the card's title row (rendered
   * full-width at the top, no label). Use for the primary identifying column.
   */
  readonly mobilePrimary?: boolean
}

export interface DataTableProps<T> {
  readonly columns: readonly DataTableColumn<T>[]
  readonly rows: readonly T[]
  readonly rowKey: (row: T, index: number) => string
  readonly initialSort?: { key: string; dir: SortDir }
  /** Row fade-in on mount. Default true. Auto-disabled above 200 rows for perf. */
  readonly animateRows?: boolean
  readonly rowClassName?: (row: T, index: number) => string
  readonly emptyState?: ReactNode
  readonly ariaLabel?: string
  /** Keep the header row pinned while the body scrolls. Pair with `maxHeight`. */
  readonly stickyHeader?: boolean
  /** Max height (e.g. `max-h-96`) for a scrollable body. */
  readonly maxHeightClass?: string
  /**
   * Below the `sm` breakpoint (640px), render each row as a stacked label/value
   * card instead of a horizontally-scrolling table. Far more readable on phones
   * for wide tables. Columns use `mobileLabel` / `mobilePrimary` to lay out.
   */
  readonly mobileCards?: boolean
}

const ALIGN_CLASS: Record<Align, string> = {
  left: 'text-left',
  // `tabular-nums` keeps digit glyphs a uniform width so currency columns
  // line up vertically when rows have different decimal widths.
  right: 'text-right tabular-nums',
  center: 'text-center',
}

function defaultSortValue<T>(row: T, key: string): number | string {
  const v = (row as Record<string, unknown>)[key]
  if (typeof v === 'number' || typeof v === 'string') return v
  return ''
}

function compareValues(a: number | string, b: number | string): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a).localeCompare(String(b))
}

function ariaSort(
  active: boolean,
  dir: SortDir,
): 'ascending' | 'descending' | 'none' {
  if (!active) return 'none'
  return dir === 'asc' ? 'ascending' : 'descending'
}

function sortArrow(active: boolean, dir: SortDir): string {
  if (!active) return '↕'
  return dir === 'asc' ? '↑' : '↓'
}

export default function DataTable<T>({
  columns,
  rows,
  rowKey,
  initialSort,
  animateRows = true,
  rowClassName,
  emptyState,
  ariaLabel,
  stickyHeader = false,
  maxHeightClass,
  mobileCards = false,
}: DataTableProps<T>) {
  const isMobile = useIsMobile()
  const [sortKey, setSortKey] = useState<string | null>(initialSort?.key ?? null)
  const [sortDir, setSortDir] = useState<SortDir>(initialSort?.dir ?? 'desc')

  const sortedRows = useMemo(() => {
    if (sortKey === null) return rows
    const col = columns.find((c) => c.key === sortKey)
    if (!col || col.sortable !== true) return rows
    const getter = col.sortValue ?? ((r: T) => defaultSortValue(r, sortKey))
    const copy = [...rows]
    copy.sort((a, b) => {
      const cmp = compareValues(getter(a), getter(b))
      return sortDir === 'asc' ? cmp : -cmp
    })
    return copy
  }, [rows, columns, sortKey, sortDir])

  const toggleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortKey(key)
    // First click: text columns read most naturally A→Z (asc); numeric/date
    // columns default to largest-first (desc).
    const col = columns.find((c) => c.key === key)
    setSortDir(col?.sortType === 'text' ? 'asc' : 'desc')
  }

  if (rows.length === 0 && emptyState !== undefined) {
    return <>{emptyState}</>
  }

  const shouldAnimate = animateRows && sortedRows.length <= 200

  // Mobile card-stack: each row becomes a stacked label/value card so wide
  // tables don't force horizontal scrolling on phones. One column may be the
  // card title (mobilePrimary); the rest render as label/value rows.
  if (mobileCards && isMobile) {
    const labelFor = (col: DataTableColumn<T>) =>
      col.mobileLabel ?? (typeof col.header === 'string' ? col.header : '')
    return (
      <div className="space-y-2" aria-label={ariaLabel}>
        {sortedRows.map((row, i) => {
          const primary = columns.find((c) => c.mobilePrimary)
          const rest = columns.filter((c) => !c.mobilePrimary)
          return (
            <div
              key={rowKey(row, i)}
              className={`glass rounded-xl border border-border p-3 ${rowClassName?.(row, i) ?? ''}`.trim()}
            >
              {primary && (
                <div className={`mb-2 font-medium ${primary.cellClassName?.(row, i) ?? ''}`.trim()}>
                  {primary.cell(row, i)}
                </div>
              )}
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                {rest.map((col) => (
                  <div key={col.key} className="flex items-baseline justify-between gap-2 min-w-0">
                    <dt className="text-xs text-text-tertiary shrink-0">{labelFor(col)}</dt>
                    <dd className={`text-sm text-right min-w-0 truncate ${col.cellClassName?.(row, i) ?? ''}`.trim()}>
                      {col.cell(row, i)}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          )
        })}
      </div>
    )
  }

  const scrollClass = [
    'overflow-x-auto data-table-scroll',
    maxHeightClass ? `${maxHeightClass} overflow-y-auto` : '',
  ].join(' ').trim()
  const theadClass = stickyHeader ? 'sticky top-0 z-10 bg-surface-dropdown/95 backdrop-blur-md' : ''
  const justifyForAlign: Record<Align, string> = {
    left: 'justify-start',
    right: 'justify-end',
    center: 'justify-center',
  }

  return (
    <div className={scrollClass}>
      <table className="w-full" aria-label={ariaLabel}>
        <thead className={theadClass}>
          <tr className="border-b border-border">
            {columns.map((col) => {
              const alignClass = ALIGN_CLASS[col.align ?? 'left']
              const widthClass = col.widthClass ?? ''
              const baseClass = `py-3 px-4 text-sm font-semibold text-muted-foreground ${alignClass} ${widthClass}`

              if (col.sortable !== true) {
                return (
                  <th key={col.key} className={baseClass.trim()}>
                    {col.header}
                  </th>
                )
              }

              const isActive = sortKey === col.key
              const arrow = sortArrow(isActive, sortDir)

              return (
                <th
                  key={col.key}
                  className={baseClass.trim()}
                  aria-sort={ariaSort(isActive, sortDir)}
                >
                  <button
                    type="button"
                    onClick={() => toggleSort(col.key)}
                    className={`inline-flex items-center gap-1 ${justifyForAlign[col.align ?? 'left']} w-full hover:text-white select-none transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-app-blue/40 rounded`}
                  >
                    {col.header}
                    <span
                      aria-hidden
                      className={isActive ? 'text-white' : 'text-text-quaternary'}
                    >
                      {arrow}
                    </span>
                  </button>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {sortedRows.map((row, i) => {
            const key = rowKey(row, i)
            const rowCls = rowClassName?.(row, i) ?? ''
            const baseRowCls = `border-b border-border hover:bg-white/5 transition-colors ${rowCls}`.trim()

            if (shouldAnimate) {
              return (
                <motion.tr
                  key={key}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.02, 0.2) }}
                  className={baseRowCls}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={`py-3 px-4 ${ALIGN_CLASS[col.align ?? 'left']} ${col.cellClassName?.(row, i) ?? ''}`.trim()}
                    >
                      {col.cell(row, i)}
                    </td>
                  ))}
                </motion.tr>
              )
            }

            return (
              <tr key={key} className={baseRowCls}>
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={`py-3 px-4 ${ALIGN_CLASS[col.align ?? 'left']} ${col.cellClassName?.(row, i) ?? ''}`.trim()}
                  >
                    {col.cell(row, i)}
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
