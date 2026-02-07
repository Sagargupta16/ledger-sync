/**
 * Comprehensive Settings Page
 *
 * Thin shell that manages shared state and tab navigation,
 * delegating rendering to individual tab components:
 * 1. Account Classifications
 * 2. Essential Categories (drag-and-drop)
 * 3. Investment Mappings (drag-and-drop)
 * 4. Income Source Categories (drag-and-drop)
 * 5. Other Settings (Fiscal, Budget, Display, Anomaly, Recurring)
 * 6. Account Management
 */

import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Save,
  RotateCcw,
  Wallet,
  TrendingUp,
  DollarSign,
  Settings2,
  UserCog,
} from 'lucide-react'
import { useAccountBalances, useMasterCategories } from '@/hooks/useAnalytics'
import { accountClassificationsService } from '@/services/api/accountClassifications'
import { usePreferences, useUpdatePreferences, useResetPreferences } from '@/hooks/api/usePreferences'
import { toast } from 'sonner'
import {
  AccountClassificationsTab,
  EssentialCategoriesTab,
  InvestmentMappingsTab,
  IncomeClassificationTab,
  OtherSettingsTab,
  AccountManagementTab,
} from './settings'
import type { LocalPrefs, LocalPrefKey } from './settings'
import type { IncomeClassificationType } from './settings/types'
import { INCOME_CLASSIFICATION_KEY_MAP } from './settings/types'

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
  const [localPrefs, setLocalPrefs] = useState<LocalPrefs | null>(null)

  const [hasChanges, setHasChanges] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  // Calculate accounts from balance data
  const accounts = useMemo(() => {
    const acc = balanceData?.accounts || {}
    return Object.keys(acc)
      .filter((name) => acc[name].balance !== 0)
      .sort((a, b) => a.localeCompare(b))
  }, [balanceData])

  // Get all expense categories from master categories (excluding Transfer categories)
  const allExpenseCategories = useMemo(() => {
    if (!masterCategories?.expense) return []
    return Object.keys(masterCategories.expense)
      .filter((cat) => !cat.toLowerCase().startsWith('transfer'))
      .sort((a, b) => a.localeCompare(b))
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

  // ---------------------------------------------------------------------------
  // Drag-and-drop handlers (shared across tabs)
  // ---------------------------------------------------------------------------

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

  // Income classification drop handler
  const handleDropOnIncomeClassification = (classificationType: IncomeClassificationType) => {
    if (draggedItem && dragType === 'income-category' && localPrefs) {
      const targetKey = INCOME_CLASSIFICATION_KEY_MAP[classificationType]
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

    const targetKey = INCOME_CLASSIFICATION_KEY_MAP[classificationType]
    const currentList = localPrefs[targetKey].filter((c: string) => c !== item)
    updateLocalPref(targetKey, currentList)
  }

  // ---------------------------------------------------------------------------
  // Preference update helper
  // ---------------------------------------------------------------------------

  const updateLocalPref = <K extends LocalPrefKey>(key: K, value: LocalPrefs[K]) => {
    if (localPrefs) {
      setLocalPrefs({ ...localPrefs, [key]: value })
      setHasChanges(true)
    }
  }

  // ---------------------------------------------------------------------------
  // Save / Reset
  // ---------------------------------------------------------------------------

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

  // ---------------------------------------------------------------------------
  // Loading state
  // ---------------------------------------------------------------------------

  if (preferencesLoading || classificationsLoading || categoriesLoading) {
    return (
      <div className="min-h-screen p-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-gray-400">Loading settings...</div>
        </div>
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

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
            {activeTab === 'accounts' && (
              <AccountClassificationsTab
                accounts={accounts}
                classifications={classifications}
                balanceData={balanceData}
                balancesLoading={balancesLoading}
                dragType={dragType}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onDragOver={handleDragOver}
                onDropOnAccountCategory={handleDropOnAccountCategory}
              />
            )}

            {activeTab === 'categories' && localPrefs && (
              <EssentialCategoriesTab
                localPrefs={localPrefs}
                allExpenseCategories={allExpenseCategories}
                dragType={dragType}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onDragOver={handleDragOver}
                onDropOnEssential={handleDropOnEssential}
                onRemoveFromEssential={handleRemoveFromEssential}
              />
            )}

            {activeTab === 'investments' && localPrefs && (
              <InvestmentMappingsTab
                localPrefs={localPrefs}
                investmentAccounts={investmentAccounts}
                dragType={dragType}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onDragOver={handleDragOver}
                onDropOnInvestmentType={handleDropOnInvestmentType}
                onRemoveInvestmentMapping={handleRemoveInvestmentMapping}
              />
            )}

            {activeTab === 'income' && localPrefs && (
              <IncomeClassificationTab
                localPrefs={localPrefs}
                allIncomeCategories={allIncomeCategories}
                dragType={dragType}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onDragOver={handleDragOver}
                onDropOnIncomeClassification={handleDropOnIncomeClassification}
                onRemoveIncomeClassification={handleRemoveIncomeClassification}
              />
            )}

            {activeTab === 'others' && localPrefs && (
              <OtherSettingsTab localPrefs={localPrefs} updateLocalPref={updateLocalPref} />
            )}

            {activeTab === 'account-management' && <AccountManagementTab />}
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
