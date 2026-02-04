/**
 * Comprehensive Settings Page
 *
 * Provides user interface for all preference categories with drag-and-drop:
 * 1. Account Classifications
 * 2. Fiscal Year Configuration
 * 3. Essential Categories (drag-and-drop)
 * 4. Investment Mappings (drag-and-drop)
 * 5. Income Source Categories (drag-and-drop)
 * 6. Budget Defaults
 * 7. Display Preferences
 * 8. Anomaly Detection Settings
 * 9. Recurring Transaction Settings
 */

import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Save,
  RotateCcw,
  GripVertical,
  Calendar,
  Wallet,
  TrendingUp,
  DollarSign,
  PiggyBank,
  Settings2,
  AlertTriangle,
  RefreshCw,
  X,
  Check,
  UserCog,
  Trash2,
} from 'lucide-react'
import { useAccountBalances, useMasterCategories } from '@/hooks/useAnalytics'
import { accountClassificationsService } from '@/services/api/accountClassifications'
import { usePreferences, useUpdatePreferences, useResetPreferences } from '@/hooks/api/usePreferences'
import { useDeleteAccount, useResetAccount } from '@/hooks/api/useAuth'
import { useAuthStore } from '@/store/authStore'
import { toast } from 'sonner'
import { formatCurrency } from '@/lib/formatters'

// Tab definitions
const TABS = [
  { id: 'accounts', label: 'Account Types', icon: Wallet },
  { id: 'categories', label: 'Essential Categories', icon: TrendingUp },
  { id: 'investments', label: 'Investment Mappings', icon: DollarSign },
  { id: 'income', label: 'Income Sources', icon: DollarSign },
  { id: 'others', label: 'Other Settings', icon: Settings2 },
  { id: 'account-management', label: 'Account', icon: UserCog },
] as const

type TabId = (typeof TABS)[number]['id']

// Account classification types
const ACCOUNT_TYPES = ['Cash', 'Bank Accounts', 'Credit Cards', 'Investments', 'Loans/Lended', 'Other Wallets']

const CATEGORY_COLORS: Record<string, string> = {
  Cash: 'from-green-500 to-emerald-600',
  'Bank Accounts': 'from-blue-500 to-cyan-600',
  'Credit Cards': 'from-orange-500 to-red-600',
  Investments: 'from-purple-500 to-pink-600',
  Loans: 'from-red-500 to-orange-600',
  'Other Wallets': 'from-indigo-500 to-blue-600',
}

// Month names for fiscal year dropdown
const MONTHS = [
  { value: 1, label: 'January' },
  { value: 2, label: 'February' },
  { value: 3, label: 'March' },
  { value: 4, label: 'April' },
  { value: 5, label: 'May' },
  { value: 6, label: 'June' },
  { value: 7, label: 'July' },
  { value: 8, label: 'August' },
  { value: 9, label: 'September' },
  { value: 10, label: 'October' },
  { value: 11, label: 'November' },
  { value: 12, label: 'December' },
]

// Investment types
const INVESTMENT_TYPES = [
  { value: 'stocks', label: 'Stocks', color: 'from-blue-500 to-blue-600' },
  { value: 'mutual_funds', label: 'Mutual Funds', color: 'from-purple-500 to-purple-600' },
  { value: 'fixed_deposits', label: 'Fixed Deposits', color: 'from-amber-500 to-amber-600' },
  { value: 'ppf_epf', label: 'PPF/EPF', color: 'from-green-500 to-green-600' },
  { value: 'real_estate', label: 'Real Estate', color: 'from-pink-500 to-pink-600' },
  { value: 'gold', label: 'Gold', color: 'from-yellow-500 to-yellow-600' },
  { value: 'crypto', label: 'Crypto', color: 'from-orange-500 to-orange-600' },
  { value: 'other', label: 'Other', color: 'from-gray-500 to-gray-600' },
]

// Time range options
const TIME_RANGE_OPTIONS = [
  { value: 'last_3_months', label: 'Last 3 Months' },
  { value: 'last_6_months', label: 'Last 6 Months' },
  { value: 'last_12_months', label: 'Last 12 Months' },
  { value: 'current_fy', label: 'Current Fiscal Year' },
  { value: 'all_time', label: 'All Time' },
]

// Anomaly types
const ANOMALY_TYPES = [
  { value: 'high_expense', label: 'High Expense Months' },
  { value: 'unusual_category', label: 'Unusual Category Spending' },
  { value: 'large_transfer', label: 'Large Transfers' },
  { value: 'budget_exceeded', label: 'Budget Exceeded' },
]

// Income classification types
const INCOME_CLASSIFICATION_TYPES = [
  { value: 'taxable', label: '💰 Taxable Income', color: 'from-red-500 to-orange-600', description: 'Salary, bonus, freelance income' },
  { value: 'investment', label: '📈 Investment Returns', color: 'from-green-500 to-emerald-600', description: 'Dividends, interest, capital gains' },
  { value: 'non_taxable', label: '💳 Cashbacks', color: 'from-blue-500 to-cyan-600', description: 'Refunds, cashbacks, rewards' },
  { value: 'other', label: '📦 Others', color: 'from-purple-500 to-pink-600', description: 'Gifts, prizes, miscellaneous' },
]

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<TabId>('accounts')

  // Auth data for account management
  const { user } = useAuthStore()
  const deleteAccount = useDeleteAccount()
  const resetAccount = useResetAccount()
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')

  // Preferences data
  const { data: preferences, isLoading: preferencesLoading } = usePreferences()
  const updatePreferences = useUpdatePreferences()
  const resetPreferences = useResetPreferences()

  // Master categories from database
  const { data: masterCategories, isLoading: categoriesLoading } = useMasterCategories()

  // Account classifications
  const { data: balanceData, isLoading: balancesLoading } = useAccountBalances()
  const [classifications, setClassifications] = useState<Record<string, string>>({})
  const [classificationsLoading, setClassificationsLoading] = useState(true)
  
  // Drag state
  const [draggedItem, setDraggedItem] = useState<string | null>(null)
  const [dragType, setDragType] = useState<'account' | 'category' | 'income-category' | null>(null)

  // Local state for preferences editing
  const [localPrefs, setLocalPrefs] = useState<{
    fiscal_year_start_month: number
    essential_categories: string[]
    investment_account_mappings: Record<string, string>
    taxable_income_categories: string[]
    investment_returns_categories: string[]
    non_taxable_income_categories: string[]
    other_income_categories: string[]
    default_budget_alert_threshold: number
    auto_create_budgets: boolean
    budget_rollover_enabled: boolean
    number_format: 'indian' | 'international'
    currency_symbol: string
    currency_symbol_position: 'before' | 'after'
    default_time_range: string
    anomaly_expense_threshold: number
    anomaly_types_enabled: string[]
    auto_dismiss_recurring_anomalies: boolean
    recurring_min_confidence: number
    recurring_auto_confirm_occurrences: number
  } | null>(null)

  const [hasChanges, setHasChanges] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  // Calculate accounts from balance data
  const accounts = useMemo(() => {
    const acc = balanceData?.accounts || {}
    return Object.keys(acc)
      .filter((name) => acc[name].balance !== 0)
      .sort((a, b) => a.localeCompare(b))
  }, [balanceData])

  // Get all expense categories from master categories (excluding Transfer categories - they're not real expenses)
  const allExpenseCategories = useMemo(() => {
    if (!masterCategories?.expense) return []
    return Object.keys(masterCategories.expense)
      .filter((cat) => !cat.toLowerCase().startsWith('transfer'))
      .sort()
  }, [masterCategories])

  // Get all income categories with subcategories from master categories
  const allIncomeCategories = useMemo(() => {
    if (!masterCategories?.income) return {}
    return masterCategories.income
  }, [masterCategories])

  // Get investment accounts only (accounts classified as 'Investments')
  const investmentAccounts = useMemo(() => {
    return accounts.filter((acc) => classifications[acc] === 'Investments')
  }, [accounts, classifications])

  // Initialize local prefs when preferences load
  useEffect(() => {
    if (preferences && !localPrefs) {
      setLocalPrefs({
        fiscal_year_start_month: preferences.fiscal_year_start_month,
        essential_categories: [...preferences.essential_categories],
        investment_account_mappings: { ...preferences.investment_account_mappings },
        taxable_income_categories: [...(preferences.taxable_income_categories || [])],
        investment_returns_categories: [...(preferences.investment_returns_categories || [])],
        non_taxable_income_categories: [...(preferences.non_taxable_income_categories || [])],
        other_income_categories: [...(preferences.other_income_categories || [])],
        default_budget_alert_threshold: preferences.default_budget_alert_threshold,
        auto_create_budgets: preferences.auto_create_budgets,
        budget_rollover_enabled: preferences.budget_rollover_enabled,
        number_format: preferences.number_format,
        currency_symbol: preferences.currency_symbol,
        currency_symbol_position: preferences.currency_symbol_position,
        default_time_range: preferences.default_time_range,
        anomaly_expense_threshold: preferences.anomaly_expense_threshold,
        anomaly_types_enabled: [...preferences.anomaly_types_enabled],
        auto_dismiss_recurring_anomalies: preferences.auto_dismiss_recurring_anomalies,
        recurring_min_confidence: preferences.recurring_min_confidence,
        recurring_auto_confirm_occurrences: preferences.recurring_auto_confirm_occurrences,
      })
    }
  }, [preferences, localPrefs])

  // Load account classifications
  useEffect(() => {
    const loadClassifications = async () => {
      setClassificationsLoading(true)
      try {
        const data = await accountClassificationsService.getAllClassifications()
        const withDefaults = { ...getDefaultClassifications(accounts), ...data }
        setClassifications(withDefaults)
      } catch {
        toast.error('Failed to load account classifications')
      } finally {
        setClassificationsLoading(false)
      }
    }
    loadClassifications()
  }, [accounts])

  // Helper to get default classifications
  const getDefaultClassifications = (accountNames: string[]): Record<string, string> => {
    const defaults: Record<string, string> = {}
    accountNames.forEach((name) => {
      const lowerName = name.toLowerCase()
      if (lowerName.includes('credit card') || lowerName.includes('cc ') || lowerName.includes('amex')) {
        defaults[name] = 'Credit Cards'
      } else if (lowerName.includes('bank') || lowerName.includes('checking') || lowerName.includes('salary')) {
        defaults[name] = 'Bank Accounts'
      } else if (lowerName.includes('cash') || lowerName.includes('wallet')) {
        defaults[name] = 'Cash'
      } else if (lowerName.includes('investment') || lowerName.includes('mutual') || lowerName.includes('stock')) {
        defaults[name] = 'Investments'
      } else if (lowerName.includes('loan') || lowerName.includes('debt')) {
        defaults[name] = 'Loans/Lended'
      } else {
        defaults[name] = 'Other Wallets'
      }
    })
    return defaults
  }

  // Generic drag handlers
  const handleDragStart = (item: string, type: 'account' | 'category' | 'income-category') => {
    setDraggedItem(item)
    setDragType(type)
  }
  
  const handleDragOver = (e: React.DragEvent) => e.preventDefault()
  
  const handleDragEnd = () => {
    setDraggedItem(null)
    setDragType(null)
  }

  // Account drop handler
  const handleDropOnAccountCategory = (category: string) => {
    if (draggedItem && dragType === 'account') {
      setClassifications((prev) => ({ ...prev, [draggedItem]: category }))
      setHasChanges(true)
    }
    handleDragEnd()
  }

  // Essential category drop handler
  const handleDropOnEssential = () => {
    if (draggedItem && dragType === 'category' && localPrefs) {
      if (!localPrefs.essential_categories.includes(draggedItem)) {
        updateLocalPref('essential_categories', [...localPrefs.essential_categories, draggedItem])
      }
    }
    handleDragEnd()
  }

  // Remove from essential
  const handleRemoveFromEssential = (category: string) => {
    if (localPrefs) {
      updateLocalPref(
        'essential_categories',
        localPrefs.essential_categories.filter((c) => c !== category)
      )
    }
  }

  // Investment mapping drop handler
  const handleDropOnInvestmentType = (investmentType: string) => {
    if (draggedItem && dragType === 'account' && localPrefs) {
      updateLocalPref('investment_account_mappings', {
        ...localPrefs.investment_account_mappings,
        [draggedItem]: investmentType,
      })
    }
    handleDragEnd()
  }

  // Remove investment mapping
  const handleRemoveInvestmentMapping = (account: string) => {
    if (localPrefs) {
      const { [account]: _removed, ...rest } = localPrefs.investment_account_mappings
      void _removed // Explicitly mark as intentionally unused
      updateLocalPref('investment_account_mappings', rest)
    }
  }

  // Income classification drop handlers - now with subcategories
  type IncomeClassificationType = 'taxable' | 'investment' | 'non_taxable' | 'other'
  
  const incomeClassificationKeyMap: Record<IncomeClassificationType, 'taxable_income_categories' | 'investment_returns_categories' | 'non_taxable_income_categories' | 'other_income_categories'> = {
    taxable: 'taxable_income_categories',
    investment: 'investment_returns_categories',
    non_taxable: 'non_taxable_income_categories',
    other: 'other_income_categories',
  }
  
  const handleDropOnIncomeClassification = (classificationType: IncomeClassificationType) => {
    if (draggedItem && dragType === 'income-category' && localPrefs) {
      // draggedItem is "Category::Subcategory" format
      const targetKey = incomeClassificationKeyMap[classificationType]
      const currentList = [...localPrefs[targetKey]]
      
      if (!currentList.includes(draggedItem)) {
        currentList.push(draggedItem)
        updateLocalPref(targetKey, currentList)
      }
    }
    handleDragEnd()
  }

  // Remove income classification
  const handleRemoveIncomeClassification = (classificationType: IncomeClassificationType, item: string) => {
    if (!localPrefs) return
    
    const targetKey = incomeClassificationKeyMap[classificationType]
    const currentList = localPrefs[targetKey].filter((c: string) => c !== item)
    updateLocalPref(targetKey, currentList)
  }

  const updateLocalPref = <K extends keyof NonNullable<typeof localPrefs>>(
    key: K,
    value: NonNullable<typeof localPrefs>[K]
  ) => {
    if (localPrefs) {
      setLocalPrefs({ ...localPrefs, [key]: value })
      setHasChanges(true)
    }
  }

  const handleSave = async () => {
    setIsSaving(true)
    try {
      // Save account classifications
      if (activeTab === 'accounts') {
        const original = await accountClassificationsService.getAllClassifications()
        for (const [accountName, accountType] of Object.entries(classifications)) {
          if (original[accountName] !== accountType) {
            await accountClassificationsService.setClassification(accountName, accountType)
          }
        }
      }

      // Save preferences
      if (localPrefs) {
        await updatePreferences.mutateAsync(localPrefs)
      }

      setHasChanges(false)
      toast.success('Settings saved successfully')
    } catch {
      toast.error('Failed to save settings')
    } finally {
      setIsSaving(false)
    }
  }

  const handleReset = async () => {
    try {
      await resetPreferences.mutateAsync()
      setLocalPrefs(null) // Will reload from API
      setHasChanges(false)
      toast.success('Settings reset to defaults')
    } catch {
      toast.error('Failed to reset settings')
    }
  }

  const toggleAnomalyType = (type: string) => {
    if (localPrefs) {
      const enabled = localPrefs.anomaly_types_enabled.includes(type)
      updateLocalPref(
        'anomaly_types_enabled',
        enabled
          ? localPrefs.anomaly_types_enabled.filter((t) => t !== type)
          : [...localPrefs.anomaly_types_enabled, type]
      )
    }
  }

  // Loading state
  if (preferencesLoading || classificationsLoading || categoriesLoading) {
    return (
      <div className="min-h-screen p-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-gray-400">Loading settings...</div>
        </div>
      </div>
    )
  }

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

  // Get unassigned investment accounts (for investment mappings)
  const unmappedAccounts = investmentAccounts.filter(
    (acc) => !localPrefs?.investment_account_mappings[acc]
  )

  // Get accounts by investment type
  const accountsByInvestmentType = INVESTMENT_TYPES.reduce(
    (acc, type) => {
      acc[type.value] = Object.entries(localPrefs?.investment_account_mappings || {})
        .filter(([, t]) => t === type.value)
        .map(([account]) => account)
      return acc
    },
    {} as Record<string, string[]>
  )

  // Get available expense categories (not yet marked as essential)
  const availableEssentialCategories = allExpenseCategories.filter(
    (cat) => !localPrefs?.essential_categories.includes(cat)
  )

  // Get income subcategories that haven't been classified yet
  // Returns array of "Category::Subcategory" strings
  const getUnclassifiedIncomeSubcategories = () => {
    if (!localPrefs) {
      // Return all subcategories as "Category::Subcategory"
      return Object.entries(allIncomeCategories).flatMap(([cat, subs]) =>
        (subs as string[]).map((sub) => `${cat}::${sub}`)
      )
    }
    
    const allClassified = new Set<string>([
      ...localPrefs.taxable_income_categories,
      ...localPrefs.investment_returns_categories,
      ...localPrefs.non_taxable_income_categories,
      ...localPrefs.other_income_categories,
    ])
    
    // Return "Category::Subcategory" strings that haven't been classified yet
    return Object.entries(allIncomeCategories).flatMap(([cat, subs]) =>
      (subs as string[])
        .map((sub) => `${cat}::${sub}`)
        .filter((item) => !allClassified.has(item))
    )
  }
  
  // Helper to parse "Category::Subcategory" and get display name
  const parseIncomeItem = (item: string) => {
    const [category, subcategory] = item.split('::')
    return { category, subcategory, display: subcategory || category }
  }

  return (
    <div className="min-h-screen p-8 pb-32">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-primary via-purple-400 to-secondary bg-clip-text text-transparent drop-shadow-lg">
            Settings
          </h1>
          <p className="text-muted-foreground mt-2">Configure your financial tracking preferences</p>
        </motion.div>

        {/* Tabs */}
        <div className="flex flex-wrap gap-2 p-1 bg-white/5 rounded-xl border border-white/10">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
                activeTab === tab.id
                  ? 'bg-gradient-to-r from-primary to-secondary text-white shadow-lg'
                  : 'text-gray-400 hover:text-white hover:bg-white/10'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              <span className="text-sm font-medium">{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="glass rounded-xl border border-white/10 p-6"
          >
            {/* Account Classifications Tab - DRAG AND DROP */}
            {activeTab === 'accounts' && (
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
                            onDragStart={() => handleDragStart(accountName, 'account')}
                            onDragEnd={handleDragEnd}
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
                      <div
                        key={category}
                        onDragOver={handleDragOver}
                        onDrop={() => handleDropOnAccountCategory(category)}
                        className={`bg-white/5 rounded-xl border-2 border-dashed p-4 transition-all min-h-[180px] ${
                          dragType === 'account' ? 'border-white/40 bg-white/10' : 'border-white/20 hover:border-white/30'
                        }`}
                      >
                        <div className={`bg-gradient-to-r ${CATEGORY_COLORS[category]} rounded-lg px-3 py-2 mb-3`}>
                          <h4 className="text-sm font-semibold text-white">{category}</h4>
                          <p className="text-xs text-white/80">{accountsByCategory[category].length} accounts</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {accountsByCategory[category].map((accountName) => (
                            <motion.div
                              key={accountName}
                              draggable
                              onDragStart={() => handleDragStart(accountName, 'account')}
                              onDragEnd={handleDragEnd}
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
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Essential Categories Tab - DRAG AND DROP */}
            {activeTab === 'categories' && localPrefs && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-xl font-semibold text-white">Essential Categories</h2>
                  <p className="text-sm text-gray-400 mt-1">
                    Drag expense categories from the left to mark them as essential (non-discretionary)
                  </p>
                </div>
                
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Available Categories - Source */}
                  <div className="space-y-3">
                    <h3 className="text-sm font-medium text-gray-400 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-gray-500"></span>
                      Available Categories ({availableEssentialCategories.length})
                    </h3>
                    <div className="bg-white/5 border border-white/10 rounded-xl p-4 min-h-[400px]">
                      <div className="flex flex-wrap gap-2">
                        {availableEssentialCategories.map((category) => (
                          <motion.div
                            key={category}
                            draggable
                            onDragStart={() => handleDragStart(category, 'category')}
                            onDragEnd={handleDragEnd}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 border border-white/20 rounded-full cursor-move hover:bg-white/20 transition-all"
                            whileHover={{ scale: 1.05 }}
                          >
                            <GripVertical className="w-3 h-3 text-white/40" />
                            <span className="text-sm text-white">{category}</span>
                          </motion.div>
                        ))}
                        {availableEssentialCategories.length === 0 && (
                          <p className="text-gray-500 text-sm">All categories marked as essential</p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Essential Categories Drop Zone */}
                  <div className="lg:col-span-2 space-y-3">
                    <h3 className="text-sm font-medium text-emerald-400 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                      Essential Categories ({localPrefs.essential_categories.length})
                    </h3>
                    <div
                      onDragOver={handleDragOver}
                      onDrop={handleDropOnEssential}
                      className={`bg-white/5 rounded-xl border-2 border-dashed p-4 min-h-[400px] transition-all ${
                        dragType === 'category' ? 'border-emerald-400 bg-emerald-500/10' : 'border-white/20 hover:border-white/30'
                      }`}
                    >
                      <div className="flex flex-wrap gap-2">
                        {localPrefs.essential_categories.map((category) => (
                          <motion.div
                            key={category}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/20 border border-emerald-500/40 rounded-full"
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                          >
                            <span className="text-sm text-emerald-300">{category}</span>
                            <button
                              onClick={() => handleRemoveFromEssential(category)}
                              className="text-emerald-300 hover:text-red-400 transition-colors"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </motion.div>
                        ))}
                        {localPrefs.essential_categories.length === 0 && (
                          <div className="flex items-center justify-center w-full h-16 text-gray-500">
                            <p className="text-sm">Drop categories here</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Investment Mappings Tab - DRAG AND DROP */}
            {activeTab === 'investments' && localPrefs && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-xl font-semibold text-white">Investment Account Mappings</h2>
                  <p className="text-sm text-gray-400 mt-1">
                    Drag accounts from the left into investment categories on the right
                  </p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Unassigned Accounts - Source */}
                  <div className="space-y-3">
                    <h3 className="text-sm font-medium text-gray-400 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-gray-500"></span>
                      Unassigned Accounts ({unmappedAccounts.length})
                    </h3>
                    <div className="bg-white/5 border border-white/10 rounded-xl p-4 min-h-[400px]">
                      <div className="flex flex-wrap gap-2">
                        {unmappedAccounts.map((account) => (
                          <motion.div
                            key={account}
                            draggable
                            onDragStart={() => handleDragStart(account, 'account')}
                            onDragEnd={handleDragEnd}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 border border-white/20 rounded-full cursor-move hover:bg-white/20 transition-all"
                            whileHover={{ scale: 1.05 }}
                          >
                            <GripVertical className="w-3 h-3 text-white/40" />
                            <span className="text-sm text-white">{account}</span>
                          </motion.div>
                        ))}
                        {unmappedAccounts.length === 0 && (
                          <p className="text-gray-500 text-sm">All accounts assigned</p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Investment Type Drop Zones */}
                  <div className="lg:col-span-2 grid grid-cols-2 md:grid-cols-4 gap-4">
                    {INVESTMENT_TYPES.map((type) => (
                      <div
                        key={type.value}
                        onDragOver={handleDragOver}
                        onDrop={() => handleDropOnInvestmentType(type.value)}
                        className={`bg-white/5 rounded-xl border-2 border-dashed p-4 transition-all min-h-[180px] ${
                          dragType === 'account' ? 'border-white/40 bg-white/10' : 'border-white/20 hover:border-white/30'
                        }`}
                      >
                        <div className={`bg-gradient-to-r ${type.color} rounded-lg px-3 py-2 mb-3`}>
                          <h4 className="text-sm font-semibold text-white">{type.label}</h4>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {accountsByInvestmentType[type.value].map((account) => (
                            <motion.div
                              key={account}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 border border-white/20 rounded-full"
                              initial={{ scale: 0.8, opacity: 0 }}
                              animate={{ scale: 1, opacity: 1 }}
                            >
                              <span className="text-sm text-white truncate">{account}</span>
                              <button
                                onClick={() => handleRemoveInvestmentMapping(account)}
                                className="text-gray-400 hover:text-red-400 transition-colors"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </motion.div>
                          ))}
                          {accountsByInvestmentType[type.value].length === 0 && (
                            <div className="flex items-center justify-center w-full h-16 text-gray-500">
                              <p className="text-sm">Drop here</p>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Income Classification Tab - DRAG AND DROP */}
            {activeTab === 'income' && localPrefs && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-xl font-semibold text-white">Income Classification</h2>
                  <p className="text-sm text-gray-400 mt-1">
                    Classify your income subcategories by tax treatment. Drag items from the left into the appropriate classification box.
                  </p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Available Income Subcategories - Source */}
                  <div className="space-y-3">
                    <h3 className="text-sm font-medium text-gray-400 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-gray-500"></span>
                      Unclassified Income ({getUnclassifiedIncomeSubcategories().length})
                    </h3>
                    <div className="bg-white/5 border border-white/10 rounded-xl p-4 min-h-[400px]">
                      {/* Group by parent category */}
                      {Object.entries(allIncomeCategories).map(([category, subs]) => {
                        const unclassifiedSubs = (subs as string[]).filter((sub) =>
                          getUnclassifiedIncomeSubcategories().includes(`${category}::${sub}`)
                        )
                        if (unclassifiedSubs.length === 0) return null
                        return (
                          <div key={category} className="mb-4">
                            <p className="text-xs text-gray-500 mb-2 font-medium">{category}</p>
                            <div className="flex flex-wrap gap-2">
                              {unclassifiedSubs.map((sub) => (
                                <motion.div
                                  key={`${category}::${sub}`}
                                  draggable
                                  onDragStart={() => handleDragStart(`${category}::${sub}`, 'income-category')}
                                  onDragEnd={handleDragEnd}
                                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 border border-white/20 rounded-full cursor-move hover:bg-white/20 transition-all"
                                  whileHover={{ scale: 1.05 }}
                                >
                                  <GripVertical className="w-3 h-3 text-white/40" />
                                  <span className="text-sm text-white">{sub}</span>
                                </motion.div>
                              ))}
                            </div>
                          </div>
                        )
                      })}
                      {getUnclassifiedIncomeSubcategories().length === 0 && (
                        <p className="text-gray-500 text-sm">All income subcategories classified</p>
                      )}
                    </div>
                  </div>

                  {/* Income Classification Drop Zones */}
                  <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
                    {INCOME_CLASSIFICATION_TYPES.map((classType) => {
                      const dataMap: Record<string, string[]> = {
                        taxable: localPrefs.taxable_income_categories,
                        investment: localPrefs.investment_returns_categories,
                        non_taxable: localPrefs.non_taxable_income_categories,
                        other: localPrefs.other_income_categories,
                      }
                      const items = dataMap[classType.value]

                      return (
                        <div
                          key={classType.value}
                          onDragOver={handleDragOver}
                          onDrop={() => handleDropOnIncomeClassification(classType.value as 'taxable' | 'investment' | 'non_taxable' | 'other')}
                          className={`bg-white/5 rounded-xl border-2 border-dashed p-4 transition-all min-h-[180px] ${
                            dragType === 'income-category' ? 'border-white/40 bg-white/10' : 'border-white/20 hover:border-white/30'
                          }`}
                        >
                          <div className={`bg-gradient-to-r ${classType.color} rounded-lg px-3 py-2 mb-2`}>
                            <h4 className="text-sm font-semibold text-white">{classType.label}</h4>
                          </div>
                          <p className="text-xs text-gray-400 mb-3">{classType.description}</p>
                          <div className="flex flex-wrap gap-2">
                            {items.map((item) => {
                              const { display } = parseIncomeItem(item)
                              return (
                                <motion.div
                                  key={item}
                                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 border border-white/20 rounded-full"
                                  initial={{ scale: 0.8, opacity: 0 }}
                                  animate={{ scale: 1, opacity: 1 }}
                                >
                                  <span className="text-sm text-white">{display}</span>
                                  <button
                                    onClick={() => handleRemoveIncomeClassification(classType.value as 'taxable' | 'investment' | 'non_taxable' | 'other', item)}
                                    className="text-gray-400 hover:text-red-400 transition-colors"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </motion.div>
                              )
                            })}
                            {items.length === 0 && (
                              <div className="flex items-center justify-center w-full h-16 text-gray-500">
                                <p className="text-sm">Drop income types here</p>
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Other Settings Tab - Combines Fiscal, Budget, Display, Anomaly, Recurring */}
            {activeTab === 'others' && localPrefs && (
              <div className="space-y-8">
                <h2 className="text-xl font-semibold text-white">Other Settings</h2>

                {/* Fiscal Year Section */}
                <div className="glass rounded-lg p-5 border border-white/10">
                  <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-primary" />
                    Fiscal Year
                  </h3>
                  <div className="max-w-sm">
                    <label htmlFor="fiscal-month" className="block text-sm font-medium text-gray-300 mb-2">
                      Fiscal Year Starts In
                    </label>
                    <select
                      id="fiscal-month"
                      value={localPrefs.fiscal_year_start_month}
                      onChange={(e) => updateLocalPref('fiscal_year_start_month', Number(e.target.value))}
                      className="w-full px-4 py-2 bg-white/5 border border-white/20 rounded-lg text-white focus:border-primary"
                    >
                      {MONTHS.map((month) => (
                        <option key={month.value} value={month.value} className="bg-gray-900">
                          {month.label}
                        </option>
                      ))}
                    </select>
                    <p className="mt-2 text-xs text-gray-400">Default: April (India FY)</p>
                  </div>
                </div>

                {/* Display Preferences Section */}
                <div className="glass rounded-lg p-5 border border-white/10">
                  <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                    <Settings2 className="w-5 h-5 text-primary" />
                    Display Preferences
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div>
                      <label htmlFor="number-format" className="block text-sm font-medium text-gray-300 mb-2">Number Format</label>
                      <select
                        id="number-format"
                        value={localPrefs.number_format}
                        onChange={(e) => updateLocalPref('number_format', e.target.value as 'indian' | 'international')}
                        className="w-full px-3 py-2 bg-white/5 border border-white/20 rounded-lg text-white text-sm focus:border-primary"
                      >
                        <option value="indian" className="bg-gray-900">Indian (1,00,000)</option>
                        <option value="international" className="bg-gray-900">International (100,000)</option>
                      </select>
                    </div>
                    <div>
                      <label htmlFor="currency-symbol" className="block text-sm font-medium text-gray-300 mb-2">Currency Symbol</label>
                      <input
                        id="currency-symbol"
                        type="text"
                        value={localPrefs.currency_symbol}
                        onChange={(e) => updateLocalPref('currency_symbol', e.target.value)}
                        className="w-full px-3 py-2 bg-white/5 border border-white/20 rounded-lg text-white text-sm focus:border-primary"
                      />
                    </div>
                    <div>
                      <label htmlFor="symbol-position" className="block text-sm font-medium text-gray-300 mb-2">Symbol Position</label>
                      <select
                        id="symbol-position"
                        value={localPrefs.currency_symbol_position}
                        onChange={(e) => updateLocalPref('currency_symbol_position', e.target.value as 'before' | 'after')}
                        className="w-full px-3 py-2 bg-white/5 border border-white/20 rounded-lg text-white text-sm focus:border-primary"
                      >
                        <option value="before" className="bg-gray-900">Before (₹100)</option>
                        <option value="after" className="bg-gray-900">After (100₹)</option>
                      </select>
                    </div>
                    <div>
                      <label htmlFor="time-range" className="block text-sm font-medium text-gray-300 mb-2">Default Time Range</label>
                      <select
                        id="time-range"
                        value={localPrefs.default_time_range}
                        onChange={(e) => updateLocalPref('default_time_range', e.target.value)}
                        className="w-full px-3 py-2 bg-white/5 border border-white/20 rounded-lg text-white text-sm focus:border-primary"
                      >
                        {TIME_RANGE_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value} className="bg-gray-900">{opt.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Budget Defaults Section */}
                <div className="glass rounded-lg p-5 border border-white/10">
                  <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                    <PiggyBank className="w-5 h-5 text-primary" />
                    Budget Defaults
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
                    <div>
                      <label htmlFor="alert-threshold" className="block text-sm font-medium text-gray-300 mb-2">
                        Alert Threshold (%)
                      </label>
                      <input
                        id="alert-threshold"
                        type="number"
                        min="0"
                        max="100"
                        value={localPrefs.default_budget_alert_threshold}
                        onChange={(e) => updateLocalPref('default_budget_alert_threshold', Number(e.target.value))}
                        className="w-full px-3 py-2 bg-white/5 border border-white/20 rounded-lg text-white text-sm focus:border-primary"
                      />
                    </div>
                    <label className="flex items-center gap-3 cursor-pointer pt-7">
                      <input
                        type="checkbox"
                        checked={localPrefs.auto_create_budgets}
                        onChange={(e) => updateLocalPref('auto_create_budgets', e.target.checked)}
                        className="w-4 h-4 rounded bg-white/5 border-white/20 text-primary focus:ring-primary"
                      />
                      <span className="text-sm text-white">Auto-create budgets</span>
                    </label>
                    <label className="flex items-center gap-3 cursor-pointer pt-7">
                      <input
                        type="checkbox"
                        checked={localPrefs.budget_rollover_enabled}
                        onChange={(e) => updateLocalPref('budget_rollover_enabled', e.target.checked)}
                        className="w-4 h-4 rounded bg-white/5 border-white/20 text-primary focus:ring-primary"
                      />
                      <span className="text-sm text-white">Budget rollover</span>
                    </label>
                  </div>
                </div>

                {/* Anomaly Detection Section */}
                <div className="glass rounded-lg p-5 border border-white/10">
                  <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-primary" />
                    Anomaly Detection
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <div>
                        <label htmlFor="expense-threshold" className="block text-sm font-medium text-gray-300 mb-2">
                          Expense Threshold (Std Devs)
                        </label>
                        <input
                          id="expense-threshold"
                          type="number"
                          min="1"
                          max="10"
                          step="0.5"
                          value={localPrefs.anomaly_expense_threshold}
                          onChange={(e) => updateLocalPref('anomaly_expense_threshold', Number(e.target.value))}
                          className="w-full px-3 py-2 bg-white/5 border border-white/20 rounded-lg text-white text-sm focus:border-primary"
                        />
                      </div>
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={localPrefs.auto_dismiss_recurring_anomalies}
                          onChange={(e) => updateLocalPref('auto_dismiss_recurring_anomalies', e.target.checked)}
                          className="w-4 h-4 rounded bg-white/5 border-white/20 text-primary focus:ring-primary"
                        />
                        <span className="text-sm text-white">Auto-dismiss recurring anomalies</span>
                      </label>
                    </div>
                    <div>
                      <span className="block text-sm font-medium text-gray-300 mb-2">Enabled Anomaly Types</span>
                      <div className="space-y-2">
                        {ANOMALY_TYPES.map((type) => (
                          <label key={type.value} className="flex items-center gap-3 cursor-pointer">
                            <button
                              type="button"
                              onClick={() => toggleAnomalyType(type.value)}
                              className={`w-4 h-4 rounded flex items-center justify-center transition-colors ${
                                localPrefs.anomaly_types_enabled.includes(type.value)
                                  ? 'bg-primary text-white'
                                  : 'bg-white/5 border border-white/20'
                              }`}
                            >
                              {localPrefs.anomaly_types_enabled.includes(type.value) && <Check className="w-3 h-3" />}
                            </button>
                            <span className="text-sm text-white">{type.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Recurring Transaction Settings Section */}
                <div className="glass rounded-lg p-5 border border-white/10">
                  <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                    <RefreshCw className="w-5 h-5 text-primary" />
                    Recurring Transactions
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="min-confidence" className="block text-sm font-medium text-gray-300 mb-2">
                        Minimum Confidence (%)
                      </label>
                      <input
                        id="min-confidence"
                        type="number"
                        min="0"
                        max="100"
                        value={localPrefs.recurring_min_confidence}
                        onChange={(e) => updateLocalPref('recurring_min_confidence', Number(e.target.value))}
                        className="w-full px-3 py-2 bg-white/5 border border-white/20 rounded-lg text-white text-sm focus:border-primary"
                      />
                    </div>
                    <div>
                      <label htmlFor="auto-confirm" className="block text-sm font-medium text-gray-300 mb-2">
                        Auto-confirm After (occurrences)
                      </label>
                      <input
                        id="auto-confirm"
                        type="number"
                        min="2"
                        max="12"
                        value={localPrefs.recurring_auto_confirm_occurrences}
                        onChange={(e) => updateLocalPref('recurring_auto_confirm_occurrences', Number(e.target.value))}
                        className="w-full px-3 py-2 bg-white/5 border border-white/20 rounded-lg text-white text-sm focus:border-primary"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Account Management Tab */}
            {activeTab === 'account-management' && (
              <div className="space-y-6">
                {/* User Info Section */}
                <div className="glass rounded-lg p-5 border border-white/10">
                  <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                    <UserCog className="w-5 h-5 text-primary" />
                    Account Information
                  </h3>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center py-2 border-b border-white/10">
                      <span className="text-gray-400">Email</span>
                      <span className="text-white">{user?.email || 'N/A'}</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-white/10">
                      <span className="text-gray-400">Name</span>
                      <span className="text-white">{user?.full_name || 'Not set'}</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-white/10">
                      <span className="text-gray-400">Account Status</span>
                      <span className={`px-2 py-1 rounded text-xs ${user?.is_active ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                        {user?.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <div className="flex justify-between items-center py-2">
                      <span className="text-gray-400">Member Since</span>
                      <span className="text-white">
                        {user?.created_at ? new Date(user.created_at).toLocaleDateString() : 'N/A'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Reset Account Section */}
                <div className="glass rounded-lg p-5 border border-amber-500/30 bg-amber-500/5">
                  <h3 className="text-lg font-semibold text-amber-400 mb-2 flex items-center gap-2">
                    <RotateCcw className="w-5 h-5" />
                    Reset Account
                  </h3>
                  <p className="text-gray-400 text-sm mb-4">
                    This will delete all your transactions, import history, and reset preferences to defaults.
                    Your login credentials will be preserved.
                  </p>
                  {!showResetConfirm ? (
                    <button
                      onClick={() => setShowResetConfirm(true)}
                      className="flex items-center gap-2 px-4 py-2 bg-amber-500/20 text-amber-400 rounded-lg hover:bg-amber-500/30 transition-all border border-amber-500/30"
                    >
                      <RotateCcw className="w-4 h-4" />
                      Reset Account Data
                    </button>
                  ) : (
                    <div className="space-y-3 p-4 bg-amber-500/10 rounded-lg border border-amber-500/30">
                      <p className="text-amber-300 text-sm font-medium">
                        Are you sure? This will remove all your financial data!
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            resetAccount.mutate(undefined, {
                              onSuccess: () => {
                                toast.success('Account reset successfully. All data cleared.')
                                setShowResetConfirm(false)
                                window.location.reload()
                              },
                              onError: () => {
                                toast.error('Failed to reset account')
                              },
                            })
                          }}
                          disabled={resetAccount.isPending}
                          className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-black rounded-lg hover:bg-amber-400 transition-all disabled:opacity-50"
                        >
                          {resetAccount.isPending ? 'Resetting...' : 'Yes, Reset Everything'}
                        </button>
                        <button
                          onClick={() => setShowResetConfirm(false)}
                          className="px-4 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-all"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Delete Account Section */}
                <div className="glass rounded-lg p-5 border border-red-500/30 bg-red-500/5">
                  <h3 className="text-lg font-semibold text-red-400 mb-2 flex items-center gap-2">
                    <Trash2 className="w-5 h-5" />
                    Delete Account
                  </h3>
                  <p className="text-gray-400 text-sm mb-4">
                    Permanently delete your account and all associated data. This action cannot be undone.
                  </p>
                  {!showDeleteConfirm ? (
                    <button
                      onClick={() => setShowDeleteConfirm(true)}
                      className="flex items-center gap-2 px-4 py-2 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition-all border border-red-500/30"
                    >
                      <Trash2 className="w-4 h-4" />
                      Delete Account
                    </button>
                  ) : (
                    <div className="space-y-3 p-4 bg-red-500/10 rounded-lg border border-red-500/30">
                      <p className="text-red-300 text-sm font-medium">
                        This is permanent! Type <span className="font-mono bg-red-500/20 px-1 rounded">DELETE</span> to confirm:
                      </p>
                      <input
                        type="text"
                        value={deleteConfirmText}
                        onChange={(e) => setDeleteConfirmText(e.target.value)}
                        placeholder="Type DELETE to confirm"
                        className="w-full px-3 py-2 bg-white/5 border border-red-500/30 rounded-lg text-white text-sm focus:border-red-500"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            deleteAccount.mutate(undefined, {
                              onSuccess: () => {
                                toast.success('Account deleted successfully')
                                // Redirect will happen automatically via logout
                              },
                              onError: () => {
                                toast.error('Failed to delete account')
                              },
                            })
                          }}
                          disabled={deleteConfirmText !== 'DELETE' || deleteAccount.isPending}
                          className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {deleteAccount.isPending ? 'Deleting...' : 'Permanently Delete'}
                        </button>
                        <button
                          onClick={() => {
                            setShowDeleteConfirm(false)
                            setDeleteConfirmText('')
                          }}
                          className="px-4 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-all"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Action Buttons - Fixed at bottom */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="fixed bottom-0 left-0 right-0 bg-gradient-to-t from-background via-background to-transparent p-8 border-t border-white/10"
        >
          <div className="max-w-7xl mx-auto flex gap-3 justify-end">
            <button
              onClick={handleReset}
              className="flex items-center gap-2 px-4 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-all"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Reset to Defaults</span>
            </button>
            <button
              onClick={handleSave}
              disabled={!hasChanges || isSaving}
              className="flex items-center gap-2 px-6 py-2 bg-gradient-to-r from-primary to-secondary text-white rounded-lg hover:shadow-lg hover:shadow-primary/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Save className="w-4 h-4" />
              <span>{isSaving ? 'Saving...' : 'Save Changes'}</span>
            </button>
          </div>
        </motion.div>
      </div>
    </div>
  )
}
