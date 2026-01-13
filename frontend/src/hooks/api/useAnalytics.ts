import { useQuery } from '@tanstack/react-query'
import { analyticsService } from '@/services/api/analytics'

export function useKPIs(params?: { start_date?: string; end_date?: string }) {
  return useQuery({
    queryKey: ['kpis', params],
    queryFn: () => analyticsService.getKPIs(params),
  })
}

export function useRecentTransactions(limit: number = 5) {
  return useQuery({
    queryKey: ['transactions', 'recent', limit],
    queryFn: () => analyticsService.getRecentTransactions(limit),
  })
}
