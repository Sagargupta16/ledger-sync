/**
 * Account Classifications Tab
 *
 * Drag-and-drop interface for classifying accounts into types
 * (Cash, Bank Accounts, Credit Cards, Investments, Loans, Other Wallets).
 */

import { motion } from 'framer-motion'
import { GripVertical } from 'lucide-react'
import { formatCurrency } from '@/lib/formatters'
import { ACCOUNT_TYPES, CATEGORY_COLORS } from './types'

interface AccountClassificationsTabProps {
  accounts: string[]
  classifications: Record<string, string>
  balanceData: { accounts: Record<string, { balance: number }> } | undefined
  balancesLoading: boolean
  dragType: 'account' | 'category' | 'income-category' | null
  onDragStart: (item: string, type: 'account' | 'category' | 'income-category') => void
  onDragEnd: () => void
  onDragOver: (e: React.DragEvent) => void
  onDropOnAccountCategory: (category: string) => void
}

export default function AccountClassificationsTab({
  accounts,
  classifications,
  balanceData,
  balancesLoading,
  dragType,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDropOnAccountCategory,
}: Readonly<AccountClassificationsTabProps>) {
  // Organize accounts by category
  const accountsByCategory = ACCOUNT_TYPES.reduce(
    (acc, category) => {
      acc[category] = accounts.filter((name) => classifications[name] === category)
      return acc
    },
    {} as Record<string, string[]>
  )

  // Get unclassified accounts (not assigned to any category)
  const classifiedAccounts = new Set(Object.values(accountsByCategory).flat())
  const unclassifiedAccounts = accounts.filter((name) => !classifiedAccounts.has(name))

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-white">Account Type Classifications</h2>
        <p className="text-sm text-gray-400 mt-1">
          Drag accounts from the left into category boxes on the right
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Unassigned Accounts - Source */}
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-gray-400 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-gray-500"></span>
            Unassigned Accounts ({unclassifiedAccounts.length})
          </h3>
          <div className="bg-white/5 border border-white/10 rounded-xl p-4 min-h-[400px]">
            <div className="flex flex-wrap gap-2">
              {unclassifiedAccounts.map((accountName) => (
                <motion.div
                  key={accountName}
                  draggable
                  onDragStart={() => onDragStart(accountName, 'account')}
                  onDragEnd={onDragEnd}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 border border-white/20 rounded-full cursor-move hover:bg-white/20 transition-all"
                  whileHover={{ scale: 1.05 }}
                >
                  <GripVertical className="w-3 h-3 text-white/40" />
                  <span className="text-sm text-white truncate">{accountName}</span>
                  {!balancesLoading && (
                    <span className="text-xs text-gray-400 font-mono ml-1">
                      {formatCurrency(Math.abs(balanceData?.accounts[accountName]?.balance || 0))}
                    </span>
                  )}
                </motion.div>
              ))}
              {unclassifiedAccounts.length === 0 && (
                <p className="text-gray-500 text-sm">All accounts classified</p>
              )}
            </div>
          </div>
        </div>

        {/* Account Type Drop Zones */}
        <div className="lg:col-span-2 grid grid-cols-2 md:grid-cols-3 gap-4">
          {ACCOUNT_TYPES.map((category) => (
            <section
              key={category}
              aria-label={`Drop zone for ${category} accounts`}
              onDragOver={onDragOver}
              onDrop={() => onDropOnAccountCategory(category)}
              className={`bg-white/5 rounded-xl border-2 border-dashed p-4 transition-all min-h-[180px] ${
                dragType === 'account'
                  ? 'border-white/40 bg-white/10'
                  : 'border-white/20 hover:border-white/30'
              }`}
            >
              <div
                className={`bg-gradient-to-r ${CATEGORY_COLORS[category]} rounded-lg px-3 py-2 mb-3`}
              >
                <h4 className="text-sm font-semibold text-white">{category}</h4>
                <p className="text-xs text-white/80">{accountsByCategory[category].length} accounts</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {accountsByCategory[category].map((accountName) => (
                  <motion.div
                    key={accountName}
                    draggable
                    onDragStart={() => onDragStart(accountName, 'account')}
                    onDragEnd={onDragEnd}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 border border-white/20 rounded-full cursor-move hover:bg-white/20 transition-all"
                    whileHover={{ scale: 1.05 }}
                  >
                    <GripVertical className="w-3 h-3 text-white/40" />
                    <span className="text-sm text-white truncate">{accountName}</span>
                  </motion.div>
                ))}
                {accountsByCategory[category].length === 0 && (
                  <div className="flex items-center justify-center w-full h-16 text-gray-500">
                    <p className="text-sm">Drop here</p>
                  </div>
                )}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}
