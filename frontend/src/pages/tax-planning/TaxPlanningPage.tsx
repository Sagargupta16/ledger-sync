import { Receipt, Upload } from 'lucide-react'
import { motion } from 'motion/react'
import { Link } from 'react-router'

import EmptyState from '@/components/shared/EmptyState'
import { PageSkeleton } from '@/components/shared/LoadingSkeleton'
import PageErrorState from '@/components/shared/PageErrorState'
import { PageContainer, PageHeader, StickyToolbar } from '@/components/ui'
import { ROUTES } from '@/constants'
import { staggerContainer } from '@/constants/animations'

import MultiYearProjectionTable from './components/MultiYearProjectionTable'
import TaxEstimateBasis from './components/TaxEstimateBasis'
import TaxOverviewSections from './components/TaxOverviewSections'
import TaxPageActions from './components/TaxPageActions'
import TaxRegimeComparisonSection from './components/TaxRegimeComparisonSection'
import TaxSavingSuggestions from './components/TaxSavingSuggestions'
import TaxYearChart from './components/TaxYearChart'
import { useTaxPlanning } from './useTaxPlanning'

export default function TaxPlanningPage() {
  const planning = useTaxPlanning()
  const hasResolvedData = !planning.isLoading && !planning.isError

  // The GST link does not depend on the failed queries, so it stays on error.
  const gstLink = (
    <Link
      to={ROUTES.GST_ANALYSIS}
      className="inline-flex min-h-11 items-center justify-center gap-2 self-start whitespace-nowrap rounded-lg border border-border bg-[var(--overlay-2)] px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-[var(--overlay-5)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] lg:pointer-fine:min-h-8 lg:pointer-fine:py-1.5"
      title="View Indirect Tax (GST) analysis"
    >
      <Receipt className="size-4" aria-hidden="true" />
      <span>View GST</span>
    </Link>
  )

  if (!planning.isLoading && planning.isError) {
    return (
      <PageErrorState
        title="Income Tax"
        subtitle="Estimate your tax liability"
        message="We couldn't load the transactions and preferences needed for this estimate."
        onRetry={planning.retry}
      >
        <div className="flex flex-col gap-3 border-b border-[var(--hairline-1)] pb-5 lg:flex-row lg:items-center lg:justify-between">
          {gstLink}
        </div>
      </PageErrorState>
    )
  }

  return (
    <PageContainer>
      <PageHeader
        title="Income Tax"
        subtitle={
          hasResolvedData
            ? `Estimate your tax liability -- ${planning.regimeLabel}`
            : 'Estimate your tax liability'
        }
        action={gstLink}
      />

      {hasResolvedData && (
        <StickyToolbar label="Fiscal year and regime">
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
        </StickyToolbar>
      )}

      {planning.isLoading && <PageSkeleton />}

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
          <TaxEstimateBasis planning={planning} />
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
