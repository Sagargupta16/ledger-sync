/**
 * Excluded Accounts sub-section within Advanced settings.
 */

import { EyeOff, Check } from 'lucide-react'
import type { LocalPrefs, LocalPrefKey } from './types'

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
      <h3 className="text-sm font-medium text-white flex items-center gap-2">
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
            return (
              <label
                key={account}
                className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer hover:bg-white/5 transition-colors"
              >
                <button
                  type="button"
                  onClick={() => toggleExcludedAccount(account)}
                  className={`w-4 h-4 rounded flex items-center justify-center shrink-0 transition-colors ${
                    isExcluded
                      ? 'bg-app-yellow text-black'
                      : 'bg-white/5 border border-border'
                  }`}
                >
                  {isExcluded && <Check className="w-3 h-3" />}
                </button>
                <span
                  className={`text-sm truncate ${
                    isExcluded ? 'text-muted-foreground line-through' : 'text-white'
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
