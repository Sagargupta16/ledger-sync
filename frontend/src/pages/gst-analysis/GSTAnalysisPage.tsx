import { Info, Landmark } from 'lucide-react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'

import ChartEmptyState from '@/components/shared/ChartEmptyState'
import ErrorState from '@/components/shared/ErrorState'
import { PageContainer, PageHeader, Spinner } from '@/components/ui'
import { ROUTES } from '@/constants'
import { staggerContainer } from '@/constants/animations'

import FYNavigator from './components/FYNavigator'
import GSTCategoryTable from './components/GSTCategoryTable'
import GSTCharts from './components/GSTCharts'
import GSTSummaryCards from './components/GSTSummaryCards'
import { useGSTAnalysis } from './useGSTAnalysis'

export default function GSTAnalysisPage() {
  const analysis = useGSTAnalysis()

  return (
    <PageContainer className="space-y-6">
      <PageHeader
        title="Indirect Tax (GST)"
        subtitle="Estimated GST paid on your expenses"
        action={
          <div className="flex items-center gap-3 flex-wrap">
            {analysis.allFYs.length > 0 && (
              <FYNavigator
                fiscalYears={analysis.allFYs}
                selectedFY={analysis.effectiveFY}
                onSelect={analysis.setSelectedFY}
              />
            )}
            <Link
              to={ROUTES.TAX_PLANNING}
              className="inline-flex min-h-11 items-center gap-2 whitespace-nowrap rounded-lg border border-border bg-[var(--overlay-2)] px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-[var(--overlay-5)] hover:text-foreground sm:min-h-8 sm:py-1.5"
              title="View Income Tax planning"
            >
              <Landmark className="w-4 h-4" />
              <span>View Income Tax</span>
            </Link>
          </div>
        }
      />

      <div className="flex items-start gap-2 px-4 py-3 rounded-xl bg-app-orange/5 border border-app-orange/20 text-sm text-muted-foreground">
        <Info className="w-4 h-4 mt-0.5 text-app-orange shrink-0" />
        <span>
          <strong className="text-foreground">Approximate figures only.</strong>{' '}
          GST isn't line-itemed in bank statements, so we apply typical slab rates per category
          (restaurants 5%, electronics 18%, etc.) to your inclusive-of-tax spend. Use this for
          lifestyle-scale awareness of indirect tax paid -- not for filing.
        </span>
      </div>

      {analysis.isLoading && <Spinner label="Loading GST analysis" className="py-20" />}

      {!analysis.isLoading && analysis.isError && (
        <ErrorState
          variant="card"
          title="Unable to load GST analysis"
          message="We couldn't load the transactions and preferences needed for this estimate."
          onRetry={analysis.retry}
        />
      )}

      {!analysis.isLoading && !analysis.isError && !analysis.hasData && (
        <ChartEmptyState message="No expense data found for this fiscal year" />
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
