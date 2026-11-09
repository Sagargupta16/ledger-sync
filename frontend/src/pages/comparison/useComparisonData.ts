import { useState, useMemo } from 'react'
import { useTransactions } from '@/hooks/api/useTransactions'
import { usePreferences } from '@/hooks/api/usePreferences'
import {
  daysInMonth,
  formatMonthKey,
  getCurrentMonth,
  getCurrentYear,
  getCurrentFY,
  getFYDateRange,
  getDateKey,
  getAvailableFYs,
  inclusiveDaySpan,
} from '@/lib/dateUtils'
import { capitalLossConfig, isCapitalLoss } from '@/lib/expenseClassification'
import { savingsRatePercentFromNet } from '@/lib/savingsRate'
import type { CompareMode, PartialPeriod, PeriodSummary, CategoryDelta } from './types'
import { blockingError, refreshFailed, retryFailed } from '@/lib/queryStatus'
import { pctChange, getMonthOptions, getYearOptions } from './utils'
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
  // The user's classified realised-loss keys -- the set `/totals` reads.
  const lossCategories = preferences?.capital_loss_categories
  const lossConfig = useMemo(() => capitalLossConfig(lossCategories), [lossCategories])
  const statusReads = [transactionsQuery, preferencesQuery]
  // Only a read with nothing to show blocks the page; one that failed but kept
  // its data raises `refreshFailed`. Loading and error are exclusive.
  const isError = blockingError(statusReads)
  const isLoading = !isError && (transactionsQuery.isLoading || preferencesQuery.isLoading)
  const retry = () => {
    void retryFailed(statusReads)
  }
  const fiscalYearStartMonth = preferences?.fiscal_year_start_month || 4

  // Mode & selection state.
  // Default to fiscal-year comparison rather than month-over-month because
  // month-over-month is noisy (one-off rent/bonus/travel dominates) while FY
  // is the cadence that actually drives tax + saving-rate decisions.
  const [mode, setMode] = useState<CompareMode>('fy')

  // Month selectors
  const monthOptions = useMemo(() => getMonthOptions(transactions), [transactions])
  const currentMonthKey = useMemo(() => getCurrentMonth(), [])
  const defaultMonths = useMemo(() => {
    const complete = monthOptions.filter((m) => m < currentMonthKey)
    const b = complete[0] || monthOptions[0] || ''
    return { a: complete[1] || monthOptions[1] || b, b }
  }, [monthOptions, currentMonthKey])
  const [monthA, setMonthA] = useState('')
  const [monthB, setMonthB] = useState('')
  const effectiveMonthA = monthA || defaultMonths.a
  const effectiveMonthB = monthB || defaultMonths.b

  // Year selectors
  const yearOptions = useMemo(() => getYearOptions(transactions), [transactions])
  // Keep null until the user picks, and derive the default from the LOADED
  // options so the select always shows the year that is compared.
  const defaultYears = useMemo(() => {
    const curr = getCurrentYear()
    const b = yearOptions.includes(curr) ? curr : (yearOptions[0] ?? curr)
    const a = yearOptions[yearOptions.indexOf(b) + 1] ?? yearOptions.at(-1) ?? b - 1
    return { a, b }
  }, [yearOptions])
  const [yearAChoice, setYearA] = useState<number | null>(null)
  const [yearBChoice, setYearB] = useState<number | null>(null)
  const yearA = yearAChoice ?? defaultYears.a
  const yearB = yearBChoice ?? defaultYears.b

  // FY selectors
  const fyOptions = useMemo(
    () => getAvailableFYs(transactions, fiscalYearStartMonth),
    [transactions, fiscalYearStartMonth],
  )
  // Keep '' until the user picks, and derive the default from the LOADED
  // options (as the month selectors do). A useState initialiser runs on the
  // first render, before the ledger and the fiscal-year preference arrive, so
  // both sides froze on the current FY with an April start and every delta read 0.
  const defaultFYs = useMemo(() => {
    const curr = getCurrentFY(fiscalYearStartMonth)
    const idx = fyOptions.indexOf(curr)
    const b = idx === -1 ? fyOptions[0] || curr : curr
    const a = idx === -1 ? fyOptions[1] || fyOptions.at(-1) || curr : fyOptions[idx + 1] || fyOptions.at(-1) || curr
    return { a, b }
  }, [fyOptions, fiscalYearStartMonth])
  const [fyAChoice, setFyAChoice] = useState('')
  const [fyBChoice, setFyBChoice] = useState('')
  // A pick made under a different fiscal-year start is not a valid label now.
  const fyA = fyOptions.includes(fyAChoice) ? fyAChoice : defaultFYs.a
  const fyB = fyOptions.includes(fyBChoice) ? fyBChoice : defaultFYs.b

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
      let capitalLosses = 0
      let count = 0

      for (const tx of transactions) {
        const d = getDateKey(tx.date)
        if (d < startDate || d > endDate) continue
        count++
        const cat = tx.category || 'Uncategorized'
        if (tx.type === 'Income') {
          if (!cats[cat]) cats[cat] = { income: 0, expense: 0 }
          income += Math.abs(tx.amount)
          cats[cat].income += Math.abs(tx.amount)
        } else if (tx.type === 'Expense' && isCapitalLoss(tx, lossConfig)) {
          // A CLASSIFIED realised loss is not consumption, so it stays out of
          // the period expense total and the category deltas -- but the cash
          // left, so savings still subtract it below (the `/totals` rule).
          capitalLosses += Math.abs(tx.amount)
        } else if (tx.type === 'Expense') {
          if (!cats[cat]) cats[cat] = { income: 0, expense: 0 }
          expense += Math.abs(tx.amount)
          cats[cat].expense += Math.abs(tx.amount)
        }
      }

      // Savings = income - spending - classified losses; rate = savings / income.
      const savings = income - expense - capitalLosses
      // Inclusive day span of the period, from the explicit date parts (local
      // midnight) so daily averages divide by the real length -- not a
      // hardcoded 30 that is ~12x wrong for year/FY comparisons.
      const days = inclusiveDaySpan(startDate, endDate)
      return {
        label,
        income,
        expense,
        savings,
        savingsRate: savingsRatePercentFromNet(savings, income) ?? 0,
        transactions: count,
        days,
        isPartial,
        categories: cats,
      }
    }
  }, [transactions, lossConfig])

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
        labelA: formatMonthKey(effectiveMonthA),
        labelB: formatMonthKey(effectiveMonthB),
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
   * When either period is still running, BOTH spans are cut to the same elapsed-day
   * count. A month, a calendar year and an FY all suffer the same distortion
   * otherwise: 26 days of July against all 31 of June reads as a spending win,
   * and two months into an FY against a full prior FY reads as an 83% income
   * collapse. This applies to every mode, not just FY.
   */
  const aligned = useMemo(() => alignToElapsed(rawSpans.a, rawSpans.b), [rawSpans])

  const partialPeriod = useMemo((): PartialPeriod | null => {
    if (!aligned.partial) return null
    return {
      label: aligned.runningSide === 'a' ? rawSpans.labelA : rawSpans.labelB,
      daysElapsed: aligned.partial.daysElapsed,
      daysTotal: aligned.partial.daysTotal,
    }
  }, [aligned, rawSpans.labelA, rawSpans.labelB])

  const [periodA, periodB] = useMemo((): [PeriodSummary, PeriodSummary] => {
    if (transactions.length === 0) {
      const empty: PeriodSummary = {
        label: '-', income: 0, expense: 0, savings: 0,
        savingsRate: 0, transactions: 0, days: 1, isPartial: false, categories: {},
      }
      return [empty, empty]
    }

    const isPartial = aligned.partial !== null
    const labelA = isPartial ? `${rawSpans.labelA} (${aligned.runningSide === 'a' ? 'to date' : 'to same day'})` : rawSpans.labelA
    const labelB = isPartial ? `${rawSpans.labelB} (${aligned.runningSide === 'b' ? 'to date' : 'to same day'})` : rawSpans.labelB
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
  }, [periodA])

  const distributionB = useMemo(() => {
    return Object.entries(periodB.categories)
      .map(([cat, data]) => ({ name: cat, value: data.expense }))
      .filter((d) => d.value > 0)
      .sort((a, b) => b.value - a.value)
  }, [periodB])

  // Auto-generated insights
  const insights = useMemo(
    () => generateAllInsights(periodA, periodB, expenseDeltas),
    [periodA, periodB, expenseDeltas],
  )

  return {
    isLoading,
    isError,
    refreshFailed: refreshFailed(statusReads),
    retry,
    transactions,
    mode, setMode,
    monthOptions, yearOptions, fyOptions,
    effectiveMonthA, effectiveMonthB,
    yearA, yearB,
    fyA, fyB,
    setMonthA, setMonthB,
    setYearA, setYearB,
    setFyA: setFyAChoice, setFyB: setFyBChoice,
    periodA, periodB, partialPeriod,
    expenseDeltas, incomeDeltas,
    distributionA, distributionB,
    insights,
  }
}
