import { motion } from 'motion/react'
import { Store } from 'lucide-react'

import { ParetoChart } from '@/components/analytics'
import EmptyState from '@/components/shared/EmptyState'
import { CardGridSkeleton, ChartSkeleton, TableSkeleton } from '@/components/shared/LoadingSkeleton'
import PageErrorState from '@/components/shared/PageErrorState'
import { PageContainer, PageHeader } from '@/components/ui'
import { ROUTES } from '@/constants'
import { SCROLL_FADE_UP } from '@/constants/animations'

import MerchantConcentration from './components/MerchantConcentration'
import MerchantFilters from './components/MerchantFilters'
import MerchantKpiGrid from './components/MerchantKpiGrid'
import MerchantTable from './components/MerchantTable'
import { useMerchantIntel } from './useMerchantIntel'

const PAGE_TITLE = 'Merchant Intelligence'
const PAGE_SUBTITLE = 'Who you actually pay, from transaction notes rather than the 12 categories'

export default function MerchantIntelligencePage() {
  const {
    isLoading,
    isError,
    retry,
    isEmpty,
    isFilteredEmpty,
    rows,
    stats,
    kindCounts,
    kindFilter,
    setKindFilter,
    recurringOnly,
    setRecurringOnly,
    search,
    setSearch,
    spendByLabel,
    threshold,
    unclassifiedCount,
    atRowLimit,
  } = useMerchantIntel()

  const clearFilters = () => {
    setKindFilter('all')
    setRecurringOnly(false)
    setSearch('')
  }

  if (isError) {
    return (
      <PageErrorState
        title={PAGE_TITLE}
        subtitle={PAGE_SUBTITLE}
        message="We could not load your merchant rollup. Your transactions are unchanged."
        onRetry={retry}
      />
    )
  }

  if (isLoading) {
    return (
      <PageContainer>
        <PageHeader title={PAGE_TITLE} subtitle={PAGE_SUBTITLE} />
        <CardGridSkeleton count={5} cols="grid-cols-2 lg:grid-cols-5" />
        <ChartSkeleton height="h-80" />
        <TableSkeleton rows={8} />
      </PageContainer>
    )
  }

  if (isEmpty) {
    return (
      <PageContainer>
        <PageHeader title={PAGE_TITLE} subtitle={PAGE_SUBTITLE} />
        <EmptyState
          icon={Store}
          title="No payees to show yet"
          description="Payees are extracted from the note on each expense. Either no statements are uploaded yet, or their notes carry no payee text. Upload a statement that keeps its narration column, then re-run the analytics refresh."
          actionHref={ROUTES.UPLOAD}
          actionLabel="Upload statements"
          variant="card"
        />
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      <PageHeader title={PAGE_TITLE} subtitle={PAGE_SUBTITLE} />

      <MerchantFilters
        kindFilter={kindFilter}
        onKindFilterChange={setKindFilter}
        kindCounts={kindCounts}
        recurringOnly={recurringOnly}
        onRecurringOnlyChange={setRecurringOnly}
        search={search}
        onSearchChange={setSearch}
      />

      <MerchantKpiGrid stats={stats} isLoading={false} threshold={threshold} />

      <motion.div {...SCROLL_FADE_UP}>
        <ParetoChart
          categoryBreakdown={spendByLabel}
          threshold={threshold}
          title="Which payees drive the spend"
          itemNoun="payee"
        />
      </motion.div>

      <motion.div {...SCROLL_FADE_UP}>
        <MerchantConcentration rows={rows} stats={stats} threshold={threshold} />
      </motion.div>

      <motion.div {...SCROLL_FADE_UP}>
        <MerchantTable
          rows={rows}
          trackedSpend={stats.trackedSpend}
          isFilteredEmpty={isFilteredEmpty}
          onClearFilters={clearFilters}
        />
      </motion.div>

      {/* Honesty footer. Every number above is scoped to what the rollup can
          see, and saying so is cheaper than a user discovering it later. */}
      <div className="space-y-1 text-[11px] leading-4 text-text-tertiary">
        <p>
          Payees come from expense notes only. Transfers and income are excluded, and any expense
          whose note is blank or a placeholder such as &quot;Unknown&quot; is dropped -- so tracked
          spend here is deliberately less than total expenses.
        </p>
        <p>
          A label tagged &quot;brand&quot; is a recognised payee. A label tagged &quot;note&quot; is
          the raw narration, which describes what was bought rather than who was paid.
        </p>
        {unclassifiedCount > 0 && (
          <p>
            {unclassifiedCount} {unclassifiedCount === 1 ? 'payee is' : 'payees are'} unclassified
            because this rollup predates payee classification -- see the &quot;Unclassified&quot;
            filter. Re-running an upload refreshes it.
          </p>
        )}
        {atRowLimit && (
          <p>
            Showing the top 200 payees by spend, which is the endpoint&apos;s maximum. A longer tail
            exists beyond that.
          </p>
        )}
      </div>
    </PageContainer>
  )
}
