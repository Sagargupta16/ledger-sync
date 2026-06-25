import { useQuery } from '@tanstack/react-query'
import { ratesService, type InstrumentRates } from '@/services/api/rates'
import { useAuthStore } from '@/store/authStore'
import { MS_PER_DAY } from '@/lib/dateUtils'

/**
 * Compiled-in fallback mirrors the backend JSON. The backend is always
 * the source of truth -- we ship this only so the instrument projector
 * can render zero-network before the query resolves (or if /api/rates
 * returns 503). Keep loosely in sync with
 * backend/src/ledger_sync/config/instrument_rates.json.
 */
const FALLBACK_RATES: InstrumentRates = {
  updated_at: '2026-05-13',
  epf: {
    rate_pct: 8.25,
    effective_from: '2024-04-01',
    effective_until: null,
    source_url: 'https://www.epfindia.gov.in/site_en/WhatsNew.php',
  },
  ppf: {
    rate_pct: 7.1,
    effective_from: '2025-04-01',
    effective_until: '2026-06-30',
    source_url: 'https://dea.gov.in/small-savings-scheme',
  },
  nps: {
    default_allocation_pct: { equity: 50, corp_bond: 30, govt_bond: 20 },
    historical_return_pct: { equity: 10, corp_bond: 8.5, govt_bond: 7.5 },
    effective_from: '2026-04-01',
    source_url: 'https://npscra.nsdl.co.in/scheme-performance.php',
  },
}

export function useInstrumentRates(): {
  data: InstrumentRates
  isFallback: boolean
  isLoading: boolean
} {
  const accessToken = useAuthStore((s) => s.accessToken)

  const query = useQuery({
    queryKey: ['instrument-rates'],
    queryFn: ratesService.getInstrumentRates,
    enabled: !!accessToken,
    staleTime: MS_PER_DAY,
    gcTime: MS_PER_DAY,
    retry: 1,
  })

  // Deep-merge over FALLBACK so the epf/ppf/nps sub-objects ALWAYS exist, even
  // if the endpoint returns a partial/malformed shape (e.g. a 404 body like
  // {detail: ...}, or demo mode where the query errors). Consumers read
  // rates.ppf.rate_pct directly, so a missing sub-object would crash the page.
  const d = query.data
  const valid = !!d && !!d.epf && !!d.ppf && !!d.nps
  const data: InstrumentRates = valid
    ? d
    : {
        ...FALLBACK_RATES,
        ...(d ?? {}),
        epf: { ...FALLBACK_RATES.epf, ...(d?.epf ?? {}) },
        ppf: { ...FALLBACK_RATES.ppf, ...(d?.ppf ?? {}) },
        nps: { ...FALLBACK_RATES.nps, ...(d?.nps ?? {}) },
      }

  return {
    data,
    isFallback: !valid,
    isLoading: query.isLoading,
  }
}
