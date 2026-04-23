import { motion, AnimatePresence } from 'framer-motion'
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  DollarSign,
  Hash,
  Clock,
} from 'lucide-react'
import { PageHeader } from '@/components/ui'
import { formatCurrency } from '@/lib/formatters'
import { rawColors } from '@/constants/colors'
import { SCROLL_FADE_UP } from '@/constants/animations'
import EmptyState from '@/components/shared/EmptyState'
import { useBillCalendar } from './useBillCalendar'
import { formatMonthYear, formatShortDate, isSameDay } from './billUtils'
import { DAY_NAMES } from './types'
import SummaryCard from './components/SummaryCard'
import BillDetailItem from './components/BillDetailItem'
import DayCell from './components/DayCell'

const LOADING_PLACEHOLDER = '...'

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

  const nextBillValue = (() => {
    if (isLoading) return LOADING_PLACEHOLDER
    if (summary.nextBill) {
      return `${summary.nextBill.name} - ${formatCurrency(summary.nextBill.amount)}`
    }
    return 'None upcoming'
  })()

  return (
    <div className="min-h-screen p-4 md:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <PageHeader
          title="Bill Calendar"
          subtitle="Upcoming expected payments in a monthly calendar view"
        />

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          <SummaryCard
            icon={DollarSign}
            label="Total Due This Month"
            value={isLoading ? LOADING_PLACEHOLDER : formatCurrency(summary.totalDue)}
            colorClass="text-app-red"
            bgClass="bg-app-red/20"
            shadowClass="shadow-app-red/30"
            delay={0.1}
          />
          <SummaryCard
            icon={Hash}
            label="Bills This Month"
            value={isLoading ? LOADING_PLACEHOLDER : String(summary.billCount)}
            colorClass="text-app-blue"
            bgClass="bg-app-blue/20"
            shadowClass="shadow-app-blue/30"
            delay={0.2}
          />
          <SummaryCard
            icon={Clock}
            label="Next Upcoming Bill"
            value={nextBillValue}
            colorClass="text-app-orange"
            bgClass="bg-app-orange/20"
            shadowClass="shadow-app-orange/30"
            delay={0.3}
          />
        </div>

        <motion.div
          className="glass rounded-2xl border border-border p-4 sm:p-6"
          {...SCROLL_FADE_UP}
        >
          <div className="flex items-center justify-between mb-6">
            <button
              type="button"
              onClick={goToPrevMonth}
              className="p-2 rounded-lg hover:bg-white/10 transition-colors text-muted-foreground hover:text-white"
              aria-label="Previous month"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold text-white">
                {formatMonthYear(viewYear, viewMonth)}
              </h2>
              {!isCurrentViewToday && (
                <button
                  type="button"
                  onClick={goToToday}
                  className="text-xs px-2.5 py-1 rounded-md bg-app-blue/15 text-app-blue hover:bg-app-blue/25 transition-colors font-medium"
                >
                  Today
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={goToNextMonth}
              className="p-2 rounded-lg hover:bg-white/10 transition-colors text-muted-foreground hover:text-white"
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
                      className="min-h-[60px] sm:min-h-[72px] rounded-xl bg-white/5 animate-pulse"
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
              </div>
            </>
          )}
        </motion.div>

        <AnimatePresence mode="wait">
          {selectedDay !== null && (
            <motion.div
              key={`detail-${selectedDay}`}
              initial={{ opacity: 0, y: 20, height: 0 }}
              animate={{ opacity: 1, y: 0, height: 'auto' }}
              exit={{ opacity: 0, y: -10, height: 0 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
              className="glass rounded-2xl border border-border p-6 overflow-hidden"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-semibold text-white">
                  Bills for {formatShortDate(viewYear, viewMonth, selectedDay)}
                </h3>
                {selectedDayBills.length > 0 && (
                  <span className="text-xs px-2.5 py-1 rounded-full bg-app-blue/15 text-app-blue font-medium">
                    {selectedDayBills.length} bill{selectedDayBills.length === 1 ? '' : 's'}
                  </span>
                )}
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
                    <span className="text-sm font-bold text-white">
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
