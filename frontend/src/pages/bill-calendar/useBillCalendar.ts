import { useMemo, useState } from 'react'
import { RECURRING_COMMITMENTS_PARAMS } from '@/hooks/api/recurringCommitmentsParams'
import { useRecurringTransactions } from '@/hooks/api/useAnalyticsV2'
import { useCardCycles } from '@/hooks/api/useCardCycles'
import { getTodayKey, MS_PER_DAY } from '@/lib/dateUtils'
import { isAcceptedRecurringCommitment } from '@/lib/recurringCalculations'
import { buildBillMap, findNextUpcomingBill, getBillDaysForMonth, getDaysInMonth, getFirstDayOfWeek } from './billUtils'
import { appendBills, buildCardBillMap } from './cardBills'
import { buildAdvanceTaxMap } from './taxBills'
import type { PlacedBill } from './types'

interface CalendarCell {
  day: number
  month: number
  year: number
  isCurrentMonth: boolean
}

export function useBillCalendar() {
  // A bill calendar plots things that are owed on a date. Habit rows repeat but
  // are not owed, so plotting them filled the grid with lunch purchases.
  const recurringQuery = useRecurringTransactions(RECURRING_COMMITMENTS_PARAMS)
  const { data: recurringTransactions, isError } = recurringQuery
  // Card due dates are their own source. A failed card read leaves the
  // recurring bills on screen; the Card statements panel reports that error.
  const cardQuery = useCardCycles()
  const cards = cardQuery.data?.cards
  const asOfDateKey = getTodayKey()
  const acceptedBills = useMemo(
    () => (recurringTransactions ?? []).filter(
      (item) => item.type === 'Expense' && isAcceptedRecurringCommitment(item, asOfDateKey),
    ),
    [recurringTransactions, asOfDateKey],
  )
  // Recurring bills paint as soon as they load and card dots join when ready.
  // Only a calendar with no bill yet waits for cards, so it never flashes empty.
  const isLoading = recurringQuery.isLoading || (cardQuery.isLoading && acceptedBills.length === 0)

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
    // Read a fresh date at click time -- `now` is captured at mount and would
    // be stale if the tab has been open across a day boundary.
    const today = new Date()
    setSelectedDay(null)
    setViewYear(today.getFullYear())
    setViewMonth(today.getMonth())
  }

  const billMap = useMemo(
    () => appendBills(
      appendBills(
        buildBillMap(acceptedBills, viewYear, viewMonth, asOfDateKey),
        buildCardBillMap(cards ?? [], viewYear, viewMonth),
      ),
      buildAdvanceTaxMap(viewYear, viewMonth),
    ),
    [acceptedBills, cards, viewYear, viewMonth, asOfDateKey],
  )
  const unscheduledBills = useMemo(
    () => acceptedBills.filter((item) => !Array.from({ length: 12 }, (_, month) => month)
      .some((month) => getBillDaysForMonth(item, viewYear, month).length > 0)),
    [acceptedBills, viewYear],
  )

  const calendarGrid = useMemo<CalendarCell[]>(() => {
    const daysInMonth = getDaysInMonth(viewYear, viewMonth)
    const firstDayOfWeek = getFirstDayOfWeek(viewYear, viewMonth)

    const prevMonth = viewMonth === 0 ? 11 : viewMonth - 1
    const prevYear = viewMonth === 0 ? viewYear - 1 : viewYear
    const daysInPrevMonth = getDaysInMonth(prevYear, prevMonth)

    const cells: CalendarCell[] = []

    for (let i = firstDayOfWeek - 1; i >= 0; i--) {
      cells.push({
        day: daysInPrevMonth - i,
        month: prevMonth,
        year: prevYear,
        isCurrentMonth: false,
      })
    }

    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ day: d, month: viewMonth, year: viewYear, isCurrentMonth: true })
    }

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

  const summary = useMemo(() => {
    let totalDue = 0
    let billCount = 0
    let maxRecurring = 0
    let maxCard = 0
    for (const [, bills] of billMap) {
      for (const bill of bills) {
        if (bill.source === 'card') maxCard = Math.max(maxCard, bill.amount)
        else maxRecurring = Math.max(maxRecurring, bill.amount)
        // Paid statements and open-cycle spend are markers, not money owed.
        if (bill.informational) continue
        totalDue += bill.amount
        billCount++
      }
    }
    // Card statements dwarf most bills, so they do not set the dot scale: a card
    // larger than every recurring bill draws at the largest size. In a month with
    // no recurring bill, card entries scale among themselves.
    const maxBillAmount = maxRecurring > 0 ? maxRecurring : maxCard
    const nextBill = findNextUpcomingBill(billMap, viewYear, viewMonth, now)

    // Whole-day countdown to the next bill, measured at local midnight so
    // partial days don't skew "in N days". Null when nothing is upcoming.
    let nextBillDaysUntil: number | null = null
    if (nextBill) {
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      const due = new Date(viewYear, viewMonth, nextBill.day)
      nextBillDaysUntil = Math.round((due.getTime() - today.getTime()) / MS_PER_DAY)
    }

    return { totalDue, billCount, nextBill, nextBillDaysUntil, maxBillAmount }
  }, [billMap, viewYear, viewMonth, now])

  const selectedDayBills = useMemo<PlacedBill[]>(() => {
    if (selectedDay === null) return []
    return billMap.get(selectedDay) ?? []
  }, [billMap, selectedDay])

  const hasAnyData = acceptedBills.length > 0 || (cards?.length ?? 0) > 0
  const isCurrentViewToday = viewYear === now.getFullYear() && viewMonth === now.getMonth()
  const retry = () => {
    void recurringQuery.refetch()
  }

  return {
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
    isError,
    retry,
    hasAnyData,
    unscheduledBills,
    isCurrentViewToday,
  }
}
