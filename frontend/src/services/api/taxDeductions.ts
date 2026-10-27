import type { DeductionKey } from '@/lib/tax-config'

import { apiClient } from './client'

/** Section key ("80C") to amount in INR. */
export type TaxDeductionAmounts = Partial<Record<DeductionKey, number>>

/** The old-regime deductions saved for one tax year ("2026-27"); only positive amounts are stored. */
export interface SavedTaxDeductions {
  tax_year: string
  deductions: TaxDeductionAmounts
}

export const taxDeductionsService = {
  get: async (taxYear: string): Promise<SavedTaxDeductions> => {
    const response = await apiClient.get<SavedTaxDeductions>(`/api/tax-deductions/${taxYear}`)
    return response.data
  },

  /**
   * Sets the sections sent and answers with the whole year. Zero removes a
   * section; a section left out keeps its saved amount.
   */
  save: async (taxYear: string, changes: TaxDeductionAmounts): Promise<SavedTaxDeductions> => {
    const response = await apiClient.patch<SavedTaxDeductions>(`/api/tax-deductions/${taxYear}`, {
      deductions: changes,
    })
    return response.data
  },

  clear: async (taxYear: string): Promise<void> => {
    await apiClient.delete(`/api/tax-deductions/${taxYear}`)
  },
}
