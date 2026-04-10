import { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  DollarSign,
  Hash,
  Clock,
  CheckCircle2,
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

/** Capitalize first letter */
function capitalize(str: string | null): string {
  if (!str) return 'Unknown'
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase()
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// Category -> color mapping for visual differentiation
const CATEGORY_COLORS: Record<string, string> = {
  'Bills & Utilities': rawColors.app.blue,
  'Entertainment': rawColors.app.purple,
  'Food & Dining': rawColors.app.orange,
  'Insurance': rawColors.app.teal,
  'Shopping': rawColors.app.pink,
  'Transportation': rawColors.app.yellow,
  'Health & Fitness': rawColors.app.green,
  'Education': rawColors.app.indigo,
}

function getCategoryColor(category: string): string {
  return CATEGORY_COLORS[category] ?? rawColors.app.blue
}

// ---------------------------------------------------------------------------
// Unified Bill type (supports both detected and manual subscriptions)
// ---------------------------------------------------------------------------

interface PlacedBill {
  key: string
  name: string
  amount: number
  category: string
  frequency: string | null
  type: string | null
  day: number
  source: 'detected' | 'confirmed'
}

// ---------------------------------------------------------------------------
// Bill Placement Logic (detected recurring transactions)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Build bill map from API data (uses is_confirmed from backend)
// ---------------------------------------------------------------------------

function buildBillMap(
  transactions: RecurringTransaction[],
  year: number,
  month: number,
): Map<number, PlacedBill[]> {
  const map = new Map<number, PlacedBill[]>()

  const addBill = (day: number, bill: PlacedBill) => {
    const existing = map.get(day) ?? []
    existing.push(bill)
    map.set(day, existing)
  }

  for (const tx of transactions) {
    const days = getBillDaysForMonth(tx, year, month)
    for (const day of days) {
      addBill(day, {
        key: `tx-${tx.id}-${day}`,
        name: tx.name,
        amount: Math.abs(tx.expected_amount),
        category: tx.category,
        frequency: tx.frequency,
        type: tx.type,
        day,
        source: tx.is_confirmed ? 'confirmed' : 'detected',
      })
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
    <motion.div {...fadeUpWithDelay(delay)} className="glass rounded-2xl border border-border p-6">
      <div className="flex items-center gap-3">
        <div className={`p-3 ${bgClass} rounded-xl ${shadowClass}`}>
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

/** Get the dot color for a bill based on source and category */
function getBillDotColor(bill: PlacedBill): string {
  if (bill.source === 'confirmed') return rawColors.app.green
  return getCategoryColor(bill.category)
}

/** Source badge for bill detail items */
function SourceBadge({ source }: Readonly<{ source: PlacedBill['source'] }>) {
  if (source === 'confirmed') {
    return (
      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-app-green/15 text-app-green">
        <CheckCircle2 className="w-2.5 h-2.5" />
        Confirmed
      </span>
    )
  }
  return null
}

/** Single bill item in the detail panel */
function BillDetailItem({ bill }: Readonly<{ bill: PlacedBill }>) {
  const color = getBillDotColor(bill)

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 10 }}
      className="flex items-center justify-between gap-3 p-3 rounded-lg bg-white/5 hover:bg-white/[0.04] transition-colors"
    >
      <div className="flex items-center gap-3 min-w-0">
        <div
          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: color }}
        />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-white truncate">{bill.name}</p>
            <SourceBadge source={bill.source} />
          </div>
          <p className="text-xs text-muted-foreground">
            {bill.category}
            {bill.frequency && (
              <span className="ml-2 text-text-tertiary">
                {capitalize(bill.frequency)}
              </span>
            )}
          </p>
        </div>
      </div>
      <p className={`text-sm font-semibold whitespace-nowrap ${bill.type === 'Income' ? 'text-app-green' : 'text-app-red'}`}>
        {bill.type === 'Income' ? '+' : '-'}{formatCurrency(bill.amount)}
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
    ? 'bg-app-blue/20 border border-app-blue/40'
    : 'hover:bg-white/8 border border-transparent'
  const todayBorderClass = isToday && !isSelected ? 'ring-2 ring-app-blue/50' : ''

  const dayNumberClass = (() => {
    if (isToday) return 'w-7 h-7 flex items-center justify-center rounded-full bg-app-blue text-white'
    if (isSelected) return 'text-app-blue'
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
              key={bill.key}
              className="w-1.5 h-1.5 rounded-full"
              style={{ backgroundColor: getBillDotColor(bill) }}
              title={bill.name}
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

  const now = useMemo(() => new Date(), [])
  const [viewYear, setViewYear] = useState(() => now.getFullYear())
  const [viewMonth, setViewMonth] = useState(() => now.getMonth())
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
    const transactions = recurringTransactions ?? []
    return buildBillMap(transactions, viewYear, viewMonth)
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

  const hasAnyData = recurringTransactions && recurringTransactions.length > 0

  // Summary calculations
  const summary = useMemo(() => {
    let totalDue = 0
    let billCount = 0

    // Tally up all bills in this month
    for (const [, bills] of billMap) {
      for (const bill of bills) {
        totalDue += bill.amount
        billCount++
      }
    }

    // Find the next upcoming bill (today or later)
    const nextBill = findNextUpcomingBill(billMap, viewYear, viewMonth, now)

    return { totalDue, billCount, nextBill }
  }, [billMap, viewYear, viewMonth, now])

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

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <SummaryCard
            icon={DollarSign}
            label="Total Due This Month"
            value={isLoading ? loadingPlaceholder : formatCurrency(summary.totalDue)}
            colorClass="text-app-red"
            bgClass="bg-app-red/20"
            shadowClass="shadow-app-red/30"
            delay={0.1}
          />
          <SummaryCard
            icon={Hash}
            label="Bills This Month"
            value={isLoading ? loadingPlaceholder : String(summary.billCount)}
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

        {/* Calendar */}
        <motion.div className="glass rounded-2xl border border-border p-4 sm:p-6" {...SCROLL_FADE_UP}>
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

              {/* Legend for bill sources */}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-4 pt-3 border-t border-white/5">
                <span className="text-xs text-text-tertiary">Legend:</span>
                <div className="flex items-center gap-1.5 text-xs text-text-secondary">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: rawColors.app.green }} />
                  <span>Confirmed</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-text-secondary">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: rawColors.app.blue }} />
                  <span>Detected</span>
                </div>
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
                  {/* Day total */}
                  <div className="flex items-center justify-between pt-3 mt-3 border-t border-white/10">
                    <span className="text-sm text-muted-foreground">Total for this day</span>
                    <span className="text-sm font-bold text-white">
                      {formatCurrency(
                        selectedDayBills.reduce(
                          (sum, b) => sum + b.amount,
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
