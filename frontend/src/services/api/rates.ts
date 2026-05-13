import { apiClient } from './client'

/**
 * Matches the JSON shape served by the backend at /api/rates/instruments.
 * Source of truth: backend/src/ledger_sync/config/instrument_rates.json.
 */
export interface InstrumentRates {
  updated_at: string
  epf: {
    rate_pct: number
    effective_from: string
    effective_until: string | null
    source_url: string
    notes?: string
  }
  ppf: {
    rate_pct: number
    effective_from: string
    effective_until: string | null
    source_url: string
    notes?: string
  }
  nps: {
    default_allocation_pct: { equity: number; corp_bond: number; govt_bond: number }
    historical_return_pct: { equity: number; corp_bond: number; govt_bond: number }
    effective_from: string
    source_url: string
    notes?: string
  }
}

export const ratesService = {
  async getInstrumentRates(): Promise<InstrumentRates> {
    const res = await apiClient.get<InstrumentRates>('/api/rates/instruments')
    return res.data
  },
}
