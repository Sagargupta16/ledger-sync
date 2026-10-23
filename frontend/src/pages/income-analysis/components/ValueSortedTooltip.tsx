/**
 * CartesianTooltip with its rows ordered by the inspected month's values,
 * largest first, so the box lists the series in the order their lines stack.
 * Shared by the Income and Expense trend charts; the live region reads the
 * same order because the reordered `series` feeds it too.
 */

import CartesianTooltip, { type CartesianTooltipProps } from '@/components/charts/CartesianTooltip'
import { useCartesian } from '@/components/charts/chartContext'

export default function ValueSortedTooltip({ series, ...props }: CartesianTooltipProps) {
  const { rows, activeIndex, numberAt } = useCartesian()
  const row = activeIndex === null ? undefined : rows[activeIndex]
  // A series with no value at this row is left out of the box, so 0 only parks it.
  const valueOf = (key: string) => (row === undefined ? 0 : (numberAt(row, key) ?? 0))
  // Array sort is stable: equal values keep the order the series were given in.
  const ordered = row === undefined ? series : [...series].sort((a, b) => valueOf(b.key) - valueOf(a.key))
  return <CartesianTooltip {...props} series={ordered} />
}
