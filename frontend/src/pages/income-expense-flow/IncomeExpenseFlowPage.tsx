import AnalyticsTimeFilter from '@/components/shared/AnalyticsTimeFilter'
import { PageContainer, PageHeader } from '@/components/ui'

import { FlowSummaryCards } from './components/FlowSummaryCards'
import { SankeyChart } from './components/SankeyChart'
import { useIncomeExpenseFlow } from './useIncomeExpenseFlow'

const IncomeExpenseFlowPage = () => {
  const m = useIncomeExpenseFlow()

  return (
    <PageContainer>
      <PageHeader
        title="Cash Flow"
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
        view={m.view}
        drillPath={m.drillPath}
        drillDirection={m.drillDirection}
        zoomOrigin={m.zoomOrigin}
        drillTo={m.drillTo}
        drillInto={m.drillInto}
        drillBack={m.drillBack}
        sankeyNodeComponent={m.sankeyNodeComponent}
        topIncome={m.topIncome}
        topExpense={m.topExpense}
        totalIncome={m.totalIncome}
        totalExpense={m.totalExpense}
        totalTax={m.totalTax}
        netSavings={m.netSavings}
        currentFY={m.currentFY}
      />
    </PageContainer>
  )
}

export default IncomeExpenseFlowPage
