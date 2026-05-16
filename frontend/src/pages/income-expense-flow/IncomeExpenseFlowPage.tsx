import AnalyticsTimeFilter from '@/components/shared/AnalyticsTimeFilter'
import { PageHeader } from '@/components/ui'

import { FlowSummaryCards } from './components/FlowSummaryCards'
import { SankeyChart } from './components/SankeyChart'
import { useIncomeExpenseFlow } from './useIncomeExpenseFlow'

const IncomeExpenseFlowPage = () => {
  const m = useIncomeExpenseFlow()

  return (
    <div className="min-h-screen p-4 md:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <PageHeader
          title="Income-Expense Flow"
          subtitle="Visualize how your income flows into savings and expenses"
          action={<AnalyticsTimeFilter {...m.timeFilterProps} />}
        />

        <FlowSummaryCards
          totalIncome={m.totalIncome}
          totalExpense={m.totalExpense}
          netSavings={m.netSavings}
          savingsRate={m.savingsRate}
        />

        <SankeyChart
          isLoading={m.isLoading}
          isMobile={m.isMobile}
          sankeyData={m.sankeyData}
          sankeyNodeComponent={m.sankeyNodeComponent}
          topIncome={m.topIncome}
          topExpense={m.topExpense}
          totalIncome={m.totalIncome}
          totalExpense={m.totalExpense}
          netSavings={m.netSavings}
          currentFY={m.currentFY}
        />
      </div>
    </div>
  )
}

export default IncomeExpenseFlowPage
