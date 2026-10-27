import { useMemo, useState } from 'react'

import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { useDeleteTaxAisSummary, useSaveTaxAisSummary, useTaxAisSummaries } from '@/hooks/api/useTaxAis'
import { useDemoGuard } from '@/hooks/useDemoGuard'
import { getTodayKey } from '@/lib/dateKeys'
import { buildSampleAisDocument } from '@/lib/demo/demoTaxAis'
import { AisDecryptError, decryptAis } from '@/lib/tax/aisDecrypt'
import { parseAisDocument } from '@/lib/tax/aisParser'
import { reconcileAis } from '@/lib/tax/aisReconcile'
import { buildAisStatement, type AisStatement } from '@/lib/tax/aisSummary'
import { usePreferencesStore } from '@/store/preferencesStore'

import { defaultTaxYear, displayFileName, taxYearLabel, taxYearOptions } from './aisImportLabels'
import { aisLedgerYearQuery, useAisLedgerIncome } from './useAisLedgerIncome'

/** An AIS JSON is a few MB at worst. */
export const MAX_AIS_BYTES = 32 * 1024 * 1024

export interface AisCredentials {
  pan: string
  dob: string
}

/**
 * /tax/ais state. The opened statement lives only in this hook's state: it is
 * never cached, persisted or sent, and closing the page drops it. The PAN and
 * date of birth reach `decryptAis` and nothing else.
 */
export function useAisImport() {
  const { isDemoMode, guardDemoAction } = useDemoGuard()
  const queryClient = useQueryClient()
  const classification = usePreferencesStore((state) => state.incomeClassification)
  const [statement, setStatement] = useState<AisStatement | null>(null)
  const [fileLabel, setFileLabel] = useState<string | null>(null)
  const [openError, setOpenError] = useState<string | null>(null)
  const [isOpening, setIsOpening] = useState(false)
  const [chosenYear, setChosenYear] = useState<string | null>(null)

  const today = getTodayKey()
  const taxYear = chosenYear ?? statement?.taxYear ?? defaultTaxYear(today)
  const ledger = useAisLedgerIncome(statement ? taxYear : null)
  const saved = useTaxAisSummaries()
  const save = useSaveTaxAisSummary()
  const remove = useDeleteTaxAisSummary()

  const reconciliation = useMemo(
    () => (statement && ledger.data ? reconcileAis(statement, ledger.data, classification) : null),
    [statement, ledger.data, classification],
  )

  function show(next: AisStatement, label: string, year: string | null) {
    setStatement(next)
    setFileLabel(label)
    setChosenYear(year)
  }

  async function open(file: File, credentials: AisCredentials): Promise<boolean> {
    if (file.size > MAX_AIS_BYTES) {
      setOpenError('This file is larger than any AIS JSON (32 MB). Choose the JSON download from the AIS portal.')
      return false
    }
    setIsOpening(true)
    setOpenError(null)
    try {
      const doc = await decryptAis(await file.text(), credentials)
      show(buildAisStatement(parseAisDocument(doc)), displayFileName(file.name), null)
      return true
    } catch (error) {
      setOpenError(error instanceof AisDecryptError ? error.message : 'The file could not be read. Download the AIS JSON again.')
      return false
    } finally {
      setIsOpening(false)
    }
  }

  /** Demo only: a sample statement built from the demo ledger's year. */
  async function openSample(year: string) {
    setIsOpening(true)
    setOpenError(null)
    try {
      const rows = await queryClient.fetchQuery(aisLedgerYearQuery(year))
      show(buildAisStatement(parseAisDocument(buildSampleAisDocument(rows, year))), 'Sample statement from the demo ledger', year)
    } catch {
      setOpenError('The demo ledger could not be read. Reload the page and try again.')
    } finally {
      setIsOpening(false)
    }
  }

  function close() {
    setStatement(null)
    setFileLabel(null)
    setChosenYear(null)
    setOpenError(null)
  }

  function saveTotals() {
    // A layout nothing was read from gives zeros, and saving replaces the year.
    if (!statement?.recognised || guardDemoAction('Saving AIS totals')) return
    const { summary } = statement
    save.mutate(
      {
        taxYear,
        totals: {
          tds_salary: summary.tdsSalary,
          tds_other: summary.tdsOther,
          interest: summary.interest,
          dividends: summary.dividends,
        },
      },
      {
        onSuccess: () => toast.success(`Saved the AIS totals for ${taxYearLabel(taxYear)}.`),
        onError: () => toast.error('The totals were not saved. Your statement is still open; try again.'),
      },
    )
  }

  function removeYear(year: string) {
    if (guardDemoAction('Removing AIS totals')) return
    remove.mutate(year, {
      onSuccess: () => toast.success(`Removed the AIS totals for ${taxYearLabel(year)}.`),
      onError: () => toast.error('The totals were not removed. Try again.'),
    })
  }

  return {
    isDemoMode,
    statement,
    fileLabel,
    openError,
    isOpening,
    taxYear,
    setTaxYear: setChosenYear,
    yearOptions: taxYearOptions(today, statement?.taxYear ?? null),
    defaultYear: defaultTaxYear(today),
    ledger,
    reconciliation,
    saved,
    savedForYear: saved.data?.find((summary) => summary.tax_year === taxYear) ?? null,
    save,
    remove,
    open,
    openSample,
    close,
    saveTotals,
    removeYear,
  }
}
