import { useMemo, useState } from 'react'

import { motion } from 'motion/react'
import { Flame } from 'lucide-react'
import { PageSkeleton } from '@/components/shared/LoadingSkeleton'
import EmptyState from '@/components/shared/EmptyState'
import PageErrorState from '@/components/shared/PageErrorState'
import { PageContainer, PageHeader } from '@/components/ui'
import { useTotals, useMonthlyAggregation } from '@/hooks/api/useAnalytics'
import { deriveFIREInputs } from '@/lib/fireCalculator'
import { staggerContainer } from '@/constants/animations'

import CalculatorTabs, { type CalculatorTab } from './components/CalculatorTabs'
import FirePanel from './components/FirePanel'
import MonteCarloPanel from './components/MonteCarloPanel'
import RetirementPanel from './components/RetirementPanel'
import { useFireAssumptions, useRetirementAssumptions } from './useFireCalculator'
import { useMonteCarloSession } from './useMonteCarloPlan'

const TITLE = 'FIRE Calculator'
const SUBTITLE = 'Plan your financial independence using your actual spending data'

export default function FIRECalculatorPage() {
  const monthlyQuery = useMonthlyAggregation()
  const totalsQuery = useTotals()
  const monthlyData = monthlyQuery.data
  const totals = totalsQuery.data
  const queries = [monthlyQuery, totalsQuery] as const
  const isLoading = queries.some((query) => query.isLoading)
  const hasError = queries.some((query) => query.isError)
  const [activeTab, setActiveTab] = useState<CalculatorTab>('fire')

  // FIRE inputs with defaults from transaction data. The distinct-month count
  // is the number of keys in the monthly rollup (one per YYYY-MM) -- no need to
  // pull the full ledger just to count months.
  const autoValues = useMemo(() => deriveFIREInputs(
    totals?.total_income ?? 0,
    totals?.total_expenses ?? 0,
    Object.keys(monthlyData ?? {}).length,
  ), [monthlyData, totals])

  // Every tab's state lives here, so switching tabs keeps each one's edits and
  // results. The Monte Carlo balances load in its panel, once that tab opens.
  const fire = useFireAssumptions(autoValues)
  const retirement = useRetirementAssumptions(autoValues, fire.swr)
  const monteCarlo = useMonteCarloSession()

  if (isLoading) return <PageSkeleton />

  if (hasError) {
    const retryFire = () => {
      void monthlyQuery.refetch()
      void totalsQuery.refetch()
    }
    return <PageErrorState title={TITLE} subtitle={SUBTITLE} onRetry={retryFire} />
  }

  const hasData = autoValues.annualExpenses > 0
  return (
    <PageContainer>
      <PageHeader
        title={TITLE}
        subtitle={SUBTITLE}
        // Only render the tablist when the panels it controls exist (no-data
        // shows an EmptyState instead, so aria-controls would dangle).
        action={hasData ? <CalculatorTabs active={activeTab} onChange={setActiveTab} /> : undefined}
      />
      <motion.div
        initial="hidden"
        animate="visible"
        variants={staggerContainer}
        className="space-y-6 md:space-y-8"
      >
        {hasData ? ({
          fire: <FirePanel fire={fire} />,
          retirement: <RetirementPanel retirement={retirement} />,
          montecarlo: <MonteCarloPanel session={monteCarlo} measured={autoValues} />,
        }[activeTab]) : (
          <EmptyState
            variant="card"
            icon={Flame}
            title="No spending data yet"
            description="FIRE and retirement targets are derived from your actual income and expenses. Upload a bank statement to see your numbers."
            actionLabel="Upload transactions"
            actionHref="/upload"
          />
        )}
      </motion.div>
    </PageContainer>
  )
}
