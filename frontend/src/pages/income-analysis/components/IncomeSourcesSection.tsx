import { useMemo } from 'react'

import { useQuery } from '@tanstack/react-query'
import { DollarSign, Wallet } from 'lucide-react'

import CategoryBreakdown from '@/components/analytics/CategoryBreakdown'
import ErrorState from '@/components/shared/ErrorState'
import { ChartSkeleton } from '@/components/shared/LoadingSkeleton'
import { useCategoryBreakdown } from '@/hooks/api/useAnalytics'
import { trailingMonthKeys } from '@/components/analytics/categoryBreakdownUtils'
import { INCOME_CATEGORY_COLORS } from '@/lib/preferencesUtils'
import { calculationsApi } from '@/services/api/calculations'

interface IncomeSourcesSectionProps {
  readonly dateRange: {
    readonly start_date?: string | null
    readonly end_date?: string | null
  }
}

export default function IncomeSourcesSection({ dateRange }: IncomeSourcesSectionProps) {
  const categoryQuery = useCategoryBreakdown({
    transaction_type: 'income',
    start_date: dateRange.start_date ?? undefined,
    end_date: dateRange.end_date ?? undefined,
  })
  const monthKeys = useMemo(() => trailingMonthKeys(12), [])
  const historyQuery = useQuery({
    queryKey: ['category-monthly-history', 'income', monthKeys],
    queryFn: async () =>
      (await calculationsApi.getCategoryMonthlyHistory(monthKeys, 'income')).data,
    staleTime: Infinity,
  })

  const retry = () => {
    const retries: Array<Promise<unknown>> = []
    if (categoryQuery.isError) retries.push(categoryQuery.refetch())
    if (historyQuery.isError) retries.push(historyQuery.refetch())
    void Promise.all(retries)
  }

  if (categoryQuery.isError || historyQuery.isError) {
    return (
      <ErrorState
        variant="card"
        title="Could not load income sources"
        message="The income source breakdown could not be loaded. Try the request again."
        onRetry={retry}
      />
    )
  }

  if (categoryQuery.isLoading || historyQuery.isLoading) {
    return <ChartSkeleton height="h-80" />
  }

  return (
    <CategoryBreakdown
      transactionType="income"
      dateRange={dateRange}
      headerIcon={DollarSign}
      headerIconColor="text-app-green"
      headerTitle="Income Sources"
      colorMap={INCOME_CATEGORY_COLORS}
      emptyIcon={Wallet}
      emptyTitle="No income data available"
      emptyDescription="Upload your transaction data to see your income breakdown."
      emptyActionLabel="Upload Data"
      emptyActionHref="/upload"
    />
  )
}
