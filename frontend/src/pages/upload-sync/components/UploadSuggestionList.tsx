import { useState } from 'react'

import { Button } from '@/components/ui'

import UploadSuggestionRow from './UploadSuggestionRow'
import type { SuggestedRow } from './useUploadCategorySuggestions'

interface UploadSuggestionListProps {
  readonly suggested: readonly SuggestedRow[]
}

const FIRST_PAGE = 5
const PAGE = 10

/** The suggested rows, five at first and ten more per click, and how to keep a suggestion. */
export default function UploadSuggestionList({ suggested }: UploadSuggestionListProps) {
  const [visible, setVisible] = useState(FIRST_PAGE)
  if (suggested.length === 0) return null
  const remaining = suggested.length - visible

  return (
    <>
      <ul className="space-y-2">
        {suggested.slice(0, visible).map(({ row, suggestions }, index) => (
          <UploadSuggestionRow key={`${row.date}-${index}`} row={row} suggestions={suggestions} />
        ))}
      </ul>
      {remaining > 0 && (
        <Button variant="ghost" size="sm" onClick={() => setVisible((count) => count + PAGE)}>
          Show {Math.min(PAGE, remaining)} more ({remaining.toLocaleString()} left)
        </Button>
      )}
      <p className="text-xs leading-5 text-muted-foreground">
        Suggestions do not change this import. To keep one, change the row in your source app
        before exporting, or add a rule under Settings, Categorization Rules: rules run on import.
      </p>
    </>
  )
}
