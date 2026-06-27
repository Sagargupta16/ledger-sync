import { useMemo } from 'react'

import { useTransactions } from '@/hooks/api/useTransactions'
import { useAnalyticsTimeFilter } from '@/hooks/useAnalyticsTimeFilter'
import { useIsMobile } from '@/hooks/useIsMobile'
import { getDateKey } from '@/lib/dateUtils'

import { createSankeyNodeComponent } from './components/SankeyNodeRenderer'

export function useIncomeExpenseFlow() {
  const { data: allTransactions = [], isLoading } = useTransactions()
  // Gate the horizontal Sankey to lg+ (>=1024px): it uses left/right:200 margins
  // that crush a tablet, so phones and tablets get the vertical MobileFlowView.
  const isMobile = useIsMobile(1024)

  const { dateRange, currentFY, timeFilterProps } = useAnalyticsTimeFilter(allTransactions)

  const fyTransactions = useMemo(() => {
    const startDate = dateRange.start_date
    if (!startDate) return allTransactions.filter((txn) => !txn.is_transfer)

    return allTransactions.filter((txn) => {
      if (txn.is_transfer) return false
      const txDate = getDateKey(txn.date)
      return txDate >= startDate && (!dateRange.end_date || txDate <= dateRange.end_date)
    })
  }, [allTransactions, dateRange])

  const computed = useMemo(() => {
    const incomeByCategory = fyTransactions
      .filter((txn) => txn.type === 'Income')
      .reduce(
        (acc, txn) => {
          const category = txn.category || 'Other Income'
          acc[category] = (acc[category] || 0) + txn.amount
          return acc
        },
        {} as Record<string, number>,
      )

    const expenseByCategory = fyTransactions
      .filter((txn) => txn.type === 'Expense')
      .reduce(
        (acc, txn) => {
          const category = txn.category || 'Other Expense'
          acc[category] = (acc[category] || 0) + txn.amount
          return acc
        },
        {} as Record<string, number>,
      )

    const totalIncome = Object.values(incomeByCategory).reduce((a, b) => a + b, 0)
    const totalExpense = Object.values(expenseByCategory).reduce((a, b) => a + b, 0)
    const netSavings = totalIncome - totalExpense
    const savingsRate = totalIncome > 0 ? (netSavings / totalIncome) * 100 : 0

    const nodes: Array<{ name: string; color?: string }> = []
    const links: Array<{ source: number; target: number; value: number; color?: string }> = []
    let nodeIndex = 0
    const nodeMap = new Map<string, number>()
    const nodeValues = new Map<number, number>()

    Object.entries(incomeByCategory)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .forEach(([category, amount]) => {
        nodeMap.set(category, nodeIndex)
        nodeValues.set(nodeIndex, amount)
        nodes.push({ name: category })
        nodeIndex++
      })

    const totalIncomeNodeIndex = nodeIndex
    nodeValues.set(nodeIndex, totalIncome)
    nodes.push({ name: 'Total Income' })
    nodeIndex++

    const savingsNodeIndex = nodeIndex
    nodeValues.set(nodeIndex, Math.max(netSavings, 0))
    nodes.push({ name: 'Savings' })
    nodeIndex++

    const expensesNodeIndex = nodeIndex
    nodeValues.set(nodeIndex, totalExpense)
    nodes.push({ name: 'Expenses' })
    nodeIndex++

    Object.entries(expenseByCategory)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .forEach(([category, amount]) => {
        nodeMap.set(`expense_${category}`, nodeIndex)
        nodeValues.set(nodeIndex, amount)
        nodes.push({ name: category })
        nodeIndex++
      })

    Object.entries(incomeByCategory)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .forEach(([category, amount]) => {
        const sourceIndex = nodeMap.get(category)
        if (sourceIndex !== undefined) {
          links.push({ source: sourceIndex, target: totalIncomeNodeIndex, value: amount })
        }
      })

    if (netSavings > 0) {
      links.push({ source: totalIncomeNodeIndex, target: savingsNodeIndex, value: netSavings })
    }
    if (totalExpense > 0) {
      links.push({ source: totalIncomeNodeIndex, target: expensesNodeIndex, value: totalExpense })
    }

    Object.entries(expenseByCategory)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .forEach(([category, amount]) => {
        const targetIndex = nodeMap.get(`expense_${category}`)
        if (targetIndex !== undefined) {
          links.push({ source: expensesNodeIndex, target: targetIndex, value: amount })
        }
      })

    const incomeCategoryCount = Object.keys(incomeByCategory).length
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

    const topIncome = Object.entries(incomeByCategory)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, amount]) => ({ name, amount }))
    const topExpense = Object.entries(expenseByCategory)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, amount]) => ({ name, amount }))

    return {
      totalIncome,
      totalExpense,
      netSavings,
      savingsRate,
      sankeyData: { nodes, links },
      sankeyNodeComponent,
      topIncome,
      topExpense,
    }
  }, [fyTransactions, isMobile])

  return { ...computed, isLoading, isMobile, currentFY, timeFilterProps }
}
