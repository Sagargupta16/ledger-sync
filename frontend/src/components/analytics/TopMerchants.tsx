import { useMemo, useState } from 'react'

import { motion } from 'motion/react'
import { Store } from 'lucide-react'

import ChartEmptyState from '@/components/shared/ChartEmptyState'
import { ChartSkeleton } from '@/components/shared/LoadingSkeleton'
import { Money } from '@/components/ui'
import { CHART_COLORS } from '@/constants/chartColors'
import { useMerchantIntelligence } from '@/hooks/api/useAnalyticsV2'
import { formatCurrency } from '@/lib/formatters'
import {
  toLabelKind,
  usableMerchants,
} from '@/pages/merchant-intelligence/merchantUtils'
import type { MerchantRow } from '@/pages/merchant-intelligence/types'

interface TopMerchantsProps {
  /**
   * When set, only payees whose PRIMARY category matches are listed.
   *
   * The rollup stores one category per payee, not a per-category split, so a
   * payee that spans categories is matched on its primary one and its total is
   * its whole spend. The card says so under the heading rather than implying
   * the amounts were re-cut per category.
   */
  readonly categoryFilter?: string | null
}

const COLORS = CHART_COLORS
const TOP_N = 10

/** Rollup floor: the backend already drops single-payment labels. */
const MIN_TRANSACTIONS = 2
const ROW_LIMIT = 200

/**
 * Top payees, read from the server-side merchant rollup.
 *
 * This used to call `useTransactions()` with no arguments -- the entire ledger
 * (~3.8 MB on a real account) into the browser just to re-split notes in JS on
 * every render. The backend already extracts, aggregates and brand-classifies
 * merchants in `core/analytics/merchants.py`, so this reads that instead: one
 * bounded payload, and the same brand/descriptor honesty the dedicated page has.
 *
 * The trade the rollup forces: it is whole-ledger and one-category-per-payee, so
 * this card cannot honour a date window and cannot re-cut a payee's spend by
 * category. It therefore takes no `dateRange` at all (a prop that only changed
 * a subtitle was worse than none) and states its real scope in the header.
 */
export default function TopMerchants({ categoryFilter }: TopMerchantsProps) {
  const { data, isPending } = useMerchantIntelligence({
    min_transactions: MIN_TRANSACTIONS,
    limit: ROW_LIMIT,
  })
  const [viewMode, setViewMode] = useState<'amount' | 'frequency'>('amount')

  const merchants = useMemo<MerchantRow[]>(() => {
    const rows = usableMerchants(data ?? []).filter(
      (row) => !categoryFilter || row.category === categoryFilter,
    )
    // Spread-then-sort, not `toSorted`: toSorted needs Firefox 115 and Vite 8's
    // default `baseline-widely-available` target is firefox114, with no polyfill
    // injected. Guarded by `lib/demo/__tests__/browserTargetBuiltins.test.ts`.
    const sorted = [...rows].sort((a, b) =>
      viewMode === 'amount'
        ? b.total_spent - a.total_spent
        : b.transaction_count - a.transaction_count,
    )
    return sorted.slice(0, TOP_N)
  }, [data, viewMode, categoryFilter])

  const totalAtTop = merchants.reduce((sum, m) => sum + m.total_spent, 0)
  const visitsAtTop = merchants.reduce((sum, m) => sum + m.transaction_count, 0)
  const maxMetric = merchants.reduce(
    (max, m) => Math.max(max, viewMode === 'amount' ? m.total_spent : m.transaction_count),
    0,
  )

  // One line, always shown, naming both limits of the rollup this reads. The
  // category variant additionally warns that a payee's total is its full spend:
  // the rollup keeps a single primary category per payee, so a payee that spans
  // categories cannot be split and one whose primary category differs is absent.
  const subtitle = categoryFilter
    ? `All-time payees whose main category is ${categoryFilter}, at their full spend`
    : 'All-time totals per payee, not filtered by the date range above'

  if (isPending) {
    return <ChartSkeleton height="h-80" />
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-2xl border border-border p-6"
    >
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-app-orange/20 p-3">
            <Store className="h-6 w-6 text-app-orange" />
          </div>
          <div>
            <h3 className="text-lg font-semibold">Top Merchants</h3>
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setViewMode('amount')}
            aria-pressed={viewMode === 'amount'}
            className={`min-h-11 rounded-lg px-3 py-2.5 text-sm transition-colors ${
              viewMode === 'amount'
                ? 'bg-primary text-primary-foreground'
                : 'bg-background/50 hover:bg-background/70'
            }`}
          >
            By Amount
          </button>
          <button
            type="button"
            onClick={() => setViewMode('frequency')}
            aria-pressed={viewMode === 'frequency'}
            className={`min-h-11 rounded-lg px-3 py-2.5 text-sm transition-colors ${
              viewMode === 'frequency'
                ? 'bg-primary text-primary-foreground'
                : 'bg-background/50 hover:bg-background/70'
            }`}
          >
            By Frequency
          </button>
        </div>
      </div>

      {merchants.length === 0 ? (
        <ChartEmptyState message="No payees identified yet. Transaction notes are what name a payee." />
      ) : (
        // A ranked list with an inline proportional bar per row reads merchant
        // magnitudes more accurately than a >7-slice donut did -- and it keeps
        // the rich per-merchant detail (visits, avg) the donut couldn't show.
        <div className="space-y-2">
          {merchants.map((merchant, index) => {
            const metric = viewMode === 'amount' ? merchant.total_spent : merchant.transaction_count
            const barWidth = maxMetric > 0 ? (metric / maxMetric) * 100 : 0
            const isNote = toLabelKind(merchant.label_kind) === 'descriptor'
            return (
              <div
                key={`${merchant.merchant}-${merchant.label_kind ?? 'unclassified'}`}
                className="relative flex items-center gap-3 overflow-hidden rounded-xl bg-background/30 p-3 transition-colors hover:bg-background/50"
              >
                {/* Proportional bar behind the row content */}
                <div
                  aria-hidden
                  className="absolute inset-y-0 left-0 rounded-xl opacity-15"
                  style={{ width: `${barWidth}%`, backgroundColor: COLORS[index % COLORS.length] }}
                />
                <div
                  className="relative flex size-8 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-foreground"
                  style={{ backgroundColor: COLORS[index % COLORS.length] }}
                >
                  {index + 1}
                </div>
                <div className="relative min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {merchant.merchant}
                    {isNote && (
                      <span
                        className="ml-1.5 text-[11px] font-normal text-text-tertiary"
                        title="Raw transaction note, so this describes what was bought rather than who was paid."
                      >
                        (note)
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {merchant.transaction_count} payments &middot; Avg{' '}
                    {formatCurrency(merchant.avg_transaction)}
                  </p>
                </div>
                <Money value={merchant.total_spent} bold className="relative" />
              </div>
            )
          })}
        </div>
      )}

      {merchants.length > 0 && (
        <div className="mt-4 grid grid-cols-1 gap-4 border-t border-border pt-4 text-center sm:grid-cols-3">
          <div>
            <p className="text-2xl font-bold text-app-orange">{merchants.length}</p>
            <p className="text-xs text-muted-foreground">Payees Shown</p>
          </div>
          <div>
            <p className="text-2xl font-bold tabular-nums break-all">
              {formatCurrency(totalAtTop)}
            </p>
            <p className="text-xs text-muted-foreground">Total at Top {merchants.length}</p>
          </div>
          <div>
            <p className="text-2xl font-bold tabular-nums">{visitsAtTop}</p>
            <p className="text-xs text-muted-foreground">Payments</p>
          </div>
        </div>
      )}
    </motion.div>
  )
}
