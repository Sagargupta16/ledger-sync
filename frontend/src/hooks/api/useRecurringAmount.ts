/**
 * Set or clear the amount a user expects on a recurring commitment.
 *
 * On a detected row the typed amount is stored beside the detected one, so the
 * next analytics refresh keeps it; `amount: null` clears it and the detected
 * amount applies again. The PATCH answers with the row's new amount state,
 * which is written into every cached recurring list at once, so a card never
 * shows the old figure while the refetch runs.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query'

import { analyticsV2Keys } from '@/hooks/api/useAnalyticsV2'
import { assertCurrentSession, getSessionGeneration, getSessionSignal, isCurrentSession } from '@/lib/session'
import { analyticsV2Service, type RecurringTransaction } from '@/services/api/analyticsV2'

export interface RecurringAmountChange {
  readonly id: number
  /** Amount per cycle, or `null` to use the detected amount again. */
  readonly amount: number | null
}

type RecurringPatchResult = Awaited<ReturnType<typeof analyticsV2Service.setRecurringAmount>>

/** Every `analyticsV2Keys.recurringTransactions(...)` entry, whatever its filters. */
const RECURRING_LISTS = [...analyticsV2Keys.all, 'recurring-transactions'] as const

function withAmount(rows: RecurringTransaction[] | undefined, result: RecurringPatchResult) {
  return rows?.map((row) =>
    row.id === result.id
      ? {
          ...row,
          expected_amount: result.expected_amount,
          detected_amount: result.detected_amount,
          amount_edited: result.amount_edited,
        }
      : row,
  )
}

export function useRecurringAmount() {
  const queryClient = useQueryClient()
  const sessionSignal = getSessionSignal()
  return useMutation({
    mutationKey: [...RECURRING_LISTS, 'amount', getSessionGeneration()],
    mutationFn: ({ id, amount }: RecurringAmountChange) => {
      assertCurrentSession(sessionSignal)
      return analyticsV2Service.setRecurringAmount(id, amount)
    },
    onMutate: () => sessionSignal,
    onSuccess: (result, _variables, signal) => {
      if (!signal || !isCurrentSession(signal)) return
      queryClient.setQueriesData<RecurringTransaction[]>({ queryKey: RECURRING_LISTS }, (rows) =>
        withAmount(rows, result),
      )
      // Totals, the bill calendar and reminders read the effective amount too.
      void queryClient.invalidateQueries({ queryKey: analyticsV2Keys.all })
    },
  })
}
