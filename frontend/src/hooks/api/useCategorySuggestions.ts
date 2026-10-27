/**
 * Category suggestions from the per-user naive Bayes model (backend
 * `core/category_suggester.py`). Read-only: nothing here changes a row, so
 * there are no mutations and no session-guarded writes. A successful upload
 * clears the whole query cache, which also refreshes these two queries.
 */

import { useQuery } from '@tanstack/react-query'

import type { ParsedTransaction } from '@/lib/fileParser'
import { categorySuggestionsService, MAX_SUGGESTION_ROWS } from '@/services/api/categorySuggestions'
import { useDemoStore } from '@/store/demoStore'

const CATEGORY_SUGGESTIONS_KEY = ['category-suggestions'] as const

export function useCategorySuggestionStatus() {
  return useQuery({
    queryKey: [...CATEGORY_SUGGESTIONS_KEY, 'status'],
    queryFn: () => categorySuggestionsService.getStatus(),
    staleTime: Infinity,
  })
}

/**
 * Suggestions for the rows of an unsaved upload, keyed by its file hash. The
 * request is a POST because the rows travel in the body; demo mode refuses
 * every non-GET call, so the query never runs there.
 */
export function useUploadRowSuggestions(
  fileHash: string,
  rows: readonly ParsedTransaction[],
  enabled: boolean,
) {
  const isDemoMode = useDemoStore((state) => state.isDemoMode)
  const sent = rows.slice(0, MAX_SUGGESTION_ROWS)
  return useQuery({
    queryKey: [...CATEGORY_SUGGESTIONS_KEY, 'upload-rows', fileHash, sent.length],
    queryFn: () => categorySuggestionsService.getForRows(sent),
    enabled: enabled && !isDemoMode && sent.length > 0,
    staleTime: Infinity,
  })
}
