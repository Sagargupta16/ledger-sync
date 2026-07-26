import { useState, useMemo } from 'react'
import { useTransactions } from '@/hooks/api/useTransactions'
import { usePreferences } from '@/hooks/api/usePreferences'
import {
  daysInMonth,
  getCurrentYear,
  getCurrentFY,
  getFYDateRange,
  getDateKey,
  getAvailableFYs,
  inclusiveDaySpan,
  toLocalDateKey,
} from '@/lib/dateUtils'
import type { CompareMode, PartialPeriod, PeriodSummary, CategoryDelta } from './types'
import { pctChange, getMonthOptions, getYearOptions, formatMonthLabel } from './utils'
import { alignToElapsed, type DateSpan } from './periodAlign'
import { generateAllInsights } from './insights'

export function useComparisonData() {
  const transactionsQuery = useTransactions()
  const preferencesQuery = usePreferences()
  const transactions = useMemo(
    () => transactionsQuery.data ?? [],
    [transactionsQuery.data],
  )
  const preferences = preferencesQuery.data
  const isLoading = transactionsQuery.isLoading || preferencesQuery.isLoading
  const isError = transactionsQuery.isError || preferencesQuery.isError
  const retry = () => {
    void transactionsQuery.refetch()
    void preferencesQuery.refetch()
  }
  const fiscalYearStartMonth = preferences?.fiscal_year_start_month || 4

  // Mode & selection state.
  // Default to fiscal-year comparison rather than month-over-month because
  // month-over-month is noisy (one-off rent/bonus/travel dominates) while FY
  // is the cadence that actually drives tax + saving-rate decisions.
  const [mode, setMode] = useState<CompareMode>('fy')

  // Month selectors
  const monthOptions = useMemo(() => getMonthOptions(transactions), [transactions])
  const currentMonthKey = useMemo(() => toLocalDateKey(new Date()).slice(0, 7), [])
  const defaultMonths = useMemo(() => {
    const complete = monthOptions.filter((m) => m < currentMonthKey)
    return { a: complete[1] || monthOptions[1] || '', b: complete[0] || monthOptions[0] || '' }
  }, [monthOptions, currentMonthKey])
  const [monthA, setMonthA] = useState('')
  const [monthB, setMonthB] = useState('')
  const effectiveMonthA = monthA || defaultMonths.a
  const effectiveMonthB = monthB || defaultMonths.b

  // Year selectors
  const yearOptions = useMemo(() => getYearOptions(transactions), [transactions])
  const [yearA, setYearA] = useState(() => getCurrentYear() - 1)
  const [yearB, setYearB] = useState(() => getCurrentYear())

  // FY selectors
  const fyOptions = useMemo(
    () => getAvailableFYs(transactions, fiscalYearStartMonth),
    [transactions, fiscalYearStartMonth],
  )
  const [fyA, setFyA] = useState(() => {
    const curr = getCurrentFY(fiscalYearStartMonth)
    const idx = fyOptions.indexOf(curr)
    return fyOptions[idx + 1] || fyOptions.at(-1) || curr
  })
  const [fyB, setFyB] = useState(() => getCurrentFY(fiscalYearStartMonth))

  // Build period summaries
  const buildSummary = useMemo(() => {
    return (
      label: string,
      startDate: string,
      endDate: string,
      isPartial: boolean,
    ): PeriodSummary => {
      const cats: Record<string, { income: number; expense: number }> = {}
      let income = 0
      let expense = 0
      let count = 0

      for (const tx of transactions) {
        const d = getDateKey(tx.date)
        if (d < startDate || d > endDate) continue
        count++
        const cat = tx.category || 'Uncategorized'
        if (!cats[cat]) cats[cat] = { income: 0, expense: 0 }
        if (tx.type === 'Income') {
          income += Math.abs(tx.amount)
          cats[cat].income += Math.abs(tx.amount)
        } else if (tx.type === 'Expense') {
          expense += Math.abs(tx.amount)
          cats[cat].expense += Math.abs(tx.amount)
        }
      }

      const savings = income - expense
      // Inclusive day span of the period, from the explicit date parts (local
      // midnight) so daily averages divide by the real length -- not a
      // hardcoded 30 that is ~12x wrong for year/FY comparisons.
      const days = inclusiveDaySpan(startDate, endDate)
      return {
        label,
        income,
        expense,
        savings,
        savingsRate: income > 0 ? (savings / income) * 100 : 0,
        transactions: count,
        days,
        isPartial,
        categories: cats,
      }
    }
  }, [transactions])

  /**
   * Raw calendar spans for the selected pair, before any partial-period
   * alignment. Month end days come from the calendar (not a hardcoded 31) and FY
   * spans honour the user's fiscal-year start month.
   */
  const rawSpans = useMemo((): { a: DateSpan; b: DateSpan; labelA: string; labelB: string } => {
    if (mode === 'month') {
      const monthSpan = (key: string): DateSpan => ({
        start: `${key}-01`,
        end: `${key}-${String(daysInMonth(key)).padStart(2, '0')}`,
      })
      return {
        a: monthSpan(effectiveMonthA),
        b: monthSpan(effectiveMonthB),
        labelA: formatMonthLabel(effectiveMonthA),
        labelB: formatMonthLabel(effectiveMonthB),
      }
    }
    if (mode === 'year') {
      return {
        a: { start: `${yearA}-01-01`, end: `${yearA}-12-31` },
        b: { start: `${yearB}-01-01`, end: `${yearB}-12-31` },
        labelA: String(yearA),
        labelB: String(yearB),
      }
    }
    return {
      a: getFYDateRange(fyA, fiscalYearStartMonth),
      b: getFYDateRange(fyB, fiscalYearStartMonth),
      labelA: fyA,
      labelB: fyB,
    }
  }, [mode, effectiveMonthA, effectiveMonthB, yearA, yearB, fyA, fyB, fiscalYearStartMonth])

  /**
   * When period B is still running, BOTH spans are cut to the same elapsed-day
   * count. A month, a calendar year and an FY all suffer the same distortion
   * otherwise: 26 days of July against all 31 of June reads as a spending win,
   * and two months into an FY against a full prior FY reads as an 83% income
   * collapse. This applies to every mode, not just FY.
   */
  const aligned = useMemo(() => alignToElapsed(rawSpans.a, rawSpans.b), [rawSpans])

  const partialPeriod = useMemo((): PartialPeriod | null => {
    if (!aligned.partial) return null
    return {
      label: rawSpans.labelB,
      daysElapsed: aligned.partial.daysElapsed,
      daysTotal: aligned.partial.daysTotal,
    }
  }, [aligned, rawSpans.labelB])

  const [periodA, periodB] = useMemo((): [PeriodSummary, PeriodSummary] => {
    if (transactions.length === 0) {
      const empty: PeriodSummary = {
        label: '-', income: 0, expense: 0, savings: 0,
        savingsRate: 0, transactions: 0, days: 1, isPartial: false, categories: {},
      }
      return [empty, empty]
    }

    const isPartial = aligned.partial !== null
    const labelA = isPartial ? `${rawSpans.labelA} (to same day)` : rawSpans.labelA
    const labelB = isPartial ? `${rawSpans.labelB} (to date)` : rawSpans.labelB
    return [
      buildSummary(labelA, aligned.a.start, aligned.a.end, isPartial),
      buildSummary(labelB, aligned.b.start, aligned.b.end, isPartial),
    ]
  }, [transactions, buildSummary, aligned, rawSpans.labelA, rawSpans.labelB])

  // Category deltas
  const categoryDeltas = useMemo((): CategoryDelta[] => {
    const allCats = new Set([...Object.keys(periodA.categories), ...Object.keys(periodB.categories)])
    const deltas: CategoryDelta[] = []

    for (const cat of allCats) {
      const a = periodA.categories[cat] || { income: 0, expense: 0 }
      const b = periodB.categories[cat] || { income: 0, expense: 0 }

      if (a.expense > 0 || b.expense > 0) {
        deltas.push({
          category: cat, periodA: a.expense, periodB: b.expense,
          change: pctChange(b.expense, a.expense), changeAbs: b.expense - a.expense, type: 'expense',
        })
      }
      if (a.income > 0 || b.income > 0) {
        deltas.push({
          category: cat, periodA: a.income, periodB: b.income,
          change: pctChange(b.income, a.income), changeAbs: b.income - a.income, type: 'income',
        })
      }
    }

    return deltas.sort((x, y) => Math.max(y.periodA, y.periodB) - Math.max(x.periodA, x.periodB))
  }, [periodA, periodB])

  const expenseDeltas = categoryDeltas.filter((d) => d.type === 'expense')
  const incomeDeltas = categoryDeltas.filter((d) => d.type === 'income')

  // Spending distribution data
  const distributionA = useMemo(() => {
    return Object.entries(periodA.categories)
      .map(([cat, data]) => ({ name: cat, value: data.expense }))
      .filter((d) => d.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 8)
  }, [periodA])

  const distributionB = useMemo(() => {
    return Object.entries(periodB.categories)
      .map(([cat, data]) => ({ name: cat, value: data.expense }))
      .filter((d) => d.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 8)
  }, [periodB])

  // Auto-generated insights
  const insights = useMemo(
    () => generateAllInsights(periodA, periodB, expenseDeltas),
    [periodA, periodB, expenseDeltas],
  )

  return {
    isLoading,
    isError,
    retry,
    transactions,
    mode, setMode,
    monthOptions, yearOptions, fyOptions,
    effectiveMonthA, effectiveMonthB,
    yearA, yearB,
    fyA, fyB,
    setMonthA, setMonthB,
    setYearA, setYearB,
    setFyA, setFyB,
    periodA, periodB, partialPeriod,
    expenseDeltas, incomeDeltas,
    distributionA, distributionB,
    insights,
  }
}
