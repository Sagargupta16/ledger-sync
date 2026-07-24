import { motion } from 'framer-motion'

import {
  CohortSpendingAnalysis,
  EnhancedSubcategoryAnalysis,
  ExpenseTreemap,
  MultiCategoryTimeAnalysis,
  ParetoChart,
  TopMerchants,
} from '@/components/analytics'
import { FilterBanner } from '@/components/shared/FilterBanner'
import { PageSkeleton } from '@/components/shared/LoadingSkeleton'
import PageErrorState from '@/components/shared/PageErrorState'
import AnalyticsTimeFilter from '@/components/shared/AnalyticsTimeFilter'
import { PageContainer, PageHeader } from '@/components/ui'
import { SCROLL_FADE_UP } from '@/constants/animations'

import BudgetRuleAnalysis from './components/BudgetRuleAnalysis'
import ExpenseTrendSection from './components/ExpenseTrendSection'
import SpendingMetricGrid from './components/SpendingMetricGrid'
import { useSpendingAnalysis } from './useSpendingAnalysis'

export default function SpendingAnalysisPage() {
  const {
    categoryFilter, clearCategoryFilter,
    timeFilterProps, dateRangeCompat, isLoading, isError, retry,
    totalSpending, monthlyAvgSpending, savings,
    categoryBreakdown, categoriesCount, subcategoriesCount,
    topCategory, topCategoryAmount,
    spendingBreakdown, spendingChartData,
    budgetRuleMetrics,
    needsTarget, wantsTarget, savingsTarget,
    monthlyTrendData, peakExpense,
  } = useSpendingAnalysis()

  if (isError) {
    return (
      <PageErrorState
        title="Expense Analysis"
        subtitle="Track and analyze your spending patterns"
        message="We could not load your transactions or spending preferences. Your saved data is unchanged."
        onRetry={retry}
      />
    )
  }

  if (isLoading) return <PageSkeleton />

  return (
    <PageContainer>
      <PageHeader
        title="Expense Analysis"
        subtitle="Track and analyze your spending patterns"
        action={<AnalyticsTimeFilter {...timeFilterProps} />}
      />

      <FilterBanner value={categoryFilter} label="Category" onClear={clearCategoryFilter} />

      <SpendingMetricGrid
        totalSpending={totalSpending}
        monthlyAvgSpending={monthlyAvgSpending}
        monthlyTrendData={monthlyTrendData}
        topCategory={topCategory}
        topCategoryAmount={topCategoryAmount}
        categoriesCount={categoriesCount}
        subcategoriesCount={subcategoriesCount}
      />

      <BudgetRuleAnalysis
        needsTarget={needsTarget}
        wantsTarget={wantsTarget}
        savingsTarget={savingsTarget}
        spendingChartData={spendingChartData}
        spendingBreakdown={spendingBreakdown}
        budgetRuleMetrics={budgetRuleMetrics}
        savings={savings}
      />

      <ExpenseTrendSection
        monthlyTrendData={monthlyTrendData}
        peakExpense={peakExpense}
        monthlyAvgSpending={monthlyAvgSpending}
      />

      <motion.div {...SCROLL_FADE_UP}>
        <ExpenseTreemap dateRange={dateRangeCompat} categoryFilter={categoryFilter} />
      </motion.div>
      <motion.div {...SCROLL_FADE_UP}>
        <ParetoChart categoryBreakdown={categoryBreakdown} />
      </motion.div>
      <motion.div {...SCROLL_FADE_UP}>
        <TopMerchants dateRange={dateRangeCompat} categoryFilter={categoryFilter} />
      </motion.div>
      <motion.div {...SCROLL_FADE_UP}>
        <MultiCategoryTimeAnalysis dateRange={dateRangeCompat} />
      </motion.div>
      <motion.div {...SCROLL_FADE_UP}>
        <EnhancedSubcategoryAnalysis
          key={categoryFilter ?? 'all'}
          dateRange={dateRangeCompat}
          categoryFilter={categoryFilter}
        />
      </motion.div>
      <motion.div {...SCROLL_FADE_UP}>
        <CohortSpendingAnalysis />
      </motion.div>
    </PageContainer>
  )
}
