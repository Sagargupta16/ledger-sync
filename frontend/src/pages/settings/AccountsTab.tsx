/**
 * Accounts Tab (Grouped)
 *
 * Combines three sections under collapsible panels:
 * 1. Account Type Classifications (from AccountClassificationsTab)
 * 2. Investment Mappings (from InvestmentMappingsTab)
 * 3. Excluded Accounts (from ExcludedAccountsTab)
 */

import { motion } from 'framer-motion'
import { Wallet, DollarSign, EyeOff, GripVertical, X, Check } from 'lucide-react'
import CollapsibleSection from '@/components/ui/CollapsibleSection'
import { formatCurrency } from '@/lib/formatters'
import type { LocalPrefs, LocalPrefKey } from './types'
import { ACCOUNT_TYPES, CATEGORY_COLORS, INVESTMENT_TYPES } from './types'

interface AccountsTabProps {
  // Account Classifications props
  accounts: string[]
  classifications: Record<string, string>
  balanceData: { accounts: Record<string, { balance: number }> } | undefined
  balancesLoading: boolean
  dragType: 'account' | 'category' | 'income-category' | null
  onDragStart: (item: string, type: 'account' | 'category' | 'income-category') => void
  onDragEnd: () => void
  onDragOver: (e: React.DragEvent) => void
  onDropOnAccountCategory: (category: string) => void
  // Investment Mappings props
  localPrefs: LocalPrefs
  investmentAccounts: string[]
  onDropOnInvestmentType: (investmentType: string) => void
  onRemoveInvestmentMapping: (account: string) => void
  // Excluded Accounts props
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

export default function AccountsTab({
  accounts,
  classifications,
  balanceData,
  balancesLoading,
  dragType,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDropOnAccountCategory,
  localPrefs,
  investmentAccounts,
  onDropOnInvestmentType,
  onRemoveInvestmentMapping,
  updateLocalPref,
}: Readonly<AccountsTabProps>) {
  // ---------------------------------------------------------------------------
  // Account Classifications logic
  // ---------------------------------------------------------------------------
  const accountsByCategory = ACCOUNT_TYPES.reduce(
    (acc, category) => {
      acc[category] = accounts.filter((name) => classifications[name] === category)
      return acc
    },
    {} as Record<string, string[]>,
  )

  const classifiedAccounts = new Set(Object.values(accountsByCategory).flat())
  const unclassifiedAccounts = accounts.filter((name) => !classifiedAccounts.has(name))

  // ---------------------------------------------------------------------------
  // Investment Mappings logic
  // ---------------------------------------------------------------------------
  const unmappedAccounts = investmentAccounts.filter(
    (acc) => !localPrefs.investment_account_mappings[acc],
  )

  const accountsByInvestmentType = INVESTMENT_TYPES.reduce(
    (acc, type) => {
      acc[type.value] = Object.entries(localPrefs.investment_account_mappings)
        .filter(([, t]) => t === type.value)
        .map(([account]) => account)
      return acc
    },
    {} as Record<string, string[]>,
  )

  // ---------------------------------------------------------------------------
  // Excluded Accounts logic
  // ---------------------------------------------------------------------------
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
  const plural = totalCount === 1 ? '' : 's'
  const summaryText =
    excludedCount === 0
      ? 'No accounts excluded'
      : `${excludedCount} of ${totalCount} account${plural} excluded`

  return (
    <div className="space-y-4">
      {/* Section 1: Account Type Classifications */}
      <CollapsibleSection
        title="Account Type Classifications"
        icon={Wallet}
        defaultExpanded={true}
        badge={accounts.length}
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Drag accounts from the left into category boxes on the right
          </p>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Unassigned Accounts - Source */}
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-muted-foreground"></span>
                Unassigned Accounts ({unclassifiedAccounts.length})
              </h3>
              <div className="bg-white/5 border border-border rounded-xl p-4 min-h-[400px]">
                <div className="flex flex-wrap gap-2">
                  {unclassifiedAccounts.map((accountName) => (
                    <motion.div
                      key={accountName}
                      draggable
                      onDragStart={() => onDragStart(accountName, 'account')}
                      onDragEnd={onDragEnd}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 border border-border-strong rounded-full cursor-move hover:bg-white/20 transition-colors"
                      whileHover={{ scale: 1.05 }}
                    >
                      <GripVertical className="w-3 h-3 text-white/40" />
                      <span className="text-sm text-white truncate">{accountName}</span>
                      {!balancesLoading && (
                        <span className="text-xs text-muted-foreground font-mono ml-1">
                          {formatCurrency(
                            Math.abs(balanceData?.accounts[accountName]?.balance || 0),
                          )}
                        </span>
                      )}
                    </motion.div>
                  ))}
                  {unclassifiedAccounts.length === 0 && (
                    <p className="text-text-tertiary text-sm">All accounts classified</p>
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
                  className={`bg-white/5 rounded-xl border-2 border-dashed p-4 transition-colors min-h-[180px] ${
                    dragType === 'account'
                      ? 'border-border-strong bg-white/10'
                      : 'border-border-strong hover:border-border-strong'
                  }`}
                >
                  <div
                    className={`bg-gradient-to-r ${CATEGORY_COLORS[category]} rounded-lg px-3 py-2 mb-3`}
                  >
                    <h4 className="text-sm font-semibold text-white">{category}</h4>
                    <p className="text-xs text-white/80">
                      {accountsByCategory[category].length} accounts
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {accountsByCategory[category].map((accountName) => (
                      <motion.div
                        key={accountName}
                        draggable
                        onDragStart={() => onDragStart(accountName, 'account')}
                        onDragEnd={onDragEnd}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 border border-border-strong rounded-full cursor-move hover:bg-white/20 transition-colors"
                        whileHover={{ scale: 1.05 }}
                      >
                        <GripVertical className="w-3 h-3 text-white/40" />
                        <span className="text-sm text-white truncate">{accountName}</span>
                      </motion.div>
                    ))}
                    {accountsByCategory[category].length === 0 && (
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
      </CollapsibleSection>

      {/* Section 2: Investment Mappings */}
      <CollapsibleSection
        title="Investment Mappings"
        icon={DollarSign}
        defaultExpanded={true}
        badge={Object.keys(localPrefs.investment_account_mappings).length}
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Drag accounts from the left into investment categories on the right
          </p>

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
      </CollapsibleSection>

      {/* Section 3: Excluded Accounts */}
      <CollapsibleSection
        title="Excluded Accounts"
        icon={EyeOff}
        defaultExpanded={false}
        badge={excludedCount || undefined}
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Check accounts to exclude them from analytics and reporting. Excluded accounts will not
            appear in spending breakdowns, trends, or net worth calculations.
          </p>

          {/* Summary */}
          <div className="flex items-center gap-2 text-sm">
            <EyeOff className="w-4 h-4 text-ios-yellow" />
            <span className="text-muted-foreground">{summaryText}</span>
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
      </CollapsibleSection>
    </div>
  )
}
