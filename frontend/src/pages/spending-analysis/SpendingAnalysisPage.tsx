import { motion } from 'motion/react'

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
import PartialPeriodNotice from '@/components/shared/PartialPeriodNotice'
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
    timeFilterProps, dateRangeCompat, partialPeriod, noCompleteMonthBasis, isLoading, isError, retry,
    totalSpending, monthlyAvgSpending, monthlyAvgSubtitle, monthlyAvgLineLabel, savings,
    categoryBreakdown, categoriesCount, subcategoriesCount,
    topCategory, topCategoryAmount,
    spendingBreakdown, spendingChartData,
    budgetRuleMetrics,
    needsTarget, wantsTarget, savingsTarget,
    monthlyTrendData, peakExpense,
    rollingAvgPointCount, rollingAvgMonths,
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

      {partialPeriod && (
        <PartialPeriodNotice
          label={partialPeriod.label}
          daysElapsed={partialPeriod.daysElapsed}
          daysTotal={partialPeriod.daysTotal}
          treatment={
            noCompleteMonthBasis
              ? 'There is no completed month in this range, so the budget-rule shares, the monthly average and the expense trend cover the month so far -- read them as a running pace, not a result.'
              : 'Total Spending includes it. The budget-rule shares, the monthly average and the expense trend cover completed months only, so a month with rent paid but salary pending cannot read as overspending.'
          }
        />
      )}

      <SpendingMetricGrid
        totalSpending={totalSpending}
        monthlyAvgSpending={monthlyAvgSpending}
        monthlyAvgSubtitle={monthlyAvgSubtitle}
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
        monthlyAvgLineLabel={monthlyAvgLineLabel}
        rollingAvgPointCount={rollingAvgPointCount}
        rollingAvgMonths={rollingAvgMonths}
      />

      <motion.div {...SCROLL_FADE_UP}>
        <ExpenseTreemap dateRange={dateRangeCompat} categoryFilter={categoryFilter} />
      </motion.div>
      <motion.div {...SCROLL_FADE_UP}>
        <ParetoChart categoryBreakdown={categoryBreakdown} />
      </motion.div>
      <motion.div {...SCROLL_FADE_UP}>
        {/* No dateRange: the merchant rollup is whole-ledger, so the card
            states its own all-time scope instead of taking a window it cannot
            apply. */}
        <TopMerchants categoryFilter={categoryFilter} />
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
