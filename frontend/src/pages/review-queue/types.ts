import type { ReviewDecision, ReviewItem } from '@/services/api/reviewQueue'

export interface CategoryLabel {
  category: string
  subcategory: string | null
}

/** One decision of this visit, newest last; Undo pops it. */
export interface ReviewStep {
  item: ReviewItem
  decision: ReviewDecision
  /** The label a change moved the row to. */
  label?: CategoryLabel
}

/**
 * Where the top card leaves to and where the next one comes from: -1 left,
 * 1 right, 0 behind the deck (a card moving up, or going back down on Undo).
 */
export interface DeckMotion {
  exitTo: -1 | 0 | 1
  enterFrom: -1 | 0 | 1
}

export interface ReviewProgressCounts {
  reviewed: number
  total: number
  windowDays: number
}
