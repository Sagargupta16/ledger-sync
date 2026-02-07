import { motion } from 'framer-motion'
import { ArrowUpRight, ArrowDownRight, Minus, Calendar } from 'lucide-react'
import { useState, useMemo } from 'react'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts'
import { useTransactions } from '@/hooks/api/useTransactions'
import { formatCurrency, formatCurrencyShort } from '@/lib/formatters'
import { chartTooltipProps } from '@/components/ui'
import { SEMANTIC_COLORS } from '@/constants/chartColors'

// Get Financial Year from date (April to March)
const getFY = (date: string): string => {
  const d = new Date(date)
  const month = d.getMonth()
  const year = d.getFullYear()
  if (month >= 3) {
    return `FY ${year}-${(year + 1).toString().slice(-2)}`
  }
  return `FY ${year - 1}-${year.toString().slice(-2)}`
}

interface FYData {
  fy: string
  income: number
  expense: number
  savings: number
  savingsRate: number
  transactions: number
  categories: Record<string, number>
}

export default function YearOverYearComparison() {
  const { data: transactions = [], isLoading } = useTransactions()
  const [selectedCategory, setSelectedCategory] = useState<string>('all')

  // Group transactions by FY
  const fyData = useMemo(() => {
    const grouped: Record<string, FYData> = {}

    transactions.forEach((tx) => {
      const fy = getFY(tx.date)
      if (!grouped[fy]) {
        grouped[fy] = {
          fy,
          income: 0,
          expense: 0,
          savings: 0,
          savingsRate: 0,
          transactions: 0,
          categories: {},
        }
      }

      grouped[fy].transactions++

      if (tx.type === 'Income') {
        grouped[fy].income += Math.abs(tx.amount)
      } else if (tx.type === 'Expense') {
        grouped[fy].expense += Math.abs(tx.amount)
        grouped[fy].categories[tx.category] = (grouped[fy].categories[tx.category] || 0) + Math.abs(tx.amount)
      }
    })

    // Calculate savings
    Object.values(grouped).forEach((fy) => {
      fy.savings = fy.income - fy.expense
      fy.savingsRate = fy.income > 0 ? (fy.savings / fy.income) * 100 : 0
    })

    return Object.values(grouped).sort((a, b) => a.fy.localeCompare(b.fy))
  }, [transactions])

  // Get all unique categories
  const allCategories = useMemo(() => {
    const cats = new Set<string>()
    fyData.forEach((fy) => {
      Object.keys(fy.categories).forEach((cat) => cats.add(cat))
    })
    return Array.from(cats).sort((a, b) => a.localeCompare(b))
  }, [fyData])

  // Compare latest two FYs
  const comparison = useMemo(() => {
    if (fyData.length < 2) return null
    const current = fyData[fyData.length - 1]
    const previous = fyData[fyData.length - 2]

    const incomeChange = previous.income > 0 ? ((current.income - previous.income) / previous.income) * 100 : 0
    const expenseChange = previous.expense > 0 ? ((current.expense - previous.expense) / previous.expense) * 100 : 0
    const savingsChange = previous.savings !== 0 ? ((current.savings - previous.savings) / previous.savings) * 100 : 0

    // Category comparison
    const categoryChanges: Array<{ category: string; current: number; previous: number; change: number }> = []
    const allCats = new Set([...Object.keys(current.categories), ...Object.keys(previous.categories)])
    allCats.forEach((cat) => {
      const curr = current.categories[cat] || 0
      const prev = previous.categories[cat] || 0
      const change = prev > 0 ? ((curr - prev) / prev) * 100 : curr > 0 ? 100 : 0
      categoryChanges.push({ category: cat, current: curr, previous: prev, change })
    })

    return {
      current,
      previous,
      incomeChange,
      expenseChange,
      savingsChange,
      categoryChanges: categoryChanges.sort((a, b) => Math.abs(b.change) - Math.abs(a.change)),
    }
  }, [fyData])

  // Chart data
  const chartData = useMemo(() => {
    if (selectedCategory === 'all') {
      return fyData.map((fy) => ({
        name: fy.fy,
        Income: fy.income,
        Expenses: fy.expense,
        Savings: fy.savings,
      }))
    }
    return fyData.map((fy) => ({
      name: fy.fy,
      [selectedCategory]: fy.categories[selectedCategory] || 0,
    }))
  }, [fyData, selectedCategory])

  const getChangeIcon = (change: number) => {
    if (Math.abs(change) < 2) return <Minus className="w-4 h-4 text-muted-foreground" />
    if (change > 0) return <ArrowUpRight className="w-4 h-4 text-ios-green" />
    return <ArrowDownRight className="w-4 h-4 text-ios-red" />
  }

  const getChangeColor = (change: number, isExpense = false) => {
    if (Math.abs(change) < 2) return 'text-muted-foreground'
    if (isExpense) {
      return change > 0 ? 'text-ios-red' : 'text-ios-green'
    }
    return change > 0 ? 'text-ios-green' : 'text-ios-red'
  }

  if (isLoading) {
    return (
      <div className="glass rounded-2xl border border-white/10 p-6 animate-pulse">
        <div className="h-8 bg-muted rounded w-1/3 mb-4" />
        <div className="h-64 bg-muted rounded" />
      </div>
    )
  }

  if (fyData.length < 2) {
    return (
      <div className="glass rounded-2xl border border-white/10 p-6">
        <h3 className="text-lg font-semibold mb-2">Year-over-Year Comparison</h3>
        <p className="text-muted-foreground">Need at least 2 financial years of data for comparison.</p>
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-2xl border border-white/10 p-6 shadow-xl"
    >
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-ios-purple/20 rounded-xl">
            <Calendar className="w-6 h-6 text-ios-purple" />
          </div>
          <div>
            <h3 className="text-lg font-semibold">Year-over-Year Comparison</h3>
            <p className="text-sm text-muted-foreground">
              {comparison?.previous.fy} vs {comparison?.current.fy}
            </p>
          </div>
        </div>
        <select
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          className="px-3 py-2 rounded-lg bg-[rgba(44,44,46,0.6)] backdrop-blur-xl border border-white/10 text-sm text-white cursor-pointer hover:bg-[rgba(58,58,60,0.6)] transition-colors"
        >
          <option value="all">All Categories</option>
          {allCategories.map((cat) => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>
      </div>

      {/* Key Metrics Comparison */}
      {comparison && selectedCategory === 'all' && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="p-4 rounded-xl bg-ios-green/10 border border-ios-green/20">
            <p className="text-sm text-muted-foreground mb-1">Income Change</p>
            <div className="flex items-center gap-2">
              {getChangeIcon(comparison.incomeChange)}
              <span className={`text-xl font-bold ${getChangeColor(comparison.incomeChange)}`}>
                {comparison.incomeChange > 0 ? '+' : ''}{comparison.incomeChange.toFixed(1)}%
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {formatCurrencyShort(comparison.previous.income)} → {formatCurrencyShort(comparison.current.income)}
            </p>
          </div>
          <div className="p-4 rounded-xl bg-ios-red/10 border border-ios-red/20">
            <p className="text-sm text-muted-foreground mb-1">Expense Change</p>
            <div className="flex items-center gap-2">
              {getChangeIcon(comparison.expenseChange)}
              <span className={`text-xl font-bold ${getChangeColor(comparison.expenseChange, true)}`}>
                {comparison.expenseChange > 0 ? '+' : ''}{comparison.expenseChange.toFixed(1)}%
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {formatCurrencyShort(comparison.previous.expense)} → {formatCurrencyShort(comparison.current.expense)}
            </p>
          </div>
          <div className="p-4 rounded-xl bg-ios-blue/10 border border-ios-blue/20">
            <p className="text-sm text-muted-foreground mb-1">Savings Change</p>
            <div className="flex items-center gap-2">
              {getChangeIcon(comparison.savingsChange)}
              <span className={`text-xl font-bold ${getChangeColor(comparison.savingsChange)}`}>
                {comparison.savingsChange > 0 ? '+' : ''}{comparison.savingsChange.toFixed(1)}%
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {formatCurrencyShort(comparison.previous.savings)} → {formatCurrencyShort(comparison.current.savings)}
            </p>
          </div>
        </div>
      )}

      {/* Chart */}
      <div className="h-64 mb-6">
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
            <XAxis dataKey="name" tick={{ fontSize: 12 }} />
            <YAxis tickFormatter={(v) => formatCurrencyShort(v)} tick={{ fontSize: 12 }} />
            <Tooltip
              {...chartTooltipProps}
              formatter={(value: number | undefined) => value !== undefined ? formatCurrency(value) : ''}
            />
            <Legend />
            {selectedCategory === 'all' ? (
              <>
                <Bar dataKey="Income" fill={SEMANTIC_COLORS.income} radius={[4, 4, 0, 0]} />
                <Bar dataKey="Expenses" fill={SEMANTIC_COLORS.expense} radius={[4, 4, 0, 0]} />
                <Bar dataKey="Savings" fill={SEMANTIC_COLORS.investment} radius={[4, 4, 0, 0]} />
              </>
            ) : (
              <Bar dataKey={selectedCategory} fill={SEMANTIC_COLORS.savings} radius={[4, 4, 0, 0]} />
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Category Changes */}
      {comparison && selectedCategory === 'all' && (
        <div>
          <h4 className="text-sm font-medium mb-3">Biggest Category Changes</h4>
          <div className="grid grid-cols-2 gap-2">
            {comparison.categoryChanges.slice(0, 6).map((cat) => (
              <div
                key={cat.category}
                className="flex items-center justify-between p-2 rounded-lg bg-background/30"
              >
                <span className="text-sm truncate">{cat.category}</span>
                <span className={`text-sm font-medium ${getChangeColor(cat.change, true)}`}>
                  {cat.change > 0 ? '+' : ''}{cat.change.toFixed(0)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  )
}
