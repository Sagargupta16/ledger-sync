/**
 * Investment Mappings Tab
 *
 * Drag-and-drop interface for mapping investment accounts to
 * investment types (stocks, mutual funds, FDs, etc.).
 */

import { motion } from 'framer-motion'
import { GripVertical, X } from 'lucide-react'
import type { LocalPrefs } from './types'
import { INVESTMENT_TYPES } from './types'

interface InvestmentMappingsTabProps {
  localPrefs: LocalPrefs
  investmentAccounts: string[]
  dragType: 'account' | 'category' | 'income-category' | null
  onDragStart: (item: string, type: 'account' | 'category' | 'income-category') => void
  onDragEnd: () => void
  onDragOver: (e: React.DragEvent) => void
  onDropOnInvestmentType: (investmentType: string) => void
  onRemoveInvestmentMapping: (account: string) => void
}

export default function InvestmentMappingsTab({
  localPrefs,
  investmentAccounts,
  dragType,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDropOnInvestmentType,
  onRemoveInvestmentMapping,
}: Readonly<InvestmentMappingsTabProps>) {
  // Get unassigned investment accounts (for investment mappings)
  const unmappedAccounts = investmentAccounts.filter(
    (acc) => !localPrefs.investment_account_mappings[acc]
  )

  // Get accounts by investment type
  const accountsByInvestmentType = INVESTMENT_TYPES.reduce(
    (acc, type) => {
      acc[type.value] = Object.entries(localPrefs.investment_account_mappings)
        .filter(([, t]) => t === type.value)
        .map(([account]) => account)
      return acc
    },
    {} as Record<string, string[]>
  )

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-white">Investment Account Mappings</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Drag accounts from the left into investment categories on the right
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Unassigned Accounts - Source */}
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-muted-foreground"></span>
            Unassigned Accounts ({unmappedAccounts.length})
          </h3>
          <div className="bg-white/5 border border-border rounded-xl p-4 min-h-[400px]">
            <div className="flex flex-wrap gap-2">
              {unmappedAccounts.map((account) => (
                <motion.div
                  key={account}
                  draggable
                  onDragStart={() => onDragStart(account, 'account')}
                  onDragEnd={onDragEnd}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 border border-border-strong rounded-full cursor-move hover:bg-white/20 transition-colors"
                  whileHover={{ scale: 1.05 }}
                >
                  <GripVertical className="w-3 h-3 text-white/40" />
                  <span className="text-sm text-white">{account}</span>
                </motion.div>
              ))}
              {unmappedAccounts.length === 0 && (
                <p className="text-text-tertiary text-sm">All accounts assigned</p>
              )}
            </div>
          </div>
        </div>

        {/* Investment Type Drop Zones */}
        <div className="lg:col-span-2 grid grid-cols-2 md:grid-cols-4 gap-4">
          {INVESTMENT_TYPES.map((type) => (
            <section
              key={type.value}
              aria-label={`Drop zone for ${type.label}`}
              onDragOver={onDragOver}
              onDrop={() => onDropOnInvestmentType(type.value)}
              className={`bg-white/5 rounded-xl border-2 border-dashed p-4 transition-colors min-h-[180px] ${
                dragType === 'account'
                  ? 'border-border-strong bg-white/10'
                  : 'border-border-strong hover:border-border-strong'
              }`}
            >
              <div className={`bg-gradient-to-r ${type.color} rounded-lg px-3 py-2 mb-3`}>
                <h4 className="text-sm font-semibold text-white">{type.label}</h4>
              </div>
              <div className="flex flex-wrap gap-2">
                {accountsByInvestmentType[type.value].map((account) => (
                  <motion.div
                    key={account}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 border border-border-strong rounded-full"
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                  >
                    <span className="text-sm text-white truncate">{account}</span>
                    <button
                      onClick={() => onRemoveInvestmentMapping(account)}
                      className="text-muted-foreground hover:text-ios-red transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </motion.div>
                ))}
                {accountsByInvestmentType[type.value].length === 0 && (
                  <div className="flex items-center justify-center w-full h-16 text-text-tertiary">
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
