import { useState, useMemo } from 'react'
import { useTransactions } from '@/hooks/api/useTransactions'
import { usePreferences } from '@/hooks/api/usePreferences'
import {
  getCurrentYear,
  getCurrentFY,
  getFYDateRange,
  getDateKey,
  getAvailableFYs,
} from '@/lib/dateUtils'
import type { CompareMode, PeriodSummary, CategoryDelta } from './types'
import { pctChange, getMonthOptions, getYearOptions, formatMonthLabel } from './utils'
import { generateAllInsights } from './insights'

export function useComparisonData() {
  const { data: transactions = [], isLoading } = useTransactions()
  const { data: preferences } = usePreferences()
  const fiscalYearStartMonth = preferences?.fiscal_year_start_month || 4

  // Mode & selection state
  const [mode, setMode] = useState<CompareMode>('month')

  // Month selectors
  const monthOptions = useMemo(() => getMonthOptions(transactions), [transactions])
  const currentMonthKey = useMemo(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  }, [])
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
    return (label: string, startDate: string, endDate: string): PeriodSummary => {
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
      return {
        label,
        income,
        expense,
        savings,
        savingsRate: income > 0 ? (savings / income) * 100 : 0,
        transactions: count,
        categories: cats,
      }
    }
  }, [transactions])

  const [periodA, periodB] = useMemo((): [PeriodSummary, PeriodSummary] => {
    if (transactions.length === 0) {
      const empty: PeriodSummary = {
        label: '-', income: 0, expense: 0, savings: 0,
        savingsRate: 0, transactions: 0, categories: {},
      }
      return [empty, empty]
    }

    if (mode === 'month') {
      const aStart = `${effectiveMonthA}-01`
      const [ay, am] = effectiveMonthA.split('-').map(Number)
      const aEnd = `${effectiveMonthA}-${new Date(ay, am, 0).getDate()}`
      const bStart = `${effectiveMonthB}-01`
      const [by, bm] = effectiveMonthB.split('-').map(Number)
      const bEnd = `${effectiveMonthB}-${new Date(by, bm, 0).getDate()}`
      return [
        buildSummary(formatMonthLabel(effectiveMonthA), aStart, aEnd),
        buildSummary(formatMonthLabel(effectiveMonthB), bStart, bEnd),
      ]
    }

    if (mode === 'year') {
      return [
        buildSummary(String(yearA), `${yearA}-01-01`, `${yearA}-12-31`),
        buildSummary(String(yearB), `${yearB}-01-01`, `${yearB}-12-31`),
      ]
    }

    // FY
    const rangeA = getFYDateRange(fyA, fiscalYearStartMonth)
    const rangeB = getFYDateRange(fyB, fiscalYearStartMonth)
    return [
      buildSummary(fyA, rangeA.start, rangeA.end),
      buildSummary(fyB, rangeB.start, rangeB.end),
    ]
  }, [transactions, buildSummary, mode, effectiveMonthA, effectiveMonthB, yearA, yearB, fyA, fyB, fiscalYearStartMonth])

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
    transactions,
    mode, setMode,
    monthOptions, yearOptions, fyOptions,
    effectiveMonthA, effectiveMonthB,
    yearA, yearB,
    fyA, fyB,
    setMonthA, setMonthB,
    setYearA, setYearB,
    setFyA, setFyB,
    periodA, periodB,
    expenseDeltas, incomeDeltas,
    distributionA, distributionB,
    insights,
  }
}
