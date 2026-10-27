/**
 * Record, correct and delete balance checks from the Data Health page.
 *
 * Each action resolves to a result the form can act on instead of throwing.
 * Demo mode has no account to write to: the guard says so in a toast and the
 * action resolves as blocked with no inline error, leaving the form as typed.
 */

import {
  useDeleteBalanceCheck,
  useRecordBalanceCheck,
  useUpdateBalanceCheck,
} from '@/hooks/api/useBalanceChecks'
import { useDemoGuard } from '@/hooks/useDemoGuard'
import type { BalanceCheckInput } from '@/services/api/balanceChecks'

import { writeErrorMessage } from './balanceCheckInput'

/** `error: null` means blocked in demo mode; the toast already explained it. */
export type WriteResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly error: string | null }

export interface BalanceCheckActions {
  readonly record: (account: string, input: BalanceCheckInput) => Promise<WriteResult>
  readonly update: (id: number, input: BalanceCheckInput) => Promise<WriteResult>
  readonly remove: (id: number) => Promise<WriteResult>
}

export function useBalanceCheckActions(): BalanceCheckActions {
  const recordCheck = useRecordBalanceCheck()
  const updateCheck = useUpdateBalanceCheck()
  const deleteCheck = useDeleteBalanceCheck()
  const { guardDemoAction } = useDemoGuard()

  const run = async (label: string, write: () => Promise<unknown>): Promise<WriteResult> => {
    if (guardDemoAction(label)) return { ok: false, error: null }
    try {
      await write()
      return { ok: true }
    } catch (error) {
      return { ok: false, error: writeErrorMessage(error) }
    }
  }

  return {
    record: (account, input) =>
      run('Recording balance checks', () => recordCheck.mutateAsync({ account, input })),
    update: (id, input) =>
      run('Editing balance checks', () => updateCheck.mutateAsync({ id, input })),
    remove: (id) => run('Deleting balance checks', () => deleteCheck.mutateAsync(id)),
  }
}
