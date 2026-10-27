import { useMemo } from 'react'

import { useAccountBalances } from '@/hooks/api/useAnalytics'
import { useAccountClassifications } from '@/hooks/api/useAccountClassifications'
import { usePreferences } from '@/hooks/api/usePreferences'
import { getLedgerTodayKey } from '@/lib/dateUtils'

import { seedPotsFromAccounts, type PotSeed } from './monteCarloSeed'

const NO_SEED: PotSeed = { balances: { equity: 0, debt: 0, cash: 0 }, netWorth: 0 }

/**
 * Today's net worth split into the simulation's pots. Balances are read at the
 * ledger's own today, exactly as the Net Worth page reads them, so both pages
 * start from one figure and share one cached request. The split needs all
 * three sources: without account types or investment mappings a PPF or EPF
 * account lands in the wrong pot. So the pots stay at zero until every source
 * has loaded, and `failed` names the ones that did not.
 */
export function useMonteCarloSeed() {
  const dateParams = { end_date: getLedgerTodayKey() }
  const balancesQuery = useAccountBalances(dateParams)
  const classificationsQuery = useAccountClassifications()
  const preferencesQuery = usePreferences()
  const sources = [
    { label: 'account balances', query: balancesQuery },
    { label: 'account types', query: classificationsQuery },
    { label: 'investment account mappings', query: preferencesQuery },
  ] as const
  const failed = sources.filter(({ query }) => query.isError).map(({ label }) => label)
  const isLoading = sources.some(({ query }) => query.isLoading)
  const ready = failed.length === 0 && !isLoading
  const accounts = balancesQuery.data?.accounts
  const classifications = classificationsQuery.data
  const mappings = preferencesQuery.data?.investment_account_mappings

  const seed = useMemo(
    () => (ready ? seedPotsFromAccounts(accounts ?? {}, classifications ?? {}, mappings ?? {}) : NO_SEED),
    [ready, accounts, classifications, mappings],
  )

  return {
    seed,
    isLoading,
    /** The sources that did not load, in reading order; empty when none failed. */
    failed,
    retry: () => {
      for (const { query } of sources) void query.refetch()
    },
  }
}
