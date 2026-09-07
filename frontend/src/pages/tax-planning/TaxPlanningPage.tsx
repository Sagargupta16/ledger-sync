import { Receipt, Upload } from 'lucide-react'
import { motion } from 'motion/react'
import { Link } from 'react-router-dom'

import EmptyState from '@/components/shared/EmptyState'
import ErrorState from '@/components/shared/ErrorState'
import { PageSkeleton } from '@/components/shared/LoadingSkeleton'
import { PageContainer, PageHeader } from '@/components/ui'
import { ROUTES } from '@/constants'
import { staggerContainer } from '@/constants/animations'

import MultiYearProjectionTable from './components/MultiYearProjectionTable'
import TaxOverviewSections from './components/TaxOverviewSections'
import TaxPageActions from './components/TaxPageActions'
import TaxRegimeComparisonSection from './components/TaxRegimeComparisonSection'
import TaxSavingSuggestions from './components/TaxSavingSuggestions'
import TaxYearChart from './components/TaxYearChart'
import { useTaxPlanning } from './useTaxPlanning'

export default function TaxPlanningPage() {
  const planning = useTaxPlanning()
  const hasResolvedData = !planning.isLoading && !planning.isError

  return (
    <PageContainer>
      <PageHeader
        title="Income Tax"
        subtitle={
          hasResolvedData
            ? `Estimate your tax liability -- ${planning.regimeLabel}`
            : 'Estimate your tax liability'
        }
      />

      <div className="flex flex-col gap-3 border-b border-[var(--hairline-1)] pb-5 lg:flex-row lg:items-center lg:justify-between">
        {hasResolvedData && (
          <TaxPageActions
            isNewRegime={planning.isNewRegime}
            setRegimeOverride={planning.setRegimeOverride}
            newRegimeAvailable={planning.newRegimeAvailable}
            isCurrentFY={planning.isCurrentFY}
            showProjection={planning.showProjection}
            setShowProjection={planning.setShowProjection}
            selectedFY={planning.effectiveFY}
            canGoBack={planning.canGoBack}
            canGoForward={planning.canGoForward}
            goToPreviousFY={planning.goToPreviousFY}
            goToNextFY={planning.goToNextFY}
            hasSalaryData={planning.hasSalaryData}
          />
        )}
        <Link
          to={ROUTES.GST_ANALYSIS}
          className="inline-flex min-h-11 items-center justify-center gap-2 self-start whitespace-nowrap rounded-lg border border-border bg-[var(--overlay-2)] px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-[var(--overlay-5)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] lg:pointer-fine:min-h-8 lg:pointer-fine:py-1.5"
          title="View Indirect Tax (GST) analysis"
        >
          <Receipt className="size-4" aria-hidden="true" />
          <span>View GST</span>
        </Link>
      </div>

      {planning.isLoading && <PageSkeleton />}

      {!planning.isLoading && planning.isError && (
        <ErrorState
          variant="card"
          title="Unable to load tax planning"
          message="We couldn't load the transactions and preferences needed for this estimate."
          onRetry={planning.retry}
        />
      )}

      {hasResolvedData && planning.fyList.length === 0 && (
        <EmptyState
          icon={Upload}
          title="No transactions to estimate"
          description="Upload a statement to calculate taxable income, deductions, and projected liability."
          actionLabel="Upload transactions"
          actionHref={ROUTES.UPLOAD}
        />
      )}

      {hasResolvedData && planning.fyList.length > 0 && (
        <motion.div
          initial="hidden"
          animate="visible"
          variants={staggerContainer}
          className="space-y-6 md:space-y-8"
        >
          <TaxOverviewSections planning={planning} />
          <TaxSavingSuggestions planning={planning} />
          <TaxYearChart planning={planning} />
          <TaxRegimeComparisonSection planning={planning} />
          {planning.hasSalaryData && planning.multiYearProjections.length > 1 && (
            <MultiYearProjectionTable projections={planning.multiYearProjections} />
          )}
        </motion.div>
      )}
    </PageContainer>
  )
}
