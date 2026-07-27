/**
 * Types for the Data Health page.
 *
 * The page answers one question the rest of the app never asks: "is what I am
 * looking at actually my current money picture?" Every metric elsewhere is
 * rendered with total confidence, so the staleness and data-quality facts have
 * to live somewhere explicit.
 */

/** How far behind the ledger is, bucketed for copy + colour. */
export type FreshnessLevel = 'fresh' | 'aging' | 'stale' | 'critical'

export interface FreshnessAssessment {
  readonly level: FreshnessLevel
  /** Whole days between the newest ledger row and today. 0 when caught up. */
  readonly gapDays: number
  /** Days since an import last ran; null when nothing was ever imported. */
  readonly daysSinceImport: number | null
  /** Newest transaction date (`YYYY-MM-DD`), null on an empty ledger. */
  readonly latestDate: string | null
  /** Concrete one-liner, e.g. "Data ends Jul 04, 2026. 22 days unimported." */
  readonly headline: string
  /** Second line naming the import that produced the current state. */
  readonly detail: string
}

/** A count-based data-quality fact the ledger currently carries. */
export type IssueSeverity = 'clean' | 'warning' | 'critical'

export interface QualityIssue {
  readonly id: string
  readonly label: string
  readonly count: number
  /** Percent of the whole ledger this count represents. */
  readonly shareOfLedger: number
  readonly severity: IssueSeverity
  /** Why the rows are a problem. */
  readonly explanation: string
  /** What the user can do about it. */
  readonly guidance: string
  /**
   * How to present the issue. Defaults to `count`.
   *
   * `flag` is for a condition that is either true or false rather than a
   * quantity of bad rows -- stale rollups affect the whole ledger, so rendering
   * "1" and a 0%-of-rows bar would describe it as the smallest possible problem
   * when it is the largest.
   */
  readonly kind?: 'count' | 'flag'
  /** Label for an in-place fix button. Omitted when the fix is manual. */
  readonly actionLabel?: string
}

export interface CoverageSummary {
  readonly earliestDate: string
  readonly latestDate: string
  /** Inclusive days between the first and last imported transaction. */
  readonly coveredDays: number
  /** Days after the last transaction, up to today. */
  readonly gapDays: number
  /** `coveredDays + gapDays` -- the full span the ledger should reach. */
  readonly totalDays: number
}

/** One line of "what the last import actually did to your data". */
export interface ImportLedgerRow {
  readonly id: string
  readonly label: string
  readonly count: number
  readonly hint: string
}
