import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { Check } from 'lucide-react'
import { useAccountBalances } from '@/hooks/useAnalytics'
import { useInvestmentAccountStore } from '@/store/investmentAccountStore'
import { formatCurrency } from '@/lib/formatters'
import { toast } from 'sonner'

export default function InvestmentAccountSelector() {
  const { data: balanceData, isLoading } = useAccountBalances()
  const { investmentAccounts, toggleInvestmentAccount } = useInvestmentAccountStore()

  const accounts = useMemo(() => {
    const acc = balanceData?.accounts || {}
    return Object.entries(acc)
      .map(([name, data]: [string, { balance?: number }]) => ({
        name,
        balance: data.balance || 0,
        isInvestment: investmentAccounts.has(name),
      }))
      .filter((acc) => acc.balance !== 0)
      .sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance))
  }, [balanceData, investmentAccounts])

  const handleToggle = (accountName: string) => {
    toggleInvestmentAccount(accountName)
    const isNowInvestment = !investmentAccounts.has(accountName)
    toast.success(
      isNowInvestment ? `${accountName} marked as investment account` : `${accountName} unmarked as investment account`
    )
  }

  if (isLoading) {
    return <div className="text-gray-400">Loading accounts...</div>
  }

  if (accounts.length === 0) {
    return <div className="text-gray-400">No accounts found. Upload transactions first.</div>
  }

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold mb-4">Select Investment Accounts</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Mark which accounts should be tracked as investment accounts. These will appear in the Investment Analytics page.
        </p>
      </div>

      <div className="space-y-2 max-h-96 overflow-y-auto">
        {accounts.map((account) => (
          <div
            key={account.name}
            onClick={() => handleToggle(account.name)}
            className="p-4 glass rounded-lg border border-white/10 cursor-pointer hover:border-primary/50 transition-all group"
          >
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <p className="font-medium text-white">{account.name}</p>
                <p className="text-sm text-muted-foreground">
                  {formatCurrency(Math.abs(account.balance))}
                </p>
              </div>
              <div
                className={`flex items-center justify-center w-6 h-6 rounded border-2 transition-all ${
                  account.isInvestment
                    ? 'bg-primary border-primary'
                    : 'border-white/30 group-hover:border-primary/50'
                }`}
              >
                {account.isInvestment && <Check className="w-4 h-4 text-white" />}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="pt-4 border-t border-white/10">
        <p className="text-sm text-muted-foreground">
          {investmentAccounts.size} of {accounts.length} accounts marked as investment accounts
        </p>
      </div>
    </motion.div>
  )
}
