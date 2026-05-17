import { BarChart3, CreditCard } from 'lucide-react'

import { EXPENSE_CATEGORY_COLORS } from '@/constants/categoryColors'

import CategoryBreakdown from './CategoryBreakdown'

interface ExpenseTreemapProps {
  readonly dateRange?: { start_date?: string; end_date?: string }
  /**
   * When set, only this category is rendered and auto-expanded to show
   * its subcategories. Used by deep-link flows
   * (``/spending?category=Food``).
   */
  readonly categoryFilter?: string | null
}

export default function ExpenseTreemap({ dateRange, categoryFilter }: ExpenseTreemapProps) {
  return (
    <CategoryBreakdown
      transactionType="expense"
      dateRange={dateRange}
      headerIcon={BarChart3}
      headerIconColor="text-app-purple"
      headerTitle={categoryFilter ? `${categoryFilter} Breakdown` : 'Expense Breakdown'}
      colorMap={EXPENSE_CATEGORY_COLORS}
      categoryFilter={categoryFilter}
      emptyIcon={CreditCard}
      emptyTitle="No expense data available"
      emptyDescription="Upload your transaction data to see your expense breakdown."
      emptyActionLabel="Upload Data"
      emptyActionHref="/upload"
    />
  )
}
