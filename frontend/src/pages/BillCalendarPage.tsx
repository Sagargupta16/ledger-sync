import { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  DollarSign,
  Hash,
  Clock,
} from 'lucide-react'
import { useRecurringTransactions } from '@/hooks/api/useAnalyticsV2'
import type { RecurringTransaction } from '@/hooks/api/useAnalyticsV2'
import { PageHeader } from '@/components/ui'
import { formatCurrency } from '@/lib/formatters'
import { rawColors } from '@/constants/colors'
import { SCROLL_FADE_UP, fadeUpWithDelay } from '@/constants/animations'
import EmptyState from '@/components/shared/EmptyState'

// ---------------------------------------------------------------------------
// Calendar Helpers
// ---------------------------------------------------------------------------

/** Get the number of days in a given month (0-indexed month) */
function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

/** Get the day of the week the 1st of the month falls on (0=Sun, 6=Sat) */
function getFirstDayOfWeek(year: number, month: number): number {
  return new Date(year, month, 1).getDay()
}

/** Format month name + year */
function formatMonthYear(year: number, month: number): string {
  return new Date(year, month, 1).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  })
}

/** Format a short date */
function formatShortDate(year: number, month: number, day: number): string {
  return new Date(year, month, day).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}

/** Check if two dates represent the same day */
function isSameDay(
  y1: number,
  m1: number,
  d1: number,
  y2: number,
  m2: number,
  d2: number,
): boolean {
  return y1 === y2 && m1 === m2 && d1 === d2
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// Category -> color mapping for visual differentiation
const CATEGORY_COLORS: Record<string, string> = {
  'Bills & Utilities': rawColors.ios.blue,
  'Entertainment': rawColors.ios.purple,
  'Food & Dining': rawColors.ios.orange,
  'Insurance': rawColors.ios.teal,
  'Shopping': rawColors.ios.pink,
  'Transportation': rawColors.ios.yellow,
  'Health & Fitness': rawColors.ios.green,
  'Education': rawColors.ios.indigo,
}

function getCategoryColor(category: string): string {
  return CATEGORY_COLORS[category] ?? rawColors.ios.blue
}

// ---------------------------------------------------------------------------
// Bill Placement Logic
// ---------------------------------------------------------------------------

interface PlacedBill {
  transaction: RecurringTransaction
  day: number
}

/** Clamp a day to the valid range for a given month */
function clampDay(d: number, daysInMonth: number): number {
  return Math.min(Math.max(d, 1), daysInMonth)
}

/**
 * Collect recurring days within a month by walking from a reference date
 * at a given interval (in days).
 */
function getRecurringDaysInMonth(
  nextExpected: string,
  year: number,
  month: number,
  daysInMonth: number,
  intervalDays: number,
): number[] {
  const nextDate = new Date(nextExpected)
  const days: number[] = []
  const monthStart = new Date(year, month, 1)
  const monthEnd = new Date(year, month, daysInMonth)
  const intervalMs = intervalDays * 24 * 60 * 60 * 1000

  let current = new Date(nextDate)
  while (current > monthStart) {
    current = new Date(current.getTime() - intervalMs)
  }
  while (current <= monthEnd) {
    if (current >= monthStart && current <= monthEnd) {
      days.push(current.getDate())
    }
    current = new Date(current.getTime() + intervalMs)
  }
  return days
}

function getWeeklyDays(tx: RecurringTransaction, year: number, month: number, daysInMonth: number): number[] {
  if (!tx.next_expected) return []
  return getRecurringDaysInMonth(tx.next_expected, year, month, daysInMonth, 7)
}

function getMonthlyDays(tx: RecurringTransaction, daysInMonth: number): number[] {
  if (tx.expected_day == null) return []
  return [clampDay(tx.expected_day, daysInMonth)]
}

function getQuarterlyDays(tx: RecurringTransaction, month: number, daysInMonth: number): number[] {
  if (tx.expected_day == null) return []
  if (!tx.next_expected) {
    if (month % 3 === 0) return [clampDay(tx.expected_day, daysInMonth)]
    return []
  }
  const nextDate = new Date(tx.next_expected)
  const nextMonth = nextDate.getMonth()
  const diff = ((month - nextMonth) % 12 + 12) % 12
  if (diff % 3 === 0) return [clampDay(tx.expected_day, daysInMonth)]
  return []
}

function getYearlyDays(tx: RecurringTransaction, month: number, daysInMonth: number): number[] {
  if (tx.expected_day == null || !tx.next_expected) return []
  const nextDate = new Date(tx.next_expected)
  if (nextDate.getMonth() === month) {
    return [clampDay(tx.expected_day, daysInMonth)]
  }
  return []
}

function getFortnightlyDays(tx: RecurringTransaction, year: number, month: number, daysInMonth: number): number[] {
  if (!tx.next_expected) return []
  return getRecurringDaysInMonth(tx.next_expected, year, month, daysInMonth, 14)
}

/**
 * Determine which days in a given month a recurring transaction falls on.
 * Returns an array of day numbers (1-based).
 */
function getBillDaysForMonth(
  tx: RecurringTransaction,
  year: number,
  month: number,
): number[] {
  const frequency = tx.frequency?.toLowerCase() ?? 'monthly'
  const daysInMonth = getDaysInMonth(year, month)

  if (frequency === 'weekly') return getWeeklyDays(tx, year, month, daysInMonth)
  if (frequency === 'monthly') return getMonthlyDays(tx, daysInMonth)
  if (frequency === 'quarterly') return getQuarterlyDays(tx, month, daysInMonth)
  if (frequency === 'yearly' || frequency === 'annually') return getYearlyDays(tx, month, daysInMonth)
  if (frequency === 'fortnightly' || frequency === 'biweekly') return getFortnightlyDays(tx, year, month, daysInMonth)

  // Default: treat as monthly
  if (tx.expected_day != null) return [clampDay(tx.expected_day, daysInMonth)]
  return []
}

/**
 * Build a map from day number -> list of bills for that day
 */
function buildBillMap(
  transactions: RecurringTransaction[],
  year: number,
  month: number,
): Map<number, PlacedBill[]> {
  const map = new Map<number, PlacedBill[]>()

  for (const tx of transactions) {
    const days = getBillDaysForMonth(tx, year, month)
    for (const day of days) {
      const existing = map.get(day) ?? []
      existing.push({ transaction: tx, day })
      map.set(day, existing)
    }
  }

  return map
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Summary stat card */
function SummaryCard({
  icon: Icon,
  label,
  value,
  colorClass,
  bgClass,
  shadowClass,
  delay,
}: Readonly<{
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  colorClass: string
  bgClass: string
  shadowClass: string
  delay: number
}>) {
  return (
    <motion.div {...fadeUpWithDelay(delay)} className="glass rounded-xl border border-border p-5 shadow-lg">
      <div className="flex items-center gap-3">
        <div className={`p-3 ${bgClass} rounded-xl shadow-lg ${shadowClass}`}>
          <Icon className={`w-5 h-5 ${colorClass}`} />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-lg font-bold text-white truncate">{value}</p>
        </div>
      </div>
    </motion.div>
  )
}

/** Single bill item in the detail panel */
function BillDetailItem({ bill }: Readonly<{ bill: PlacedBill }>) {
  const tx = bill.transaction
  const color = getCategoryColor(tx.category)

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 10 }}
      className="flex items-center justify-between gap-3 p-3 rounded-lg bg-white/5 hover:bg-white/8 transition-colors"
    >
      <div className="flex items-center gap-3 min-w-0">
        <div
          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: color }}
        />
        <div className="min-w-0">
          <p className="text-sm font-medium text-white truncate">{tx.name}</p>
          <p className="text-xs text-muted-foreground">
            {tx.category}
            {tx.frequency && (
              <span className="ml-2 text-text-tertiary">
                {tx.frequency.charAt(0).toUpperCase() + tx.frequency.slice(1).toLowerCase()}
              </span>
            )}
          </p>
        </div>
      </div>
      <p className="text-sm font-semibold text-ios-red whitespace-nowrap">
        {formatCurrency(Math.abs(tx.expected_amount))}
      </p>
    </motion.div>
  )
}

/** Calendar day cell */
function DayCell({
  day,
  isToday,
  isSelected,
  isCurrentMonth,
  bills,
  onClick,
}: Readonly<{
  day: number
  isToday: boolean
  isSelected: boolean
  isCurrentMonth: boolean
  bills: PlacedBill[]
  onClick: () => void
}>) {
  const hasBills = bills.length > 0
  const maxDotsShown = 3

  const opacityClass = isCurrentMonth ? '' : 'opacity-30'
  const selectionClass = isSelected
    ? 'bg-ios-blue/20 border border-ios-blue/40'
    : 'hover:bg-white/8 border border-transparent'
  const todayBorderClass = isToday && !isSelected ? 'border border-ios-blue/30' : ''

  const dayNumberClass = (() => {
    if (isToday) return 'w-7 h-7 flex items-center justify-center rounded-full bg-ios-blue text-white'
    if (isSelected) return 'text-ios-blue'
    if (isCurrentMonth) return 'text-white'
    return 'text-text-quaternary'
  })()

  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        relative flex flex-col items-center justify-start p-1.5 sm:p-2 rounded-xl min-h-[60px] sm:min-h-[72px]
        transition-all duration-200 cursor-pointer group
        ${opacityClass}
        ${selectionClass}
        ${todayBorderClass}
      `}
    >
      {/* Day number */}
      <span
        className={`
          text-sm font-medium leading-none
          ${dayNumberClass}
        `}
      >
        {day}
      </span>

      {/* Bill dots */}
      {hasBills && (
        <div className="flex items-center gap-0.5 mt-1.5 flex-wrap justify-center">
          {bills.slice(0, maxDotsShown).map((bill) => (
            <div
              key={`${bill.transaction.id}-dot`}
              className="w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: getCategoryColor(bill.transaction.category) }}
              title={bill.transaction.name}
            />
          ))}
          {bills.length > maxDotsShown && (
            <span className="text-[9px] text-muted-foreground ml-0.5">
              +{bills.length - maxDotsShown}
            </span>
          )}
        </div>
      )}
    </button>
  )
}

/** Find the first bill from a given start day through end of month */
function findFirstBillFromDay(
  billMap: Map<number, PlacedBill[]>,
  startDay: number,
  daysInMonth: number,
): PlacedBill | null {
  for (let d = startDay; d <= daysInMonth; d++) {
    const dayBills = billMap.get(d)
    if (dayBills && dayBills.length > 0) {
      return dayBills[0]
    }
  }
  return null
}

/** Find the next upcoming bill in the viewed month relative to today */
function findNextUpcomingBill(
  billMap: Map<number, PlacedBill[]>,
  viewYear: number,
  viewMonth: number,
  now: Date,
): PlacedBill | null {
  const todayDate = now.getDate()
  const todayMonth = now.getMonth()
  const todayYear = now.getFullYear()
  const daysInMonth = getDaysInMonth(viewYear, viewMonth)

  if (viewYear === todayYear && viewMonth === todayMonth) {
    return findFirstBillFromDay(billMap, todayDate, daysInMonth)
  }

  const isFutureMonth = viewYear > todayYear || (viewYear === todayYear && viewMonth > todayMonth)
  if (isFutureMonth) {
    return findFirstBillFromDay(billMap, 1, daysInMonth)
  }

  return null
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function BillCalendarPage() {
  const { data: recurringTransactions, isLoading } = useRecurringTransactions({ active_only: true })

  const now = new Date()
  const [viewYear, setViewYear] = useState(now.getFullYear())
  const [viewMonth, setViewMonth] = useState(now.getMonth())
  const [selectedDay, setSelectedDay] = useState<number | null>(null)

  const goToPrevMonth = () => {
    setSelectedDay(null)
    if (viewMonth === 0) {
      setViewMonth(11)
      setViewYear((y) => y - 1)
    } else {
      setViewMonth((m) => m - 1)
    }
  }

  const goToNextMonth = () => {
    setSelectedDay(null)
    if (viewMonth === 11) {
      setViewMonth(0)
      setViewYear((y) => y + 1)
    } else {
      setViewMonth((m) => m + 1)
    }
  }

  const goToToday = () => {
    setSelectedDay(null)
    setViewYear(now.getFullYear())
    setViewMonth(now.getMonth())
  }

  // Build the bill map for the current month view
  const billMap = useMemo(() => {
    if (!recurringTransactions) return new Map<number, PlacedBill[]>()
    return buildBillMap(recurringTransactions, viewYear, viewMonth)
  }, [recurringTransactions, viewYear, viewMonth])

  // Build the calendar grid: days from prev month, current month, next month
  const calendarGrid = useMemo(() => {
    const daysInMonth = getDaysInMonth(viewYear, viewMonth)
    const firstDayOfWeek = getFirstDayOfWeek(viewYear, viewMonth)

    // Previous month fill
    const prevMonth = viewMonth === 0 ? 11 : viewMonth - 1
    const prevYear = viewMonth === 0 ? viewYear - 1 : viewYear
    const daysInPrevMonth = getDaysInMonth(prevYear, prevMonth)

    const cells: Array<{
      day: number
      month: number
      year: number
      isCurrentMonth: boolean
    }> = []

    // Leading days from previous month
    for (let i = firstDayOfWeek - 1; i >= 0; i--) {
      cells.push({
        day: daysInPrevMonth - i,
        month: prevMonth,
        year: prevYear,
        isCurrentMonth: false,
      })
    }

    // Current month days
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({
        day: d,
        month: viewMonth,
        year: viewYear,
        isCurrentMonth: true,
      })
    }

    // Trailing days from next month
    const nextMonth = viewMonth === 11 ? 0 : viewMonth + 1
    const nextYear = viewMonth === 11 ? viewYear + 1 : viewYear
    const totalCells = Math.ceil(cells.length / 7) * 7
    let nextDay = 1
    while (cells.length < totalCells) {
      cells.push({
        day: nextDay++,
        month: nextMonth,
        year: nextYear,
        isCurrentMonth: false,
      })
    }

    return cells
  }, [viewYear, viewMonth])

  // Summary calculations
  const summary = useMemo(() => {
    if (!recurringTransactions || recurringTransactions.length === 0) {
      return { totalDue: 0, billCount: 0, nextBill: null as PlacedBill | null }
    }

    let totalDue = 0
    let billCount = 0

    // Tally up all bills in this month
    for (const [, bills] of billMap) {
      for (const bill of bills) {
        totalDue += Math.abs(bill.transaction.expected_amount)
        billCount++
      }
    }

    // Find the next upcoming bill (today or later)
    const nextBill = findNextUpcomingBill(billMap, viewYear, viewMonth, now)

    return { totalDue, billCount, nextBill }
  }, [recurringTransactions, billMap, viewYear, viewMonth, now])

  // Bills for the selected day
  const selectedDayBills = useMemo(() => {
    if (selectedDay === null) return []
    return billMap.get(selectedDay) ?? []
  }, [billMap, selectedDay])

  const loadingPlaceholder = '...'

  const isCurrentViewToday = viewYear === now.getFullYear() && viewMonth === now.getMonth()

  const nextBillValue = (() => {
    if (isLoading) return loadingPlaceholder
    if (summary.nextBill) {
      return `${summary.nextBill.transaction.name} - ${formatCurrency(Math.abs(summary.nextBill.transaction.expected_amount))}`
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

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <SummaryCard
            icon={DollarSign}
            label="Total Due This Month"
            value={isLoading ? loadingPlaceholder : formatCurrency(summary.totalDue)}
            colorClass="text-ios-red"
            bgClass="bg-ios-red/20"
            shadowClass="shadow-ios-red/30"
            delay={0.1}
          />
          <SummaryCard
            icon={Hash}
            label="Bills This Month"
            value={isLoading ? loadingPlaceholder : String(summary.billCount)}
            colorClass="text-ios-blue"
            bgClass="bg-ios-blue/20"
            shadowClass="shadow-ios-blue/30"
            delay={0.2}
          />
          <SummaryCard
            icon={Clock}
            label="Next Upcoming Bill"
            value={nextBillValue}
            colorClass="text-ios-orange"
            bgClass="bg-ios-orange/20"
            shadowClass="shadow-ios-orange/30"
            delay={0.3}
          />
        </div>

        {/* Calendar */}
        <motion.div className="glass rounded-xl border border-border p-4 sm:p-6" {...SCROLL_FADE_UP}>
          {/* Month Navigation */}
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
                  className="text-xs px-2.5 py-1 rounded-md bg-ios-blue/15 text-ios-blue hover:bg-ios-blue/25 transition-colors font-medium"
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
            // Skeleton loader for calendar
            <div className="space-y-2">
              <div className="grid grid-cols-7 gap-1">
                {DAY_NAMES.map((name) => (
                  <div key={name} className="text-center text-xs font-medium text-muted-foreground py-2">
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
          {!isLoading && (!recurringTransactions || recurringTransactions.length === 0) && (
            <EmptyState
              icon={CalendarDays}
              title="No recurring transactions found"
              description="Once recurring payment patterns are detected from your transactions, they will appear on the calendar."
              variant="card"
            />
          )}
          {!isLoading && recurringTransactions && recurringTransactions.length > 0 && (
            <>
              {/* Day name headers */}
              <div className="grid grid-cols-7 gap-1 mb-1">
                {DAY_NAMES.map((name) => (
                  <div key={name} className="text-center text-xs font-medium text-muted-foreground py-2">
                    {name}
                  </div>
                ))}
              </div>

              {/* Calendar grid */}
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
            </>
          )}
        </motion.div>

        {/* Selected Day Detail Panel */}
        <AnimatePresence mode="wait">
          {selectedDay !== null && (
            <motion.div
              key={`detail-${selectedDay}`}
              initial={{ opacity: 0, y: 20, height: 0 }}
              animate={{ opacity: 1, y: 0, height: 'auto' }}
              exit={{ opacity: 0, y: -10, height: 0 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
              className="glass rounded-xl border border-border p-5 overflow-hidden"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-semibold text-white">
                  Bills for {formatShortDate(viewYear, viewMonth, selectedDay)}
                </h3>
                {selectedDayBills.length > 0 && (
                  <span className="text-xs px-2.5 py-1 rounded-full bg-ios-blue/15 text-ios-blue font-medium">
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
                    <BillDetailItem key={bill.transaction.id} bill={bill} />
                  ))}
                  {/* Day total */}
                  <div className="flex items-center justify-between pt-3 mt-3 border-t border-white/10">
                    <span className="text-sm text-muted-foreground">Total for this day</span>
                    <span className="text-sm font-bold text-white">
                      {formatCurrency(
                        selectedDayBills.reduce(
                          (sum, b) => sum + Math.abs(b.transaction.expected_amount),
                          0,
                        ),
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
