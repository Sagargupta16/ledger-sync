import { motion } from 'framer-motion'
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
  return (
    <motion.section
      className="glass rounded-2xl border border-border p-4 sm:p-6"
      {...SCROLL_FADE_UP}
    >
      <div className="mb-6 flex items-center justify-between gap-2">
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
        <div className="space-y-2">
          <div className="grid grid-cols-7 gap-1">
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
              <div key={rowId} className="grid grid-cols-7 gap-1">
                {Array.from({ length: 7 }, (_, index) => `${rowId}-col-${index}`).map(
                  (cellId) => (
                    <div
                      key={cellId}
                      className="min-h-[60px] animate-pulse rounded-xl bg-[var(--overlay-2)] sm:min-h-[72px]"
                    />
                  ),
                )}
              </div>
            ),
          )}
        </div>
      )}

      {!isLoading && !hasAnyData && (
        <EmptyState
          icon={CalendarDays}
          title="No recurring transactions found"
          description="Once recurring payment patterns are detected from your transactions, they will appear on the calendar. You can also add manual subscriptions from the Subscription Tracker page."
          variant="card"
        />
      )}

      {!isLoading && hasAnyData && (
        <>
          <div className="mb-1 grid grid-cols-7 gap-1">
            {DAY_NAMES.map((name) => (
              <div
                key={name}
                className="py-2 text-center text-xs font-medium text-muted-foreground"
              >
                {name}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
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
                  day={cell.day}
                  isToday={isToday}
                  isSelected={isSelected}
                  isCurrentMonth={cell.isCurrentMonth}
                  bills={bills}
                  maxBillAmount={maxBillAmount}
                  onClick={() => {
                    if (cell.isCurrentMonth) {
                      onSelectDay(selectedDay === cell.day ? null : cell.day)
                    }
                  }}
                />
              )
            })}
          </div>

          <BillCalendarLegend />
        </>
      )}
    </motion.section>
  )
}
