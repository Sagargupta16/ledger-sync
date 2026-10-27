import { useState, type ReactNode } from 'react'

import type { UseQueryResult } from '@tanstack/react-query'
import { Sparkles } from 'lucide-react'

import ErrorState from '@/components/shared/ErrorState'
import { ProgressBar } from '@/components/shared'
import { Button, ConfirmDialog, Spinner } from '@/components/ui'
import { useBuildSemanticIndex, useDeleteSemanticIndex } from '@/hooks/api/useSemanticSearch'
import { getApiErrorMessage } from '@/lib/errorUtils'
import { getActiveLocale } from '@/lib/formatters'
import type { SemanticSearchStatus } from '@/services/api/semanticSearch'
import { useDemoStore } from '@/store/demoStore'

const HEADING_ID = 'smart-search-heading'
const count = (value: number) => value.toLocaleString(getActiveLocale())

function Shell({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <section className="ledger-panel space-y-3 p-4" aria-labelledby={HEADING_ID}>
      <div className="flex items-center gap-2">
        <Sparkles className="size-4 shrink-0 text-app-blue" aria-hidden />
        <h2 id={HEADING_ID} className="text-sm font-semibold text-foreground">Smart search</h2>
      </div>
      {children}
    </section>
  )
}

function coverage({ total, indexed, pending }: SemanticSearchStatus): string {
  if (total === 0) return 'Nothing to index yet. Import transactions first.'
  if (indexed === 0) {
    return `Find transactions by meaning, so "coffee" also finds a cafe whose note never says coffee. Smart search is opt-in: build the index to turn it on for your ${count(total)} transactions.`
  }
  if (pending === 0) return `Covers all ${count(total)} transactions. Describe what you want, like "coffee with friends" or "cab to the airport".`
  return `${count(indexed)} of ${count(total)} transactions are indexed. ${count(pending)} new or changed ones are not yet.`
}

/** What leaves the server, said before the button that sends it (and again while it is on). */
function disclosure(status: SemanticSearchStatus, isDemoMode: boolean): string {
  if (isDemoMode) {
    return 'Demo data: results are ranked by text similarity in your browser, and nothing is sent anywhere.'
  }
  const billing = status.funding === 'personal' ? ', billed to your own Bedrock key' : ''
  return `Only the note, category, subcategory and account of each row, and the text you search for, go to Amazon Titan Text Embeddings V2 (${status.region}), never amounts or dates. Indexing and every smart search count toward your AI usage${billing}.`
}

/** Deleting the stored vectors must stay possible even when Bedrock can no longer be reached. */
function RemoveIndexButton() {
  const remove = useDeleteSemanticIndex()
  const [confirming, setConfirming] = useState(false)
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setConfirming(true)}
        disabled={remove.isPending}
        className="text-text-tertiary"
      >
        Remove index
      </Button>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Remove the smart search index?"
        description="This deletes the stored embeddings of your transactions. Smart search stays off until you build the index again, which sends the text to Bedrock again."
        confirmLabel="Remove index"
        variant="danger"
        onConfirm={() => remove.mutate()}
      />
    </>
  )
}

/**
 * Opt-in, progress and coverage for the smart search index on /transactions.
 * The server sends nothing to Bedrock until the user presses Build index.
 */
export default function SmartSearchIndexCard({
  statusQuery,
}: Readonly<{ statusQuery: UseQueryResult<SemanticSearchStatus> }>) {
  const isDemoMode = useDemoStore((state) => state.isDemoMode)
  const build = useBuildSemanticIndex()

  if (statusQuery.isPending) {
    return (
      <Shell>
        <div className="flex items-center gap-2 text-xs text-text-tertiary">
          <Spinner size="sm" />
          <span>Checking the smart search index...</span>
        </div>
      </Shell>
    )
  }

  if (statusQuery.isError) {
    return (
      <Shell>
        <ErrorState
          variant="inline"
          message="Smart search status could not load. Regular search still works."
          onRetry={() => void statusQuery.refetch()}
        />
      </Shell>
    )
  }

  const status = statusQuery.data
  if (!status.available) {
    return (
      <Shell>
        <p className="text-xs leading-5 text-text-secondary" role="note">
          {status.message ?? 'Smart search cannot reach Amazon Bedrock right now.'}
        </p>
        <p className="text-xs leading-5 text-text-tertiary">
          The search box keeps matching words until Smart search can run.
        </p>
        {status.indexed > 0 && !isDemoMode && (
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs leading-5 text-text-tertiary">
              Your index of {count(status.indexed)} transactions is still stored.
            </p>
            <RemoveIndexButton />
          </div>
        )}
      </Shell>
    )
  }

  // `running` also covers a loop started before this card last mounted.
  const indexing = build.running
  const canIndex = !isDemoMode && status.pending > 0 && !indexing
  let actionLabel = 'Update index'
  if (build.isError) actionLabel = 'Resume indexing'
  else if (status.indexed === 0) actionLabel = 'Build index'

  return (
    <Shell>
      {indexing ? (
        <div className="space-y-2" aria-live="polite">
          <ProgressBar value={status.indexed} max={Math.max(status.total, 1)} ariaLabel="Smart search index progress" />
          <p className="text-xs leading-5 text-text-secondary">
            Indexing {count(status.indexed)} of {count(status.total)} transactions. You can keep
            using the page.
          </p>
        </div>
      ) : (
        <p className="text-xs leading-5 text-text-secondary">{coverage(status)}</p>
      )}

      {build.isError && !indexing && (
        <p className="text-xs leading-5 text-app-red" role="alert">
          {getApiErrorMessage(build.error, 'Indexing stopped. Try again shortly.')} Rows already
          indexed stay searchable.
        </p>
      )}
      {build.isSuccess && build.data?.error && !build.data.done && (
        <p className="text-xs leading-5 text-app-orange" role="status">{build.data.error}</p>
      )}

      <p className="text-xs leading-5 text-text-secondary">{disclosure(status, isDemoMode)}</p>

      <div className="flex flex-wrap items-center gap-2">
        {canIndex && (
          <Button variant="primary" size="sm" onClick={() => build.mutate()}>
            {actionLabel}
          </Button>
        )}
        {indexing && (
          <Button variant="secondary" size="sm" onClick={build.stop}>
            Stop after this batch
          </Button>
        )}
        {!isDemoMode && !indexing && status.indexed > 0 && <RemoveIndexButton />}
      </div>
    </Shell>
  )
}
