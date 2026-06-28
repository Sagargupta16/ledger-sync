import { useMemo } from 'react'

import { useTransactions } from '@/hooks/api/useTransactions'
import { useAnalyticsTimeFilter } from '@/hooks/useAnalyticsTimeFilter'
import { useIsMobile } from '@/hooks/useIsMobile'
import { getDateKey } from '@/lib/dateUtils'

import { createSankeyNodeComponent } from './components/SankeyNodeRenderer'

/** Cap a category map to the top N by amount, folding the remainder into a
 * single "Other (n)" bucket so the displayed flows still sum to the totals
 * shown on the KPI cards (a raw top-10 slice silently dropped the tail). */
const SANKEY_TOP_N = 8
function topCategoriesWithOther(
  byCategory: Record<string, number>,
  otherLabel: string,
): Array<{ name: string; amount: number }> {
  const sorted = Object.entries(byCategory)
    .filter(([, amount]) => amount > 0)
    .sort((a, b) => b[1] - a[1])
  if (sorted.length <= SANKEY_TOP_N) {
    return sorted.map(([name, amount]) => ({ name, amount }))
  }
  const head = sorted.slice(0, SANKEY_TOP_N).map(([name, amount]) => ({ name, amount }))
  const restCount = sorted.length - SANKEY_TOP_N
  const otherAmount = sorted.slice(SANKEY_TOP_N).reduce((sum, [, amount]) => sum + amount, 0)
  return [...head, { name: `${otherLabel} (${restCount})`, amount: otherAmount }]
}

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

    // Top-N + "Other" so every visible flow reconciles with the totals (and
    // therefore the KPI cards). A raw slice(0,10) silently dropped categories
    // 11+, so the flows didn't sum to Total Income / Expenses for users with
    // many categories.
    const topIncomeCats = topCategoriesWithOther(incomeByCategory, 'Other Income')
    const topExpenseCats = topCategoriesWithOther(expenseByCategory, 'Other Expense')

    const nodes: Array<{ name: string; color?: string }> = []
    const links: Array<{ source: number; target: number; value: number; color?: string }> = []
    let nodeIndex = 0
    const incomeNodeIndexByName = new Map<string, number>()
    const expenseNodeIndexByName = new Map<string, number>()
    const nodeValues = new Map<number, number>()

    topIncomeCats.forEach(({ name, amount }) => {
      incomeNodeIndexByName.set(name, nodeIndex)
      nodeValues.set(nodeIndex, amount)
      nodes.push({ name })
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

    topExpenseCats.forEach(({ name, amount }) => {
      expenseNodeIndexByName.set(name, nodeIndex)
      nodeValues.set(nodeIndex, amount)
      nodes.push({ name })
      nodeIndex++
    })

    topIncomeCats.forEach(({ name, amount }) => {
      const sourceIndex = incomeNodeIndexByName.get(name)
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

    topExpenseCats.forEach(({ name, amount }) => {
      const targetIndex = expenseNodeIndexByName.get(name)
      if (targetIndex !== undefined) {
        links.push({ source: expensesNodeIndex, target: targetIndex, value: amount })
      }
    })

    const incomeCategoryCount = topIncomeCats.length
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

    // Mobile rows reuse the same top-N + Other lists so phone + desktop agree.
    const topIncome = topIncomeCats
    const topExpense = topExpenseCats

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
