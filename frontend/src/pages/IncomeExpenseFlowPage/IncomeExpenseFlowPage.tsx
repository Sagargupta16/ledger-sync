import { motion } from 'framer-motion'
import { ArrowRightLeft, TrendingUp, TrendingDown } from 'lucide-react'
import { useState, useMemo } from 'react'
import { ResponsiveContainer, Sankey, Tooltip } from 'recharts'
import { formatCurrency, formatPercent } from '@/lib/formatters'
import { useTransactions } from '@/hooks/api/useTransactions'
import { usePreferences } from '@/hooks/api/usePreferences'
import AnalyticsTimeFilter from '@/components/shared/AnalyticsTimeFilter'
import { getCurrentYear, getCurrentMonth, getCurrentFY, getAnalyticsDateRange, type AnalyticsViewMode } from '@/lib/dateUtils'

const IncomeExpenseFlowPage = () => {
  const { data: allTransactions = [], isLoading } = useTransactions()
  const { data: preferences } = usePreferences()
  const fiscalYearStartMonth = preferences?.fiscal_year_start_month || 4

  // Time filter state
  const [viewMode, setViewMode] = useState<AnalyticsViewMode>('fy')
  const [currentYear, setCurrentYear] = useState(getCurrentYear())
  const [currentMonth, setCurrentMonth] = useState(getCurrentMonth())
  const [currentFY, setCurrentFY] = useState(getCurrentFY(fiscalYearStartMonth))

  // Get date range based on current filter
  const dateRange = useMemo(() => {
    return getAnalyticsDateRange(viewMode, currentYear, currentMonth, currentFY, fiscalYearStartMonth)
  }, [viewMode, currentYear, currentMonth, currentFY, fiscalYearStartMonth])

  // Filter transactions based on selected time range
  const fyTransactions = useMemo(() => {
    if (!dateRange.start_date) return allTransactions.filter(txn => !txn.is_transfer)
    
    return allTransactions.filter(txn => {
      if (txn.is_transfer) return false
      return txn.date >= dateRange.start_date! && (!dateRange.end_date || txn.date <= dateRange.end_date)
    })
  }, [allTransactions, dateRange])

  // Calculate income and expense totals by category
  const incomeByCategory = fyTransactions
    .filter(txn => txn.type === 'Income')
    .reduce((acc, txn) => {
      const category = txn.category || 'Other Income'
      acc[category] = (acc[category] || 0) + txn.amount
      return acc
    }, {} as Record<string, number>)

  const expenseByCategory = fyTransactions
    .filter(txn => txn.type === 'Expense')
    .reduce((acc, txn) => {
      const category = txn.category || 'Other Expense'
      acc[category] = (acc[category] || 0) + txn.amount
      return acc
    }, {} as Record<string, number>)

  const totalIncome = Object.values(incomeByCategory).reduce((a, b) => a + b, 0)
  const totalExpense = Object.values(expenseByCategory).reduce((a, b) => a + b, 0)
  const netSavings = totalIncome - totalExpense
  const savingsRate = totalIncome > 0 ? (netSavings / totalIncome) * 100 : 0

  // Prepare Sankey data
  const nodes: Array<{ name: string; color?: string }> = []
  const links: Array<{ source: number; target: number; value: number; color?: string }> = []
  let nodeIndex = 0
  const nodeMap = new Map<string, number>()
  const nodeValues = new Map<number, number>()

  // Add income categories as source nodes (top 10)
  Object.entries(incomeByCategory)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .forEach(([category, amount]) => {
      nodeMap.set(category, nodeIndex)
      nodeValues.set(nodeIndex, amount)
      nodes.push({ name: category })
      nodeIndex++
    })

  // Add "Total Income" as middle node
  const totalIncomeNodeIndex = nodeIndex
  nodeValues.set(nodeIndex, totalIncome)
  nodes.push({ name: 'Total Income' })
  nodeIndex++

  // Add "Savings" and "Expenses" as target nodes
  const savingsNodeIndex = nodeIndex
  nodeValues.set(nodeIndex, netSavings > 0 ? netSavings : 0)
  nodes.push({ name: 'Savings' })
  nodeIndex++

  const expensesNodeIndex = nodeIndex
  nodeValues.set(nodeIndex, totalExpense)
  nodes.push({ name: 'Expenses' })
  nodeIndex++

  // Add expense categories as final target nodes (top 10)
  Object.entries(expenseByCategory)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .forEach(([category, amount]) => {
      nodeMap.set(`expense_${category}`, nodeIndex)
      nodeValues.set(nodeIndex, amount)
      nodes.push({ name: category })
      nodeIndex++
    })

  // Create links from income categories to Total Income
  Object.entries(incomeByCategory)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .forEach(([category, amount]) => {
      const sourceIndex = nodeMap.get(category)
      if (sourceIndex !== undefined) {
        links.push({
          source: sourceIndex,
          target: totalIncomeNodeIndex,
          value: amount
        })
      }
    })

  // Link from Total Income to Savings
  if (netSavings > 0) {
    links.push({
      source: totalIncomeNodeIndex,
      target: savingsNodeIndex,
      value: netSavings
    })
  }

  // Link from Total Income to Expenses
  if (totalExpense > 0) {
    links.push({
      source: totalIncomeNodeIndex,
      target: expensesNodeIndex,
      value: totalExpense
    })
  }

  // Create links from Expenses to expense categories
  Object.entries(expenseByCategory)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .forEach(([category, amount]) => {
      const targetIndex = nodeMap.get(`expense_${category}`)
      if (targetIndex !== undefined) {
        links.push({
          source: expensesNodeIndex,
          target: targetIndex,
          value: amount
        })
      }
    })

  const sankeyData = { nodes, links }

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <h1 className="text-4xl font-bold bg-gradient-to-r from-primary via-purple-400 to-secondary bg-clip-text text-transparent drop-shadow-lg">
            Income-Expense Flow
          </h1>
          <p className="text-muted-foreground mt-2">
            Visualize how your income flows into savings and expenses
          </p>
        </motion.div>

        {/* Analytics Time Filter */}
        <AnalyticsTimeFilter
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          currentYear={currentYear}
          currentMonth={currentMonth}
          currentFY={currentFY}
          onYearChange={setCurrentYear}
          onMonthChange={setCurrentMonth}
          onFYChange={setCurrentFY}
        />

      {/* Summary Cards */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="grid grid-cols-1 md:grid-cols-4 gap-6"
      >
        <div className="glass rounded-xl border border-white/10 p-6 shadow-lg">
          <div className="flex items-center gap-3 mb-2">
            <TrendingUp className="w-5 h-5 text-green-500" />
            <p className="text-sm text-muted-foreground">Total Income</p>
          </div>
          <p className="text-2xl font-bold text-green-400">
            {formatCurrency(totalIncome)}
          </p>
        </div>

        <div className="glass rounded-xl border border-white/10 p-6 shadow-lg">
          <div className="flex items-center gap-3 mb-2">
            <TrendingDown className="w-5 h-5 text-red-500" />
            <p className="text-sm text-muted-foreground">Total Expense</p>
          </div>
          <p className="text-2xl font-bold text-red-400">
            {formatCurrency(totalExpense)}
          </p>
        </div>

        <div className="glass rounded-xl border border-white/10 p-6 shadow-lg">
          <div className="flex items-center gap-3 mb-2">
            <ArrowRightLeft className={`w-5 h-5 ${netSavings >= 0 ? 'text-primary' : 'text-red-500'}`} />
            <p className="text-sm text-muted-foreground">Net Savings</p>
          </div>
          <p className={`text-2xl font-bold ${netSavings >= 0 ? 'text-primary' : 'text-red-400'}`}>
            {formatCurrency(Math.abs(netSavings))}
          </p>
        </div>

        <div className="glass rounded-xl border border-white/10 p-6 shadow-lg">
          <div className="flex items-center gap-3 mb-2">
            <TrendingUp className={`w-5 h-5 ${savingsRate >= 20 ? 'text-green-500' : 'text-yellow-500'}`} />
            <p className="text-sm text-muted-foreground">Savings Rate</p>
          </div>
          <p className={`text-2xl font-bold ${savingsRate >= 20 ? 'text-green-400' : 'text-yellow-400'}`}>
            {formatPercent(savingsRate)}
          </p>
        </div>
      </motion.div>

      {/* Sankey Diagram */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="glass rounded-xl border border-white/10 p-8 shadow-lg"
      >
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-purple-500/20 rounded-xl shadow-lg shadow-purple-500/30">
              <ArrowRightLeft className="w-6 h-6 text-purple-400" />
            </div>
            <div>
              <h3 className="text-xl font-semibold text-white">Cash Flow Sankey</h3>
              <p className="text-sm text-muted-foreground">Income sources flowing to savings and expenses</p>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="h-[700px] flex items-center justify-center bg-gradient-to-br from-gray-900/50 to-gray-800/50 rounded-xl border border-white/5">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 mx-auto mb-4"></div>
              <div className="text-gray-400">Loading flow diagram...</div>
            </div>
          </div>
        ) : nodes.length > 0 ? (
          <div className="relative bg-gradient-to-br from-gray-900/30 to-gray-800/30 rounded-xl border border-white/5 p-6 overflow-x-auto">
            <div style={{ minWidth: '1000px', height: '700px', position: 'relative' }}>
              <ResponsiveContainer width="100%" height={700}>
                <Sankey
                  data={sankeyData as { nodes: Array<{ name: string }>; links: Array<{ source: number; target: number; value: number }> }}
                  nodeWidth={20}
                  nodePadding={60}
                  margin={{ top: 30, right: 200, bottom: 30, left: 200 }}
                  node={(nodeProps: { x: number; y: number; width: number; height: number; index: number; payload: { name: string } }) => {
                    const { x, y, width, height, index, payload } = nodeProps
                    const value = nodeValues.get(index) || 0
                    const percentage = totalIncome > 0 ? ((value / totalIncome) * 100).toFixed(1) : '0'
                    
                    // Determine color based on position
                    let fillColor = '#8b5cf6'
                    if (index < Object.keys(incomeByCategory).length) {
                      // Income nodes - green gradient
                      const greenColors = ['#10b981', '#22c55e', '#84cc16', '#a3e635', '#6ee7b7']
                      fillColor = greenColors[index % greenColors.length]
                    } else if (index === totalIncomeNodeIndex || index === savingsNodeIndex || index === expensesNodeIndex) {
                      // Middle nodes - purple/blue
                      if (index === totalIncomeNodeIndex) fillColor = '#6366f1'
                      else if (index === savingsNodeIndex) fillColor = '#8b5cf6'
                      else fillColor = '#ec4899'
                    } else {
                      // Expense nodes - red/orange gradient
                      const redColors = ['#ef4444', '#f59e0b', '#fb923c', '#f97316', '#dc2626']
                      const expenseIndex = index - (Object.keys(incomeByCategory).length + 3)
                      fillColor = redColors[expenseIndex % redColors.length]
                    }

                    return (
                      <g>
                        <rect
                          x={x}
                          y={y}
                          width={width}
                          height={height}
                          fill={fillColor}
                          fillOpacity={0.9}
                          stroke={fillColor}
                          strokeWidth={0}
                          rx={4}
                          ry={4}
                        />
                        {/* Node label - positioned to the side */}
                        <text
                          x={x < 400 ? x - 10 : x + width + 10}
                          y={y + height / 2}
                          textAnchor={x < 400 ? 'end' : 'start'}
                          dominantBaseline="middle"
                          fill="#ffffff"
                          fontSize={13}
                          fontWeight="600"
                        >
                          {payload.name}
                        </text>
                        {/* Value and percentage */}
                        <text
                          x={x < 400 ? x - 10 : x + width + 10}
                          y={y + height / 2 + 16}
                          textAnchor={x < 400 ? 'end' : 'start'}
                          dominantBaseline="middle"
                          fill="#a78bfa"
                          fontSize={11}
                          fontWeight="500"
                        >
                          {formatCurrency(value)} ({percentage}%)
                        </text>
                      </g>
                    )
                  }}
                  link={{
                    stroke: '#8b5cf6',
                    strokeOpacity: 0.25,
                  }}
                >
                  <defs>
                    <linearGradient id="incomeGradient" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#10b981" stopOpacity={0.8} />
                      <stop offset="100%" stopColor="#22c55e" stopOpacity={0.8} />
                    </linearGradient>
                    <linearGradient id="middleGradient" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#6366f1" stopOpacity={0.9} />
                      <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0.9} />
                    </linearGradient>
                    <linearGradient id="expenseGradient" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#ef4444" stopOpacity={0.8} />
                      <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.8} />
                    </linearGradient>
                  </defs>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'rgba(17, 24, 39, 0.98)',
                      border: '1px solid rgba(139, 92, 246, 0.5)',
                      borderRadius: '12px',
                      backdropFilter: 'blur(10px)',
                      padding: '12px 16px',
                      boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
                    }}
                    labelStyle={{
                      color: '#ffffff',
                      fontWeight: 'bold',
                      fontSize: '14px',
                      marginBottom: '4px',
                    }}
                    itemStyle={{
                      color: '#a78bfa',
                      fontSize: '13px',
                    }}
                    formatter={(value: number) => [
                      formatCurrency(value),
                      'Amount'
                    ]}
                  />
                </Sankey>
              </ResponsiveContainer>
            </div>
            
            {/* Legend */}
            <div className="mt-6 pt-6 border-t border-white/10 flex flex-wrap justify-center gap-6">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded" style={{ background: 'linear-gradient(to right, #10b981, #22c55e)' }}></div>
                <span className="text-sm text-gray-300">Income Sources</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded" style={{ background: 'linear-gradient(to right, #6366f1, #8b5cf6)' }}></div>
                <span className="text-sm text-gray-300">Total Income / Savings / Expenses</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded" style={{ background: 'linear-gradient(to right, #ef4444, #f59e0b)' }}></div>
                <span className="text-sm text-gray-300">Expense Categories</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="h-[700px] flex items-center justify-center bg-gradient-to-br from-gray-900/50 to-gray-800/50 rounded-xl border border-white/5">
            <div className="text-center">
              <ArrowRightLeft className="w-16 h-16 text-gray-600 mx-auto mb-4" />
              <p className="text-gray-400 text-lg">No transaction data available for FY {selectedFY}</p>
              <p className="text-gray-500 text-sm mt-2">Select a different financial year or upload transaction data</p>
            </div>
          </div>
        )}
      </motion.div>
      </div>
    </div>
  )
}

export default IncomeExpenseFlowPage
