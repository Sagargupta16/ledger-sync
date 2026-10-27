import type { Transaction } from '@/types'

import { apiClient } from './client'

/** Why smart search cannot reach Amazon Bedrock for this user right now. */
export type SmartSearchUnavailableReason =
  | 'server_not_configured'
  | 'personal_key_missing'
  | 'provider_not_bedrock'

/** `GET /api/semantic-search/status`: Bedrock readiness and index coverage. */
export interface SemanticSearchStatus {
  available: boolean
  reason: SmartSearchUnavailableReason | null
  /** Human-readable reason when `available` is false. */
  message: string | null
  /** `app` spends the server's Bedrock access, `personal` the user's own key. */
  funding: 'app' | 'personal' | null
  model: string
  dimensions: number
  region: string
  /** Live rows the Transactions page lists. */
  total: number
  /** Rows whose vector matches their current text. */
  indexed: number
  /** Rows with no vector yet, or whose note, category or account changed. */
  pending: number
  batch_size: number
  /** App-funded embedding tokens allowed per UTC day; null when no cap applies. */
  daily_token_limit: number | null
  tokens_today: number
}

/** Progress after one `POST /api/semantic-search/index` call; call again until `done`. */
export interface SemanticIndexBatch {
  embedded: number
  failed: number
  total: number
  indexed: number
  pending: number
  done: boolean
  input_tokens: number
  cost_usd: number
  /** Set when some rows of the batch failed and stay pending. */
  error: string | null
}

export interface SemanticSearchHit {
  transaction: Transaction
  /** Cosine similarity of the row's text to the query, -1 to 1; higher is closer. */
  score: number
}

export interface SemanticSearchResults {
  query: string
  /** Best match first. */
  results: SemanticSearchHit[]
  /** Rows that have a vector; 0 means nothing was searched. */
  indexed: number
  model: string
}

/** The search text plus the page filters the backend applies before ranking. */
export interface SemanticSearchParams {
  q: string
  /** The backend caps this at 100. */
  limit?: number
  category?: string
  account?: string
  type?: string
  tag?: string
  start_date?: string
  end_date?: string
  min_amount?: number
  max_amount?: number
}

export const semanticSearchService = {
  getStatus: async (signal?: AbortSignal): Promise<SemanticSearchStatus> => {
    const response = await apiClient.get<SemanticSearchStatus>('/api/semantic-search/status', {
      signal,
    })
    return response.data
  },

  /** Embeds `q` with Bedrock (counted as AI usage) and ranks the indexed rows. */
  search: async (
    params: SemanticSearchParams,
    signal?: AbortSignal,
  ): Promise<SemanticSearchResults> => {
    const response = await apiClient.get<SemanticSearchResults>('/api/semantic-search', {
      params,
      signal,
    })
    return response.data
  },

  /** Embeds the next batch of new or changed rows. */
  indexBatch: async (): Promise<SemanticIndexBatch> => {
    const response = await apiClient.post<SemanticIndexBatch>('/api/semantic-search/index')
    return response.data
  },

  /** Deletes every stored vector for this user. */
  deleteIndex: async (): Promise<{ deleted: number }> => {
    const response = await apiClient.delete<{ deleted: number }>('/api/semantic-search/index')
    return response.data
  },
}
