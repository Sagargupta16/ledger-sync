import { motion } from 'framer-motion'
import { Check, Info, Settings2 } from 'lucide-react'
import { toast } from 'sonner'

import { useAccountBalances } from '@/hooks/api/useAnalytics'
import { useAccountStore } from '@/store/accountStore'
import type { AccountType } from '@/types'

const CLASSIFIER_TYPES: Array<{
  type: AccountType
  activeColor: string
  hoverColor: string
  label: string
}> = [
  {
    type: 'investment',
    activeColor: 'bg-app-purple border-app-purple',
    hoverColor: 'border-border-strong hover:border-app-purple',
    label: 'Investment',
  },
  {
    type: 'deposit',
    activeColor: 'bg-app-blue border-app-blue',
    hoverColor: 'border-border-strong hover:border-app-blue',
    label: 'Deposit',
  },
  {
    type: 'loan',
    activeColor: 'bg-app-red border-app-red',
    hoverColor: 'border-border-strong hover:border-app-red',
    label: 'Loan',
  },
]

export default function AccountClassifier() {
  const { data: balanceData, isLoading } = useAccountBalances()
  const { accountTypes, setAccountType } = useAccountStore()

  const accounts = balanceData?.accounts ? Object.keys(balanceData.accounts) : []

  const handleToggle = (account: string, type: AccountType) => {
    const currentTypes = accountTypes[account] || []
    const newTypes = currentTypes.includes(type)
      ? currentTypes.filter((t) => t !== type)
      : [...currentTypes, type]
    setAccountType(account, newTypes)
    toast.success(`Updated ${account}`, {
      description: `Set as ${newTypes.join(', ') || 'Unclassified'}`,
    })
  }

  if (isLoading) {
    return (
      <div
        className="flex justify-center p-8"
        role="status"
        aria-live="polite"
        aria-label="Loading account classifications"
      >
        <div
          className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"
          aria-hidden
        />
      </div>
    )
  }

  if (accounts.length === 0) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      className="space-y-4 pt-8 border-t border-border"
    >
      <div className="flex items-center gap-2 mb-4">
        <Settings2 className="w-5 h-5 text-primary" aria-hidden />
        <h3 className="text-lg font-semibold">Account Configuration</h3>
      </div>

      <div className="bg-[var(--overlay-2)] backdrop-blur-sm rounded-xl border border-border overflow-hidden">
        <section
          className="overflow-x-auto"
          aria-label="Account classification matrix"
        >
          <table
            className="w-full min-w-[30rem] text-left"
            aria-describedby="account-classification-help"
          >
            <caption className="sr-only">
              Account classification matrix. Toggle whether each account is an investment,
              deposit, or loan.
            </caption>
            <thead>
              <tr className="bg-[var(--overlay-2)] border-b border-border">
                <th
                  scope="col"
                  className="sticky left-0 z-20 bg-surface-dropdown p-4 font-medium"
                >
                  Account Name
                </th>
                {CLASSIFIER_TYPES.map(({ type, label }) => (
                  <th
                    key={type}
                    scope="col"
                    className="w-28 p-4 text-center font-medium"
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--hairline-1)]">
              {accounts.map((account) => {
                const types = accountTypes[account] || []
                return (
                  <tr key={account} className="hover:bg-[var(--overlay-5)] transition-colors">
                    <th
                      scope="row"
                      className="sticky left-0 z-10 max-w-52 break-words bg-surface-dropdown p-4 text-left font-medium"
                    >
                      {account}
                    </th>
                    {CLASSIFIER_TYPES.map(({ type, activeColor, hoverColor, label }) => {
                      const isSelected = types.includes(type)
                      return (
                        <td key={type} className="p-2 text-center sm:p-4">
                          <button
                            type="button"
                            onClick={() => handleToggle(account, type)}
                            aria-label={`${isSelected ? 'Remove' : 'Set'} ${label.toLowerCase()} classification for ${account}`}
                            aria-pressed={isSelected}
                            className={`mx-auto flex size-11 items-center justify-center rounded-md border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] ${
                              isSelected ? activeColor : hoverColor
                            }`}
                          >
                            {isSelected && (
                              <Check className="size-4 text-foreground" aria-hidden />
                            )}
                          </button>
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </section>
      </div>
      <p
        id="account-classification-help"
        className="text-sm text-muted-foreground flex items-center gap-2"
      >
        <Info className="w-4 h-4 shrink-0" aria-hidden />
        Classify your accounts to enable advanced analytics in Investment and Net Worth pages.
      </p>
    </motion.div>
  )
}
