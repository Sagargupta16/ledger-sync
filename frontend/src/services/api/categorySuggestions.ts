import type { ParsedTransaction } from '@/lib/fileParser'

import { apiClient } from './client'

/** One suggested label; `confidence` is the model's probability, 0 to 1. */
export interface CategorySuggestion {
  category: string
  subcategory: string | null
  confidence: number
}

/** `GET /api/category-suggestions/status`: whether the per-user model is on yet. */
export interface CategorySuggestionStatus {
  ready: boolean
  training_rows: number
  /** The most categories within one type, income or expense: each type has its own model. */
  category_count: number
  min_training_rows: number
  min_categories: number
  confidence_floor: number
  /** Trimmed, lowercased labels that count as not categorized (Other, Uncategorised...). */
  placeholder_labels: string[]
}

export interface RowCategorySuggestions {
  ready: boolean
  /** One entry per request row, in request order; [] means the model abstained. */
  suggestions: CategorySuggestion[][]
  /** Request rows an active categorization rule recategorizes on import; they get []. */
  rule_matched: number
}

/** Request cap, matching backend `schemas/category_suggestions.py`. */
export const MAX_SUGGESTION_ROWS = 2_000
const NOTE_CHARS = 500

function normalizeLabel(value: string | null | undefined): string {
  return (value ?? '').trim().split(/\s+/).join(' ').toLowerCase()
}

/**
 * Mirror of backend `is_uncategorised`: a placeholder category with no real
 * subcategory under it. "Miscellaneous / Uncategorised" qualifies;
 * "Miscellaneous / Bank Fees" is a real label and does not.
 */
export function isUncategorised(
  category: string | null | undefined,
  subcategory: string | null | undefined,
  placeholders: ReadonlySet<string>,
): boolean {
  return placeholders.has(normalizeLabel(category)) && placeholders.has(normalizeLabel(subcategory))
}

export function formatSuggestionLabel(suggestion: CategorySuggestion): string {
  return suggestion.subcategory
    ? `${suggestion.category} / ${suggestion.subcategory}`
    : suggestion.category
}

export const categorySuggestionsService = {
  getStatus: async (): Promise<CategorySuggestionStatus> => {
    const response = await apiClient.get<CategorySuggestionStatus>('/api/category-suggestions/status')
    return response.data
  },

  /**
   * Unsaved upload rows; at most `MAX_SUGGESTION_ROWS`. A POST only because the
   * rows travel in the body: the server scores them and saves nothing.
   */
  getForRows: async (rows: readonly ParsedTransaction[]): Promise<RowCategorySuggestions> => {
    // Long narrations add nothing past their first words and could push the
    // body over Vercel's 4.5 MB request limit, so notes are cut at 500 characters.
    const trimmed = rows.map((row) => ({ ...row, note: row.note?.slice(0, NOTE_CHARS) }))
    const response = await apiClient.post<RowCategorySuggestions>('/api/category-suggestions', {
      rows: trimmed,
    })
    return response.data
  },
}
