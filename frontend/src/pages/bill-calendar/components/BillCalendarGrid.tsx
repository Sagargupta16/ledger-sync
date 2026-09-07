import { useRef, useState, type KeyboardEvent } from 'react'

import { motion } from 'motion/react'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'

import EmptyState from '@/components/shared/EmptyState'
import { Button } from '@/components/ui'
import { SCROLL_FADE_UP } from '@/constants/animations'

import { formatMonthYear, isSameDay } from '../billUtils'
import { DAY_NAMES } from '../types'
import type { useBillCalendar } from '../useBillCalendar'

import BillCalendarLegend from './BillCalendarLegend'
import DayCell from './DayCell'

type CalendarState = ReturnType<typeof useBillCalendar>

interface BillCalendarGridProps {
  readonly now: CalendarState['now']
  readonly viewYear: number
  readonly viewMonth: number
  readonly selectedDay: number | null
  readonly billMap: CalendarState['billMap']
  readonly calendarGrid: CalendarState['calendarGrid']
  readonly maxBillAmount: number
  readonly isLoading: boolean
  readonly hasAnyData: boolean
  readonly isCurrentViewToday: boolean
  readonly onPreviousMonth: () => void
  readonly onNextMonth: () => void
  readonly onToday: () => void
  readonly onSelectDay: (day: number | null) => void
}

export default function BillCalendarGrid({
  now,
  viewYear,
  viewMonth,
  selectedDay,
  billMap,
  calendarGrid,
  maxBillAmount,
  isLoading,
  hasAnyData,
  isCurrentViewToday,
  onPreviousMonth,
  onNextMonth,
  onToday,
  onSelectDay,
}: BillCalendarGridProps) {
  const daysInView = calendarGrid.filter((cell) => cell.isCurrentMonth).length
  const defaultFocusDay = isCurrentViewToday ? now.getDate() : 1
  const viewKey = `${viewYear}-${viewMonth}`
  const [focusAnchor, setFocusAnchor] = useState<{ viewKey: string; day: number } | null>(null)
  const focusedDay =
    focusAnchor?.viewKey === viewKey ? focusAnchor.day : (selectedDay ?? defaultFocusDay)
  const gridRef = useRef<HTMLDivElement>(null)

  const handleDayKeyDown = (event: KeyboardEvent<HTMLButtonElement>, day: number) => {
    let nextDay: number | null = null
    if (event.key === 'ArrowLeft') nextDay = day - 1
    if (event.key === 'ArrowRight') nextDay = day + 1
    if (event.key === 'ArrowUp') nextDay = day - 7
    if (event.key === 'ArrowDown') nextDay = day + 7
    if (event.key === 'Home') nextDay = 1
    if (event.key === 'End') nextDay = daysInView
    if (nextDay === null) return

    event.preventDefault()
    const clampedDay = Math.min(daysInView, Math.max(1, nextDay))
    setFocusAnchor({ viewKey, day: clampedDay })
    requestAnimationFrame(() => {
      gridRef.current
        ?.querySelector<HTMLButtonElement>(`[data-bill-calendar-day="${clampedDay}"]`)
        ?.focus()
    })
  }

  return (
    <motion.section
      className="-mx-4 border-y border-[var(--glass-border)] bg-surface-1 py-4 sm:mx-0 sm:rounded-lg sm:border sm:p-5 sm:shadow-[var(--glass-shadow)]"
      {...SCROLL_FADE_UP}
    >
      <div className="mb-4 flex items-center justify-between gap-2 px-4 sm:px-0">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onPreviousMonth}
          aria-label="Previous month"
          icon={<ChevronLeft className="h-5 w-5" />}
          className="p-2"
        />

        <div className="flex min-w-0 items-center justify-center gap-2 sm:gap-3">
          <h2 className="truncate text-base font-semibold text-foreground sm:text-lg">
            {formatMonthYear(viewYear, viewMonth)}
          </h2>
          {!isCurrentViewToday && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onToday}
              className="bg-app-blue/15 text-app-blue hover:bg-app-blue/25 hover:text-app-blue"
            >
              Today
            </Button>
          )}
        </div>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onNextMonth}
          aria-label="Next month"
          icon={<ChevronRight className="h-5 w-5" />}
          className="p-2"
        />
      </div>

      {isLoading && (
        <div className="overflow-x-auto pb-1">
          <div className="min-w-[20rem] space-y-2">
            <div className="grid grid-cols-7 gap-0.5 sm:gap-1">
              {DAY_NAMES.map((name) => (
                <div
                  key={name}
                  className="py-2 text-center text-xs font-medium text-muted-foreground"
                >
                  {name}
                </div>
              ))}
            </div>
            {Array.from({ length: 5 }, (_, index) => `skeleton-row-${index}`).map(
              (rowId) => (
                <div key={rowId} className="grid grid-cols-7 gap-0.5 sm:gap-1">
                  {Array.from({ length: 7 }, (_, index) => `${rowId}-col-${index}`).map(
                    (cellId) => (
                      <div
                        key={cellId}
                        className="min-h-[60px] min-w-11 animate-pulse rounded-md bg-[var(--overlay-2)] sm:min-h-[72px]"
                      />
                    ),
                  )}
                </div>
              ),
            )}
          </div>
        </div>
      )}

      {!isLoading && !hasAnyData && (
        <div className="px-4 sm:px-0">
          <EmptyState
            icon={CalendarDays}
            title="No recurring transactions found"
            description="Once recurring payment patterns are detected from your transactions, they will appear on the calendar. You can also add manual subscriptions from the Subscription Tracker page."
            variant="card"
          />
        </div>
      )}

      {!isLoading && hasAnyData && (
        <>
          <p id="bill-calendar-keyboard-help" className="sr-only">
            Use the arrow keys to move between days. Press Enter or Space to select a day.
          </p>
          <div className="overflow-x-auto pb-1">
            <div className="min-w-[20rem]">
              <div className="mb-1 grid grid-cols-7 gap-0.5 sm:gap-1">
                {DAY_NAMES.map((name) => (
                  <div
                    key={name}
                    className="py-2 text-center text-xs font-medium text-muted-foreground"
                  >
                    {name}
                  </div>
                ))}
              </div>

              <div
                ref={gridRef}
                role="group"
                className="grid grid-cols-7 gap-0.5 sm:gap-1"
                aria-label={`${formatMonthYear(viewYear, viewMonth)} calendar`}
                aria-describedby="bill-calendar-keyboard-help"
              >
                {calendarGrid.map((cell) => {
                  const bills = cell.isCurrentMonth ? (billMap.get(cell.day) ?? []) : []
                  const isToday = isSameDay(
                    cell.year,
                    cell.month,
                    cell.day,
                    now.getFullYear(),
                    now.getMonth(),
                    now.getDate(),
                  )
                  const isSelected = cell.isCurrentMonth && selectedDay === cell.day

                  return (
                    <DayCell
                      key={`cell-${cell.year}-${cell.month}-${cell.day}`}
                      year={cell.year}
                      month={cell.month}
                      day={cell.day}
                      isToday={isToday}
                      isSelected={isSelected}
                      isCurrentMonth={cell.isCurrentMonth}
                      bills={bills}
                      maxBillAmount={maxBillAmount}
                      tabIndex={
                        cell.isCurrentMonth && cell.day === focusedDay ? 0 : -1
                      }
                      onFocus={() => setFocusAnchor({ viewKey, day: cell.day })}
                      onKeyDown={(event) => handleDayKeyDown(event, cell.day)}
                      onClick={() =>
                        onSelectDay(selectedDay === cell.day ? null : cell.day)
                      }
                    />
                  )
                })}
              </div>
            </div>
          </div>

          <div className="px-4 sm:px-0">
            <BillCalendarLegend />
          </div>
        </>
      )}
    </motion.section>
  )
}
