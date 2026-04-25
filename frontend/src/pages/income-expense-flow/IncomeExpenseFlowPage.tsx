import { useMemo, useEffect, useState } from 'react'

import { motion } from 'framer-motion'
import { ArrowRightLeft, TrendingUp, TrendingDown } from 'lucide-react'
import { Sankey, Tooltip } from 'recharts'

import { rawColors } from '@/constants/colors'
import { formatCurrency, formatPercent } from '@/lib/formatters'
import { useTransactions } from '@/hooks/api/useTransactions'
import AnalyticsTimeFilter from '@/components/shared/AnalyticsTimeFilter'
import { getDateKey } from '@/lib/dateUtils'
import { useAnalyticsTimeFilter } from '@/hooks/useAnalyticsTimeFilter'
import { PageHeader, ChartContainer } from '@/components/ui'
import { chartTooltipProps } from '@/components/ui/ChartTooltip'

/** Guard against NaN values that Recharts passes for zero-value nodes */
function safeNumber(value: number): number {
  return Number.isFinite(value) ? value : 0
}

/** Determine the fill color for a Sankey node based on its position in the diagram */
function getNodeFillColor(
  index: number,
  incomeCategoryCount: number,
  totalIncomeNodeIndex: number,
  savingsNodeIndex: number,
  expensesNodeIndex: number,
): string {
  if (index < incomeCategoryCount) {
    const greenColors = [rawColors.app.green, rawColors.app.green, rawColors.app.greenVibrant, rawColors.app.teal, rawColors.app.tealVibrant]
    return greenColors[index % greenColors.length]
  }

  if (index === totalIncomeNodeIndex) return rawColors.app.indigoVibrant
  if (index === savingsNodeIndex) return rawColors.app.purple
  if (index === expensesNodeIndex) return rawColors.app.pink

  const redColors = [rawColors.app.red, rawColors.app.orange, rawColors.app.orangeVibrant, rawColors.app.yellow, rawColors.app.redVibrant]
  const expenseIndex = index - (incomeCategoryCount + 3)
  return redColors[expenseIndex % redColors.length]
}

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
  readonly chartWidth: number
  readonly fontSize: number
}

const SankeyNodeRenderer = ({
  x: rawX,
  y: rawY,
  width: rawWidth,
  height: rawHeight,
  index,
  payload,
  nodeValues,
  incomeCategoryCount,
  totalIncomeNodeIndex,
  savingsNodeIndex,
  expensesNodeIndex,
  totalIncome,
  chartWidth,
  fontSize,
}: SankeyNodeRendererProps) => {
  const x = safeNumber(rawX)
  const y = safeNumber(rawY)
  const width = safeNumber(rawWidth)
  const height = safeNumber(rawHeight)

  const value = nodeValues.get(index) || 0
  const percentage = totalIncome > 0 ? ((value / totalIncome) * 100).toFixed(1) : '0'
  const fillColor = getNodeFillColor(index, incomeCategoryCount, totalIncomeNodeIndex, savingsNodeIndex, expensesNodeIndex)

  // Position labels outside the node, on whichever side has more room (left vs right).
  const onLeftSide = x < chartWidth / 2
  const labelX = onLeftSide ? x - 8 : x + width + 8
  const anchor: 'end' | 'start' = onLeftSide ? 'end' : 'start'

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
      <text
        x={labelX}
        y={y + height / 2 - fontSize * 0.25}
        textAnchor={anchor}
        dominantBaseline="middle"
        fill="#ffffff"
        fontSize={fontSize}
        fontWeight="600"
      >
        {payload.name}
      </text>
      <text
        x={labelX}
        y={y + height / 2 + fontSize * 0.9}
        textAnchor={anchor}
        dominantBaseline="middle"
        fill={rawColors.app.purple}
        fontSize={fontSize - 2}
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
  readonly chartWidth: number
  readonly fontSize: number
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
      chartWidth={context.chartWidth}
      fontSize={context.fontSize}
    />
  )
  return SankeyNodeComponent
}

function useIsMobile(breakpoint = 640): boolean {
  const [isMobile, setIsMobile] = useState(
    () => globalThis.window !== undefined && globalThis.window.innerWidth < breakpoint,
  )
  useEffect(() => {
    const mq = globalThis.window.matchMedia(`(max-width: ${breakpoint - 1}px)`)
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [breakpoint])
  return isMobile
}

const IncomeExpenseFlowPage = () => {
  const { data: allTransactions = [], isLoading } = useTransactions()
  const isMobile = useIsMobile()

  const { dateRange, currentFY, timeFilterProps } = useAnalyticsTimeFilter(allTransactions)

  // Filter transactions based on selected time range
  const fyTransactions = useMemo(() => {
    const startDate = dateRange.start_date
    if (!startDate) return allTransactions.filter(txn => !txn.is_transfer)

    return allTransactions.filter(txn => {
      if (txn.is_transfer) return false
      const txDate = getDateKey(txn.date)
      return txDate >= startDate && (!dateRange.end_date || txDate <= dateRange.end_date)
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
    // Chart width passed into the node renderer for left/right label decisions.
    // On mobile the diagram is 720px (scrollable); on desktop it fills its container (~900px typical).
    const chartWidth = isMobile ? 720 : 900
    const sankeyNodeComponent = createSankeyNodeComponent({
      nodeValues,
      incomeCategoryCount,
      totalIncomeNodeIndex,
      savingsNodeIndex,
      expensesNodeIndex,
      totalIncome,
      chartWidth,
      fontSize: isMobile ? 11 : 13,
    })

    return {
      totalIncome, totalExpense, netSavings, savingsRate,
      sankeyData: { nodes, links },
      sankeyNodeComponent,
    }
  }, [fyTransactions, isMobile])

  return (
    <div className="min-h-screen p-4 md:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <PageHeader
          title="Income-Expense Flow"
          subtitle="Visualize how your income flows into savings and expenses"
          action={
            <AnalyticsTimeFilter {...timeFilterProps} />
          }
        />

      {/* Summary Cards */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6"
      >
        <div className="glass rounded-2xl border border-border border-l-4 border-l-app-green p-6">
          <div className="flex items-center gap-3 mb-2">
            <TrendingUp className="w-5 h-5 text-app-green" />
            <p className="text-sm text-muted-foreground">Total Income</p>
          </div>
          <p className="text-2xl font-bold text-app-green">
            {formatCurrency(totalIncome)}
          </p>
        </div>

        <div className="glass rounded-2xl border border-border border-l-4 border-l-app-red p-6">
          <div className="flex items-center gap-3 mb-2">
            <TrendingDown className="w-5 h-5 text-app-red" />
            <p className="text-sm text-muted-foreground">Total Expense</p>
          </div>
          <p className="text-2xl font-bold text-app-red">
            {formatCurrency(totalExpense)}
          </p>
        </div>

        <div className="glass rounded-2xl border border-border p-6">
          <div className="flex items-center gap-3 mb-2">
            <ArrowRightLeft className={`w-5 h-5 ${netSavings >= 0 ? 'text-primary' : 'text-app-red'}`} />
            <p className="text-sm text-muted-foreground">Net Savings</p>
          </div>
          <p className={`text-2xl font-bold ${netSavings >= 0 ? 'text-primary' : 'text-app-red'}`}>
            {formatCurrency(Math.abs(netSavings))}
          </p>
        </div>

        <div className="glass rounded-2xl border border-border p-6">
          <div className="flex items-center gap-3 mb-2">
            <TrendingUp className={`w-5 h-5 ${savingsRate >= 20 ? 'text-app-green' : 'text-app-yellow'}`} />
            <p className="text-sm text-muted-foreground">Savings Rate</p>
          </div>
          <p className={`text-2xl font-bold ${savingsRate >= 20 ? 'text-app-green' : 'text-app-yellow'}`}>
            {formatPercent(savingsRate)}
          </p>
        </div>
      </motion.div>

      {/* Sankey Diagram */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="glass rounded-2xl border border-border p-4 md:p-6 lg:p-8"
      >
        <div className="flex items-center justify-between mb-4 sm:mb-8">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-app-purple/20 rounded-xl">
              <ArrowRightLeft className="w-6 h-6 text-app-purple" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">Cash Flow Sankey</h3>
              <p className="text-sm text-muted-foreground">
                <span className="sm:hidden">Swipe to explore &rarr;</span>
                <span className="hidden sm:inline">Income sources flowing to savings and expenses</span>
              </p>
            </div>
          </div>
        </div>

        {isLoading && (
          <div className="h-[400px] md:h-[550px] lg:h-[700px] flex items-center justify-center bg-gradient-to-br from-background/50 to-surface-dropdown/50 rounded-xl border border-border">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-app-purple mx-auto mb-4"></div>
              <div className="text-muted-foreground">Loading flow diagram...</div>
            </div>
          </div>
        )}
        {!isLoading && sankeyData.nodes.length > 0 && (
          <div className="relative bg-gradient-to-br from-background/30 to-surface-dropdown/30 rounded-xl border border-border p-3 sm:p-6 overflow-x-auto data-table-scroll">
            {/* On mobile, fix the diagram to 720px so the Sankey has enough plot width
                and let users swipe horizontally. Desktop fills the container. */}
            <div
              style={{
                width: isMobile ? 720 : '100%',
                minWidth: isMobile ? 720 : undefined,
                height: isMobile ? 520 : 700,
                position: 'relative',
              }}
            >
              <ChartContainer height={isMobile ? 520 : 700}>
                <Sankey
                  data={sankeyData as { nodes: Array<{ name: string }>; links: Array<{ source: number; target: number; value: number }> }}
                  nodeWidth={isMobile ? 14 : 20}
                  nodePadding={isMobile ? 30 : 60}
                  margin={{
                    top: 20,
                    right: isMobile ? 110 : 200,
                    bottom: 20,
                    left: isMobile ? 110 : 200,
                  }}
                  node={sankeyNodeComponent}
                  link={{
                    stroke: rawColors.app.purple,
                    strokeOpacity: 0.25,
                  }}
                >
                  <defs>
                    <linearGradient id="incomeGradient" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor={rawColors.app.green} stopOpacity={0.8} />
                      <stop offset="100%" stopColor={rawColors.app.green} stopOpacity={0.8} />
                    </linearGradient>
                    <linearGradient id="middleGradient" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor={rawColors.app.indigo} stopOpacity={0.9} />
                      <stop offset="100%" stopColor={rawColors.app.purple} stopOpacity={0.9} />
                    </linearGradient>
                    <linearGradient id="expenseGradient" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor={rawColors.app.red} stopOpacity={0.8} />
                      <stop offset="100%" stopColor={rawColors.app.orange} stopOpacity={0.8} />
                    </linearGradient>
                  </defs>
                  <Tooltip
                    {...chartTooltipProps}
                    formatter={(value: number | undefined) => value === undefined ? '' : [
                      formatCurrency(value),
                      'Amount'
                    ]}
                  />
                </Sankey>
              </ChartContainer>
            </div>

            {/* Legend */}
            <div className="mt-6 pt-6 border-t border-border flex flex-wrap justify-center gap-6">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded" style={{ background: `linear-gradient(to right, ${rawColors.app.green}, ${rawColors.app.greenVibrant})` }}></div>
                <span className="text-sm text-foreground">Income Sources</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded" style={{ background: `linear-gradient(to right, ${rawColors.app.indigo}, ${rawColors.app.purple})` }}></div>
                <span className="text-sm text-foreground">Total Income / Savings / Expenses</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded" style={{ background: `linear-gradient(to right, ${rawColors.app.red}, ${rawColors.app.orange})` }}></div>
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
