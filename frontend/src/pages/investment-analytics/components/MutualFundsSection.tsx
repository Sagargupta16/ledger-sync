import { useState } from 'react'

import { CardGridSkeleton } from '@/components/shared/LoadingSkeleton'
import { Button } from '@/components/ui'
import { useMfHoldings } from '@/hooks/api/useMfHoldings'
import type { CasImportResult } from '@/services/api/cas'

import { CasUploadPanel } from './CasUploadPanel'
import { ImportResultBanner } from './ImportResultBanner'
import { MfHoldingsTable } from './MfHoldingsTable'
import { MfSummary } from './MfSummary'

/**
 * Mutual funds from an imported CAS: market value at AMFI's latest NAV, with
 * cost, gain and XIRR from the statement's own transactions. Unlike the ledger
 * figures above it, these are market values, so they can carry a real return.
 */
export function MutualFundsSection() {
  const query = useMfHoldings()
  const [showImport, setShowImport] = useState(false)
  // Kept here, not in the panel: a first import swaps the panel for the table, so the
  // panel (and anything it remembers) is gone by the time the result matters.
  const [imported, setImported] = useState<CasImportResult | null>(null)
  const data = query.data
  const hasHoldings = (data?.holdings.length ?? 0) > 0

  const handleImported = (result: CasImportResult) => {
    setImported(result)
    setShowImport(false)
  }
  const toggleImport = () => {
    setShowImport((open) => !open)
    setImported(null)
  }

  return (
    <section
      className="ledger-panel space-y-4 p-4 sm:p-5"
      aria-labelledby="mutual-funds-title"
      aria-busy={query.isPending}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="mutual-funds-title" className="text-base font-semibold text-foreground">
            Mutual funds from your CAS
          </h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Market value at AMFI&apos;s latest NAV, with cost, gain and XIRR from your Consolidated
            Account Statement.
          </p>
        </div>
        {hasHoldings && (
          <Button variant="secondary" size="sm" aria-expanded={showImport} onClick={toggleImport}>
            {showImport ? 'Hide import' : 'Import a newer CAS'}
          </Button>
        )}
      </div>

      {imported && <ImportResultBanner result={imported} onDismiss={() => setImported(null)} />}
      {query.isPending && <CardGridSkeleton count={4} cols="grid-cols-2 xl:grid-cols-4" />}
      {query.isError && (
        <div className="space-y-2">
          <p role="alert" className="text-sm text-app-red">
            Could not load your mutual fund holdings.
          </p>
          <Button variant="secondary" size="sm" onClick={() => void query.refetch()}>
            Retry
          </Button>
        </div>
      )}
      {data && hasHoldings && (
        <>
          <MfSummary
            data={data}
            isRefreshing={query.isFetching}
            onRefresh={() => void query.refetch()}
          />
          <MfHoldingsTable holdings={data.holdings} />
        </>
      )}
      {!query.isPending && (!hasHoldings || showImport) && (
        <CasUploadPanel onImported={handleImported} />
      )}
    </section>
  )
}
