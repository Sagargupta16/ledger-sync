import CategorySuggestionChips from '@/components/transactions/CategorySuggestionChips'
import { Money } from '@/components/ui'

import type { SuggestedRow } from './useUploadCategorySuggestions'

function rowLabel(row: SuggestedRow['row']): string {
  return row.subcategory ? `${row.category} / ${row.subcategory}` : row.category
}

/** One file row with a placeholder label, what it says now, and the suggested labels. */
export default function UploadSuggestionRow({ row, suggestions }: SuggestedRow) {
  return (
    <li className="space-y-2 rounded-md border border-border p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">{row.note}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            <span className="font-mono">{row.date}</span>, {row.account}, now {rowLabel(row)}
          </p>
        </div>
        <Money value={row.amount} width="md" />
      </div>
      <CategorySuggestionChips suggestions={suggestions} />
    </li>
  )
}
