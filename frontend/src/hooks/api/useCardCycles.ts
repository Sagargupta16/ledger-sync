import { queryOptions, useQuery } from '@tanstack/react-query'

import { getTodayKey } from '@/lib/dateUtils'
import { cardCyclesService, type CardCyclesParams } from '@/services/api/cardCycles'

/**
 * A year of statements, so the Bill Calendar can mark past due dates paid.
 * The Card statements panel reads the same entry, so both share one request.
 */
const CARD_CYCLES_PARAMS: CardCyclesParams = { history: 12 }

/**
 * `/api/card-cycles`. Under the `calculations` family so every upload and every
 * account-settings save (type, closure) refreshes it with the other ledger
 * reads; read-only, so there is no mutation or session guard here. The answer
 * depends on the IST day (countdowns, overdue, which cycle is open), so the day
 * is part of the key: a tab left open past midnight reads a fresh entry.
 */
export const cardCyclesOptions = () =>
  queryOptions({
    queryKey: ['calculations', 'card-cycles', CARD_CYCLES_PARAMS, getTodayKey()] as const,
    queryFn: () => cardCyclesService.getCardCycles(CARD_CYCLES_PARAMS),
    staleTime: Infinity,
    gcTime: 60 * 60 * 1000,
  })

export const useCardCycles = () => useQuery(cardCyclesOptions())
