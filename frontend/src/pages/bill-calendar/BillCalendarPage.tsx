import { motion, AnimatePresence } from 'framer-motion'
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  DollarSign,
  Hash,
  Clock,
  X,
} from 'lucide-react'
import { PageHeader } from '@/components/ui'
import { formatCurrency } from '@/lib/formatters'
import { rawColors } from '@/constants/colors'
import { SCROLL_FADE_UP } from '@/constants/animations'
import EmptyState from '@/components/shared/EmptyState'
import { CardGridSkeleton } from '@/components/shared/LoadingSkeleton'
import { useBillCalendar } from './useBillCalendar'
import { formatMonthYear, formatShortDate, isSameDay } from './billUtils'
import { DAY_NAMES } from './types'
import SummaryCard from '@/components/shared/SummaryCard'
import BillDetailItem from './components/BillDetailItem'
import DayCell from './components/DayCell'

export default function BillCalendarPage() {
  const {
    now,
    viewYear,
    viewMonth,
    selectedDay,
    setSelectedDay,
    goToPrevMonth,
    goToNextMonth,
    goToToday,
    billMap,
    calendarGrid,
    summary,
    selectedDayBills,
    isLoading,
    hasAnyData,
    isCurrentViewToday,
  } = useBillCalendar()

  // The countdown is the headline; the bill name + amount becomes the context
  // line. Leads with "what's the urgency" rather than "which bill".
  const nextBill = summary.nextBill
  const daysUntil = summary.nextBillDaysUntil
  const nextBillPrimary = (() => {
    if (!nextBill || daysUntil === null) return 'None upcoming'
    if (daysUntil <= 0) return 'Due today'
    if (daysUntil === 1) return 'Due tomorrow'
    return `In ${daysUntil} days`
  })()
  const nextBillContext = nextBill
    ? `${nextBill.name} -- ${formatCurrency(nextBill.amount)}`
    : 'Next Upcoming Bill'

  return (
    <div className="min-h-dvh p-4 md:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <PageHeader
          title="Bill Calendar"
          subtitle="Upcoming expected payments in a monthly calendar view"
        />

        {isLoading ? (
          <CardGridSkeleton count={3} cols="grid-cols-1 sm:grid-cols-3" />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-5">
            <SummaryCard
              icon={DollarSign}
              label="Total Due This Month"
              value={formatCurrency(summary.totalDue)}
              colorClass="text-app-red"
              bgClass="bg-app-red/20"
              shadowClass="shadow-app-red/30"
              delay={0.1}
              compact
            />
            <SummaryCard
              icon={Hash}
              label="Bills This Month"
              value={String(summary.billCount)}
              colorClass="text-app-blue"
              bgClass="bg-app-blue/20"
              shadowClass="shadow-app-blue/30"
              delay={0.2}
              compact
            />
            {/* Next-bill card spans full width on phone so it never sits
                lopsided alone in the 2-column row. */}
            <div className="col-span-2 sm:col-span-1">
              <SummaryCard
                icon={Clock}
                label={nextBillContext}
                value={nextBillPrimary}
                colorClass="text-app-orange"
                bgClass="bg-app-orange/20"
                shadowClass="shadow-app-orange/30"
                delay={0.3}
                compact
              />
            </div>
          </div>
        )}

        <motion.div
          className="glass rounded-2xl border border-border p-4 sm:p-6"
          {...SCROLL_FADE_UP}
        >
          <div className="flex items-center justify-between mb-6">
            <button
              type="button"
              onClick={goToPrevMonth}
              className="flex items-center justify-center min-h-11 min-w-11 sm:min-h-0 sm:min-w-0 p-2 rounded-lg hover:bg-[var(--overlay-5)] transition-colors text-muted-foreground hover:text-foreground"
              aria-label="Previous month"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold text-foreground">
                {formatMonthYear(viewYear, viewMonth)}
              </h2>
              {!isCurrentViewToday && (
                <button
                  type="button"
                  onClick={goToToday}
                  className="text-xs px-3 py-2 sm:py-1 min-h-11 sm:min-h-0 rounded-md bg-app-blue/15 text-app-blue hover:bg-app-blue/25 transition-colors font-medium"
                >
                  Today
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={goToNextMonth}
              className="flex items-center justify-center min-h-11 min-w-11 sm:min-h-0 sm:min-w-0 p-2 rounded-lg hover:bg-[var(--overlay-5)] transition-colors text-muted-foreground hover:text-foreground"
              aria-label="Next month"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          {isLoading && (
            <div className="space-y-2">
              <div className="grid grid-cols-7 gap-1">
                {DAY_NAMES.map((name) => (
                  <div
                    key={name}
                    className="text-center text-xs font-medium text-muted-foreground py-2"
                  >
                    {name}
                  </div>
                ))}
              </div>
              {Array.from({ length: 5 }, (_, i) => `skeleton-row-${i}`).map((rowId) => (
                <div key={rowId} className="grid grid-cols-7 gap-1">
                  {Array.from({ length: 7 }, (_, j) => `${rowId}-col-${j}`).map((cellId) => (
                    <div
                      key={cellId}
                      className="min-h-[60px] sm:min-h-[72px] rounded-xl bg-[var(--overlay-2)] animate-pulse"
                    />
                  ))}
                </div>
              ))}
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
              <div className="grid grid-cols-7 gap-1 mb-1">
                {DAY_NAMES.map((name) => (
                  <div
                    key={name}
                    className="text-center text-xs font-medium text-muted-foreground py-2"
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
                      maxBillAmount={summary.maxBillAmount}
                      onClick={() => {
                        if (cell.isCurrentMonth) {
                          setSelectedDay(selectedDay === cell.day ? null : cell.day)
                        }
                      }}
                    />
                  )
                })}
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-4 pt-3 border-t border-border">
                <span className="text-xs text-text-tertiary">Legend:</span>
                <div className="flex items-center gap-1.5 text-xs text-text-secondary">
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: rawColors.app.green }}
                  />
                  <span>Confirmed</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-text-secondary">
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: rawColors.app.blue }}
                  />
                  <span>Detected</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-text-secondary">
                  <span className="flex items-end gap-0.5" aria-hidden="true">
                    <span className="w-1 h-1 rounded-full bg-text-tertiary" />
                    <span className="w-2 h-2 rounded-full bg-text-tertiary" />
                  </span>
                  <span>Bigger dot = larger amount</span>
                </div>
              </div>
            </>
          )}
        </motion.div>

        <AnimatePresence mode="wait">
          {selectedDay !== null && (
            <motion.div
              key={`detail-${selectedDay}`}
              role="region"
              aria-live="polite"
              aria-label={`Bills for ${formatShortDate(viewYear, viewMonth, selectedDay)}`}
              initial={{ opacity: 0, y: 20, height: 0 }}
              animate={{ opacity: 1, y: 0, height: 'auto' }}
              exit={{ opacity: 0, y: -10, height: 0 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
              className="glass rounded-2xl border border-border p-4 sm:p-6 overflow-hidden"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-semibold text-foreground">
                  Bills for {formatShortDate(viewYear, viewMonth, selectedDay)}
                </h3>
                <div className="flex items-center gap-2">
                  {selectedDayBills.length > 0 && (
                    <span className="text-xs px-2.5 py-1 rounded-full bg-app-blue/15 text-app-blue font-medium">
                      {selectedDayBills.length} bill{selectedDayBills.length === 1 ? '' : 's'}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => setSelectedDay(null)}
                    aria-label="Close day details"
                    className="flex items-center justify-center min-h-11 min-w-11 sm:min-h-0 sm:min-w-0 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-[var(--overlay-5)] transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {selectedDayBills.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No bills expected on this day.
                </p>
              ) : (
                <div className="space-y-2">
                  {selectedDayBills.map((bill) => (
                    <BillDetailItem key={bill.key} bill={bill} />
                  ))}
                  <div className="flex items-center justify-between pt-3 mt-3 border-t border-border">
                    <span className="text-sm text-muted-foreground">Total for this day</span>
                    <span className="text-sm font-bold text-foreground">
                      {formatCurrency(
                        selectedDayBills.reduce((sum, b) => sum + b.amount, 0),
                      )}
                    </span>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
