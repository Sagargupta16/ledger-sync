import { useCallback, useMemo, useState, type KeyboardEvent } from 'react'

import type { DayCell } from './DayOfWeekChart'
import type { HeatmapMode } from '../types'
import type { useYearInReview } from '../useYearInReview'
import {
  HIGHLIGHT_CLEARED,
  SELECTION_CLEARED,
  describeHeatmapDay,
  describeHighlight,
  moveHeatmapFocus,
} from './heatmapKeyboard'
import { countHeatmapLevel, type HeatmapLegendStop, type HeatmapLevelKey } from './heatmapLevels'

type HeatmapReview = Pick<
  ReturnType<typeof useYearInReview>,
  'mode' | 'grid' | 'modeMax' | 'setHoveredDay'
>

/** One stable set of callbacks shared by every cell, so memoised cells skip hover re-renders. */
export interface HeatmapCellHandlers {
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>, cell: DayCell) => void
  onSelect: (cell: DayCell) => void
  onMouseEnter: (cell: DayCell) => void
  onMouseLeave: () => void
  onFocus: (cell: DayCell) => void
  onBlur: () => void
}

/**
 * Interaction state for the year heatmap: the roving tab stop, the selected
 * day (click, tap, Enter or Space), the legend highlight, the selected month
 * on phones, and the sentence the polite live region reads out.
 */
export function useHeatmapControls({ mode, grid, modeMax, setHoveredDay }: HeatmapReview) {
  const [keyboardDate, setKeyboardDate] = useState<string | null>(null)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null)
  // A level means something else in another metric, so a highlight lapses with its mode.
  const [highlight, setHighlight] = useState<{ mode: HeatmapMode; key: HeatmapLevelKey } | null>(
    null,
  )
  const [announcement, setAnnouncement] = useState('')

  const highlightKey = highlight?.mode === mode ? highlight.key : null
  const selectedDay = grid.find((cell) => cell.date === selectedDate) ?? null
  const hasSelection = selectedDay !== null

  const toggleHighlight = useCallback(
    (stop: HeatmapLegendStop) => {
      if (stop.key === highlightKey) {
        setHighlight(null)
        setAnnouncement(HIGHLIGHT_CLEARED)
        return
      }
      setHighlight({ mode, key: stop.key })
      setAnnouncement(describeHighlight(countHeatmapLevel(grid, mode, modeMax, stop.key), stop.label))
    },
    [grid, highlightKey, mode, modeMax],
  )

  const selectMonth = useCallback((monthIndex: number) => {
    setSelectedDate(null)
    setSelectedMonth((current) => (current === monthIndex ? null : monthIndex))
  }, [])

  const handlers = useMemo<HeatmapCellHandlers>(() => {
    const select = (cell: DayCell) => {
      setSelectedMonth(null)
      setSelectedDate(cell.date)
      setAnnouncement(`Selected ${describeHeatmapDay(cell)}`)
    }
    // Escape peels one layer at a time: the selected day, then the highlight.
    const clear = (): string | null => {
      if (hasSelection) {
        setSelectedDate(null)
        return SELECTION_CLEARED
      }
      if (highlightKey === null) return null
      setHighlight(null)
      return HIGHLIGHT_CLEARED
    }
    return {
      onKeyDown: (event, cell) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          select(cell)
        } else if (event.key === 'Escape') {
          const message = clear()
          if (message === null) return
          event.preventDefault()
          setAnnouncement(message)
        } else {
          moveHeatmapFocus(event, setKeyboardDate)
        }
      },
      onSelect: select,
      onMouseEnter: (cell) => {
        setSelectedMonth(null)
        setKeyboardDate(cell.date)
        setHoveredDay(cell)
      },
      onMouseLeave: () => setHoveredDay(null),
      onFocus: (cell) => {
        setSelectedMonth(null)
        setKeyboardDate(cell.date)
        setHoveredDay(cell)
        setAnnouncement(describeHeatmapDay(cell))
      },
      onBlur: () => setHoveredDay(null),
    }
  }, [hasSelection, highlightKey, setHoveredDay])

  return {
    keyboardDate,
    selectedDay,
    selectedMonth,
    selectMonth,
    highlightKey,
    toggleHighlight,
    announcement,
    handlers,
  }
}
