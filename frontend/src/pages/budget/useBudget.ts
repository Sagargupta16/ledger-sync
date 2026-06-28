import { useCallback, useMemo, useState } from 'react'

import { toast } from 'sonner'

import { useCategoryBreakdown } from '@/hooks/api/useAnalytics'
import { usePreferences } from '@/hooks/api/usePreferences'
import { useTransactions } from '@/hooks/api/useTransactions'
import { getCurrentFY, getFYDateRange } from '@/lib/dateUtils'
import { parseStringArray } from '@/lib/formatters'
import { computeCategoryMomentum } from '@/lib/momentumCalculator'
import { useBudgetStore } from '@/store/budgetStore'

import { buildStatus } from './budgetUtils'
import type { BudgetPeriod, BudgetRow, ViewMode } from './types'

export function useBudget() {
  const { data: transactions = [], isError: transactionsError } = useTransactions()
  const { data: categoryData, isError: categoryError } = useCategoryBreakdown({
    transaction_type: 'expense',
  })
  const { data: preferences, isError: preferencesError } = usePreferences()
  const isError = transactionsError || categoryError || preferencesError
  const fiscalYearStartMonth = preferences?.fiscal_year_start_month || 4
  const alertThreshold = preferences?.default_budget_alert_threshold ?? 80

  const categoryMomentum = useMemo(() => computeCategoryMomentum(transactions), [transactions])

  const fixedExpenseCategories = useMemo<Set<string>>(
    () =>
      new Set(parseStringArray(preferences?.fixed_expense_categories).map((c) => c.toLowerCase())),
    [preferences?.fixed_expense_categories],
  )

  const getStatus = useCallback(
    (pct: number): BudgetRow['status'] => buildStatus(pct, alertThreshold),
    [alertThreshold],
  )

  const { budgets, setBudget, removeBudget } = useBudgetStore()

  const [viewMode, setViewMode] = useState<ViewMode>('category')
  const [budgetPeriod, setBudgetPeriod] = useState<BudgetPeriod>('monthly')
  const [isAdding, setIsAdding] = useState(false)
  const [editKey, setEditKey] = useState<string | null>(null)
  const [formCategory, setFormCategory] = useState('')
  const [formSubcategory, setFormSubcategory] = useState('')
  const [formLimit, setFormLimit] = useState('')

  const currentMonthKey = useMemo(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  }, [])

  // Current day-of-month and total days, shared by the burndown chart and the
  // per-row month-end pace projection so they stay in sync.
  const monthProgress = useMemo(() => {
    const now = new Date()
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
    return { todayDay: now.getDate(), daysInMonth }
  }, [])

  const fyRange = useMemo(() => {
    const fy = getCurrentFY(fiscalYearStartMonth)
    return getFYDateRange(fy, fiscalYearStartMonth)
  }, [fiscalYearStartMonth])

  const spendingData = useMemo(() => {
    const byCategory: Record<string, number> = {}
    const bySubcategory: Record<string, number> = {}
    const byCategoryYearly: Record<string, number> = {}
    const bySubcategoryYearly: Record<string, number> = {}

    const addToMaps = (
      catMap: Record<string, number>,
      subMap: Record<string, number>,
      cat: string,
      sub: string | null,
      amt: number,
    ) => {
      catMap[cat] = (catMap[cat] || 0) + amt
      if (sub) subMap[sub] = (subMap[sub] || 0) + amt
    }

    for (const tx of transactions) {
      if (tx.type !== 'Expense') continue
      const amt = Math.abs(tx.amount)
      const cat = tx.category || 'Uncategorized'
      const sub = tx.subcategory ? `${cat}::${tx.subcategory}` : null
      const dateKey = tx.date.substring(0, 10)

      if (tx.date.startsWith(currentMonthKey)) {
        addToMaps(byCategory, bySubcategory, cat, sub, amt)
      }

      if (dateKey >= fyRange.start && dateKey <= fyRange.end) {
        addToMaps(byCategoryYearly, bySubcategoryYearly, cat, sub, amt)
      }
    }

    return { byCategory, bySubcategory, byCategoryYearly, bySubcategoryYearly }
  }, [transactions, currentMonthKey, fyRange])

  const allCategories = useMemo(() => {
    const cats = new Set<string>()
    if (categoryData?.categories) {
      for (const c of Object.keys(categoryData.categories)) cats.add(c)
    }
    for (const tx of transactions) {
      if (tx.type === 'Expense' && tx.category) cats.add(tx.category)
    }
    return Array.from(cats).sort((a, b) => a.localeCompare(b))
  }, [categoryData, transactions])

  const subcategoriesForCategory = useMemo(() => {
    const map: Record<string, Set<string>> = {}
    for (const tx of transactions) {
      if (tx.type === 'Expense' && tx.category && tx.subcategory) {
        if (!map[tx.category]) map[tx.category] = new Set()
        map[tx.category].add(tx.subcategory)
      }
    }
    return Object.fromEntries(
      Object.entries(map).map(([k, v]) => [k, Array.from(v).sort((a, b) => a.localeCompare(b))]),
    )
  }, [transactions])

  const budgetRows = useMemo((): BudgetRow[] => {
    return budgets.map((b) => {
      const isSubcat = b.category.includes('::')
      const monthlyMap = isSubcat ? spendingData.bySubcategory : spendingData.byCategory
      const yearlyMap = isSubcat ? spendingData.bySubcategoryYearly : spendingData.byCategoryYearly
      const spendMap = b.period === 'monthly' ? monthlyMap : yearlyMap
      const spent = spendMap[b.category] || 0
      const percentage = b.limit > 0 ? (spent / b.limit) * 100 : 0
      const parts = b.category.split('::')

      return {
        category: parts[0],
        subcategory: parts[1],
        limit: b.limit,
        period: b.period,
        spent,
        percentage,
        remaining: b.limit - spent,
        status: getStatus(percentage),
      }
    })
  }, [budgets, spendingData, getStatus])

  const filteredRows = useMemo(() => {
    let rows = budgetRows
    if (viewMode === 'category') rows = rows.filter((r) => !r.subcategory)
    else rows = rows.filter((r) => !!r.subcategory)
    return rows.sort((a, b) => b.percentage - a.percentage)
  }, [budgetRows, viewMode])

  const summary = useMemo(() => {
    const totalBudget = filteredRows.reduce((s, r) => s + r.limit, 0)
    const totalSpent = filteredRows.reduce((s, r) => s + r.spent, 0)
    const exceeded = filteredRows.filter((r) => r.status === 'exceeded').length
    const onTrack = filteredRows.filter((r) => r.status === 'safe').length
    return { totalBudget, totalSpent, exceeded, onTrack, count: filteredRows.length }
  }, [filteredRows])

  const chartData = useMemo(() => {
    return filteredRows.slice(0, 8).map((r) => ({
      name: r.subcategory || r.category,
      Budget: r.limit,
      Spent: r.spent,
      status: r.status,
    }))
  }, [filteredRows])

  const burndownData = useMemo(() => {
    const { daysInMonth } = monthProgress

    const totalBudget = filteredRows
      .filter((r) => r.period === 'monthly')
      .reduce((sum, r) => sum + r.limit, 0)

    if (totalBudget === 0) return []

    const dailyExpense: number[] = new Array(daysInMonth).fill(0)
    for (const tx of transactions) {
      if (tx.type !== 'Expense') continue
      if (!tx.date.startsWith(currentMonthKey)) continue
      const dayNum = Number.parseInt(tx.date.substring(8, 10), 10)
      if (dayNum >= 1 && dayNum <= daysInMonth) {
        dailyExpense[dayNum - 1] += Math.abs(tx.amount)
      }
    }

    const cumulative: number[] = []
    let runningTotal = 0
    for (let i = 0; i < daysInMonth; i++) {
      runningTotal += dailyExpense[i]
      cumulative.push(runningTotal)
    }

    const todayDay = monthProgress.todayDay

    return Array.from({ length: daysInMonth }, (_, i) => ({
      day: i + 1,
      ideal: Math.round(totalBudget - (totalBudget / daysInMonth) * (i + 1)),
      actual: i < todayDay ? Math.round(totalBudget - cumulative[i]) : undefined,
    }))
  }, [filteredRows, transactions, currentMonthKey, monthProgress])

  const usageData = useMemo(() => {
    // Top 8 by utilization (rows are sorted desc). Rendered as a sorted
    // horizontal bar -- length encodes utilization far more readably than radar
    // spokes, and full category names fit on the y-axis.
    return filteredRows.slice(0, 8).map((r) => ({
      category: r.subcategory || r.category,
      usage: Math.round(r.percentage),
      status: r.status,
    }))
  }, [filteredRows])

  const availableCategories = useMemo(() => {
    const existing = new Set(budgets.map((b) => b.category))
    if (viewMode === 'category') {
      return allCategories.filter((c) => !existing.has(c))
    }
    const subs: string[] = []
    for (const [cat, sublist] of Object.entries(subcategoriesForCategory)) {
      for (const sub of sublist) {
        const key = `${cat}::${sub}`
        if (!existing.has(key)) subs.push(key)
      }
    }
    return subs.sort((a, b) => a.localeCompare(b))
  }, [budgets, allCategories, subcategoriesForCategory, viewMode])

  const handleAdd = useCallback(() => {
    const key =
      viewMode === 'subcategory' && formSubcategory
        ? `${formCategory}::${formSubcategory}`
        : formCategory
    if (!key || !formLimit) return
    const limit = Number.parseFloat(formLimit)
    if (!Number.isFinite(limit) || limit <= 0) {
      toast.error('Enter a budget limit greater than 0')
      return
    }
    setBudget(key, limit, budgetPeriod)
    setFormCategory('')
    setFormSubcategory('')
    setFormLimit('')
    setIsAdding(false)
  }, [formCategory, formSubcategory, formLimit, viewMode, budgetPeriod, setBudget])

  const handleQuickAdd = useCallback(
    (cat: string, spent: number) => {
      const suggested = Math.ceil((spent * 1.2) / 1000) * 1000
      setBudget(cat, suggested, budgetPeriod)
    },
    [setBudget, budgetPeriod],
  )

  return {
    isError,
    alertThreshold,
    fixedExpenseCategories,
    categoryMomentum,
    budgets,
    setBudget,
    removeBudget,
    viewMode,
    setViewMode,
    budgetPeriod,
    setBudgetPeriod,
    isAdding,
    setIsAdding,
    editKey,
    setEditKey,
    formCategory,
    setFormCategory,
    formSubcategory,
    setFormSubcategory,
    formLimit,
    setFormLimit,
    spendingData,
    allCategories,
    subcategoriesForCategory,
    filteredRows,
    summary,
    chartData,
    burndownData,
    usageData,
    monthProgress,
    availableCategories,
    handleAdd,
    handleQuickAdd,
  }
}
