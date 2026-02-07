import { motion } from 'framer-motion'
import { Target, Plus, Trash2, AlertTriangle, CheckCircle, Edit2 } from 'lucide-react'
import { useState, useMemo } from 'react'
import { useCategoryBreakdown } from '@/hooks/useAnalytics'
import { useTransactions } from '@/hooks/api/useTransactions'
import { useBudgetStore } from '@/store/budgetStore'
import { formatCurrency, formatPercent } from '@/lib/formatters'

export default function BudgetTracker() {
  const { data: categoryData } = useCategoryBreakdown({
    transaction_type: 'expense',
  })
  const { data: transactions = [] } = useTransactions()
  const { budgets, setBudget, removeBudget } = useBudgetStore()

  const [isAdding, setIsAdding] = useState(false)
  const [editingCategory, setEditingCategory] = useState<string | null>(null)
  const [newCategory, setNewCategory] = useState('')
  const [newLimit, setNewLimit] = useState('')

  // Get current month spending by category
  const currentMonthSpending = useMemo(() => {
    const now = new Date()
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    
    const spending: Record<string, number> = {}
    
    transactions
      .filter((tx) => tx.type === 'Expense' && tx.date.startsWith(currentMonth))
      .forEach((tx) => {
        spending[tx.category] = (spending[tx.category] || 0) + Math.abs(tx.amount)
      })
    
    return spending
  }, [transactions])

  // All categories from data
  const allCategories = useMemo(() => {
    const cats = new Set<string>()
    if (categoryData?.categories) {
      Object.keys(categoryData.categories).forEach((c) => cats.add(c))
    }
    transactions.forEach((tx) => {
      if (tx.type === 'Expense' && tx.category) {
        cats.add(tx.category)
      }
    })
    return Array.from(cats).sort((a, b) => a.localeCompare(b))
  }, [categoryData, transactions])

  // Budget status
  const budgetStatus = useMemo(() => {
    return budgets.map((budget) => {
      const spent = currentMonthSpending[budget.category] || 0
      const percentage = budget.limit > 0 ? (spent / budget.limit) * 100 : 0
      const remaining = budget.limit - spent
      
      let status: 'safe' | 'warning' | 'danger' | 'exceeded' = 'safe'
      if (percentage >= 100) status = 'exceeded'
      else if (percentage >= 80) status = 'danger'
      else if (percentage >= 60) status = 'warning'
      
      return {
        ...budget,
        spent,
        percentage,
        remaining,
        status,
      }
    })
  }, [budgets, currentMonthSpending])

  // Categories without budgets
  const categoriesWithoutBudget = allCategories.filter(
    (c) => !budgets.find((b) => b.category === c)
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'safe':
        return 'text-green-500 bg-green-500/20 border-green-500/30'
      case 'warning':
        return 'text-yellow-500 bg-yellow-500/20 border-yellow-500/30'
      case 'danger':
        return 'text-orange-500 bg-orange-500/20 border-orange-500/30'
      case 'exceeded':
        return 'text-red-500 bg-red-500/20 border-red-500/30'
      default:
        return ''
    }
  }

  const getProgressColor = (status: string) => {
    switch (status) {
      case 'safe':
        return 'bg-green-500'
      case 'warning':
        return 'bg-yellow-500'
      case 'danger':
        return 'bg-orange-500'
      case 'exceeded':
        return 'bg-red-500'
      default:
        return 'bg-primary'
    }
  }

  // Summary stats
  const totalBudget = budgets.reduce((sum, b) => sum + b.limit, 0)
  const totalSpent = budgetStatus.reduce((sum, b) => sum + b.spent, 0)
  const overBudgetCount = budgetStatus.filter((b) => b.status === 'exceeded').length

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-2xl border border-white/10 p-6 shadow-xl"
    >
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-emerald-500/20 rounded-xl">
            <Target className="w-6 h-6 text-emerald-500" />
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
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/20 text-primary hover:bg-primary/30 transition-all"
        >
          <Plus className="w-4 h-4" />
          <span className="text-sm">Add Budget</span>
        </button>
      </div>

      {/* Summary */}
      {budgets.length > 0 && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="p-3 rounded-xl bg-background/30 text-center">
            <p className="text-xs text-muted-foreground">Total Budget</p>
            <p className="text-lg font-bold">{formatCurrency(totalBudget)}</p>
          </div>
          <div className="p-3 rounded-xl bg-background/30 text-center">
            <p className="text-xs text-muted-foreground">Total Spent</p>
            <p className={`text-lg font-bold ${totalSpent > totalBudget ? 'text-red-500' : 'text-green-500'}`}>
              {formatCurrency(totalSpent)}
            </p>
          </div>
          <div className="p-3 rounded-xl bg-background/30 text-center">
            <p className="text-xs text-muted-foreground">Remaining</p>
            <p className={`text-lg font-bold ${totalBudget - totalSpent < 0 ? 'text-red-500' : 'text-emerald-500'}`}>
              {formatCurrency(totalBudget - totalSpent)}
            </p>
          </div>
        </div>
      )}

      {/* Add Budget Form */}
      {isAdding && (
        <div className="mb-4 p-4 rounded-xl bg-background/50 border border-white/10">
          <h4 className="text-sm font-medium mb-3">Add New Budget</h4>
          <div className="flex gap-3">
            <select
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              className="flex-1 px-3 py-2 rounded-lg bg-background/50 border border-white/10 text-sm"
            >
              <option value="">Select category</option>
              {categoriesWithoutBudget.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
            <input
              type="number"
              value={newLimit}
              onChange={(e) => setNewLimit(e.target.value)}
              placeholder="Budget limit"
              className="w-32 px-3 py-2 rounded-lg bg-background/50 border border-white/10 text-sm"
            />
            <button
              onClick={handleAddBudget}
              disabled={!newCategory || !newLimit}
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm disabled:opacity-50"
            >
              Add
            </button>
            <button
              onClick={() => setIsAdding(false)}
              className="px-4 py-2 rounded-lg bg-muted text-muted-foreground text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
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
              className={`p-4 rounded-xl border transition-all ${getStatusColor(budget.status)}`}
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
                      defaultValue={budget.limit}
                      onBlur={(e) => handleEditBudget(budget.category, Number.parseFloat(e.target.value))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleEditBudget(budget.category, Number.parseFloat((e.target as HTMLInputElement).value))
                        }
                      }}
                      className="w-24 px-2 py-1 rounded bg-background/50 border border-white/20 text-sm"
                      autoFocus
                    />
                  ) : (
                    <>
                      <span className="font-bold">{formatPercent(budget.percentage)}</span>
                      <button
                        onClick={() => setEditingCategory(budget.category)}
                        className="p-1 rounded hover:bg-white/10"
                      >
                        <Edit2 className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => removeBudget(budget.category)}
                        className="p-1 rounded hover:bg-white/10 text-red-400"
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
                  className={`h-full transition-all duration-500 ${getProgressColor(budget.status)}`}
                  style={{ width: `${Math.min(100, budget.percentage)}%` }}
                />
              </div>
              
              <div className="flex justify-between text-xs">
                <span>Spent: {formatCurrency(budget.spent)}</span>
                <span>Budget: {formatCurrency(budget.limit)}</span>
              </div>
              
              {budget.remaining < 0 ? (
                <p className="text-xs mt-1 text-red-400">
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
        <div className="mt-4 pt-4 border-t border-white/10">
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
                  className="px-3 py-1 rounded-full bg-primary/10 text-primary text-xs hover:bg-primary/20 transition-all"
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
