/**
 * Screen-reader data table for Recharts visualizations.
 *
 * Recharts paints `<path>` elements assistive tech cannot interpret, and a
 * `role="img"` label only conveys the gist -- a reader still can't get the
 * numbers. This renders the same data as a visually-hidden `<table>`.
 *
 * Extracted from `chartDefaults` so that module stays a styling-tokens file.
 */

export interface ChartDataTableColumn<T> {
  header: string
  /** Render this column's cells as `<th scope="row">`. Set on exactly one column. */
  rowHeader?: boolean
  value: (row: T) => string
}

/**
 * Visually-hidden `<table>` mirroring a chart's data.
 *
 * `sr-only` is absolutely positioned and clipped, so this contributes nothing to
 * layout; the visual chart is byte-identical.
 *
 * PLACEMENT RULE -- the table must never be a descendant of a `role="img"`
 * element. ARIA makes the children of `role="img"` presentational, so a nested
 * table is hidden from AT again and the reader is back to the one-sentence gist.
 * In practice that means:
 *
 * 1. The chart component renders this as a SIBLING of `ChartContainer` (whose
 *    `ariaLabel` is what emits the `role="img"` wrapper).
 * 2. Call sites must NOT add their own `role="img"` wrapper around the chart --
 *    pass `ariaLabel` to the chart component instead. A hand-rolled wrapper sits
 *    OUTSIDE the component, so it swallows the table too (rule 1 can't save it).
 *
 * Note that jsdom/testing-library does not implement presentational children, so
 * a unit test cannot catch a violation of rule 2 -- it is enforced by review and
 * by every chart component exposing an `ariaLabel` prop so no call site needs a
 * wrapper.
 *
 * Kept as a camelCase render function so the caller reads as a helper call --
 * mirrors `referenceLine` in `chartDefaults`.
 */
export function chartDataTable<T>(
  rows: readonly T[],
  columns: readonly ChartDataTableColumn<T>[],
  caption: string,
  keyOf: (row: T, index: number) => string,
) {
  return (
    <div className="sr-only overflow-hidden">
      <table className="sr-only">
        <caption>{caption}</caption>
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col.header} scope="col">
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={keyOf(row, i)}>
              {columns.map((col) =>
                col.rowHeader ? (
                  <th key={col.header} scope="row">
                    {col.value(row)}
                  </th>
                ) : (
                  <td key={col.header}>{col.value(row)}</td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
