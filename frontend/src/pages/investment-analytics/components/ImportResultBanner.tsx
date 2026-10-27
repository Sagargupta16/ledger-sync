import { Button } from '@/components/ui'
import type { CasImportResult } from '@/services/api/cas'

import { describeImportResult } from '../mfHoldingsUtils'

const SHOWN_WARNINGS = 3

interface ImportResultBannerProps {
  readonly result: CasImportResult
  readonly onDismiss: () => void
}

/**
 * What the last import did, with the parser's own warnings: the only sign that a
 * scheme was misread or skipped. It lives in the section, not the import panel,
 * because the panel closes itself as soon as the first holdings arrive.
 */
export function ImportResultBanner({ result, onDismiss }: ImportResultBannerProps) {
  const flagged = result.warnings.length
  const more = flagged > SHOWN_WARNINGS ? ` (and ${flagged - SHOWN_WARNINGS} more)` : ''
  return (
    <div className="flex items-start justify-between gap-3 rounded-md border border-app-green/20 bg-app-green/10 px-3 py-2">
      <output className="block min-w-0 space-y-1 text-sm text-foreground">
        <span className="block">{describeImportResult(result)}</span>
        {flagged > 0 && (
          <span className="block text-xs text-warning">
            The parser flagged {flagged === 1 ? '1 row' : `${flagged} rows`}. Check these schemes
            against your statement: {result.warnings.slice(0, SHOWN_WARNINGS).join('; ')}
            {more}
          </span>
        )}
      </output>
      <Button variant="ghost" size="sm" onClick={onDismiss}>
        Dismiss
      </Button>
    </div>
  )
}
