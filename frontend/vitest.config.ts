import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

// Test files that run in Node instead of jsdom. Each one, and everything it
// imports, needs no DOM, render or browser storage: creating a jsdom window per
// file was 55% of the suite's time. Every other test file stays in jsdom, so a
// new test file gets jsdom unless it is added here.
const NODE_TESTS = [
  'src/components/analytics/__tests__/cashFlowUtils.test.ts',
  'src/components/analytics/__tests__/instrumentProjectionUtils.test.ts',
  'src/components/analytics/__tests__/pieSliceCap.test.ts',
  'src/components/analytics/health/__tests__/healthEarningPeriod.test.ts',
  'src/components/analytics/health/__tests__/healthInvestmentFlows.test.ts',
  'src/components/analytics/health/__tests__/healthScore.test.ts',
  'src/components/charts/__tests__/slopeLayout.test.ts',
  'src/components/charts/__tests__/treemapLayout.test.ts',
  'src/components/shared/__tests__/quickInsightsConsistency.test.ts',
  'src/components/shared/__tests__/quickInsightsCoverage.test.ts',
  'src/components/shared/__tests__/quickInsightsDivisors.test.ts',
  'src/components/shared/__tests__/quickInsightsMedians.test.ts',
  'src/components/ui/__tests__/themeContrast.test.ts',
  'src/constants/__tests__/animations.test.ts',
  'src/constants/__tests__/currencies.test.ts',
  'src/hooks/__tests__/useAnalyticsTimeFilter.test.ts',
  'src/lib/__tests__/ageOfMoneyCalculator.test.ts',
  'src/lib/__tests__/chartDateLabels.test.ts',
  'src/lib/__tests__/chartUtils.test.ts',
  'src/lib/__tests__/chatAdapters.test.ts',
  'src/lib/__tests__/distribution.test.ts',
  'src/lib/__tests__/expenseClassification.test.ts',
  'src/lib/__tests__/fileParser.test.ts',
  'src/lib/__tests__/fireCalculator.test.ts',
  'src/lib/__tests__/formatters.test.ts',
  'src/lib/__tests__/formattersCurrencyIntegrity.test.ts',
  'src/lib/__tests__/gstCalculator.test.ts',
  'src/lib/__tests__/instrumentCalculators.test.ts',
  'src/lib/__tests__/prefetch.test.ts',
  'src/lib/__tests__/projectionCalculator.test.ts',
  'src/lib/__tests__/queryClient.test.ts',
  'src/lib/__tests__/queryStatus.test.ts',
  'src/lib/__tests__/recurrenceFrequency.test.ts',
  'src/lib/__tests__/recurringCalculations.test.ts',
  'src/lib/__tests__/rsuVesting.test.ts',
  'src/lib/__tests__/rsuWithholding.test.ts',
  'src/lib/__tests__/salaryProjection.test.ts',
  'src/lib/__tests__/savingsRate.test.ts',
  'src/lib/__tests__/savingsRateSourceOfTruth.test.ts',
  'src/lib/__tests__/taxCalculator.test.ts',
  'src/lib/__tests__/tdsScheduleCalculator.test.ts',
  'src/lib/__tests__/utcDateKeyGuard.test.ts',
  'src/lib/__tests__/xirr.test.ts',
  'src/lib/demo/__tests__/browserTargetBuiltins.test.ts',
  'src/lib/demo/__tests__/demoAccountBalancesShape.test.ts',
  'src/lib/demo/__tests__/demoInvestmentFlows.test.ts',
  'src/lib/demo/__tests__/demoMerchantIntelligence.test.ts',
  'src/lib/demo/__tests__/generateTransactions.test.ts',
  'src/lib/finance/__tests__/analysisPeriod.test.ts',
  'src/lib/finance/__tests__/cashFlowForecast.test.ts',
  'src/lib/finance/__tests__/creditCardUtilization.test.ts',
  'src/lib/finance/__tests__/dashboardMetrics.test.ts',
  'src/lib/finance/__tests__/investmentFlows.test.ts',
  'src/lib/finance/__tests__/investmentReturns.test.ts',
  'src/lib/finance/__tests__/netWorth.test.ts',
  'src/lib/finance/__tests__/payrollPlanning.test.ts',
  'src/lib/finance/__tests__/sipProjection.test.ts',
  'src/lib/finance/__tests__/taxHistory.test.ts',
  'src/lib/finance/__tests__/taxPlanning.test.ts',
  'src/lib/finance/__tests__/taxRateCurve.test.ts',
  'src/lib/tax-config/__tests__/taxConfig.test.ts',
  'src/pages/ai-canvas/__tests__/calculators.test.ts',
  'src/pages/ai-canvas/__tests__/chartSpec.test.ts',
  'src/pages/bill-calendar/__tests__/billDays.test.ts',
  'src/pages/comparison/__tests__/periodAlign.test.ts',
  'src/pages/data-health/__tests__/dataHealthUtils.test.ts',
  'src/pages/goals/__tests__/helpers.test.ts',
  'src/pages/home/__tests__/homeCtaContrast.test.ts',
  'src/pages/home/__tests__/sampleData.test.ts',
  'src/pages/income-expense-flow/__tests__/sankeyDrilldown.test.ts',
  'src/pages/investment-analytics/__tests__/investmentUtils.test.ts',
  'src/pages/merchant-intelligence/__tests__/merchantUtils.test.ts',
  'src/pages/mutual-fund-projection/__tests__/expectedValue.test.ts',
  'src/pages/mutual-fund-projection/__tests__/projectionUtils.test.ts',
  'src/pages/net-worth/__tests__/netWorthUtils.test.ts',
  'src/pages/returns-analysis/__tests__/returnsAnalysisUtils.test.ts',
  'src/pages/settings/__tests__/incomeClassificationAudit.test.ts',
  'src/pages/settings/__tests__/settingsVocabulary.test.ts',
  'src/pages/settings/__tests__/spendingSplit.test.ts',
  'src/pages/settings/sections/salary/__tests__/fyHelpers.test.ts',
  'src/pages/spending-analysis/__tests__/spendingAnalysisUtils.test.ts',
  'src/pages/subscription-tracker/__tests__/helpers.test.ts',
  'src/pages/tax-planning/__tests__/taxPlanningUtils.test.ts',
  'src/services/api/__tests__/analyticsParamContract.test.ts',
  'src/services/api/__tests__/authHeaderRefresh.test.ts',
  'src/services/api/__tests__/dataHealth.test.ts',
  'src/services/api/__tests__/demoRouteShapes.test.ts',
  'src/services/api/__tests__/transactionPagination.test.ts',
  'src/services/api/__tests__/uploadIdempotency.test.ts',
  'src/services/api/__tests__/writeRequestShapes.test.ts',
  'src/store/__tests__/incomeClassificationDefaults.test.ts',
  'src/store/__tests__/preferenceHydrationDefaults.test.ts',
]

// Scratch files written while characterising third-party behaviour are named
// *.tmp.test.tsx and gitignored. They deliberately assert what a library
// currently does, including its bugs, so they must never gate the suite.
//
// `.claude` is excluded for a different reason: it holds local agent state,
// including git worktrees checked out under it. A worktree is a second copy
// of this same suite, so without this the local run counts every test twice
// against CI -- inflated counts that make a real regression impossible to
// spot by number.
const BASE_EXCLUDE = [
  '**/node_modules/**',
  '**/dist/**',
  '**/.claude/**',
  '**/*.tmp.test.{ts,tsx}',
]

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    projects: [
      {
        extends: true,
        test: {
          name: 'jsdom',
          environment: 'jsdom',
          exclude: [...BASE_EXCLUDE, ...NODE_TESTS],
        },
      },
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          include: NODE_TESTS,
          exclude: BASE_EXCLUDE,
        },
      },
    ],
  },
  resolve: {
    alias: {
      '@': resolve(import.meta.dirname, './src'),
    },
  },
})
