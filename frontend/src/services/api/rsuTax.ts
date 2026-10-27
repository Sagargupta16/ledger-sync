import { apiClient } from './client'
import type {
  FastDsReport,
  ForeignAssetEvent,
  ForeignAssetEventInput,
  ForeignAssetEventLink,
  LotLedger,
  ScheduleFaReport,
  VestClose,
  VestFx,
  VestFxInput,
} from './rsuTaxTypes'

export type * from './rsuTaxTypes'

/**
 * RSU tax records and the foreign-asset reports (`/api/rsu-tax`).
 *
 * Every figure is a computation aid for an Indian return, not tax advice. The
 * employer's perquisite figure governs a vest's rupee value when entered, then
 * an SBI TT buying rate the user looked up, then the app's ECB-converted vest
 * price (an approximation). The shapes live in `rsuTaxTypes.ts`.
 */

const BASE = '/api/rsu-tax'

export const rsuTaxService = {
  listVestFx: async (): Promise<VestFx[]> => {
    const response = await apiClient.get<VestFx[]>(`${BASE}/vest-fx`)
    return response.data
  },

  saveVestFx: async (vestingId: string, input: VestFxInput): Promise<VestFx> => {
    const response = await apiClient.put<VestFx>(`${BASE}/vest-fx/${encodeURIComponent(vestingId)}`, input)
    return response.data
  },

  deleteVestFx: async (vestingId: string): Promise<void> => {
    await apiClient.delete(`${BASE}/vest-fx/${encodeURIComponent(vestingId)}`)
  },

  /** The vest-date close in the stock's own currency, before any later split. */
  getVestClose: async (vestingId: string): Promise<VestClose> => {
    const response = await apiClient.get<VestClose>(`${BASE}/vest-close/${encodeURIComponent(vestingId)}`)
    return response.data
  },

  getLots: async (): Promise<LotLedger> => {
    const response = await apiClient.get<LotLedger>(`${BASE}/lots`)
    return response.data
  },

  createEvent: async (input: ForeignAssetEventInput): Promise<ForeignAssetEvent> => {
    const response = await apiClient.post<ForeignAssetEvent>(`${BASE}/events`, input)
    return response.data
  },

  linkEvent: async (eventId: number, link: ForeignAssetEventLink): Promise<ForeignAssetEvent> => {
    const response = await apiClient.patch<ForeignAssetEvent>(`${BASE}/events/${eventId}`, link)
    return response.data
  },

  deleteEvent: async (eventId: number): Promise<void> => {
    await apiClient.delete(`${BASE}/events/${eventId}`)
  },

  getScheduleFa: async (year: number): Promise<ScheduleFaReport> => {
    const response = await apiClient.get<ScheduleFaReport>(`${BASE}/schedule-fa`, { params: { year } })
    return response.data
  },

  getFastDs: async (): Promise<FastDsReport> => {
    const response = await apiClient.get<FastDsReport>(`${BASE}/fast-ds`)
    return response.data
  },
}
