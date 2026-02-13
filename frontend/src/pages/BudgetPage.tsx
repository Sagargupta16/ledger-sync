import { motion, AnimatePresence } from 'framer-motion'
import {
  Target,
  Plus,
  Trash2,
  AlertTriangle,
  CheckCircle,
  Edit2,
  PiggyBank,
  TrendingDown,
  BarChart3,
  X,
} from 'lucide-react'
import { useState, useMemo, useCallback } from 'react'
import { useCategoryBreakdown } from '@/hooks/useAnalytics'
import StatCard from '@/pages/year-in-review/StatCard'
import { useTransactions } from '@/hooks/api/useTransactions'
import { useBudgetStore } from '@/store/budgetStore'
import { formatCurrency, formatPercent } from '@/lib/formatters'
import { rawColors } from '@/constants/colors'
import { staggerContainer, fadeUpItem } from '@/constants/animations'
import { getCurrentFY, getFYDateRange } from '@/lib/dateUtils'
import { usePreferences } from '@/hooks/api/usePreferences'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
} from 'recharts'
import { chartTooltipProps, PageHeader } from '@/components/ui'

// ─── Types ──────────────────────────────────────────────────────────
type BudgetPeriod = 'monthly' | 'yearly'
type ViewMode = 'category' | 'subcategory'

interface BudgetRow {
  category: string
  subcategory?: string
  limit: number
  period: BudgetPeriod
  spent: number
  percentage: number
  remaining: number
  status: 'safe' | 'warning' | 'danger' | 'exceeded'
}

// ─── Helpers ────────────────────────────────────────────────────────
const statusConfig = {
  safe: { color: rawColors.ios.green, bg: 'bg-green-500/10', border: 'border-green-500/20', text: 'text-green-400' },
  warning: { color: rawColors.ios.yellow, bg: 'bg-yellow-500/10', border: 'border-yellow-500/20', text: 'text-yellow-400' },
  danger: { color: rawColors.ios.orange, bg: 'bg-orange-500/10', border: 'border-orange-500/20', text: 'text-orange-400' },
  exceeded: { color: rawColors.ios.red, bg: 'bg-red-500/10', border: 'border-red-500/20', text: 'text-red-400' },
}

// ─── Component ──────────────────────────────────────────────────────
export default function BudgetPage() {
  const { data: transactions = [] } = useTransactions()
  const { data: categoryData } = useCategoryBreakdown({ transaction_type: 'expense' })
  const { data: preferences } = usePreferences()
  const fiscalYearStartMonth = preferences?.fiscal_year_start_month || 4
  const alertThreshold = preferences?.default_budget_alert_threshold ?? 80

  const getStatus = useCallback((pct: number): BudgetRow['status'] => {
    if (pct >= 100) return 'exceeded'
    if (pct >= alertThreshold) return 'danger'
    if (pct >= alertThreshold * 0.75) return 'warning'
    return 'safe'
  }, [alertThreshold])
  const { budgets, setBudget, removeBudget } = useBudgetStore()

  const [viewMode, setViewMode] = useState<ViewMode>('category')
  const [budgetPeriod, setBudgetPeriod] = useState<BudgetPeriod>('monthly')
  const [isAdding, setIsAdding] = useState(false)
  const [editKey, setEditKey] = useState<string | null>(null)
  const [formCategory, setFormCategory] = useState('')
  const [formSubcategory, setFormSubcategory] = useState('')
  const [formLimit, setFormLimit] = useState('')

  // ─── Spending data ────────────────────────────────────────────
  const currentMonthKey = useMemo(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  }, [])

  const fyRange = useMemo(() => {
    const fy = getCurrentFY(fiscalYearStartMonth)
    return getFYDateRange(fy, fiscalYearStartMonth)
  }, [fiscalYearStartMonth])

  // Monthly spending by category and subcategory
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

      // Monthly
      if (tx.date.startsWith(currentMonthKey)) {
        addToMaps(byCategory, bySubcategory, cat, sub, amt)
      }

      // Yearly (FY)
      if (dateKey >= fyRange.start && dateKey <= fyRange.end) {
        addToMaps(byCategoryYearly, bySubcategoryYearly, cat, sub, amt)
      }
    }

    return { byCategory, bySubcategory, byCategoryYearly, bySubcategoryYearly }
  }, [transactions, currentMonthKey, fyRange])

  // All unique categories and subcategories
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
      Object.entries(map).map(([k, v]) => [k, Array.from(v).sort((a, b) => a.localeCompare(b))])
    )
  }, [transactions])

  // ─── Build budget rows ────────────────────────────────────────
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

  // Filter rows by view mode and period
  const filteredRows = useMemo(() => {
    let rows = budgetRows
    if (viewMode === 'category') rows = rows.filter((r) => !r.subcategory)
    else rows = rows.filter((r) => !!r.subcategory)
    return rows.sort((a, b) => b.percentage - a.percentage)
  }, [budgetRows, viewMode])

  // Summary stats
  const summary = useMemo(() => {
    const totalBudget = filteredRows.reduce((s, r) => s + r.limit, 0)
    const totalSpent = filteredRows.reduce((s, r) => s + r.spent, 0)
    const exceeded = filteredRows.filter((r) => r.status === 'exceeded').length
    const onTrack = filteredRows.filter((r) => r.status === 'safe').length
    return { totalBudget, totalSpent, exceeded, onTrack, count: filteredRows.length }
  }, [filteredRows])

  // Bar chart data for top 8 budgets
  const chartData = useMemo(() => {
    return filteredRows.slice(0, 8).map((r) => ({
      name: r.subcategory || r.category,
      Budget: r.limit,
      Spent: r.spent,
      status: r.status,
    }))
  }, [filteredRows])

  // Categories without a budget (for add form)
  const availableCategories = useMemo(() => {
    const existing = new Set(budgets.map((b) => b.category))
    if (viewMode === 'category') {
      return allCategories.filter((c) => !existing.has(c))
    }
    // subcategory: show sub keys not already budgeted
    const subs: string[] = []
    for (const [cat, sublist] of Object.entries(subcategoriesForCategory)) {
      for (const sub of sublist) {
        const key = `${cat}::${sub}`
        if (!existing.has(key)) subs.push(key)
      }
    }
    return subs.sort((a, b) => a.localeCompare(b))
  }, [budgets, allCategories, subcategoriesForCategory, viewMode])

  // ─── Handlers ─────────────────────────────────────────────────
  const handleAdd = useCallback(() => {
    const key = viewMode === 'subcategory' && formSubcategory
      ? `${formCategory}::${formSubcategory}`
      : formCategory
    if (key && formLimit) {
      setBudget(key, Number.parseFloat(formLimit), budgetPeriod)
      setFormCategory('')
      setFormSubcategory('')
      setFormLimit('')
      setIsAdding(false)
    }
  }, [formCategory, formSubcategory, formLimit, viewMode, budgetPeriod, setBudget])

  const handleQuickAdd = useCallback(
    (cat: string, spent: number) => {
      const suggested = Math.ceil(spent * 1.2 / 1000) * 1000
      setBudget(cat, suggested, 'monthly')
    },
    [setBudget]
  )

  // ─── Render ───────────────────────────────────────────────────
  return (
    <div className="p-8 space-y-8">
      {/* Header */}
      <PageHeader
        title="Budget Tracker"
        subtitle="Set limits and track spending by category"
        action={
          <div className="flex items-center gap-3">
            {/* View Mode Toggle */}
            <div className="flex items-center gap-1 p-1 glass-thin rounded-xl" role="tablist">
              {([['category', 'Category'], ['subcategory', 'Subcategory']] as const).map(([val, label]) => (
                <motion.button
                  key={val}
                  role="tab"
                  aria-selected={viewMode === val}
                  onClick={() => setViewMode(val)}
                  className={`relative px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                    viewMode === val ? 'text-white' : 'text-gray-400 hover:text-white hover:bg-white/5'
                  }`}
                  whileTap={{ scale: 0.97 }}
                >
                  {viewMode === val && (
                    <motion.div
                      layoutId="budgetViewTab"
                      className="absolute inset-0 rounded-lg"
                      style={{ backgroundColor: rawColors.ios.green }}
                      initial={false}
                      transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                    />
                  )}
                  <span className="relative z-10">{label}</span>
                </motion.button>
              ))}
            </div>

            <motion.button
              onClick={() => setIsAdding(true)}
              whileTap={{ scale: 0.97 }}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all"
              style={{ backgroundColor: `${rawColors.ios.green}22`, color: rawColors.ios.green }}
            >
              <Plus className="w-4 h-4" /> Add Budget
            </motion.button>
          </div>
        }
      />

      {/* Summary KPIs */}
      {summary.count > 0 && (
        <motion.div className="grid grid-cols-2 md:grid-cols-4 gap-5" initial="hidden" animate="visible" variants={staggerContainer}>
          <motion.div variants={fadeUpItem}>
            <StatCard label="Total Budget" value={formatCurrency(summary.totalBudget)} icon={Target} color={rawColors.ios.blue} />
          </motion.div>
          <motion.div variants={fadeUpItem}>
            <StatCard
              label="Total Spent"
              value={formatCurrency(summary.totalSpent)}
              icon={TrendingDown}
              color={summary.totalSpent > summary.totalBudget ? rawColors.ios.red : rawColors.ios.green}
            />
          </motion.div>
          <motion.div variants={fadeUpItem}>
            <StatCard label="On Track" value={String(summary.onTrack)} icon={CheckCircle} color={rawColors.ios.green} />
          </motion.div>
          <motion.div variants={fadeUpItem}>
            <StatCard label="Exceeded" value={String(summary.exceeded)} icon={AlertTriangle} color={rawColors.ios.red} />
          </motion.div>
        </motion.div>
      )}

      {/* Add Budget Form */}
      <AnimatePresence>
        {isAdding && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="glass rounded-2xl border border-white/10 p-6 overflow-hidden"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">New Budget</h3>
              <button onClick={() => setIsAdding(false)} className="p-1.5 rounded-lg hover:bg-white/10">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex flex-wrap gap-4 items-end">
              {viewMode === 'category' ? (
                <div className="flex-1 min-w-48">
                  <label htmlFor="budget-category" className="text-xs text-gray-400 mb-1 block">Category</label>
                  <select
                    id="budget-category"
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-lg bg-[rgba(44,44,46,0.6)] backdrop-blur-xl border border-white/10 text-sm text-white cursor-pointer hover:bg-[rgba(58,58,60,0.6)] transition-colors"
                  >
                    <option value="">Select category</option>
                    {availableCategories.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              ) : (
                <>
                  <div className="flex-1 min-w-40">
                    <label htmlFor="budget-cat-sub" className="text-xs text-gray-400 mb-1 block">Category</label>
                    <select
                      id="budget-cat-sub"
                      value={formCategory}
                      onChange={(e) => { setFormCategory(e.target.value); setFormSubcategory('') }}
                      className="w-full px-3 py-2.5 rounded-lg bg-[rgba(44,44,46,0.6)] backdrop-blur-xl border border-white/10 text-sm text-white cursor-pointer hover:bg-[rgba(58,58,60,0.6)] transition-colors"
                    >
                      <option value="">Select category</option>
                      {allCategories.filter((c) => subcategoriesForCategory[c]?.length).map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex-1 min-w-40">
                    <label htmlFor="budget-subcategory" className="text-xs text-gray-400 mb-1 block">Subcategory</label>
                    <select
                      id="budget-subcategory"
                      value={formSubcategory}
                      onChange={(e) => setFormSubcategory(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-lg bg-[rgba(44,44,46,0.6)] backdrop-blur-xl border border-white/10 text-sm text-white cursor-pointer hover:bg-[rgba(58,58,60,0.6)] transition-colors disabled:opacity-50"
                      disabled={!formCategory}
                    >
                      <option value="">Select subcategory</option>
                      {(subcategoriesForCategory[formCategory] || []).map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                </>
              )}
              <div className="w-36">
                <label htmlFor="budget-limit" className="text-xs text-gray-400 mb-1 block">Limit (₹)</label>
                <input
                  id="budget-limit"
                  type="number"
                  value={formLimit}
                  onChange={(e) => setFormLimit(e.target.value)}
                  placeholder="Amount"
                  className="w-full px-3 py-2.5 rounded-lg bg-[rgba(44,44,46,0.6)] backdrop-blur-xl border border-white/10 text-sm text-white placeholder-gray-500"
                />
              </div>
              <div className="w-32">
                <label htmlFor="budget-period" className="text-xs text-gray-400 mb-1 block">Period</label>
                <select
                  id="budget-period"
                  value={budgetPeriod}
                  onChange={(e) => setBudgetPeriod(e.target.value as BudgetPeriod)}
                  className="w-full px-3 py-2.5 rounded-lg bg-[rgba(44,44,46,0.6)] backdrop-blur-xl border border-white/10 text-sm text-white cursor-pointer hover:bg-[rgba(58,58,60,0.6)] transition-colors"
                >
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </div>
              <button
                onClick={handleAdd}
                disabled={!formCategory || !formLimit}
                className="px-5 py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-40 transition-all"
                style={{ backgroundColor: rawColors.ios.green }}
              >
                Add
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Chart + Budget List */}
      {filteredRows.length > 0 ? (
        <>
          {/* Bar Chart */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass rounded-2xl border border-white/10 p-6 shadow-xl"
          >
            <h2 className="text-lg font-semibold mb-4">Budget vs Actual</h2>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <BarChart data={chartData} barGap={4}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                  <XAxis dataKey="name" tick={{ fill: '#9ca3af', fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={50} />
                  <YAxis tickFormatter={(v: number) => `₹${(v / 1000).toFixed(0)}K`} tick={{ fill: '#9ca3af', fontSize: 12 }} />
                  <Tooltip
                    {...chartTooltipProps}
                    formatter={(value: number | undefined) => (value === undefined ? '' : formatCurrency(value))}
                  />
                  <Bar dataKey="Budget" fill={rawColors.ios.blue} radius={[4, 4, 0, 0]} opacity={0.5} />
                  <Bar dataKey="Spent" radius={[4, 4, 0, 0]}>
                    {chartData.map((entry) => (
                      <Cell key={entry.name} fill={statusConfig[entry.status].color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </motion.div>

          {/* Budget Rows */}
          <div className="space-y-3">
            {filteredRows.map((row) => {
              const key = row.subcategory ? `${row.category}::${row.subcategory}` : row.category
              const cfg = statusConfig[row.status]
              const isEditing = editKey === key

              return (
                <motion.div
                  key={key}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`glass rounded-2xl border p-5 ${cfg.border} ${cfg.bg}`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      {row.status === 'exceeded' ? (
                        <AlertTriangle className={`w-4 h-4 ${cfg.text}`} />
                      ) : (
                        <CheckCircle className={`w-4 h-4 ${cfg.text}`} />
                      )}
                      <div>
                        <span className="font-medium">{row.category}</span>
                        {row.subcategory && (
                          <span className="text-gray-400 text-sm ml-1">/ {row.subcategory}</span>
                        )}
                      </div>
                      <span className="text-xs text-gray-500 ml-2 px-2 py-0.5 rounded-full bg-white/5">
                        {row.period}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {isEditing ? (
                        <input
                          type="number"
                          defaultValue={row.limit}
                          onBlur={(e) => {
                            setBudget(key, Number.parseFloat(e.target.value), row.period)
                            setEditKey(null)
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              setBudget(key, Number.parseFloat((e.target as HTMLInputElement).value), row.period)
                              setEditKey(null)
                            }
                            if (e.key === 'Escape') setEditKey(null)
                          }}
                          className="w-28 px-2 py-1 rounded-lg bg-[rgba(44,44,46,0.6)] backdrop-blur-xl border border-white/10 text-sm text-white"
                          autoFocus
                        />
                      ) : (
                        <>
                          <span className={`text-lg font-bold ${cfg.text}`}>
                            {formatPercent(row.percentage)}
                          </span>
                          <button onClick={() => setEditKey(key)} className="p-1.5 rounded-lg hover:bg-white/10 transition-all">
                            <Edit2 className="w-3.5 h-3.5 text-gray-400" />
                          </button>
                          <button onClick={() => removeBudget(key)} className="p-1.5 rounded-lg hover:bg-white/10 transition-all text-red-400">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="h-2 bg-black/20 rounded-full overflow-hidden mb-2">
                    <motion.div
                      className="h-full rounded-full"
                      style={{ backgroundColor: cfg.color }}
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(100, row.percentage)}%` }}
                      transition={{ duration: 0.6, ease: 'easeOut' }}
                    />
                  </div>

                  <div className="flex justify-between text-xs text-gray-400">
                    <span>Spent: {formatCurrency(row.spent)}</span>
                    <span>Budget: {formatCurrency(row.limit)}</span>
                  </div>
                  {row.remaining < 0 ? (
                    <p className="text-xs mt-1 text-red-400 font-medium">
                      Over budget by {formatCurrency(Math.abs(row.remaining))}
                    </p>
                  ) : (
                    <p className="text-xs mt-1 text-gray-500">
                      {formatCurrency(row.remaining)} remaining
                    </p>
                  )}
                </motion.div>
              )
            })}
          </div>
        </>
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="glass rounded-2xl border border-white/10 p-12 text-center"
        >
          <PiggyBank className="w-16 h-16 text-gray-600 mx-auto mb-4" />
          <h3 className="text-lg font-semibold mb-2">No budgets set yet</h3>
          <p className="text-sm text-gray-400 mb-6 max-w-md mx-auto">
            Set spending limits for your categories to start tracking. We'll suggest limits based on your spending patterns.
          </p>
          <button
            onClick={() => setIsAdding(true)}
            className="px-5 py-2.5 rounded-xl text-sm font-medium text-white transition-all"
            style={{ backgroundColor: rawColors.ios.green }}
          >
            <Plus className="w-4 h-4 inline mr-1.5" /> Create Your First Budget
          </button>
        </motion.div>
      )}

      {/* Quick Suggestions */}
      {availableCategories.length > 0 && filteredRows.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass rounded-2xl border border-white/10 p-6"
        >
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="w-5 h-5 text-gray-400" />
            <h3 className="text-sm font-medium">Suggested Budgets</h3>
            <span className="text-xs text-gray-500">Based on current spending</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {availableCategories
              .filter((c) => {
                const spent = spendingData.byCategory[c] || spendingData.bySubcategory[c] || 0
                return spent > 500
              })
              .slice(0, 8)
              .map((cat) => {
                const spent = spendingData.byCategory[cat] || spendingData.bySubcategory[cat] || 0
                const displayName = cat.includes('::') ? cat.split('::')[1] : cat
                return (
                  <motion.button
                    key={cat}
                    onClick={() => handleQuickAdd(cat, spent)}
                    whileTap={{ scale: 0.95 }}
                    className="px-3 py-1.5 rounded-full text-xs font-medium transition-all hover:scale-105"
                    style={{ backgroundColor: `${rawColors.ios.green}15`, color: rawColors.ios.green }}
                  >
                    + {displayName} ({formatCurrency(spent)}/mo)
                  </motion.button>
                )
              })}
          </div>
        </motion.div>
      )}
    </div>
  )
}

// ─── Sub-components ─────────────────────────────────────────────────
