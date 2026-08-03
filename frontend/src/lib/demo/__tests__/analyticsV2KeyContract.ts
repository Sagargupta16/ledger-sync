/**
 * Test helper: maps every analyticsV2 query-key segment back to the exported
 * key factory, so a seeded key can be round-tripped and compared.
 *
 * Kept beside the test rather than inside it so the spec file stays readable.
 * `V2_ENDPOINTS` is asserted to be exhaustive against `analyticsV2Keys` in
 * `seedDemoCache.test.tsx` -- adding a factory entry without a row here fails.
 */

import { hashKey } from '@tanstack/react-query'

import { analyticsV2Keys } from '@/hooks/api/useAnalyticsV2'
import { dataHealthKeys } from '@/hooks/api/useDataHealthQuery'

const num = (value: unknown): number | undefined => (typeof value === 'number' ? value : undefined)
const str = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined)
const bool = (value: unknown): boolean | undefined => (typeof value === 'boolean' ? value : undefined)

interface V2Endpoint {
  /** Second element of the query key. */
  readonly segment: string
  /** Rebuilds the canonical key from a seeded key's tail, via the real factory. */
  readonly build: (tail: readonly unknown[]) => readonly unknown[]
}

/**
 * Every analyticsV2 endpoint, with its tail positions mapped back through the
 * exported factory. If a factory gains a param, the rebuilt key grows and any
 * literal seed for that endpoint stops matching -- which is the point.
 */
export const V2_ENDPOINTS: readonly V2Endpoint[] = [
  {
    segment: 'daily-summaries',
    build: (t) => analyticsV2Keys.dailySummaries({ start_date: str(t[0]), end_date: str(t[1]), limit: num(t[2]) }),
  },
  { segment: 'cohort-spending', build: () => analyticsV2Keys.cohortSpending() },
  { segment: 'investment-holdings', build: (t) => analyticsV2Keys.investmentHoldings({ active_only: bool(t[0]) }) },
  { segment: 'monthly-summaries', build: (t) => analyticsV2Keys.monthlySummaries({ limit: num(t[0]) }) },
  {
    segment: 'category-trends',
    build: (t) => analyticsV2Keys.categoryTrends({ category: str(t[0]), limit: num(t[1]) }),
  },
  // Param-free factories: the handlers declare no query params, so there is one
  // key each and the tail must be empty. A seed carrying a tail value here is a
  // mismatch, which is what caught the stale `['analyticsV2','transfer-flows']`
  // literal -- it happened to match while the factory still had paging in it.
  { segment: 'transfer-flows', build: () => analyticsV2Keys.transferFlows() },
  {
    segment: 'recurring-transactions',
    build: (t) =>
      analyticsV2Keys.recurringTransactions({
        active_only: bool(t[0]),
        min_confidence: num(t[1]),
        pattern_kind: str(t[2]),
      }),
  },
  {
    segment: 'merchant-intelligence',
    build: (t) =>
      analyticsV2Keys.merchantIntelligence({
        min_transactions: num(t[0]),
        recurring_only: bool(t[1]),
        limit: num(t[2]),
      }),
  },
  { segment: 'net-worth', build: (t) => analyticsV2Keys.netWorth({ limit: num(t[0]) }) },
  { segment: 'fy-summaries', build: () => analyticsV2Keys.fySummaries() },
  {
    segment: 'anomalies',
    build: (t) =>
      analyticsV2Keys.anomalies({
        type: str(t[0]),
        severity: str(t[1]),
        include_reviewed: bool(t[2]),
        limit: num(t[3]),
      }),
  },
  { segment: 'budgets', build: (t) => analyticsV2Keys.budgets({ active_only: bool(t[0]) }) },
  {
    segment: 'goals',
    build: (t) => analyticsV2Keys.goals({ goal_type: str(t[0]), include_achieved: bool(t[1]) }),
  },
  {
    segment: 'spending-rule',
    build: (t) => analyticsV2Keys.spendingRule({ start_date: str(t[0]), end_date: str(t[1]) }),
  },
]

/**
 * `data-health` lives under the `analyticsV2` key prefix but is built by
 * `dataHealthKeys` in its own hook file, not by `analyticsV2Keys`. It therefore
 * belongs in the round-trip check (a prefetch can drift from it like any other)
 * but NOT in `factorySegments()`, which enumerates `analyticsV2Keys` to assert
 * exhaustiveness -- listing it there would fail that assertion in the opposite
 * direction.
 */
const EXTERNAL_ENDPOINTS: readonly V2Endpoint[] = [
  { segment: 'data-health', build: () => dataHealthKeys.summary() },
]

/** `null` when the key round-trips through its factory unchanged, else the reason. */
export function factoryMismatch(key: readonly unknown[]): string | null {
  const endpoint = [...V2_ENDPOINTS, ...EXTERNAL_ENDPOINTS].find((e) => e.segment === key[1])
  if (!endpoint) return `unknown analyticsV2 endpoint '${String(key[1])}'`
  const rebuilt = endpoint.build(key.slice(2))
  if (hashKey(rebuilt) !== hashKey(key)) {
    return `seed=${JSON.stringify(key)} (${key.length}) vs factory=${JSON.stringify(rebuilt)} (${rebuilt.length})`
  }
  return null
}

/** Key segments the factory actually exposes, for the exhaustiveness assertion. */
export function factorySegments(): readonly string[] {
  return Object.entries(analyticsV2Keys)
    .filter(([name]) => name !== 'all')
    .map(([, build]) => String((build as () => readonly unknown[])()[1]))
}
