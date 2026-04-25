import type { ReactNode } from 'react'
import { useMemo, useState } from 'react'

import { motion } from 'framer-motion'

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
  /** Override the value used for comparison. Default: `row[key]` when row is a string-keyed object. */
  readonly sortValue?: (row: T) => number | string
  readonly cell: (row: T, index: number) => ReactNode
  /** Per-row className override for this column (e.g. color based on sign of the value). */
  readonly cellClassName?: (row: T, index: number) => string
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

export default function DataTable<T>({
  columns,
  rows,
  rowKey,
  initialSort,
  animateRows = true,
  rowClassName,
  emptyState,
  ariaLabel,
}: DataTableProps<T>) {
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
    setSortDir('desc')
  }

  if (rows.length === 0 && emptyState !== undefined) {
    return <>{emptyState}</>
  }

  const shouldAnimate = animateRows && sortedRows.length <= 200

  return (
    <div className="overflow-x-auto data-table-scroll">
      <table className="w-full" aria-label={ariaLabel}>
        <thead>
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
              const arrow = isActive ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''

              return (
                <th
                  key={col.key}
                  className={`${baseClass} cursor-pointer hover:text-white select-none`.trim()}
                  onClick={() => toggleSort(col.key)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      toggleSort(col.key)
                    }
                  }}
                  tabIndex={0}
                  aria-sort={ariaSort(isActive, sortDir)}
                >
                  {col.header}
                  {arrow}
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
