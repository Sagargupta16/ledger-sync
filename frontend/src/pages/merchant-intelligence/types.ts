import type { MerchantIntelligence } from '@/hooks/api/useAnalyticsV2'

/**
 * How the backend extractor derived a merchant label
 * (`core/analytics/merchant_extract.py`):
 *   - `brand`      -- a recognised payee ("Uber", "Apple", "Swiggy").
 *   - `descriptor` -- the transaction note itself ("Juice - Pineapple"), i.e.
 *     WHAT was bought, not WHO was paid.
 *
 * The distinction has to survive into the UI: labelling a descriptor row as a
 * merchant would tell the user they "paid Juice - Pineapple 40 times".
 */
export type LabelKind = 'brand' | 'descriptor'

/**
 * A merchant-intelligence row as the API actually returns it.
 *
 * `MerchantIntelligence` in `services/api/analyticsV2.ts` predates the
 * brand/descriptor split and still omits `label_kind` and `aliases`, both of
 * which `/api/analytics/v2/merchant-intelligence` returns today. They are
 * declared optional here on purpose -- rollups built before the `label_kind`
 * column landed (and the demo-mode adapter) omit the field, so every consumer
 * must tolerate `undefined` instead of assuming a kind.
 */
export interface MerchantRow extends MerchantIntelligence {
  readonly label_kind?: string
  /** Raw note spellings that folded into this label (capped at 25 server-side). */
  readonly aliases?: readonly string[]
}

/**
 * Active label-kind filter.
 *
 * A strict partition of the rows: `all`, the two kinds the backend emits, and
 * `unclassified` for rows from a rollup built before `label_kind` existed. Every
 * row falls in exactly one non-`all` bucket, which is what lets the filter chips
 * show a count that matches what clicking them actually yields.
 */
export type KindFilter = 'all' | LabelKind | 'unclassified'

export interface MerchantKindCounts {
  readonly brand: number
  readonly descriptor: number
  /** Rows from a rollup built before `label_kind` existed. */
  readonly unclassified: number
}

export interface MerchantStats {
  /** Labels left after placeholder filtering and the active filters. */
  readonly merchantCount: number
  readonly trackedSpend: number
  readonly trackedPayments: number
  readonly topBySpend: MerchantRow | null
  readonly topByFrequency: MerchantRow | null
  /** trackedSpend / trackedPayments -- the average payment, not the average merchant. */
  readonly avgTicket: number
  /** Median of each merchant's own average, so one heavy payer cannot skew it. */
  readonly medianMerchantTicket: number
  /** Share of tracked spend held by the single biggest merchant, in percent. */
  readonly topShare: number
  /** How many merchants it takes to reach the Pareto threshold. */
  readonly vitalFewCount: number
  /** Cumulative share those vital-few merchants actually reach, in percent. */
  readonly vitalFewShare: number
}
