import { useState, useMemo } from 'react'

import { motion } from 'framer-motion'
import { Target, Plus, Trash2, AlertTriangle, CheckCircle, Edit2 } from 'lucide-react'

import { useCategoryBreakdown } from '@/hooks/api/useAnalytics'
import { useBudgetStore } from '@/store/budgetStore'
import { formatCurrency, formatPercent } from '@/lib/formatters'

import { computeBudgetStatus, getStatusColor, getProgressColor } from './budgetUtils'
import AddBudgetForm from './components/AddBudgetForm'

/** First/last day of the current calendar month as YYYY-MM-DD (local). */
function currentMonthRange(): { start_date: string; end_date: string } {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth()
  const pad = (n: number) => String(n).padStart(2, '0')
  const lastDay = new Date(y, m + 1, 0).getDate()
  return {
    start_date: `${y}-${pad(m + 1)}-01`,
    end_date: `${y}-${pad(m + 1)}-${pad(lastDay)}`,
  }
}

export default function BudgetTracker() {
  // All-time expense categories (for the dropdown / suggestions list).
  const { data: categoryData } = useCategoryBreakdown({
    transaction_type: 'expense',
  })
  // Current-month expense per category, aggregated server-side (replaces the
  // full-ledger fetch that filtered by date.startsWith(month) in the browser).
  const monthRange = useMemo(() => currentMonthRange(), [])
  const { data: monthCategoryData } = useCategoryBreakdown({
    transaction_type: 'expense',
    ...monthRange,
  })
  const { budgets, setBudget, removeBudget } = useBudgetStore()

  const [isAdding, setIsAdding] = useState(false)
  const [editingCategory, setEditingCategory] = useState<string | null>(null)
  const [newCategory, setNewCategory] = useState('')
  const [newLimit, setNewLimit] = useState('')

  // Get current month spending by category (from the month-scoped breakdown).
  const currentMonthSpending = useMemo(() => {
    const spending: Record<string, number> = {}
    const cats = monthCategoryData?.categories ?? {}
    for (const [cat, info] of Object.entries(cats)) {
      spending[cat] = Math.abs(info.total)
    }
    return spending
  }, [monthCategoryData])

  // All expense categories (all-time) for the dropdown + suggestions.
  const allCategories = useMemo(() => {
    const cats = new Set<string>()
    if (categoryData?.categories) {
      Object.keys(categoryData.categories).forEach((c) => cats.add(c))
    }
    return Array.from(cats).sort((a, b) => a.localeCompare(b))
  }, [categoryData])

  // Budget status
  const budgetStatus = useMemo(
    () => computeBudgetStatus(budgets, currentMonthSpending),
    [budgets, currentMonthSpending]
  )

  // Categories without budgets
  const categoriesWithoutBudget = allCategories.filter(
    (c) => !budgets.some((b) => b.category === c)
  )

  const handleAddBudget = () => {
    if (newCategory && newLimit) {
      setBudget(newCategory, Number.parseFloat(newLimit))
      setNewCategory('')
      setNewLimit('')
      setIsAdding(false)
    }
  }

  const handleEditBudget = (category: string, limit: number) => {
    setBudget(category, limit)
    setEditingCategory(null)
  }

  // Summary stats
  const totalBudget = budgets.reduce((sum, b) => sum + b.limit, 0)
  const totalSpent = budgetStatus.reduce((sum, b) => sum + b.spent, 0)
  const overBudgetCount = budgetStatus.filter((b) => b.status === 'exceeded').length

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-2xl border border-border p-6"
    >
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-app-green/20 rounded-xl">
            <Target className="w-6 h-6 text-app-green" />
          </div>
          <div>
            <h3 className="text-lg font-semibold">Budget Tracker</h3>
            <p className="text-sm text-muted-foreground">
              {budgets.length} budgets set • {overBudgetCount > 0 ? `${overBudgetCount} exceeded` : 'On track'}
            </p>
          </div>
        </div>
        <button
          onClick={() => setIsAdding(true)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/20 text-primary hover:bg-primary/30 transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span className="text-sm">Add Budget</span>
        </button>
      </div>

      {/* Summary */}
      {budgets.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-6">
          <div className="p-3 rounded-xl bg-background/30 text-center">
            <p className="text-xs text-muted-foreground">Total Budget</p>
            <p className="text-lg font-bold">{formatCurrency(totalBudget)}</p>
          </div>
          <div className="p-3 rounded-xl bg-background/30 text-center">
            <p className="text-xs text-muted-foreground">Total Spent</p>
            <p className={`text-lg font-bold ${totalSpent > totalBudget ? 'text-app-red' : 'text-app-green'}`}>
              {formatCurrency(totalSpent)}
            </p>
          </div>
          <div className="p-3 rounded-xl bg-background/30 text-center">
            <p className="text-xs text-muted-foreground">Remaining</p>
            <p className={`text-lg font-bold ${totalBudget - totalSpent < 0 ? 'text-app-red' : 'text-app-green'}`}>
              {formatCurrency(totalBudget - totalSpent)}
            </p>
          </div>
        </div>
      )}

      {/* Add Budget Form */}
      {isAdding && (
        <AddBudgetForm
          categoriesWithoutBudget={categoriesWithoutBudget}
          newCategory={newCategory}
          newLimit={newLimit}
          onCategoryChange={setNewCategory}
          onLimitChange={setNewLimit}
          onAdd={handleAddBudget}
          onCancel={() => setIsAdding(false)}
        />
      )}

      {/* Budget List */}
      {budgetStatus.length === 0 ? (
        <div className="text-center py-8">
          <Target className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-50" />
          <p className="text-muted-foreground">No budgets set yet.</p>
          <p className="text-sm text-muted-foreground mt-1">
            Click "Add Budget" to start tracking your spending limits.
          </p>
        </div>
      ) : (
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {budgetStatus.map((budget) => (
            <div
              key={budget.category}
              className={`p-4 rounded-xl border transition-colors ${getStatusColor(budget.status)}`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  {budget.status === 'exceeded' ? (
                    <AlertTriangle className="w-4 h-4" />
                  ) : (
                    <CheckCircle className="w-4 h-4" />
                  )}
                  <span className="font-medium">{budget.category}</span>
                </div>
                <div className="flex items-center gap-2">
                  {editingCategory === budget.category ? (
                    <input
                      type="number"
                      inputMode="decimal"
                      defaultValue={budget.limit}
                      onBlur={(e) => handleEditBudget(budget.category, Number.parseFloat(e.target.value))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleEditBudget(budget.category, Number.parseFloat((e.target as HTMLInputElement).value))
                        }
                      }}
                      className="w-24 px-2 py-1 rounded bg-background/50 border border-border-strong text-sm"
                      autoFocus
                    />
                  ) : (
                    <>
                      <span className="font-bold">{formatPercent(budget.percentage)}</span>
                      <button
                        onClick={() => setEditingCategory(budget.category)}
                        className="p-1 rounded hover:bg-[var(--overlay-5)]"
                      >
                        <Edit2 className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => removeBudget(budget.category)}
                        className="p-1 rounded hover:bg-[var(--overlay-5)] text-app-red"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Progress Bar */}
              <div className="h-2 bg-black/20 rounded-full overflow-hidden mb-2">
                <div
                  className={`h-full transition-colors duration-500 ${getProgressColor(budget.status)}`}
                  style={{ width: `${Math.min(100, budget.percentage)}%` }}
                />
              </div>

              <div className="flex justify-between text-xs">
                <span>Spent: {formatCurrency(budget.spent)}</span>
                <span>Budget: {formatCurrency(budget.limit)}</span>
              </div>

              {budget.remaining < 0 ? (
                <p className="text-xs mt-1 text-app-red">
                  Over budget by {formatCurrency(Math.abs(budget.remaining))}
                </p>
              ) : (
                <p className="text-xs mt-1 opacity-70">
                  {formatCurrency(budget.remaining)} remaining
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Suggestions */}
      {categoriesWithoutBudget.length > 0 && budgets.length > 0 && (
        <div className="mt-4 pt-4 border-t border-border">
          <p className="text-xs text-muted-foreground mb-2">
            Suggested budgets based on spending:
          </p>
          <div className="flex flex-wrap gap-2">
            {categoriesWithoutBudget
              .filter((c) => currentMonthSpending[c] && currentMonthSpending[c] > 1000)
              .slice(0, 3)
              .map((cat) => (
                <button
                  key={cat}
                  onClick={() => {
                    // Suggest 120% of current spending as budget
                    const suggested = Math.ceil(currentMonthSpending[cat] * 1.2 / 1000) * 1000
                    setBudget(cat, suggested)
                  }}
                  className="px-3 py-1 rounded-full bg-primary/10 text-primary text-xs hover:bg-primary/20 transition-colors"
                >
                  + {cat} ({formatCurrency(currentMonthSpending[cat])})
                </button>
              ))}
          </div>
        </div>
      )}
    </motion.div>
  )
}
