import { useMemo, useState } from 'react'
import { useRecurringTransactions } from '@/hooks/api/useAnalyticsV2'
import { buildBillMap, findNextUpcomingBill, getDaysInMonth, getFirstDayOfWeek } from './billUtils'
import type { PlacedBill } from './types'

interface CalendarCell {
  day: number
  month: number
  year: number
  isCurrentMonth: boolean
}

export function useBillCalendar() {
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

  const billMap = useMemo(
    () => buildBillMap(recurringTransactions ?? [], viewYear, viewMonth),
    [recurringTransactions, viewYear, viewMonth],
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
    for (const [, bills] of billMap) {
      for (const bill of bills) {
        totalDue += bill.amount
        billCount++
      }
    }
    const nextBill = findNextUpcomingBill(billMap, viewYear, viewMonth, now)
    return { totalDue, billCount, nextBill }
  }, [billMap, viewYear, viewMonth, now])

  const selectedDayBills = useMemo<PlacedBill[]>(() => {
    if (selectedDay === null) return []
    return billMap.get(selectedDay) ?? []
  }, [billMap, selectedDay])

  const hasAnyData = Boolean(recurringTransactions && recurringTransactions.length > 0)
  const isCurrentViewToday = viewYear === now.getFullYear() && viewMonth === now.getMonth()

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
    hasAnyData,
    isCurrentViewToday,
  }
}
