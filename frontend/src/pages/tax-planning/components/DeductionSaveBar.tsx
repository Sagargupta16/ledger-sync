import { Button } from '@/components/ui'
import { formatTaxYearLabel } from '@/lib/tax-config'

import type { DeductionDraft } from './useDeductionDraft'

interface Props {
  draft: DeductionDraft
  fyStartYear: number
}

function statusText(draft: DeductionDraft, yearLabel: string): string {
  if (draft.isLoading) return 'Loading saved deductions...'
  if (draft.isError) return 'Saved deductions could not be loaded. Saving is off until they load.'
  if (draft.isDirty) return `Unsaved changes for ${yearLabel}.`
  if (draft.isDemoMode && draft.hasSaved) return 'Filled in from the demo ledger. Saving needs your own account.'
  return draft.hasSaved ? `Saved for ${yearLabel}.` : `Nothing saved for ${yearLabel} yet.`
}

/** Save state and actions for the old-regime deduction inputs. */
export default function DeductionSaveBar({ draft, fyStartYear }: Readonly<Props>) {
  const nothingToClear = !draft.hasSaved && draft.total === 0

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {statusText(draft, formatTaxYearLabel(fyStartYear))}
        </p>
        {draft.isError && (
          <Button type="button" variant="ghost" size="sm" onClick={draft.retry}>
            Retry
          </Button>
        )}
      </div>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={draft.clearAll}
          disabled={draft.isSaving || !draft.canWrite || nothingToClear}
        >
          Clear
        </Button>
        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={draft.saveDraft}
          disabled={!draft.isDirty || !draft.canWrite}
          isLoading={draft.isSaving}
        >
          Save deductions
        </Button>
      </div>
    </div>
  )
}
