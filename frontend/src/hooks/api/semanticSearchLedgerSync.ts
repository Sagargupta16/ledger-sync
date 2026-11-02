/**
 * Keeps cached smart-search results in step with writes to the ledger.
 * Used by useSemanticSearch.
 */

import type { QueryClient } from '@tanstack/react-query'

/** Signals that the shown rows changed arrive in bursts; one refetch per burst. */
const SIGNAL_WINDOW_MS = 50

const followed = new WeakSet<QueryClient>()

/**
 * Smart results are metered (each fetch embeds the query), so they stay cached
 * until something changes the rows they show. Two signals say so, and neither
 * needs every writer's key list repeated here: `['transactions-page']` being
 * invalidated (an excluded account, a rule run, an upload, a tag edit made on
 * the page), and a finished tag write itself (so results shown without that
 * query never keep old tags). One burst of signals becomes one refetch.
 */
export function followLedgerWrites(client: QueryClient, semanticSearchKey: readonly unknown[]) {
  if (followed.has(client)) return
  followed.add(client)
  let scheduled = false
  const refresh = () => {
    if (scheduled) return
    scheduled = true
    // A write signals twice, a few promise ticks apart (its onSuccess, then its success event).
    setTimeout(() => {
      scheduled = false
      void client.invalidateQueries({ queryKey: semanticSearchKey })
    }, SIGNAL_WINDOW_MS)
  }
  client.getQueryCache().subscribe((event) => {
    if (event.type !== 'updated' || event.action.type !== 'invalidate') return
    const [family] = event.query.queryKey as readonly unknown[]
    if (family === 'transactions-page') refresh()
  })
  client.getMutationCache().subscribe((event) => {
    if (event.type !== 'updated' || event.action.type !== 'success') return
    const key: readonly unknown[] | undefined = event.mutation.options.mutationKey
    if (key?.[0] === 'transactions' && key[1] === 'tags') refresh()
  })
}
