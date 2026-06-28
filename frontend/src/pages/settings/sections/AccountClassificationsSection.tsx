/**
 * Account Classifications section - drag-and-drop account categorization.
 */

import { motion } from 'framer-motion'
import { Wallet, GripVertical } from 'lucide-react'
import { formatCurrency } from '@/lib/formatters'
import { ACCOUNT_TYPES, CATEGORY_COLORS } from '../types'
import { Section } from '../sectionPrimitives'

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
  onAssignAccount: (account: string, category: string) => void
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
  onAssignAccount,
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
          <p className="text-sm font-medium text-app-yellow mb-1">
            {unclassifiedAccounts.length}{' '}Unassigned Account{unclassifiedAccounts.length !== 1 && 's'}
          </p>
          <p className="text-xs text-muted-foreground mb-3">
            Drag a chip onto a category below, or pick a category from its dropdown.
          </p>
          <div className="flex flex-col gap-2">
            {unclassifiedAccounts.map((name) => (
              <div key={name} className="flex items-center gap-2">
                <motion.div
                  draggable
                  onDragStart={() => onDragStart(name)}
                  onDragEnd={onDragEnd}
                  whileHover={{ scale: 1.03 }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--overlay-5)] border border-border rounded-full cursor-move hover:bg-[var(--overlay-6)] transition-colors min-w-0 flex-1"
                >
                  <GripVertical className="w-3 h-3 text-foreground/40 shrink-0" />
                  <span className="text-sm text-foreground truncate">{name}</span>
                  {!balancesLoading && (
                    <span className="text-xs text-muted-foreground font-mono ml-auto pl-1 shrink-0">
                      {formatCurrency(Math.abs(balanceData?.accounts[name]?.balance || 0))}
                    </span>
                  )}
                </motion.div>
                <select
                  aria-label={`Classify ${name}`}
                  value=""
                  onChange={(e) => {
                    if (e.target.value) onAssignAccount(name, e.target.value)
                  }}
                  className="shrink-0 w-36 px-2 py-2 min-h-[44px] bg-[var(--overlay-2)] border border-border rounded-lg text-foreground text-xs focus:border-primary focus:outline-none"
                >
                  <option value="" className="bg-background">
                    Classify as...
                  </option>
                  {ACCOUNT_TYPES.map((category) => (
                    <option key={category} value={category} className="bg-background">
                      {category}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Account type drop zones grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {ACCOUNT_TYPES.map((category) => (
          <fieldset
            key={category}
            aria-label={`Drop zone for ${category} accounts`}
            onDragOver={handleDragOver}
            onDrop={() => onDropOnCategory(category)}
            className={`rounded-xl border-2 border-dashed p-3 transition-all min-h-[140px] ${
              dragType === 'account'
                ? 'border-primary/50 bg-primary/5'
                : 'border-border bg-[var(--overlay-1)]'
            }`}
          >
            <div
              className={`bg-gradient-to-r ${CATEGORY_COLORS[category] || 'from-muted-foreground to-text-tertiary'} rounded-lg px-3 py-1.5 mb-2`}
            >
              <h4 className="text-xs font-semibold text-foreground">{category}</h4>
              <p className="text-[10px] text-foreground/70">
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
                  className="flex items-center gap-1 px-2.5 py-1 bg-[var(--overlay-5)] border border-border rounded-full cursor-move hover:bg-[var(--overlay-6)] transition-colors"
                >
                  <GripVertical className="w-2.5 h-2.5 text-foreground/30" />
                  <span className="text-xs text-foreground truncate max-w-[120px]">{name}</span>
                </motion.div>
              ))}
              {(!accountsByCategory[category] || accountsByCategory[category].length === 0) && (
                <p className="text-xs text-text-tertiary py-3 w-full text-center">Drop here</p>
              )}
            </div>
          </fieldset>
        ))}
      </div>
    </Section>
  )
}
