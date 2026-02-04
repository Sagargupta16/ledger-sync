import { motion } from 'framer-motion'
import { Check, Info, Settings2 } from 'lucide-react'
import { useAccountBalances } from '@/hooks/useAnalytics'
import { useAccountStore } from '@/store/accountStore'
import type { AccountType } from '@/types'
import { toast } from 'sonner'

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
      <div className="flex justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  if (accounts.length === 0) return null

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      className="space-y-4 pt-8 border-t border-white/10"
    >
      <div className="flex items-center gap-2 mb-4">
        <Settings2 className="w-5 h-5 text-primary" />
        <h3 className="text-lg font-semibold">Account Configuration</h3>
      </div>
      
      <div className="bg-white/5 backdrop-blur-sm rounded-xl border border-white/10 overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-white/5 border-b border-white/10">
              <th className="p-4 font-medium">Account Name</th>
              <th className="p-4 font-medium text-center w-32">Investment</th>
              <th className="p-4 font-medium text-center w-32">Deposit</th>
              <th className="p-4 font-medium text-center w-32">Loan</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {accounts.map((account) => {
              const types = accountTypes[account] || []
              return (
                <tr key={account} className="hover:bg-white/5 transition-colors">
                  <td className="p-4 font-medium">{account}</td>
                  <td className="p-4 text-center">
                    <button
                      onClick={() => handleToggle(account, 'investment')}
                      className={`w-5 h-5 rounded border transition-colors flex items-center justify-center mx-auto ${
                        types.includes('investment')
                          ? 'bg-purple-500 border-purple-500'
                          : 'border-gray-500 hover:border-purple-400'
                      }`}
                    >
                      {types.includes('investment') && <Check className="w-3 h-3 text-white" />}
                    </button>
                  </td>
                  <td className="p-4 text-center">
                    <button
                      onClick={() => handleToggle(account, 'deposit')}
                      className={`w-5 h-5 rounded border transition-colors flex items-center justify-center mx-auto ${
                        types.includes('deposit')
                          ? 'bg-blue-500 border-blue-500'
                          : 'border-gray-500 hover:border-blue-400'
                      }`}
                    >
                      {types.includes('deposit') && <Check className="w-3 h-3 text-white" />}
                    </button>
                  </td>
                  <td className="p-4 text-center">
                    <button
                      onClick={() => handleToggle(account, 'loan')}
                      className={`w-5 h-5 rounded border transition-colors flex items-center justify-center mx-auto ${
                        types.includes('loan')
                          ? 'bg-red-500 border-red-500'
                          : 'border-gray-500 hover:border-red-400'
                      }`}
                    >
                      {types.includes('loan') && <Check className="w-3 h-3 text-white" />}
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="text-sm text-gray-400 flex items-center gap-2">
        <Info className="w-4 h-4" />
        Classify your accounts to enable advanced analytics in Investment and Net Worth pages.
      </p>
    </motion.div>
  )
}
