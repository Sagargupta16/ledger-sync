import { Database } from 'lucide-react'

import EmptyState from '@/components/shared/EmptyState'
import { CardGridSkeleton, TableSkeleton } from '@/components/shared/LoadingSkeleton'
import PageErrorState from '@/components/shared/PageErrorState'
import { ROUTES } from '@/constants'
import { PageContainer, PageHeader } from '@/components/ui'

import CoveragePanel from './components/CoveragePanel'
import HealthMetricGrid from './components/HealthMetricGrid'
import ImportLedgerPanel from './components/ImportLedgerPanel'
import QualityIssueList from './components/QualityIssueList'
import StalenessBanner from './components/StalenessBanner'
import { useDataHealth } from './useDataHealth'

const PAGE_TITLE = 'Data Health'
const PAGE_SUBTITLE = 'How current your ledger is, and what the importer did to it'

export default function DataHealthPage() {
  const state = useDataHealth()

  // Error before empty/zero states: a failed fetch must never be shown as
  // "no issues found", which is the most dangerous lie this page could tell.
  if (state.isError) {
    return (
      <PageErrorState
        title={PAGE_TITLE}
        subtitle={PAGE_SUBTITLE}
        message="We could not read your import history, so we cannot tell you whether the rest of the app is up to date. Check your connection and try again."
        onRetry={state.retry}
      />
    )
  }

  if (state.isLoading) {
    return (
      <PageContainer>
        <PageHeader title={PAGE_TITLE} subtitle={PAGE_SUBTITLE} />
        <CardGridSkeleton count={4} cols="grid-cols-2 lg:grid-cols-4" />
        <TableSkeleton rows={3} />
        <TableSkeleton rows={4} />
      </PageContainer>
    )
  }

  const { health, freshness } = state
  if (!health || !freshness) return null

  if (state.isEmpty) {
    return (
      <PageContainer>
        <PageHeader title={PAGE_TITLE} subtitle={PAGE_SUBTITLE} />
        <EmptyState
          icon={Database}
          title="Nothing imported yet"
          description="Upload a bank statement and this page will report how fresh your ledger is, what the importer changed, and which rows need cleaning up."
          actionLabel="Upload a statement"
          actionHref={ROUTES.UPLOAD}
          variant="card"
        />
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      <PageHeader title={PAGE_TITLE} subtitle={PAGE_SUBTITLE} />

      <StalenessBanner freshness={freshness} />

      <HealthMetricGrid
        freshness={freshness}
        coverage={state.coverage}
        transactionCount={health.transaction_count}
        lastImportFileName={health.last_import_file_name}
      />

      {state.coverage && <CoveragePanel coverage={state.coverage} />}

      <QualityIssueList
        issues={state.issues}
        transactionCount={health.transaction_count}
        onAction={state.runIssueAction}
        pendingActionId={state.pendingActionId}
        failedActionId={state.failedActionId}
      />

      <ImportLedgerPanel
        rows={state.importLedger}
        fileName={health.last_import_file_name}
        importedAt={health.last_import_at}
      />
    </PageContainer>
  )
}
