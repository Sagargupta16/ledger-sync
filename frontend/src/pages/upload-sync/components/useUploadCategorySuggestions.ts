import { useMemo } from 'react'

import {
  useCategorySuggestionStatus,
  useUploadRowSuggestions,
} from '@/hooks/api/useCategorySuggestions'
import type { ParsedTransaction } from '@/lib/fileParser'
import { isUncategorised, type CategorySuggestion } from '@/services/api/categorySuggestions'

export interface SuggestedRow {
  readonly row: ParsedTransaction
  readonly suggestions: readonly CategorySuggestion[]
}

/**
 * The file's income and expense rows whose labels are placeholders, the model's
 * status, and its suggestions for those rows with the most confident first.
 * Rows the model abstained on, and rows a categorization rule will set on
 * import (the server returns [] for both), are not in `suggested`.
 */
export function useUploadCategorySuggestions(rows: readonly ParsedTransaction[], fileHash: string) {
  const status = useCategorySuggestionStatus()
  const targets = useMemo(() => {
    if (!status.data) return []
    const placeholders = new Set(status.data.placeholder_labels)
    return rows.filter((row) => !row.type.toLowerCase().includes('transfer')
      && isUncategorised(row.category, row.subcategory, placeholders))
  }, [rows, status.data])
  const query = useUploadRowSuggestions(fileHash, targets, status.data?.ready === true)
  const suggested = useMemo<SuggestedRow[]>(() => {
    const scored = query.data?.suggestions ?? []
    return targets
      .slice(0, scored.length)
      .map((row, index) => ({ row, suggestions: scored[index] ?? [] }))
      .filter((item) => item.suggestions.length > 0)
      .sort((left, right) => right.suggestions[0].confidence - left.suggestions[0].confidence)
  }, [targets, query.data])
  return { status: status.data, targets, query, suggested }
}
