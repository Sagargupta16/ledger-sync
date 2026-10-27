import { queryOptions, useQuery } from '@tanstack/react-query'

import { transactionsService, type TransactionFilters } from '@/services/api/transactions'
import type { Transaction } from '@/types'

const PAGE_SIZE = 1000
// 20,000 rows in one year is far past any personal ledger.
const MAX_PAGES = 20

/** Every row of one April-March tax year ("2025-26") in date order, optionally of one type. */
async function fetchYearRows(taxYear: string, type: string | undefined, signal?: AbortSignal): Promise<Transaction[]> {
  const start = Number(taxYear.slice(0, 4))
  const base: TransactionFilters = {
    ...(type ? { type } : {}),
    start_date: `${start}-04-01`,
    end_date: `${start + 1}-03-31`,
    limit: PAGE_SIZE,
    sort: 'date',
    sort_order: 'asc',
  }
  const rows: Transaction[] = []
  let cursor: string | undefined
  for (let page = 0; page < MAX_PAGES; page++) {
    const response = await transactionsService.getTransactionsPaginated(
      cursor ? { ...base, cursor } : { ...base, offset: rows.length },
      signal,
    )
    rows.push(...response.data)
    if (!response.has_more || response.data.length === 0) break
    cursor = response.next_cursor ?? undefined
  }
  return rows
}

/** The year's income rows: the ledger side of the AIS reconciliation. */
export const aisLedgerIncomeQuery = (taxYear: string) =>
  queryOptions({
    queryKey: ['ais-ledger-income', taxYear],
    queryFn: ({ signal }) => fetchYearRows(taxYear, 'Income', signal),
    staleTime: Infinity,
  })

/** Demo only: the whole year, which the sample statement is built from. */
export const aisLedgerYearQuery = (taxYear: string) =>
  queryOptions({
    queryKey: ['ais-ledger-year', taxYear],
    queryFn: ({ signal }) => fetchYearRows(taxYear, undefined, signal),
    staleTime: Infinity,
  })

/** Idle until a statement is open. */
export function useAisLedgerIncome(taxYear: string | null) {
  return useQuery({ ...aisLedgerIncomeQuery(taxYear ?? ''), enabled: Boolean(taxYear) })
}
