/**
 * Account Classifications section - drag-and-drop account categorization.
 */

import { motion } from 'framer-motion'
import { Wallet, GripVertical } from 'lucide-react'
import { formatCurrency } from '@/lib/formatters'
import { ACCOUNT_TYPES, CATEGORY_COLORS } from './types'
import { Section } from './components'

interface Props {
  index: number
  unclassifiedAccounts: string[]
  accountsByCategory: Record<string, string[]>
  balancesLoading: boolean
  balanceData: { accounts: Record<string, { balance: number }> } | undefined
  dragType: 'account' | null
  onDragStart: (item: string) => void
  onDragEnd: () => void
  onDropOnCategory: (category: string) => void
}

export default function AccountClassificationsSection({
  index,
  unclassifiedAccounts,
  accountsByCategory,
  balancesLoading,
  balanceData,
  dragType,
  onDragStart,
  onDragEnd,
  onDropOnCategory,
}: Readonly<Props>) {
  const handleDragOver = (e: React.DragEvent) => e.preventDefault()

  return (
    <Section
      index={index}
      icon={Wallet}
      title="Account Classifications"
      description="Drag accounts between categories to classify them"
    >
      {/* Unassigned accounts highlight */}
      {unclassifiedAccounts.length > 0 && (
        <div className="bg-app-yellow/10 border border-app-yellow/30 rounded-xl p-4">
          <p className="text-sm font-medium text-app-yellow mb-2">
            {unclassifiedAccounts.length}{' '}Unassigned Account{unclassifiedAccounts.length !== 1 && 's'}
          </p>
          <div className="flex flex-wrap gap-2">
            {unclassifiedAccounts.map((name) => (
              <motion.div
                key={name}
                draggable
                onDragStart={() => onDragStart(name)}
                onDragEnd={onDragEnd}
                whileHover={{ scale: 1.05 }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 border border-border rounded-full cursor-move hover:bg-white/20 transition-colors"
              >
                <GripVertical className="w-3 h-3 text-white/40" />
                <span className="text-sm text-white">{name}</span>
                {!balancesLoading && (
                  <span className="text-xs text-muted-foreground font-mono ml-1">
                    {formatCurrency(Math.abs(balanceData?.accounts[name]?.balance || 0))}
                  </span>
                )}
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* Account type drop zones grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {ACCOUNT_TYPES.map((category) => (
          <div
            key={category}
            role="group"
            aria-label={`Drop zone for ${category} accounts`}
            onDragOver={handleDragOver}
            onDrop={() => onDropOnCategory(category)}
            className={`rounded-xl border-2 border-dashed p-3 transition-all min-h-[140px] ${
              dragType === 'account'
                ? 'border-primary/50 bg-primary/5'
                : 'border-border bg-white/[0.02]'
            }`}
          >
            <div
              className={`bg-gradient-to-r ${CATEGORY_COLORS[category] || 'from-muted-foreground to-text-tertiary'} rounded-lg px-3 py-1.5 mb-2`}
            >
              <h4 className="text-xs font-semibold text-white">{category}</h4>
              <p className="text-[10px] text-white/70">
                {accountsByCategory[category]?.length || 0}{' '}accounts
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {accountsByCategory[category]?.map((name) => (
                <motion.div
                  key={name}
                  draggable
                  onDragStart={() => onDragStart(name)}
                  onDragEnd={onDragEnd}
                  whileHover={{ scale: 1.03 }}
                  className="flex items-center gap-1 px-2.5 py-1 bg-white/10 border border-border rounded-full cursor-move hover:bg-white/20 transition-colors"
                >
                  <GripVertical className="w-2.5 h-2.5 text-white/30" />
                  <span className="text-xs text-white truncate max-w-[120px]">{name}</span>
                </motion.div>
              ))}
              {(!accountsByCategory[category] || accountsByCategory[category].length === 0) && (
                <p className="text-xs text-text-tertiary py-3 w-full text-center">Drop here</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </Section>
  )
}
