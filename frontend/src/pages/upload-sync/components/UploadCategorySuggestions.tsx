import type { ReactNode } from 'react'

import { Sparkles } from 'lucide-react'

import { CollapsibleSection, Spinner } from '@/components/ui'
import type { ParsedTransaction } from '@/lib/fileParser'
import {
  MAX_SUGGESTION_ROWS,
  type CategorySuggestionStatus,
} from '@/services/api/categorySuggestions'

import UploadSuggestionList from './UploadSuggestionList'
import { useUploadCategorySuggestions } from './useUploadCategorySuggestions'

interface UploadCategorySuggestionsProps {
  readonly rows: readonly ParsedTransaction[]
  readonly fileHash: string
}

function rowCount(count: number): string {
  return `${count.toLocaleString()} ${count === 1 ? 'row' : 'rows'}`
}

function gateNotice(status: CategorySuggestionStatus): ReactNode {
  return (
    <div className="space-y-1 text-sm text-muted-foreground">
      <p>Suggestions start once your saved ledger has:</p>
      <ul className="list-disc space-y-0.5 pl-5">
        <li>
          {status.min_training_rows} categorized rows (now {status.training_rows.toLocaleString()})
        </li>
        <li>
          {status.min_categories} expense categories, or {status.min_categories} income categories
          (now {status.category_count})
        </li>
      </ul>
    </div>
  )
}

/** What happened to the file's placeholder rows, as one or two sentences. */
function summary(targetCount: number, suggestedCount: number, ruleMatched: number): string[] {
  const checked = targetCount > MAX_SUGGESTION_ROWS
    ? ` (the first ${MAX_SUGGESTION_ROWS.toLocaleString()} were checked)`
    : ''
  const lines: string[] = []
  if (ruleMatched > 0) {
    lines.push(`A categorization rule will set the category of ${rowCount(ruleMatched)} on import.`)
  }
  if (suggestedCount > 0) {
    const verb = suggestedCount === 1 ? 'matches' : 'match'
    lines.push(`${suggestedCount.toLocaleString()} of them ${verb} your categorized history${checked}.`)
  } else if (ruleMatched < Math.min(targetCount, MAX_SUGGESTION_ROWS)) {
    const rest = ruleMatched > 0 ? 'the rest' : 'them'
    lines.push(`None of ${rest} has enough in common with your categorized history to suggest a category${checked}.`)
  }
  return lines
}

/**
 * Suggested categories for the file's rows that carry a placeholder label,
 * from the user's own categorized history, collapsed until opened. Read-only:
 * it never edits the rows this import sends, so source identities and
 * transaction IDs stay unchanged.
 */
export default function UploadCategorySuggestions({ rows, fileHash }: UploadCategorySuggestionsProps) {
  const { status, targets, query, suggested } = useUploadCategorySuggestions(rows, fileHash)
  if (!status || targets.length === 0) return null

  let body: ReactNode
  if (!status.ready) {
    body = gateNotice(status)
  } else if (query.isPending && query.fetchStatus !== 'idle') {
    body = <Spinner size="sm" label="Comparing them with your categorized history" />
  } else if (query.data) {
    body = (
      <>
        {summary(targets.length, suggested.length, query.data.rule_matched).map((line) => (
          <p key={line} className="text-sm text-muted-foreground">{line}</p>
        ))}
        <UploadSuggestionList suggested={suggested} />
      </>
    )
  } else {
    body = (
      <p className="text-sm text-muted-foreground">
        Suggestions are unavailable right now. The import is not affected.
      </p>
    )
  }

  return (
    <CollapsibleSection
      title={`${rowCount(targets.length)} with a placeholder category`}
      icon={Sparkles}
      defaultExpanded={false}
      badge={suggested.length > 0 ? `${suggested.length.toLocaleString()} suggested` : undefined}
    >
      <div className="space-y-3">{body}</div>
    </CollapsibleSection>
  )
}
