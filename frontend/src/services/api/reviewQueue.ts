import { apiClient } from './client'

/** Only income and expense rows are reviewed; a transfer's category is a routing label. */
export type ReviewableType = 'Income' | 'Expense'

export type ReviewDecision = 'keep' | 'change'

export interface ReviewSuggestion {
  category: string
  subcategory: string | null
  /** The suggester's probability, 0 to 1; null when it reports none. */
  confidence: number | null
}

export interface ReviewItem {
  transaction_id: string
  /** `YYYY-MM-DD` ledger day. */
  date: string
  amount: number
  type: ReviewableType
  account: string
  category: string
  subcategory: string | null
  note: string | null
  /** At most two, never the row's own label. */
  suggestions: ReviewSuggestion[]
}

export interface ReviewCategoryOption {
  type: ReviewableType
  category: string
  /** Most used first. */
  subcategories: string[]
  count: number
}

export interface ReviewQueue {
  /** The newest unreviewed rows of the window, newest first. */
  items: ReviewItem[]
  /** Every unreviewed row in the window, `items` included. */
  remaining: number
  /** The window's rows that already carry a decision. */
  reviewed: number
  window_start: string | null
  window_days: number
  categories: ReviewCategoryOption[]
}

export interface ReviewRequest {
  action: ReviewDecision
  category?: string | null
  subcategory?: string | null
}

export interface ReviewResult {
  transaction_id: string
  decision: ReviewDecision
  category: string
  subcategory: string | null
  /** The label the import gives the row; Undo restores it. */
  imported_category: string
  imported_subcategory: string | null
}

export const REVIEW_QUEUE_BATCH = 20

export const reviewQueueService = {
  /** `limit` and `days` are QUERY params on the handler. */
  getQueue: async (limit = REVIEW_QUEUE_BATCH): Promise<ReviewQueue> => {
    const response = await apiClient.get<ReviewQueue>('/api/review-queue', { params: { limit } })
    return response.data
  },

  /** A change survives every later import; a keep only marks the row reviewed. */
  review: async (transactionId: string, body: ReviewRequest): Promise<ReviewResult> => {
    const response = await apiClient.put<ReviewResult>(
      `/api/review-queue/${encodeURIComponent(transactionId)}`,
      body,
    )
    return response.data
  },

  /** Forget the review; a changed row gets its imported category back. */
  undo: async (transactionId: string): Promise<void> => {
    await apiClient.delete(`/api/review-queue/${encodeURIComponent(transactionId)}`)
  },
}
