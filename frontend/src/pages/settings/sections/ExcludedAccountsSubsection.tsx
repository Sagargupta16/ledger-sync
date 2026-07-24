/**
 * Excluded Accounts sub-section within Advanced settings.
 */

import { EyeOff, Check } from 'lucide-react'
import type { LocalPrefs, LocalPrefKey } from '../types'

interface Props {
  accounts: string[]
  excludedAccounts: string[]
  updateLocalPref: <K extends LocalPrefKey>(key: K, value: LocalPrefs[K]) => void
}

export default function ExcludedAccountsSubsection({
  accounts,
  excludedAccounts,
  updateLocalPref,
}: Readonly<Props>) {
  const toggleExcludedAccount = (account: string) => {
    const isExcluded = excludedAccounts.includes(account)
    updateLocalPref(
      'excluded_accounts',
      isExcluded ? excludedAccounts.filter((a) => a !== account) : [...excludedAccounts, account],
    )
  }

  return (
    <div className="pt-4 border-t border-border space-y-3">
      <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
        <EyeOff className="w-4 h-4 text-primary" />
        Excluded Accounts
        {excludedAccounts.length > 0 && (
          <span className="px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-app-yellow/20 text-app-yellow">
            {excludedAccounts.length}
          </span>
        )}
      </h3>
      <p className="text-xs text-muted-foreground">
        Excluded accounts are hidden from analytics and reporting.
      </p>
      {accounts.length === 0 ? (
        <p className="text-sm text-muted-foreground">No accounts found.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
           {accounts.map((account) => {
             const isExcluded = excludedAccounts.includes(account)
             const controlId = `excluded-account-${encodeURIComponent(account)}`
             return (
               <label
                 key={account}
                 htmlFor={controlId}
                 className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-[var(--overlay-2)]"
               >
                 <input
                   id={controlId}
                   type="checkbox"
                   checked={isExcluded}
                   onChange={() => toggleExcludedAccount(account)}
                   className="sr-only"
                 />
                 <span
                   aria-hidden="true"
                   className={`flex size-4 shrink-0 items-center justify-center rounded transition-colors ${
                     isExcluded
                       ? 'bg-app-yellow text-on-warning'
                       : 'bg-[var(--overlay-2)] border border-border'
                   }`}
                 >
                   {isExcluded && <Check className="w-3 h-3" />}
                 </span>
                <span
                  className={`text-sm truncate ${
                    isExcluded ? 'text-muted-foreground line-through' : 'text-foreground'
                  }`}
                >
                  {account}
                </span>
              </label>
            )
          })}
        </div>
      )}
    </div>
  )
}
