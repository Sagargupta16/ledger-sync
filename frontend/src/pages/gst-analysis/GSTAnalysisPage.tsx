import { Info, Landmark } from 'lucide-react'
import { motion } from 'motion/react'
import { Link } from 'react-router-dom'

import EmptyState from '@/components/shared/EmptyState'
import ErrorState from '@/components/shared/ErrorState'
import LoadingSkeleton from '@/components/shared/LoadingSkeleton'
import { PageContainer, PageHeader } from '@/components/ui'
import { ROUTES } from '@/constants'
import { staggerContainer } from '@/constants/animations'

import FYNavigator from './components/FYNavigator'
import GSTCategoryTable from './components/GSTCategoryTable'
import GSTCharts from './components/GSTCharts'
import GSTSummaryCards from './components/GSTSummaryCards'
import { useGSTAnalysis } from './useGSTAnalysis'

function GSTAnalysisSkeleton() {
  return (
    <div role="status" aria-busy="true" className="space-y-6">
      <span className="sr-only">Loading GST analysis</span>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
        {['gst-total', 'gst-rate', 'gst-category'].map((key) => (
          <div
            key={key}
            className={
              key === 'gst-category'
                ? 'ledger-panel col-span-2 min-w-0 space-y-3 p-3 sm:col-span-1 sm:p-5'
                : 'ledger-panel min-w-0 space-y-3 p-3 sm:p-5'
            }
          >
            <LoadingSkeleton className="h-3 w-20 max-w-full" />
            <LoadingSkeleton className="h-7 w-28 max-w-full" />
            <LoadingSkeleton className="h-3 w-16 max-w-full" />
          </div>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="ledger-panel p-4 sm:p-5">
          <LoadingSkeleton className="mb-4 h-5 w-40 max-w-full" />
          <LoadingSkeleton className="h-64 w-full" />
        </div>
        <div className="ledger-panel p-4 sm:p-5">
          <LoadingSkeleton className="mb-4 h-5 w-40 max-w-full" />
          <LoadingSkeleton className="h-64 w-full" />
        </div>
      </div>
    </div>
  )
}

export default function GSTAnalysisPage() {
  const analysis = useGSTAnalysis()

  return (
    <PageContainer className="space-y-6">
      <PageHeader
        title="Indirect Tax (GST)"
        subtitle="Estimated GST paid on your expenses"
      />

      <div className="flex flex-col gap-3 border-b border-[var(--hairline-1)] pb-5 sm:flex-row sm:items-center sm:justify-between">
        {analysis.allFYs.length > 0 && (
          <FYNavigator
            fiscalYears={analysis.allFYs}
            selectedFY={analysis.effectiveFY}
            onSelect={analysis.setSelectedFY}
          />
        )}
        <Link
          to={ROUTES.TAX_PLANNING}
          className="inline-flex min-h-11 items-center justify-center gap-2 self-start whitespace-nowrap rounded-lg border border-border bg-[var(--overlay-2)] px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-[var(--overlay-5)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] lg:pointer-fine:min-h-8 lg:pointer-fine:py-1.5"
          title="View Income Tax planning"
        >
          <Landmark className="size-4" aria-hidden="true" />
          <span>View Income Tax</span>
        </Link>
      </div>

      <details className="rounded-lg border border-app-orange/20 bg-app-orange/5 text-sm text-muted-foreground">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)]">
          <Info className="size-4 shrink-0 text-app-orange" aria-hidden="true" />
          <strong className="text-foreground">Estimates only, not for filing.</strong>
          <span className="ml-auto text-xs text-app-orange">How this works</span>
        </summary>
        <p className="border-t border-app-orange/15 px-4 py-3 leading-6">
          Bank statements do not itemize GST, so Ledger Sync applies typical category slab rates
          to inclusive-of-tax spending. Use these figures for awareness of indirect tax paid.
        </p>
      </details>

      {analysis.isLoading && <GSTAnalysisSkeleton />}

      {!analysis.isLoading && analysis.isError && (
        <ErrorState
          variant="card"
          title="Unable to load GST analysis"
          message="We couldn't load the transactions and preferences needed for this estimate."
          onRetry={analysis.retry}
        />
      )}

      {!analysis.isLoading && !analysis.isError && !analysis.hasData && (
        <EmptyState
          title="No expenses in this fiscal year"
          description="Upload transactions or choose another fiscal year to estimate GST."
          actionLabel="Upload transactions"
          actionHref={ROUTES.UPLOAD}
        />
      )}

      {!analysis.isLoading && !analysis.isError && analysis.hasData && analysis.gstData && (
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
          className="space-y-6"
        >
          <GSTSummaryCards data={analysis.gstData} />
          <GSTCharts data={analysis.gstData} taxableSlabs={analysis.taxableSlabs} />
          <GSTCategoryTable data={analysis.gstData} />
        </motion.div>
      )}
    </PageContainer>
  )
}
