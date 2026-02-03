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
  ChevronRight,
} from 'lucide-react'
import { useAccountBalances, useMasterCategories } from '@/hooks/useAnalytics'
import { accountClassificationsService } from '@/services/api/accountClassifications'
import { usePreferences, useUpdatePreferences, useResetPreferences } from '@/hooks/api/usePreferences'
import { toast } from 'sonner'
import { formatCurrency } from '@/lib/formatters'

// Tab definitions
const TABS = [
  { id: 'accounts', label: 'Account Types', icon: Wallet },
  { id: 'categories', label: 'Essential Categories', icon: TrendingUp },
  { id: 'investments', label: 'Investment Mappings', icon: DollarSign },
  { id: 'income', label: 'Income Sources', icon: DollarSign },
  { id: 'others', label: 'Other Settings', icon: Settings2 },
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

// Income type colors
const INCOME_TYPE_COLORS = {
  salary: { bg: 'bg-blue-500/20', border: 'border-blue-500/30', text: 'text-blue-400', gradient: 'from-blue-500 to-blue-600' },
  bonus: { bg: 'bg-amber-500/20', border: 'border-amber-500/30', text: 'text-amber-400', gradient: 'from-amber-500 to-amber-600' },
  investment: { bg: 'bg-emerald-500/20', border: 'border-emerald-500/30', text: 'text-emerald-400', gradient: 'from-emerald-500 to-emerald-600' },
  cashback: { bg: 'bg-pink-500/20', border: 'border-pink-500/30', text: 'text-pink-400', gradient: 'from-pink-500 to-pink-600' },
}

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<TabId>('accounts')

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
    salary_categories: Record<string, string[]>
    bonus_categories: Record<string, string[]>
    investment_income_categories: Record<string, string[]>
    cashback_categories: Record<string, string[]>
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
        salary_categories: structuredClone(preferences.salary_categories),
        bonus_categories: structuredClone(preferences.bonus_categories),
        investment_income_categories: structuredClone(preferences.investment_income_categories),
        cashback_categories: structuredClone(preferences.cashback_categories || {}),
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
      const { [account]: _, ...rest } = localPrefs.investment_account_mappings
      updateLocalPref('investment_account_mappings', rest)
    }
  }

  // Income source drop handlers
  const handleDropOnIncomeType = (incomeType: 'salary' | 'bonus' | 'investment' | 'cashback') => {
    if (draggedItem && dragType === 'income-category' && localPrefs) {
      // Parse the dragged item: "Category::Subcategory" or just "Category"
      const [category, subcategory] = draggedItem.split('::')
      
      const targetKey = incomeType === 'salary' ? 'salary_categories' 
        : incomeType === 'bonus' ? 'bonus_categories' 
        : incomeType === 'cashback' ? 'cashback_categories'
        : 'investment_income_categories'
      
      const currentMapping = { ...localPrefs[targetKey] }
      
      if (subcategory) {
        // Adding a specific subcategory
        if (!currentMapping[category]) {
          currentMapping[category] = []
        }
        if (!currentMapping[category].includes(subcategory)) {
          currentMapping[category] = [...currentMapping[category], subcategory]
        }
      } else {
        // Adding entire category (all subcategories)
        const subcats = allIncomeCategories[category] || []
        currentMapping[category] = subcats
      }
      
      updateLocalPref(targetKey, currentMapping)
    }
    handleDragEnd()
  }

  // Remove income source mapping
  const handleRemoveIncomeMapping = (incomeType: 'salary' | 'bonus' | 'investment' | 'cashback', category: string, subcategory?: string) => {
    if (!localPrefs) return
    
    const targetKey = incomeType === 'salary' ? 'salary_categories' 
      : incomeType === 'bonus' ? 'bonus_categories' 
      : incomeType === 'cashback' ? 'cashback_categories'
      : 'investment_income_categories'
    
    const currentMapping = { ...localPrefs[targetKey] }
    
    if (subcategory) {
      // Remove specific subcategory
      if (currentMapping[category]) {
        currentMapping[category] = currentMapping[category].filter((s: string) => s !== subcategory)
        if (currentMapping[category].length === 0) {
          delete currentMapping[category]
        }
      }
    } else {
      // Remove entire category
      delete currentMapping[category]
    }
    
    updateLocalPref(targetKey, currentMapping)
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

  // Get unassigned investment accounts (for investment mappings)
  const unmappedAccounts = investmentAccounts.filter(
    (acc) => !localPrefs?.investment_account_mappings[acc]
  )

  // Get accounts by investment type
  const accountsByInvestmentType = INVESTMENT_TYPES.reduce(
    (acc, type) => {
      acc[type.value] = Object.entries(localPrefs?.investment_account_mappings || {})
        .filter(([_, t]) => t === type.value)
        .map(([account]) => account)
      return acc
    },
    {} as Record<string, string[]>
  )

  // Get available expense categories (not yet marked as essential)
  const availableEssentialCategories = allExpenseCategories.filter(
    (cat) => !localPrefs?.essential_categories.includes(cat)
  )

  // Get income categories that haven't been assigned yet
  const getUnassignedIncomeCategories = () => {
    if (!localPrefs) return Object.entries(allIncomeCategories)
    
    const assigned = new Set<string>()
    
    // Collect all assigned category::subcategory combinations
    for (const [cat, subs] of Object.entries(localPrefs.salary_categories)) {
      subs.forEach((sub: string) => assigned.add(`${cat}::${sub}`))
    }
    for (const [cat, subs] of Object.entries(localPrefs.bonus_categories)) {
      subs.forEach((sub: string) => assigned.add(`${cat}::${sub}`))
    }
    for (const [cat, subs] of Object.entries(localPrefs.investment_income_categories)) {
      subs.forEach((sub: string) => assigned.add(`${cat}::${sub}`))
    }
    for (const [cat, subs] of Object.entries(localPrefs.cashback_categories)) {
      subs.forEach((sub: string) => assigned.add(`${cat}::${sub}`))
    }
    
    // Filter to only unassigned
    const result: Record<string, string[]> = {}
    for (const [cat, subs] of Object.entries(allIncomeCategories)) {
      const unassignedSubs = subs.filter((sub: string) => !assigned.has(`${cat}::${sub}`))
      if (unassignedSubs.length > 0) {
        result[cat] = unassignedSubs
      }
    }
    return Object.entries(result)
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
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-semibold text-white">Account Type Classifications</h2>
                  <p className="text-sm text-gray-400">Drag and drop accounts to organize them</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {ACCOUNT_TYPES.map((category) => (
                    <div
                      key={category}
                      onDragOver={handleDragOver}
                      onDrop={() => handleDropOnAccountCategory(category)}
                      className={`glass rounded-xl border-2 border-dashed p-4 transition-all ${
                        dragType === 'account' ? 'border-white/40 bg-white/5' : 'border-white/20 hover:border-white/30'
                      }`}
                    >
                      <div className={`bg-gradient-to-r ${CATEGORY_COLORS[category]} rounded-lg p-3 mb-3`}>
                        <h3 className="text-lg font-bold text-white">{category}</h3>
                        <p className="text-xs text-white/80">{accountsByCategory[category].length} accounts</p>
                      </div>
                      <div className="space-y-1.5 max-h-48 overflow-y-auto">
                        {accountsByCategory[category].length > 0 ? (
                          accountsByCategory[category].map((accountName) => (
                            <motion.div
                              key={accountName}
                              draggable
                              onDragStart={() => handleDragStart(accountName, 'account')}
                              onDragEnd={handleDragEnd}
                              className="flex items-center gap-2 px-2.5 py-2 bg-white/5 border border-white/10 rounded-md cursor-move hover:bg-white/10 text-sm"
                              whileHover={{ scale: 1.02 }}
                            >
                              <GripVertical className="w-3.5 h-3.5 text-white/40" />
                              <span className="font-medium text-white truncate flex-1">{accountName}</span>
                              {!balancesLoading && (
                                <span className="text-xs text-gray-400 font-mono">
                                  {formatCurrency(Math.abs(balanceData?.accounts[accountName]?.balance || 0))}
                                </span>
                              )}
                            </motion.div>
                          ))
                        ) : (
                          <div className="flex items-center justify-center h-16 text-gray-500 border-2 border-dashed border-white/10 rounded-lg">
                            <p className="text-xs">Drop here</p>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
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
                
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Available Categories */}
                  <div className="space-y-3">
                    <h3 className="text-sm font-medium text-gray-400 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-gray-500"></span>
                      Available Categories ({availableEssentialCategories.length})
                    </h3>
                    <div className="bg-white/5 border border-white/10 rounded-xl p-4 min-h-[300px] max-h-[400px] overflow-y-auto">
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
                  <div className="space-y-3">
                    <h3 className="text-sm font-medium text-emerald-400 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                      Essential Categories ({localPrefs.essential_categories.length})
                    </h3>
                    <div
                      onDragOver={handleDragOver}
                      onDrop={handleDropOnEssential}
                      className={`bg-emerald-500/10 border-2 border-dashed rounded-xl p-4 min-h-[300px] max-h-[400px] overflow-y-auto transition-all ${
                        dragType === 'category' ? 'border-emerald-400 bg-emerald-500/20' : 'border-emerald-500/30'
                      }`}
                    >
                      <div className="flex flex-wrap gap-2">
                        {localPrefs.essential_categories.map((category) => (
                          <motion.div
                            key={category}
                            className="flex items-center gap-2 px-3 py-1.5 bg-emerald-500/30 border border-emerald-500/50 rounded-full"
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
                          <div className="flex items-center justify-center w-full h-32 text-emerald-400/50">
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
                    Drag accounts into investment categories to classify them for net worth tracking
                  </p>
                </div>

                {/* Unassigned accounts */}
                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-gray-400 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-gray-500"></span>
                    Unassigned Accounts ({unmappedAccounts.length})
                  </h3>
                  <div className="bg-white/5 border border-white/10 rounded-xl p-4 min-h-[80px]">
                    <div className="flex flex-wrap gap-2">
                      {unmappedAccounts.map((account) => (
                        <motion.div
                          key={account}
                          draggable
                          onDragStart={() => handleDragStart(account, 'account')}
                          onDragEnd={handleDragEnd}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 border border-white/20 rounded-lg cursor-move hover:bg-white/20 transition-all"
                          whileHover={{ scale: 1.02 }}
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
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {INVESTMENT_TYPES.map((type) => (
                    <div
                      key={type.value}
                      onDragOver={handleDragOver}
                      onDrop={() => handleDropOnInvestmentType(type.value)}
                      className={`rounded-xl border-2 border-dashed p-3 transition-all ${
                        dragType === 'account' ? 'border-white/40 bg-white/5' : 'border-white/20'
                      }`}
                    >
                      <div className={`bg-gradient-to-r ${type.color} rounded-lg px-3 py-2 mb-2`}>
                        <h4 className="text-sm font-semibold text-white">{type.label}</h4>
                      </div>
                      <div className="space-y-1 min-h-[60px]">
                        {accountsByInvestmentType[type.value].map((account) => (
                          <div
                            key={account}
                            className="flex items-center justify-between px-2 py-1 bg-white/5 rounded text-xs"
                          >
                            <span className="text-white truncate">{account}</span>
                            <button
                              onClick={() => handleRemoveInvestmentMapping(account)}
                              className="text-gray-400 hover:text-red-400 ml-1"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                        {accountsByInvestmentType[type.value].length === 0 && (
                          <div className="flex items-center justify-center h-12 text-gray-500 text-xs">
                            Drop here
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Income Sources Tab - DRAG AND DROP */}
            {activeTab === 'income' && localPrefs && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-xl font-semibold text-white">Income Source Categories</h2>
                  <p className="text-sm text-gray-400 mt-1">
                    Drag income subcategories to classify them as Salary, Bonus, Investment, or Cashback income
                  </p>
                </div>

                {/* Available Income Categories - Flat list */}
                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-gray-400 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-gray-500"></span>
                    Available Income Categories
                  </h3>
                  <div className="bg-white/5 border border-white/10 rounded-xl p-4 max-h-[200px] overflow-y-auto">
                    <div className="flex flex-wrap gap-2">
                      {getUnassignedIncomeCategories().flatMap(([category, subcats]) =>
                        (subcats as string[]).map((sub) => (
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
                        ))
                      )}
                      {getUnassignedIncomeCategories().length === 0 && (
                        <p className="text-gray-500 text-sm">All income categories assigned</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Income Type Drop Zones */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {(['salary', 'bonus', 'investment', 'cashback'] as const).map((incomeType) => {
                    const colors = INCOME_TYPE_COLORS[incomeType]
                    const data = incomeType === 'salary' ? localPrefs.salary_categories
                      : incomeType === 'bonus' ? localPrefs.bonus_categories
                      : incomeType === 'cashback' ? localPrefs.cashback_categories
                      : localPrefs.investment_income_categories
                    const label = incomeType === 'salary' ? '💼 Salary Income'
                      : incomeType === 'bonus' ? '🎁 Bonus Income'
                      : incomeType === 'cashback' ? '💳 Cashback Income'
                      : '📈 Investment Income'

                    return (
                      <div
                        key={incomeType}
                        onDragOver={handleDragOver}
                        onDrop={() => handleDropOnIncomeType(incomeType)}
                        className={`rounded-xl border-2 border-dashed p-4 transition-all min-h-[200px] ${
                          dragType === 'income-category' ? `${colors.border} ${colors.bg}` : `${colors.border} ${colors.bg}`
                        }`}
                      >
                        <div className={`bg-gradient-to-r ${colors.gradient} rounded-lg px-3 py-2 mb-3`}>
                          <h4 className="text-sm font-semibold text-white">{label}</h4>
                        </div>
                        <div className="space-y-2">
                          {Object.entries(data).map(([category, subcats]) => (
                            <div key={category} className="space-y-1">
                              <div className="flex items-center justify-between">
                                <span className="text-sm font-medium text-white">{category}</span>
                                <button
                                  onClick={() => handleRemoveIncomeMapping(incomeType, category)}
                                  className="text-gray-400 hover:text-red-400"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                              <div className="flex flex-wrap gap-1 ml-2">
                                {(subcats as string[]).map((sub) => (
                                  <span
                                    key={sub}
                                    className={`inline-flex items-center gap-1 px-2 py-0.5 ${colors.bg} rounded text-xs ${colors.text}`}
                                  >
                                    {sub}
                                    <button
                                      onClick={() => handleRemoveIncomeMapping(incomeType, category, sub)}
                                      className="hover:text-red-400"
                                    >
                                      <X className="w-2.5 h-2.5" />
                                    </button>
                                  </span>
                                ))}
                              </div>
                            </div>
                          ))}
                          {Object.keys(data).length === 0 && (
                            <div className={`flex items-center justify-center h-24 ${colors.text} opacity-50`}>
                              <p className="text-sm">Drop categories here</p>
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
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
