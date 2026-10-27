import { useState } from 'react'

import { useClearTaxDeductions, useSaveTaxDeductions, useTaxDeductions } from '@/hooks/api/useTaxDeductions'
import { useDemoGuard } from '@/hooks/useDemoGuard'
import { OLD_REGIME_DEDUCTIONS, taxYearKey, type DeductionKey } from '@/lib/tax-config'
import type { TaxDeductionAmounts } from '@/services/api/taxDeductions'

type DeductionValues = Record<DeductionKey, number>
type DeductionEdits = Partial<DeductionValues>

/** Every input field, at its saved amount or zero. */
function withAllFields(saved: TaxDeductionAmounts | undefined): DeductionValues {
  return Object.fromEntries(
    OLD_REGIME_DEDUCTIONS.map(({ key }) => [key, saved?.[key] ?? 0]),
  ) as DeductionValues
}

/**
 * The old-regime deduction inputs for one tax year: the saved amounts, edits
 * not saved yet, and the save and clear actions. A draft belongs to the year it
 * was typed in and holds only the fields the user changed, so every other field
 * shows the saved amount even when it arrives after the typing. Saving sends
 * just those fields, which the server merges into the year.
 */
export function useDeductionDraft(fyStartYear: number) {
  const taxYear = taxYearKey(fyStartYear)
  const query = useTaxDeductions(taxYear)
  const save = useSaveTaxDeductions()
  const clear = useClearTaxDeductions()
  const { isDemoMode, guardDemoAction } = useDemoGuard()
  const [draft, setDraft] = useState<{ taxYear: string; edits: DeductionEdits } | null>(null)

  const saved = withAllFields(query.data?.deductions)
  const edits = draft?.taxYear === taxYear ? draft.edits : undefined
  const values: DeductionValues = { ...saved, ...edits }
  const hasSaved = OLD_REGIME_DEDUCTIONS.some(({ key }) => saved[key] > 0)
  // Write only on top of a loaded year, so a save or clear never acts on
  // amounts the page has not shown.
  const canWrite = query.isSuccess

  // Drop the draft only if it is still the one that was written, so amounts
  // typed while the request was in flight stay on screen.
  const settle = (sent: DeductionEdits | undefined) =>
    setDraft((current) => (current?.edits === sent ? null : current))

  const saveDraft = () => {
    if (!canWrite || !edits || guardDemoAction('Saving deductions')) return
    save.mutate({ taxYear, changes: edits }, { onSuccess: () => settle(edits) })
  }

  const clearAll = () => {
    if (!canWrite || guardDemoAction('Clearing deductions')) return
    if (!hasSaved) {
      setDraft(null)
      return
    }
    clear.mutate(taxYear, { onSuccess: () => settle(edits) })
  }

  return {
    values,
    total: OLD_REGIME_DEDUCTIONS.reduce((sum, { key }) => sum + values[key], 0),
    isDirty: OLD_REGIME_DEDUCTIONS.some(({ key }) => values[key] !== saved[key]),
    hasSaved,
    isDemoMode,
    isLoading: query.isPending,
    isError: query.isError,
    canWrite,
    isSaving: save.isPending || clear.isPending,
    retry: () => {
      void query.refetch()
    },
    setValue: (key: DeductionKey, amount: number) =>
      setDraft({ taxYear, edits: { ...edits, [key]: amount } }),
    saveDraft,
    clearAll,
  }
}

export type DeductionDraft = ReturnType<typeof useDeductionDraft>
