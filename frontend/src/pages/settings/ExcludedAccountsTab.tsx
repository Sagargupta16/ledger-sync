/**
 * Excluded Accounts Tab
 *
 * Checkbox list of all user accounts. Checked accounts are excluded from
 * analytics and reporting. Stored as the `excluded_accounts` JSON array.
 */

import { motion } from 'framer-motion'
import { EyeOff, Check } from 'lucide-react'
import type { LocalPrefs, LocalPrefKey } from './types'

interface ExcludedAccountsTabProps {
  localPrefs: LocalPrefs
  accounts: string[]
  updateLocalPref: <K extends LocalPrefKey>(key: K, value: LocalPrefs[K]) => void
}

/** Safely coerce the stored value (may be JSON string or array) to string[] */
function normalizeAccounts(value: string[] | string): string[] {
  if (Array.isArray(value)) return value
  if (typeof value === 'string' && value.length > 0) {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}

export default function ExcludedAccountsTab({
  localPrefs,
  accounts,
  updateLocalPref,
}: Readonly<ExcludedAccountsTabProps>) {
  const excludedAccounts = normalizeAccounts(localPrefs.excluded_accounts)

  const toggleAccount = (account: string) => {
    const isExcluded = excludedAccounts.includes(account)
    const updated = isExcluded
      ? excludedAccounts.filter((a) => a !== account)
      : [...excludedAccounts, account]
    updateLocalPref('excluded_accounts', updated)
  }

  const excludedCount = excludedAccounts.length
  const totalCount = accounts.length

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-white">Excluded Accounts</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Check accounts to exclude them from analytics and reporting.
          Excluded accounts will not appear in spending breakdowns, trends, or net worth calculations.
        </p>
      </div>

      {/* Summary */}
      <div className="flex items-center gap-2 text-sm">
        <EyeOff className="w-4 h-4 text-ios-yellow" />
        <span className="text-muted-foreground">
          {excludedCount === 0
            ? 'No accounts excluded'
            : `${excludedCount} of ${totalCount} account${totalCount !== 1 ? 's' : ''} excluded`}
        </span>
      </div>

      {/* Account List */}
      <div className="glass rounded-lg border border-border overflow-hidden">
        {accounts.length === 0 ? (
          <div className="p-6 text-center text-muted-foreground text-sm">
            No accounts found. Import some transactions first.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {accounts.map((account, index) => {
              const isExcluded = excludedAccounts.includes(account)
              return (
                <motion.label
                  key={account}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.02 }}
                  className="flex items-center gap-4 px-5 py-3.5 cursor-pointer hover:bg-white/5 transition-colors"
                >
                  <button
                    type="button"
                    onClick={() => toggleAccount(account)}
                    className={`w-5 h-5 rounded flex items-center justify-center shrink-0 transition-colors ${
                      isExcluded
                        ? 'bg-ios-yellow text-black'
                        : 'bg-white/5 border border-border-strong'
                    }`}
                  >
                    {isExcluded && <Check className="w-3.5 h-3.5" />}
                  </button>
                  <span
                    className={`text-sm transition-colors ${
                      isExcluded ? 'text-muted-foreground line-through' : 'text-white'
                    }`}
                  >
                    {account}
                  </span>
                  {isExcluded && (
                    <span className="ml-auto text-xs text-ios-yellow/80 flex items-center gap-1">
                      <EyeOff className="w-3 h-3" />
                      Excluded
                    </span>
                  )}
                </motion.label>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
