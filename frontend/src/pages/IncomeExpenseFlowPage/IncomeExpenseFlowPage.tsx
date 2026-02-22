import { motion } from 'framer-motion'
import { rawColors } from '@/constants/colors'
import { ArrowRightLeft, TrendingUp, TrendingDown } from 'lucide-react'
import { useState, useMemo } from 'react'
import { ResponsiveContainer, Sankey, Tooltip } from 'recharts'
import { formatCurrency, formatPercent } from '@/lib/formatters'
import { useTransactions } from '@/hooks/api/useTransactions'
import { usePreferences } from '@/hooks/api/usePreferences'
import AnalyticsTimeFilter from '@/components/shared/AnalyticsTimeFilter'
import { getCurrentYear, getCurrentMonth, getCurrentFY, getAnalyticsDateRange, getDateKey, type AnalyticsViewMode } from '@/lib/dateUtils'
import { usePreferencesStore } from '@/store/preferencesStore'
import { PageHeader } from '@/components/ui'

interface SankeyNodeRendererProps {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  readonly index: number
  readonly payload: { name: string }
  readonly nodeValues: Map<number, number>
  readonly incomeCategoryCount: number
  readonly totalIncomeNodeIndex: number
  readonly savingsNodeIndex: number
  readonly expensesNodeIndex: number
  readonly totalIncome: number
}

const SankeyNodeRenderer = ({
  x,
  y,
  width,
  height,
  index,
  payload,
  nodeValues,
  incomeCategoryCount,
  totalIncomeNodeIndex,
  savingsNodeIndex,
  expensesNodeIndex,
  totalIncome,
}: SankeyNodeRendererProps) => {
  const value = nodeValues.get(index) || 0
  const percentage = totalIncome > 0 ? ((value / totalIncome) * 100).toFixed(1) : '0'

  // Determine color based on position
  let fillColor: string
  if (index < incomeCategoryCount) {
    // Income nodes - green gradient
    const greenColors = [rawColors.ios.green, rawColors.ios.green, '#84cc16', '#a3e635', '#6ee7b7']
    fillColor = greenColors[index % greenColors.length]
  } else if (index === totalIncomeNodeIndex || index === savingsNodeIndex || index === expensesNodeIndex) {
    // Middle nodes - purple/blue
    if (index === totalIncomeNodeIndex) fillColor = rawColors.ios.indigoVibrant
    else if (index === savingsNodeIndex) fillColor = rawColors.ios.purple
    else fillColor = rawColors.ios.pink
  } else {
    // Expense nodes - red/orange gradient
    const redColors = [rawColors.ios.red, rawColors.ios.orange, '#fb923c', '#f97316', rawColors.ios.redVibrant]
    const expenseIndex = index - (incomeCategoryCount + 3)
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
        fill={rawColors.ios.purple}
        fontSize={11}
        fontWeight="500"
      >
        {formatCurrency(value)} ({percentage}%)
      </text>
    </g>
  )
}

interface SankeyNodeWrapperProps {
  readonly nodeValues: Map<number, number>
  readonly incomeCategoryCount: number
  readonly totalIncomeNodeIndex: number
  readonly savingsNodeIndex: number
  readonly expensesNodeIndex: number
  readonly totalIncome: number
}

function createSankeyNodeComponent(context: SankeyNodeWrapperProps) {
  const SankeyNodeComponent = (nodeProps: { x: number; y: number; width: number; height: number; index: number; payload: { name: string } }) => (
    <SankeyNodeRenderer
      {...nodeProps}
      nodeValues={context.nodeValues}
      incomeCategoryCount={context.incomeCategoryCount}
      totalIncomeNodeIndex={context.totalIncomeNodeIndex}
      savingsNodeIndex={context.savingsNodeIndex}
      expensesNodeIndex={context.expensesNodeIndex}
      totalIncome={context.totalIncome}
    />
  )
  return SankeyNodeComponent
}

const IncomeExpenseFlowPage = () => {
  const { data: allTransactions = [], isLoading } = useTransactions()
  const { data: preferences } = usePreferences()
  const fiscalYearStartMonth = preferences?.fiscal_year_start_month || 4

  // Time filter state
  const { displayPreferences } = usePreferencesStore()
  const [viewMode, setViewMode] = useState<AnalyticsViewMode>(
    (displayPreferences.defaultTimeRange as AnalyticsViewMode) || 'fy'
  )
  const [currentYear, setCurrentYear] = useState(getCurrentYear())
  const [currentMonth, setCurrentMonth] = useState(getCurrentMonth())
  const [currentFY, setCurrentFY] = useState(getCurrentFY(fiscalYearStartMonth))

  // Get date range based on current filter
  const dateRange = useMemo(() => {
    return getAnalyticsDateRange(viewMode, currentYear, currentMonth, currentFY, fiscalYearStartMonth)
  }, [viewMode, currentYear, currentMonth, currentFY, fiscalYearStartMonth])

  const dataDateRange = useMemo(() => {
    if (allTransactions.length === 0) return { minDate: undefined, maxDate: undefined }
    const dates = allTransactions.map(t => t.date.substring(0, 10)).sort()
    return { minDate: dates[0], maxDate: dates[dates.length - 1] }
  }, [allTransactions])

  // Filter transactions based on selected time range
  const fyTransactions = useMemo(() => {
    if (!dateRange.start_date) return allTransactions.filter(txn => !txn.is_transfer)
    
    return allTransactions.filter(txn => {
      if (txn.is_transfer) return false
      // Compare only the date part (YYYY-MM-DD) to handle datetime strings correctly
      const txDate = getDateKey(txn.date)
      return txDate >= dateRange.start_date! && (!dateRange.end_date || txDate <= dateRange.end_date)
    })
  }, [allTransactions, dateRange])

  // Calculate income and expense totals by category and prepare Sankey data
  const {
    totalIncome, totalExpense, netSavings, savingsRate,
    sankeyData, sankeyNodeComponent,
  } = useMemo(() => {
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
    nodeValues.set(nodeIndex, Math.max(netSavings, 0))
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

    const incomeCategoryCount = Object.keys(incomeByCategory).length
    const sankeyNodeComponent = createSankeyNodeComponent({
      nodeValues,
      incomeCategoryCount,
      totalIncomeNodeIndex,
      savingsNodeIndex,
      expensesNodeIndex,
      totalIncome,
    })

    return {
      totalIncome, totalExpense, netSavings, savingsRate,
      sankeyData: { nodes, links },
      sankeyNodeComponent,
    }
  }, [fyTransactions])

  return (
    <div className="min-h-screen p-4 md:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <PageHeader
          title="Income-Expense Flow"
          subtitle="Visualize how your income flows into savings and expenses"
          action={
            <AnalyticsTimeFilter
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              currentYear={currentYear}
              currentMonth={currentMonth}
              currentFY={currentFY}
              onYearChange={setCurrentYear}
              onMonthChange={setCurrentMonth}
              onFYChange={setCurrentFY}
              minDate={dataDateRange.minDate}
              maxDate={dataDateRange.maxDate}
              fiscalYearStartMonth={fiscalYearStartMonth}
            />
          }
        />

      {/* Summary Cards */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6"
      >
        <div className="glass rounded-xl border border-border p-6 shadow-lg">
          <div className="flex items-center gap-3 mb-2">
            <TrendingUp className="w-5 h-5 text-ios-green" />
            <p className="text-sm text-muted-foreground">Total Income</p>
          </div>
          <p className="text-2xl font-bold text-ios-green">
            {formatCurrency(totalIncome)}
          </p>
        </div>

        <div className="glass rounded-xl border border-border p-6 shadow-lg">
          <div className="flex items-center gap-3 mb-2">
            <TrendingDown className="w-5 h-5 text-ios-red" />
            <p className="text-sm text-muted-foreground">Total Expense</p>
          </div>
          <p className="text-2xl font-bold text-ios-red">
            {formatCurrency(totalExpense)}
          </p>
        </div>

        <div className="glass rounded-xl border border-border p-6 shadow-lg">
          <div className="flex items-center gap-3 mb-2">
            <ArrowRightLeft className={`w-5 h-5 ${netSavings >= 0 ? 'text-primary' : 'text-ios-red'}`} />
            <p className="text-sm text-muted-foreground">Net Savings</p>
          </div>
          <p className={`text-2xl font-bold ${netSavings >= 0 ? 'text-primary' : 'text-ios-red'}`}>
            {formatCurrency(Math.abs(netSavings))}
          </p>
        </div>

        <div className="glass rounded-xl border border-border p-6 shadow-lg">
          <div className="flex items-center gap-3 mb-2">
            <TrendingUp className={`w-5 h-5 ${savingsRate >= 20 ? 'text-ios-green' : 'text-ios-yellow'}`} />
            <p className="text-sm text-muted-foreground">Savings Rate</p>
          </div>
          <p className={`text-2xl font-bold ${savingsRate >= 20 ? 'text-ios-green' : 'text-ios-yellow'}`}>
            {formatPercent(savingsRate)}
          </p>
        </div>
      </motion.div>

      {/* Sankey Diagram */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="glass rounded-xl border border-border p-4 md:p-6 lg:p-8 shadow-lg"
      >
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-ios-purple/20 rounded-xl shadow-lg shadow-ios-purple/30">
              <ArrowRightLeft className="w-6 h-6 text-ios-purple" />
            </div>
            <div>
              <h3 className="text-xl font-semibold text-white">Cash Flow Sankey</h3>
              <p className="text-sm text-muted-foreground">Income sources flowing to savings and expenses</p>
            </div>
          </div>
        </div>

        {isLoading && (
          <div className="h-[400px] md:h-[550px] lg:h-[700px] flex items-center justify-center bg-gradient-to-br from-background/50 to-surface-dropdown/50 rounded-xl border border-border">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-ios-purple mx-auto mb-4"></div>
              <div className="text-muted-foreground">Loading flow diagram...</div>
            </div>
          </div>
        )}
        {!isLoading && sankeyData.nodes.length > 0 && (
          <div className="relative bg-gradient-to-br from-background/30 to-surface-dropdown/30 rounded-xl border border-border p-6 overflow-x-auto">
            <div style={{ minWidth: "min(1000px, 90vw)", height: '700px', position: 'relative' }}>
              <ResponsiveContainer width="100%" height={typeof globalThis.window !== 'undefined' && globalThis.window.innerWidth < 768 ? 400 : 700}>
                <Sankey
                  data={sankeyData as { nodes: Array<{ name: string }>; links: Array<{ source: number; target: number; value: number }> }}
                  nodeWidth={20}
                  nodePadding={60}
                  margin={{ top: 30, right: 200, bottom: 30, left: 200 }}
                  node={sankeyNodeComponent}
                  link={{
                    stroke: rawColors.ios.purple,
                    strokeOpacity: 0.25,
                  }}
                >
                  <defs>
                    <linearGradient id="incomeGradient" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor={rawColors.ios.green} stopOpacity={0.8} />
                      <stop offset="100%" stopColor={rawColors.ios.green} stopOpacity={0.8} />
                    </linearGradient>
                    <linearGradient id="middleGradient" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor={rawColors.ios.indigo} stopOpacity={0.9} />
                      <stop offset="100%" stopColor={rawColors.ios.purple} stopOpacity={0.9} />
                    </linearGradient>
                    <linearGradient id="expenseGradient" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor={rawColors.ios.red} stopOpacity={0.8} />
                      <stop offset="100%" stopColor={rawColors.ios.orange} stopOpacity={0.8} />
                    </linearGradient>
                  </defs>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'rgba(17, 24, 39, 0.95)',
                      border: '1px solid rgba(139, 92, 246, 0.2)',
                      borderRadius: '12px',
                      backdropFilter: 'blur(12px)',
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
                      color: rawColors.ios.purple,
                      fontSize: '13px',
                    }}
                    formatter={(value: number | undefined) => value === undefined ? '' : [
                      formatCurrency(value),
                      'Amount'
                    ]}
                  />
                </Sankey>
              </ResponsiveContainer>
            </div>

            {/* Legend */}
            <div className="mt-6 pt-6 border-t border-border flex flex-wrap justify-center gap-6">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded" style={{ background: 'linear-gradient(to right, #34c759, #30d158)' }}></div>
                <span className="text-sm text-foreground">Income Sources</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded" style={{ background: 'linear-gradient(to right, #818cf8, #a78bfa)' }}></div>
                <span className="text-sm text-foreground">Total Income / Savings / Expenses</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded" style={{ background: 'linear-gradient(to right, #ff6b6b, #ff9f43)' }}></div>
                <span className="text-sm text-foreground">Expense Categories</span>
              </div>
            </div>
          </div>
        )}
        {!isLoading && sankeyData.nodes.length === 0 && (
          <div className="h-[400px] md:h-[550px] lg:h-[700px] flex items-center justify-center bg-gradient-to-br from-background/50 to-surface-dropdown/50 rounded-xl border border-border">
            <div className="text-center">
              <ArrowRightLeft className="w-16 h-16 text-text-quaternary mx-auto mb-4" />
              <p className="text-muted-foreground text-lg">No transaction data available for FY {currentFY}</p>
              <p className="text-text-tertiary text-sm mt-2">Select a different financial year or upload transaction data</p>
            </div>
          </div>
        )}
      </motion.div>
      </div>
    </div>
  )
}

export default IncomeExpenseFlowPage
