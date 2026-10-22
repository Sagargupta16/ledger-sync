import type { KeyboardEvent } from 'react'

import { addDaysToKey } from '@/lib/dateUtils'
import { formatCurrency, formatDate } from '@/lib/formatters'

import type { DayCell } from './DayOfWeekChart'
import { heatmapValueNoun } from '../heatmapUtils'

export const SELECTION_CLEARED = 'Selection cleared'
export const HIGHLIGHT_CLEARED = 'Highlight cleared, showing every day'

const LONG_DATE: Intl.DateTimeFormatOptions = {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
}

/**
 * Roving focus for the grid: Left and Right move a week, Up and Down a day,
 * Home and End jump to the first and last day that has happened. Only enabled
 * (past) cells are targets. Moves focus and reports the new date.
 */
export function moveHeatmapFocus(
  event: KeyboardEvent<HTMLButtonElement>,
  onMove: (date: string) => void,
) {
  const currentCell = event.currentTarget
  const heatmap = currentCell.closest<HTMLElement>('[data-heatmap-grid]')
  if (!heatmap) return

  const enabledCells = Array.from(
    heatmap.querySelectorAll<HTMLButtonElement>(
      'button[data-cell-date]:not(:disabled)',
    ),
  )
  let nextCell: HTMLButtonElement | undefined
  let dayDelta = 0

  if (event.key === 'ArrowRight') dayDelta = 7
  else if (event.key === 'ArrowLeft') dayDelta = -7
  else if (event.key === 'ArrowDown') dayDelta = 1
  else if (event.key === 'ArrowUp') dayDelta = -1
  else if (event.key === 'Home') nextCell = enabledCells[0]
  else if (event.key === 'End') nextCell = enabledCells.at(-1)
  else return

  if (dayDelta !== 0 && currentCell.dataset.cellDate) {
    const targetDate = addDaysToKey(currentCell.dataset.cellDate, dayDelta)
    nextCell = enabledCells.find((cell) => cell.dataset.cellDate === targetDate)
  }
  if (!nextCell) return

  event.preventDefault()
  const nextDate = nextCell.dataset.cellDate
  if (!nextDate) return

  onMove(nextDate)
  nextCell.focus()
}

/**
 * Live-region sentence for one day: the full date and the three figures the
 * detail row shows, in the cell labels' direction-explicit words.
 */
export function describeHeatmapDay(cell: DayCell): string {
  const date = `${formatDate(cell.date, LONG_DATE)}${cell.isToday ? ', today' : ''}`
  if (!cell.hasTx) return `${date}: no activity`
  const net =
    cell.net === 0
      ? 'net zero'
      : `${formatCurrency(Math.abs(cell.net))} ${heatmapValueNoun('net', cell.net)}`
  return `${date}: ${formatCurrency(cell.expense)} spent, ${formatCurrency(cell.income)} earned, ${net}`
}

/** Announcement for a legend highlight: how many days sit on the level. */
export function describeHighlight(count: number, label: string): string {
  return `${count} ${count === 1 ? 'day' : 'days'} with ${label} highlighted`
}
