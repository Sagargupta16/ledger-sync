import { BarChart3, CreditCard } from 'lucide-react'
import CategoryBreakdown from './CategoryBreakdown'

interface ExpenseTreemapProps {
  readonly dateRange?: { start_date?: string; end_date?: string }
}

export default function ExpenseTreemap({ dateRange }: ExpenseTreemapProps) {
  return (
    <CategoryBreakdown
      transactionType="expense"
      dateRange={dateRange}
      headerIcon={BarChart3}
      headerIconColor="text-ios-purple"
      headerTitle="Expense Breakdown"
      emptyIcon={CreditCard}
      emptyTitle="No expense data available"
      emptyDescription="Upload your transaction data to see your expense breakdown."
      emptyActionLabel="Upload Data"
      emptyActionHref="/upload"
    />
  )
}
