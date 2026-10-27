import { apiClient } from './client'

/** The four totals saved from one AIS: all that leaves the browser, in INR. */
export interface TaxAisTotals {
  tds_salary: number
  tds_other: number
  interest: number
  dividends: number
}

/** One tax year's saved totals ("2025-26": April 2025 to March 2026). */
export interface TaxAisSummary extends TaxAisTotals {
  tax_year: string
  /** Last import, ISO 8601 UTC. */
  updated_at: string
}

// A demo adapter without this route answers `[]`; read that as "nothing saved".
const isSummary = (value: unknown): value is TaxAisSummary =>
  typeof value === 'object' && value !== null && 'tax_year' in value

export const taxAisService = {
  list: async (): Promise<TaxAisSummary[]> => {
    const response = await apiClient.get<{ summaries?: TaxAisSummary[] }>('/api/tax-ais')
    return response.data.summaries ?? []
  },

  /** Null when no AIS was imported for the year. */
  get: async (taxYear: string): Promise<TaxAisSummary | null> => {
    const response = await apiClient.get<unknown>(`/api/tax-ais/${taxYear}`)
    return isSummary(response.data) ? response.data : null
  },

  /** Replaces any earlier import of the same year. */
  save: async (taxYear: string, totals: TaxAisTotals): Promise<TaxAisSummary> => {
    const response = await apiClient.put<TaxAisSummary>(`/api/tax-ais/${taxYear}`, totals)
    return response.data
  },

  remove: async (taxYear: string): Promise<void> => {
    await apiClient.delete(`/api/tax-ais/${taxYear}`)
  },
}
