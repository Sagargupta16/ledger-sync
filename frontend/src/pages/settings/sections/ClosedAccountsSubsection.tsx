/**
 * Closed Accounts sub-section within Advanced settings.
 *
 * Unlike Excluded Accounts (which hides an account from analytics entirely),
 * closing keeps the history but stops forward-looking behavior: recurring and
 * bill expectations deactivate, credit-card limit config hides, and pickers
 * omit the account. Applies immediately (server side effects), not batched
 * behind the page Save.
 */

import { Archive } from 'lucide-react'
import { toast } from 'sonner'

import { useClosedAccounts, useSetAccountStatus } from '@/hooks/api/useAccountStatus'
import { useDemoGuard } from '@/hooks/useDemoGuard'
import { Toggle } from '../sectionPrimitives'

interface Props {
  accounts: string[]
}

export default function ClosedAccountsSubsection({ accounts }: Readonly<Props>) {
  const { data: closedAccounts = [] } = useClosedAccounts()
  const setStatus = useSetAccountStatus()
  const { guardDemoAction } = useDemoGuard()

  // Closed accounts with a zero balance drop out of the balances-derived
  // `accounts` list, so union them in -- otherwise a fully settled closed
  // card would vanish from this list and could never be reopened.
  const allNames = [...new Set([...accounts, ...closedAccounts])].sort((a, b) =>
    a.localeCompare(b),
  )

  const toggle = (account: string, isClosed: boolean) => {
    if (guardDemoAction('Closing accounts')) return
    setStatus.mutate(
      { accountName: account, isClosed },
      {
        onSuccess: () => {
          toast.success(isClosed ? `${account} marked closed` : `${account} reopened`)
        },
        onError: () => toast.error('Failed to update account status'),
      },
    )
  }

  return (
    <div className="pt-4 border-t border-border space-y-3">
      <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
        <Archive className="w-4 h-4 text-primary" />
        Closed Accounts
        {closedAccounts.length > 0 && (
          <span className="px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-[var(--overlay-5)] text-muted-foreground">
            {closedAccounts.length}
          </span>
        )}
      </h3>
      <p className="text-xs text-muted-foreground">
        Closed accounts (a cancelled credit card, an old bank account) keep their history in
        analytics, but no new bills or recurring payments are expected on them and they are
        hidden from limits and account pickers. Changes apply immediately.
      </p>
      {allNames.length === 0 ? (
        <p className="text-sm text-muted-foreground">No accounts found.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
          {allNames.map((account) => {
            const isClosed = closedAccounts.includes(account)
            return (
              <div
                key={account}
                className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-[var(--overlay-2)] transition-colors"
              >
                <span
                  className={`text-sm truncate flex-1 ${
                    isClosed ? 'text-muted-foreground line-through' : 'text-foreground'
                  }`}
                >
                  {account}
                </span>
                {isClosed && (
                  <span className="px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-[var(--overlay-5)] text-muted-foreground shrink-0">
                    Closed
                  </span>
                )}
                <Toggle
                  checked={isClosed}
                  onChange={(next) => toggle(account, next)}
                  id={`closed-${account}`}
                />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
