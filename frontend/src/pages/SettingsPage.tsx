/**
 * Settings Page - Complete Rewrite
 *
 * Single scrollable page with glass card sections. All state/handlers live here.
 * Replaces drag-drop with toggles, selects, and checkboxes where possible.
 * Keeps drag-drop only for account type classification.
 */

import { useState, useEffect, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Save,
  RotateCcw,
  Wallet,
  DollarSign,
  TrendingUp,
  Tags,
  Target,
  Settings2,
  Bell,
  Shield,
  LayoutGrid,
  GripVertical,
  Check,
  ChevronDown,
  CreditCard,
  PiggyBank,
  AlertTriangle,
  RefreshCw,
  Receipt,
  Clock,
  EyeOff,
  Palette,
} from 'lucide-react'
import { useAccountBalances, useMasterCategories } from '@/hooks/useAnalytics'
import { accountClassificationsService } from '@/services/api/accountClassifications'
import { usePreferences, useUpdatePreferences, useResetPreferences } from '@/hooks/api/usePreferences'
import { toast } from 'sonner'
import { formatCurrency } from '@/lib/formatters'
import PageHeader from '@/components/ui/PageHeader'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import type { LocalPrefs, LocalPrefKey, IncomeClassificationType } from './settings/types'
import {
  ACCOUNT_TYPES,
  CATEGORY_COLORS,
  INVESTMENT_TYPES,
  MONTHS,
  TIME_RANGE_OPTIONS,
  ANOMALY_TYPES,
  INCOME_CLASSIFICATION_TYPES,
  INCOME_CLASSIFICATION_KEY_MAP,
} from './settings/types'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAYDAY_OPTIONS = Array.from({ length: 31 }, (_, i) => i + 1)

const DAYS_AHEAD_OPTIONS = [
  { value: 3, label: '3 days' },
  { value: 5, label: '5 days' },
  { value: 7, label: '7 days' },
  { value: 14, label: '14 days' },
]

const DASHBOARD_WIDGETS = [
  { key: 'savings_rate', label: 'Savings Rate' },
  { key: 'top_spending', label: 'Top Spending Category' },
  { key: 'top_income', label: 'Top Income Source' },
  { key: 'cashback', label: 'Net Cashback Earned' },
  { key: 'total_transactions', label: 'Total Transactions' },
  { key: 'biggest_transaction', label: 'Biggest Transaction' },
  { key: 'median_transaction', label: 'Median Transaction' },
  { key: 'daily_spending', label: 'Average Daily Spending' },
  { key: 'weekend_spending', label: 'Weekend Spending' },
  { key: 'peak_day', label: 'Peak Spending Day' },
  { key: 'burn_rate', label: 'Monthly Burn Rate' },
  { key: 'spending_diversity', label: 'Spending Diversity' },
  { key: 'avg_transaction', label: 'Avg Transaction Amount' },
  { key: 'total_transfers', label: 'Total Internal Transfers' },
] as const

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getOrdinalSuffix(day: number): string {
  if (day === 1 || day === 21 || day === 31) return 'st'
  if (day === 2 || day === 22) return 'nd'
  if (day === 3 || day === 23) return 'rd'
  return 'th'
}

/** Derive default account classifications from account names by keyword matching */
function getDefaultClassifications(accountNames: string[]): Record<string, string> {
  const defaults: Record<string, string> = {}
  accountNames.forEach((name) => {
    const lower = name.toLowerCase()
    if (lower.includes('credit card') || lower.includes('cc ') || lower.includes('amex')) {
      defaults[name] = 'Credit Cards'
    } else if (lower.includes('bank') || lower.includes('checking') || lower.includes('salary')) {
      defaults[name] = 'Bank Accounts'
    } else if (lower.includes('cash') || lower.includes('wallet')) {
      defaults[name] = 'Cash'
    } else if (lower.includes('investment') || lower.includes('mutual') || lower.includes('stock')) {
      defaults[name] = 'Investments'
    } else if (lower.includes('loan') || lower.includes('debt')) {
      defaults[name] = 'Loans/Lended'
    } else {
      defaults[name] = 'Other Wallets'
    }
  })
  return defaults
}

/** Safely coerce stored value (may be JSON string or array) to string[] */
function normalizeArray(value: string[] | string): string[] {
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

function getStoredWidgets(): string[] {
  try {
    const raw = localStorage.getItem('ledger-sync-visible-widgets')
    if (raw) return JSON.parse(raw)
  } catch {
    /* use defaults */
  }
  return DASHBOARD_WIDGETS.map((w) => w.key)
}

function getStoredTheme(): 'dark' | 'system' {
  return (localStorage.getItem('ledger-sync-theme') as 'dark' | 'system') || 'dark'
}

// ---------------------------------------------------------------------------
// Section entrance animation wrapper
// ---------------------------------------------------------------------------

const sectionVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.06, duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] as const },
  }),
}

function Section({
  index,
  icon: Icon,
  title,
  description,
  children,
  defaultCollapsed = false,
}: {
  index: number
  icon: React.ElementType
  title: string
  description?: string
  children: React.ReactNode
  defaultCollapsed?: boolean
}) {
  const [expanded, setExpanded] = useState(!defaultCollapsed)

  return (
    <motion.div
      custom={index}
      initial="hidden"
      animate="visible"
      variants={sectionVariants}
      className="glass rounded-2xl border border-border overflow-hidden"
    >
      <button
        type="button"
        onClick={() => setExpanded((p) => !p)}
        className="flex items-center gap-3 w-full px-6 py-5 text-left hover:bg-white/5 transition-colors"
      >
        <div className="p-2 rounded-xl bg-primary/10">
          <Icon className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-semibold text-white">{title}</h2>
          {description && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">{description}</p>
          )}
        </div>
        <ChevronDown
          className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${!expanded ? '-rotate-90' : ''}`}
        />
      </button>
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="overflow-hidden"
          >
            <div className="px-6 pb-6 space-y-4">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// ---------------------------------------------------------------------------
// Toggle switch component
// ---------------------------------------------------------------------------

function Toggle({
  checked,
  onChange,
  id,
}: {
  checked: boolean
  onChange: (val: boolean) => void
  id?: string
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
        checked ? 'bg-primary' : 'bg-white/20'
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  )
}

// ---------------------------------------------------------------------------
// Form field helpers
// ---------------------------------------------------------------------------

function FieldLabel({ htmlFor, children }: { htmlFor?: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="block text-sm font-medium text-foreground mb-1.5">
      {children}
    </label>
  )
}

function FieldHint({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-muted-foreground mt-1">{children}</p>
}

const inputClass =
  'w-full px-3 py-2 bg-white/5 border border-border rounded-lg text-white text-sm focus:border-primary focus:outline-none transition-colors'
const selectClass =
  'w-full px-3 py-2 bg-white/5 border border-border rounded-lg text-white text-sm focus:border-primary focus:outline-none transition-colors'

// ===========================================================================
// MAIN COMPONENT
// ===========================================================================

export default function SettingsPage() {
  // -------------------------------------------------------------------------
  // Data hooks
  // -------------------------------------------------------------------------
  const { data: preferences, isLoading: preferencesLoading } = usePreferences()
  const updatePreferences = useUpdatePreferences()
  const resetPreferences = useResetPreferences()
  const { data: masterCategories, isLoading: categoriesLoading } = useMasterCategories()
  const { data: balanceData, isLoading: balancesLoading } = useAccountBalances()

  // -------------------------------------------------------------------------
  // Local state
  // -------------------------------------------------------------------------
  const [classifications, setClassifications] = useState<Record<string, string>>({})
  const [classificationsLoading, setClassificationsLoading] = useState(true)
  const [localPrefs, setLocalPrefs] = useState<LocalPrefs | null>(null)
  const [hasChanges, setHasChanges] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [showResetConfirm, setShowResetConfirm] = useState(false)

  // Drag state (kept only for account classifications)
  const [draggedItem, setDraggedItem] = useState<string | null>(null)
  const [dragType, setDragType] = useState<'account' | null>(null)

  // Theme & widgets (local storage only)
  const [theme, setTheme] = useState<'dark' | 'system'>(getStoredTheme)
  const [visibleWidgets, setVisibleWidgets] = useState<string[]>(getStoredWidgets)

  // -------------------------------------------------------------------------
  // Derived data
  // -------------------------------------------------------------------------
  const accounts = useMemo(() => {
    const acc = balanceData?.accounts || {}
    return Object.keys(acc)
      .filter((name) => acc[name].balance !== 0)
      .sort((a, b) => a.localeCompare(b))
  }, [balanceData])

  const allExpenseCategories = useMemo(() => {
    if (!masterCategories?.expense) return []
    return Object.keys(masterCategories.expense)
      .filter((cat) => !cat.toLowerCase().startsWith('transfer'))
      .sort((a, b) => a.localeCompare(b))
  }, [masterCategories])

  const allIncomeCategories = useMemo(() => {
    if (!masterCategories?.income) return {}
    return masterCategories.income
  }, [masterCategories])

  const investmentAccounts = useMemo(
    () => accounts.filter((acc) => classifications[acc] === 'Investments'),
    [accounts, classifications],
  )

  const creditCardAccounts = useMemo(
    () => accounts.filter((acc) => classifications[acc] === 'Credit Cards'),
    [accounts, classifications],
  )

  const accountsByCategory = useMemo(() => {
    return ACCOUNT_TYPES.reduce(
      (acc, category) => {
        acc[category] = accounts.filter((name) => classifications[name] === category)
        return acc
      },
      {} as Record<string, string[]>,
    )
  }, [accounts, classifications])

  const unclassifiedAccounts = useMemo(() => {
    const classified = new Set(Object.values(accountsByCategory).flat())
    return accounts.filter((name) => !classified.has(name))
  }, [accounts, accountsByCategory])

  const excludedAccounts = useMemo(
    () => (localPrefs ? normalizeArray(localPrefs.excluded_accounts) : []),
    [localPrefs],
  )

  const fixedCategories = useMemo(
    () => (localPrefs ? normalizeArray(localPrefs.fixed_expense_categories) : []),
    [localPrefs],
  )

  // Income classification helpers
  const allClassifiedIncome = useMemo(() => {
    if (!localPrefs) return new Set<string>()
    return new Set<string>([
      ...localPrefs.taxable_income_categories,
      ...localPrefs.investment_returns_categories,
      ...localPrefs.non_taxable_income_categories,
      ...localPrefs.other_income_categories,
    ])
  }, [localPrefs])

  const unclassifiedIncomeItems = useMemo(() => {
    return Object.entries(allIncomeCategories).flatMap(([cat, subs]) =>
      subs.map((sub) => `${cat}::${sub}`).filter((item) => !allClassifiedIncome.has(item)),
    )
  }, [allIncomeCategories, allClassifiedIncome])

  // Investment mapping helpers
  const unmappedInvestmentAccounts = useMemo(
    () =>
      localPrefs
        ? investmentAccounts.filter((acc) => !localPrefs.investment_account_mappings[acc])
        : [],
    [investmentAccounts, localPrefs],
  )

  // -------------------------------------------------------------------------
  // Initialize local prefs
  // -------------------------------------------------------------------------
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
        needs_target_percent: preferences.needs_target_percent ?? 50,
        wants_target_percent: preferences.wants_target_percent ?? 30,
        savings_target_percent: preferences.savings_target_percent ?? 20,
        credit_card_limits: { ...preferences.credit_card_limits },
        earning_start_date: preferences.earning_start_date ?? null,
        use_earning_start_date: preferences.use_earning_start_date ?? false,
        fixed_expense_categories: Array.isArray(preferences.fixed_expense_categories)
          ? [...preferences.fixed_expense_categories]
          : (preferences.fixed_expense_categories ?? []),
        savings_goal_percent: preferences.savings_goal_percent ?? 20,
        monthly_investment_target: preferences.monthly_investment_target ?? 0,
        payday: preferences.payday ?? 1,
        preferred_tax_regime: preferences.preferred_tax_regime ?? 'new',
        excluded_accounts: Array.isArray(preferences.excluded_accounts)
          ? [...preferences.excluded_accounts]
          : (preferences.excluded_accounts ?? []),
        notify_budget_alerts: preferences.notify_budget_alerts ?? true,
        notify_anomalies: preferences.notify_anomalies ?? true,
        notify_upcoming_bills: preferences.notify_upcoming_bills ?? true,
        notify_days_ahead: preferences.notify_days_ahead ?? 7,
      })
    }
  }, [preferences, localPrefs])

  // Load account classifications
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setClassificationsLoading(true)
      try {
        const data = await accountClassificationsService.getAllClassifications()
        if (cancelled) return
        setClassifications({ ...getDefaultClassifications(accounts), ...data })
      } catch {
        if (!cancelled) toast.error('Failed to load account classifications')
      } finally {
        if (!cancelled) setClassificationsLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [accounts])

  // -------------------------------------------------------------------------
  // Preference update helper
  // -------------------------------------------------------------------------
  const updateLocalPref = useCallback(
    <K extends LocalPrefKey>(key: K, value: LocalPrefs[K]) => {
      setLocalPrefs((prev) => (prev ? { ...prev, [key]: value } : prev))
      setHasChanges(true)
    },
    [],
  )

  // -------------------------------------------------------------------------
  // Account drag-and-drop handlers
  // -------------------------------------------------------------------------
  const handleDragStart = (item: string) => {
    setDraggedItem(item)
    setDragType('account')
  }
  const handleDragOver = (e: React.DragEvent) => e.preventDefault()
  const handleDragEnd = () => {
    setDraggedItem(null)
    setDragType(null)
  }
  const handleDropOnAccountCategory = (category: string) => {
    if (draggedItem && dragType === 'account') {
      setClassifications((prev) => ({ ...prev, [draggedItem]: category }))
      setHasChanges(true)
    }
    handleDragEnd()
  }

  // -------------------------------------------------------------------------
  // Category toggle handlers (replaces drag-drop)
  // -------------------------------------------------------------------------
  const toggleEssentialCategory = (cat: string) => {
    if (!localPrefs) return
    const isEssential = localPrefs.essential_categories.includes(cat)
    updateLocalPref(
      'essential_categories',
      isEssential
        ? localPrefs.essential_categories.filter((c) => c !== cat)
        : [...localPrefs.essential_categories, cat],
    )
  }

  const toggleFixedCategory = (cat: string) => {
    if (!localPrefs) return
    const current = normalizeArray(localPrefs.fixed_expense_categories)
    const isFixed = current.includes(cat)
    updateLocalPref(
      'fixed_expense_categories',
      isFixed ? current.filter((c) => c !== cat) : [...current, cat],
    )
  }

  // -------------------------------------------------------------------------
  // Income classification handler (replaces drag-drop with select)
  // -------------------------------------------------------------------------
  const setIncomeClassification = (
    item: string,
    newType: IncomeClassificationType | 'unclassified',
  ) => {
    if (!localPrefs) return
    // Remove from all classification lists first
    const updated = { ...localPrefs }
    for (const classType of INCOME_CLASSIFICATION_TYPES) {
      const key = INCOME_CLASSIFICATION_KEY_MAP[classType.value as IncomeClassificationType]
      updated[key] = (updated[key] as string[]).filter((c: string) => c !== item)
    }
    // Add to the new classification if not "unclassified"
    if (newType !== 'unclassified') {
      const targetKey = INCOME_CLASSIFICATION_KEY_MAP[newType]
      updated[targetKey] = [...(updated[targetKey] as string[]), item]
    }
    setLocalPrefs(updated)
    setHasChanges(true)
  }

  const getIncomeClassification = (item: string): IncomeClassificationType | 'unclassified' => {
    if (!localPrefs) return 'unclassified'
    for (const classType of INCOME_CLASSIFICATION_TYPES) {
      const key = INCOME_CLASSIFICATION_KEY_MAP[classType.value as IncomeClassificationType]
      if ((localPrefs[key] as string[]).includes(item)) {
        return classType.value as IncomeClassificationType
      }
    }
    return 'unclassified'
  }

  // -------------------------------------------------------------------------
  // Investment mapping handlers (select-based)
  // -------------------------------------------------------------------------
  const setInvestmentMapping = (account: string, investmentType: string) => {
    if (!localPrefs) return
    if (investmentType === '') {
      // Remove mapping
      const rest = Object.fromEntries(
        Object.entries(localPrefs.investment_account_mappings).filter(([k]) => k !== account),
      )
      updateLocalPref('investment_account_mappings', rest)
    } else {
      updateLocalPref('investment_account_mappings', {
        ...localPrefs.investment_account_mappings,
        [account]: investmentType,
      })
    }
  }

  // -------------------------------------------------------------------------
  // Excluded accounts toggle
  // -------------------------------------------------------------------------
  const toggleExcludedAccount = (account: string) => {
    const isExcluded = excludedAccounts.includes(account)
    updateLocalPref(
      'excluded_accounts',
      isExcluded ? excludedAccounts.filter((a) => a !== account) : [...excludedAccounts, account],
    )
  }

  // -------------------------------------------------------------------------
  // Anomaly type toggle
  // -------------------------------------------------------------------------
  const toggleAnomalyType = (type: string) => {
    if (!localPrefs) return
    const enabled = localPrefs.anomaly_types_enabled.includes(type)
    updateLocalPref(
      'anomaly_types_enabled',
      enabled
        ? localPrefs.anomaly_types_enabled.filter((t) => t !== type)
        : [...localPrefs.anomaly_types_enabled, type],
    )
  }

  // -------------------------------------------------------------------------
  // Save / Reset
  // -------------------------------------------------------------------------
  const handleSave = async () => {
    setIsSaving(true)
    try {
      const original = await accountClassificationsService.getAllClassifications()
      const changedEntries = Object.entries(classifications).filter(
        ([accountName, accountType]) => original[accountName] !== accountType,
      )
      await Promise.all(
        changedEntries.map(([accountName, accountType]) =>
          accountClassificationsService.setClassification(accountName, accountType),
        ),
      )
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
      setLocalPrefs(null)
      setHasChanges(false)
      toast.success('Settings reset to defaults')
    } catch {
      toast.error('Failed to reset settings')
    }
  }

  // -------------------------------------------------------------------------
  // Loading
  // -------------------------------------------------------------------------
  if (preferencesLoading || classificationsLoading || categoriesLoading) {
    return (
      <div className="min-h-screen p-4 md:p-6 lg:p-8">
        <div className="max-w-5xl mx-auto space-y-4">
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className="glass rounded-2xl border border-border h-24 animate-pulse opacity-30"
            />
          ))}
        </div>
      </div>
    )
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  let sectionIndex = 0

  return (
    <div className="min-h-screen p-4 md:p-6 lg:p-8">
      <div className="max-w-5xl mx-auto space-y-5">
        {/* Page Header */}
        <PageHeader
          title="Settings"
          subtitle="Configure your financial preferences"
          action={
            <div className="flex items-center gap-3">
              {hasChanges && (
                <span className="text-sm text-ios-yellow flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-ios-yellow animate-pulse" />
                  Unsaved
                </span>
              )}
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={() => setShowResetConfirm(true)}
                className="flex items-center gap-2 px-4 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-colors text-sm"
              >
                <RotateCcw className="w-4 h-4" />
                <span className="hidden sm:inline">Reset</span>
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={handleSave}
                disabled={!hasChanges || isSaving}
                className="flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-primary to-secondary text-white rounded-lg hover:shadow-lg hover:shadow-primary/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
              >
                <Save className="w-4 h-4" />
                <span>{isSaving ? 'Saving...' : 'Save'}</span>
              </motion.button>
            </div>
          }
        />

        {/* ================================================================= */}
        {/* SECTION: Account Classifications                                  */}
        {/* ================================================================= */}
        <Section
          index={sectionIndex++}
          icon={Wallet}
          title="Account Classifications"
          description="Drag accounts between categories to classify them"
        >
          {/* Unassigned accounts highlight */}
          {unclassifiedAccounts.length > 0 && (
            <div className="bg-ios-yellow/10 border border-ios-yellow/30 rounded-xl p-4">
              <p className="text-sm font-medium text-ios-yellow mb-2">
                {unclassifiedAccounts.length} Unassigned Account{unclassifiedAccounts.length !== 1 && 's'}
              </p>
              <div className="flex flex-wrap gap-2">
                {unclassifiedAccounts.map((name) => (
                  <motion.div
                    key={name}
                    draggable
                    onDragStart={() => handleDragStart(name)}
                    onDragEnd={handleDragEnd}
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
                role="listbox"
                aria-label={`Drop zone for ${category} accounts`}
                onDragOver={handleDragOver}
                onDrop={() => handleDropOnAccountCategory(category)}
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
                    {accountsByCategory[category]?.length || 0} accounts
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {accountsByCategory[category]?.map((name) => (
                    <motion.div
                      key={name}
                      draggable
                      onDragStart={() => handleDragStart(name)}
                      onDragEnd={handleDragEnd}
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

        {/* ================================================================= */}
        {/* SECTION: Investment Account Mappings                               */}
        {/* ================================================================= */}
        {investmentAccounts.length > 0 && (
          <Section
            index={sectionIndex++}
            icon={TrendingUp}
            title="Investment Account Mappings"
            description="Map investment accounts to their investment type"
          >
            <div className="space-y-3">
              {investmentAccounts.map((account) => (
                <div
                  key={account}
                  className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 py-2 border-b border-border last:border-0"
                >
                  <span className="text-sm text-white flex-1 min-w-0 truncate">{account}</span>
                  <select
                    value={localPrefs?.investment_account_mappings[account] || ''}
                    onChange={(e) => setInvestmentMapping(account, e.target.value)}
                    className={`${selectClass} w-full sm:w-48`}
                  >
                    <option value="" className="bg-background">
                      Unassigned
                    </option>
                    {INVESTMENT_TYPES.map((type) => (
                      <option key={type.value} value={type.value} className="bg-background">
                        {type.label}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
              {unmappedInvestmentAccounts.length > 0 && (
                <FieldHint>
                  {unmappedInvestmentAccounts.length} account{unmappedInvestmentAccounts.length !== 1 && 's'} not yet mapped
                </FieldHint>
              )}
            </div>
          </Section>
        )}

        {/* ================================================================= */}
        {/* SECTION: Expense Categories                                       */}
        {/* ================================================================= */}
        <Section
          index={sectionIndex++}
          icon={Tags}
          title="Expense Categories"
          description="Toggle categories as essential or fixed monthly expenses"
        >
          {allExpenseCategories.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No expense categories found. Import some transactions first.
            </p>
          ) : (
            <div className="space-y-2">
              {/* Legend */}
              <div className="flex items-center gap-4 mb-3">
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="w-3 h-3 rounded-sm bg-ios-green/30 border border-ios-green/50" />
                  Essential
                </span>
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="w-3 h-3 rounded-sm bg-ios-orange/30 border border-ios-orange/50" />
                  Fixed
                </span>
              </div>

              {/* Category grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1">
                {allExpenseCategories.map((cat) => {
                  const isEssential = localPrefs?.essential_categories.includes(cat) ?? false
                  const isFixed = fixedCategories.includes(cat)

                  return (
                    <div
                      key={cat}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/5 transition-colors"
                    >
                      <span className="text-sm text-white flex-1 truncate">{cat}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        {/* Essential toggle */}
                        <button
                          type="button"
                          title="Essential"
                          onClick={() => toggleEssentialCategory(cat)}
                          className={`w-6 h-6 rounded-md flex items-center justify-center transition-colors text-xs font-bold ${
                            isEssential
                              ? 'bg-ios-green/25 text-ios-green border border-ios-green/50'
                              : 'bg-white/5 text-white/30 border border-border hover:border-ios-green/30 hover:text-ios-green/60'
                          }`}
                        >
                          E
                        </button>
                        {/* Fixed toggle */}
                        <button
                          type="button"
                          title="Fixed"
                          onClick={() => toggleFixedCategory(cat)}
                          className={`w-6 h-6 rounded-md flex items-center justify-center transition-colors text-xs font-bold ${
                            isFixed
                              ? 'bg-ios-orange/25 text-ios-orange border border-ios-orange/50'
                              : 'bg-white/5 text-white/30 border border-border hover:border-ios-orange/30 hover:text-ios-orange/60'
                          }`}
                        >
                          F
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Summary */}
              <div className="flex flex-wrap gap-4 pt-2 text-xs text-muted-foreground">
                <span>
                  {localPrefs?.essential_categories.length || 0} essential
                </span>
                <span>{fixedCategories.length} fixed</span>
              </div>
            </div>
          )}
        </Section>

        {/* ================================================================= */}
        {/* SECTION: Income Classification                                    */}
        {/* ================================================================= */}
        <Section
          index={sectionIndex++}
          icon={DollarSign}
          title="Income Classification"
          description="Classify income subcategories by type for tax and analytics"
        >
          {Object.keys(allIncomeCategories).length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No income categories found. Import some transactions first.
            </p>
          ) : (
            <div className="space-y-4">
              {Object.entries(allIncomeCategories).map(([parentCat, subs]) => (
                <div key={parentCat}>
                  <h4 className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">
                    {parentCat}
                  </h4>
                  <div className="space-y-1">
                    {subs.map((sub) => {
                      const fullKey = `${parentCat}::${sub}`
                      const currentType = getIncomeClassification(fullKey)

                      return (
                        <div
                          key={fullKey}
                          className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/5 transition-colors"
                        >
                          <span className="text-sm text-white flex-1 min-w-0 truncate">{sub}</span>
                          <select
                            value={currentType}
                            onChange={(e) =>
                              setIncomeClassification(
                                fullKey,
                                e.target.value as IncomeClassificationType | 'unclassified',
                              )
                            }
                            className="px-2 py-1.5 bg-white/5 border border-border rounded-lg text-white text-xs focus:border-primary focus:outline-none w-40 sm:w-44"
                          >
                            <option value="unclassified" className="bg-background">
                              Unclassified
                            </option>
                            {INCOME_CLASSIFICATION_TYPES.map((t) => (
                              <option key={t.value} value={t.value} className="bg-background">
                                {t.label.replace(/^[^\s]+\s/, '')}
                              </option>
                            ))}
                          </select>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}

              {/* Summary */}
              <div className="flex flex-wrap gap-3 pt-1 text-xs text-muted-foreground">
                {INCOME_CLASSIFICATION_TYPES.map((t) => {
                  const key = INCOME_CLASSIFICATION_KEY_MAP[t.value as IncomeClassificationType]
                  const count = localPrefs ? (localPrefs[key] as string[]).length : 0
                  return (
                    <span key={t.value}>
                      {count} {t.label.replace(/^[^\s]+\s/, '').toLowerCase()}
                    </span>
                  )
                })}
                <span>{unclassifiedIncomeItems.length} unclassified</span>
              </div>
            </div>
          )}
        </Section>

        {/* ================================================================= */}
        {/* SECTION: Financial Settings                                       */}
        {/* ================================================================= */}
        {localPrefs && (
          <Section
            index={sectionIndex++}
            icon={Target}
            title="Financial Settings"
            description="Savings goals, investment targets, tax regime, and spending rules"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {/* Fiscal Year */}
              <div>
                <FieldLabel htmlFor="fiscal-year">Fiscal Year Starts In</FieldLabel>
                <select
                  id="fiscal-year"
                  value={localPrefs.fiscal_year_start_month}
                  onChange={(e) =>
                    updateLocalPref('fiscal_year_start_month', Number(e.target.value))
                  }
                  className={selectClass}
                >
                  {MONTHS.map((m) => (
                    <option key={m.value} value={m.value} className="bg-background">
                      {m.label}
                    </option>
                  ))}
                </select>
                <FieldHint>Default: April (India FY)</FieldHint>
              </div>

              {/* Savings Goal */}
              <div>
                <FieldLabel htmlFor="savings-goal">Savings Goal (%)</FieldLabel>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    value={localPrefs.savings_goal_percent ?? 20}
                    onChange={(e) =>
                      updateLocalPref('savings_goal_percent', Number(e.target.value))
                    }
                    className="flex-1 h-2 bg-white/10 rounded-full appearance-none cursor-pointer accent-primary"
                  />
                  <input
                    id="savings-goal"
                    type="number"
                    min="0"
                    max="100"
                    value={localPrefs.savings_goal_percent ?? 20}
                    onChange={(e) =>
                      updateLocalPref('savings_goal_percent', Number(e.target.value))
                    }
                    className="w-16 px-2 py-2 bg-white/5 border border-border rounded-lg text-white text-sm text-center focus:border-primary focus:outline-none"
                  />
                </div>
              </div>

              {/* Monthly Investment Target */}
              <div>
                <FieldLabel htmlFor="investment-target">Investment Target / mo</FieldLabel>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">
                    {localPrefs.currency_symbol ?? '\u20B9'}
                  </span>
                  <input
                    id="investment-target"
                    type="number"
                    min="0"
                    step="1000"
                    value={localPrefs.monthly_investment_target ?? 0}
                    onChange={(e) =>
                      updateLocalPref('monthly_investment_target', Number(e.target.value))
                    }
                    className={inputClass}
                  />
                </div>
                {localPrefs.monthly_investment_target > 0 && (
                  <FieldHint>
                    <span className="text-ios-green">
                      Target: {formatCurrency(localPrefs.monthly_investment_target)} / month
                    </span>
                  </FieldHint>
                )}
              </div>

              {/* Payday */}
              <div>
                <FieldLabel htmlFor="payday">Payday</FieldLabel>
                <select
                  id="payday"
                  value={localPrefs.payday ?? 1}
                  onChange={(e) => updateLocalPref('payday', Number(e.target.value))}
                  className={selectClass}
                >
                  {PAYDAY_OPTIONS.map((day) => (
                    <option key={day} value={day} className="bg-background">
                      {day}{getOrdinalSuffix(day)} of month
                    </option>
                  ))}
                </select>
              </div>

              {/* Tax Regime */}
              <div>
                <FieldLabel>Tax Regime</FieldLabel>
                <div className="flex gap-2">
                  {(['new', 'old'] as const).map((regime) => (
                    <label
                      key={regime}
                      className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors border text-sm ${
                        (localPrefs.preferred_tax_regime ?? 'new') === regime
                          ? 'bg-primary/15 border-primary text-white font-medium'
                          : 'bg-white/5 border-border text-muted-foreground hover:text-white'
                      }`}
                    >
                      <input
                        type="radio"
                        name="tax-regime"
                        value={regime}
                        checked={(localPrefs.preferred_tax_regime ?? 'new') === regime}
                        onChange={(e) => updateLocalPref('preferred_tax_regime', e.target.value)}
                        className="sr-only"
                      />
                      {regime === 'new' ? 'New' : 'Old'} Regime
                    </label>
                  ))}
                </div>
                <FieldHint>
                  {(localPrefs.preferred_tax_regime ?? 'new') === 'new'
                    ? 'Lower rates, fewer deductions'
                    : 'Higher rates, allows HRA/80C/80D deductions'}
                </FieldHint>
              </div>

              {/* Spending Rule 50/30/20 - spans full width */}
              <div className="md:col-span-2 lg:col-span-3">
                <FieldLabel>Spending Rule</FieldLabel>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Needs %</label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={localPrefs.needs_target_percent}
                      onChange={(e) =>
                        updateLocalPref('needs_target_percent', Number(e.target.value))
                      }
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Wants %</label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={localPrefs.wants_target_percent}
                      onChange={(e) =>
                        updateLocalPref('wants_target_percent', Number(e.target.value))
                      }
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Savings %</label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={localPrefs.savings_target_percent}
                      onChange={(e) =>
                        updateLocalPref('savings_target_percent', Number(e.target.value))
                      }
                      className={inputClass}
                    />
                  </div>
                </div>
                {(() => {
                  const sum =
                    localPrefs.needs_target_percent +
                    localPrefs.wants_target_percent +
                    localPrefs.savings_target_percent
                  return sum !== 100 ? (
                    <p className="mt-1.5 text-xs text-ios-yellow">
                      Totals {sum}% (should be 100%)
                    </p>
                  ) : (
                    <FieldHint>Default: 50 / 30 / 20</FieldHint>
                  )
                })()}
              </div>
            </div>

            {/* Budget Defaults */}
            <div className="pt-3 border-t border-border">
              <h3 className="text-sm font-medium text-white mb-3 flex items-center gap-2">
                <PiggyBank className="w-4 h-4 text-primary" />
                Budget Defaults
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-start">
                <div>
                  <FieldLabel htmlFor="alert-threshold">Alert Threshold (%)</FieldLabel>
                  <input
                    id="alert-threshold"
                    type="number"
                    min="0"
                    max="100"
                    value={localPrefs.default_budget_alert_threshold}
                    onChange={(e) =>
                      updateLocalPref('default_budget_alert_threshold', Number(e.target.value))
                    }
                    className={inputClass}
                  />
                </div>
                <label className="flex items-center gap-3 cursor-pointer pt-6">
                  <input
                    type="checkbox"
                    checked={localPrefs.auto_create_budgets}
                    onChange={(e) => updateLocalPref('auto_create_budgets', e.target.checked)}
                    className="w-4 h-4 rounded bg-white/5 border-border text-primary focus:ring-primary"
                  />
                  <span className="text-sm text-white">Auto-create budgets</span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer pt-6">
                  <input
                    type="checkbox"
                    checked={localPrefs.budget_rollover_enabled}
                    onChange={(e) => updateLocalPref('budget_rollover_enabled', e.target.checked)}
                    className="w-4 h-4 rounded bg-white/5 border-border text-primary focus:ring-primary"
                  />
                  <span className="text-sm text-white">Budget rollover</span>
                </label>
              </div>
            </div>
          </Section>
        )}

        {/* ================================================================= */}
        {/* SECTION: Display & Preferences                                    */}
        {/* ================================================================= */}
        {localPrefs && (
          <Section
            index={sectionIndex++}
            icon={Settings2}
            title="Display & Preferences"
            description="Number formats, currency, time ranges, and appearance"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {/* Number Format */}
              <div>
                <FieldLabel htmlFor="number-format">Number Format</FieldLabel>
                <select
                  id="number-format"
                  value={localPrefs.number_format}
                  onChange={(e) =>
                    updateLocalPref('number_format', e.target.value as 'indian' | 'international')
                  }
                  className={selectClass}
                >
                  <option value="indian" className="bg-background">
                    Indian (1,00,000)
                  </option>
                  <option value="international" className="bg-background">
                    International (100,000)
                  </option>
                </select>
              </div>

              {/* Currency Symbol */}
              <div>
                <FieldLabel htmlFor="currency-symbol">Currency Symbol</FieldLabel>
                <input
                  id="currency-symbol"
                  type="text"
                  value={localPrefs.currency_symbol}
                  onChange={(e) => updateLocalPref('currency_symbol', e.target.value)}
                  className={inputClass}
                />
              </div>

              {/* Symbol Position */}
              <div>
                <FieldLabel htmlFor="symbol-position">Symbol Position</FieldLabel>
                <select
                  id="symbol-position"
                  value={localPrefs.currency_symbol_position}
                  onChange={(e) =>
                    updateLocalPref(
                      'currency_symbol_position',
                      e.target.value as 'before' | 'after',
                    )
                  }
                  className={selectClass}
                >
                  <option value="before" className="bg-background">
                    Before ({localPrefs.currency_symbol}100)
                  </option>
                  <option value="after" className="bg-background">
                    After (100{localPrefs.currency_symbol})
                  </option>
                </select>
              </div>

              {/* Default Time Range */}
              <div>
                <FieldLabel htmlFor="time-range">Default Time Range</FieldLabel>
                <select
                  id="time-range"
                  value={localPrefs.default_time_range}
                  onChange={(e) => updateLocalPref('default_time_range', e.target.value)}
                  className={selectClass}
                >
                  {TIME_RANGE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value} className="bg-background">
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Earning Start Date */}
              <div className="md:col-span-2">
                <FieldLabel htmlFor="earning-start-date">Earning Start Date</FieldLabel>
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                  <input
                    id="earning-start-date"
                    type="date"
                    value={localPrefs.earning_start_date ?? ''}
                    onChange={(e) =>
                      updateLocalPref('earning_start_date', e.target.value || null)
                    }
                    className={`${inputClass} w-auto`}
                  />
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={localPrefs.use_earning_start_date}
                      disabled={!localPrefs.earning_start_date}
                      onChange={(e) =>
                        updateLocalPref('use_earning_start_date', e.target.checked)
                      }
                      className="w-4 h-4 rounded bg-white/5 border-border text-primary focus:ring-primary disabled:opacity-40"
                    />
                    <span className="text-sm text-white">Use as analytics start</span>
                  </label>
                </div>
                {localPrefs.use_earning_start_date && localPrefs.earning_start_date && (
                  <p className="mt-1.5 text-xs text-ios-green">
                    Analytics from{' '}
                    {new Date(localPrefs.earning_start_date + 'T00:00:00').toLocaleDateString(
                      'en-IN',
                      { day: 'numeric', month: 'long', year: 'numeric' },
                    )}
                  </p>
                )}
              </div>

              {/* Appearance */}
              <div className="lg:col-span-3">
                <FieldLabel>Appearance</FieldLabel>
                <div className="flex gap-2">
                  {(['dark', 'system'] as const).map((t) => (
                    <label
                      key={t}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg cursor-pointer transition-colors border text-sm ${
                        theme === t
                          ? 'bg-primary/15 border-primary text-white font-medium'
                          : 'bg-white/5 border-border text-muted-foreground hover:text-white'
                      }`}
                    >
                      <input
                        type="radio"
                        name="theme"
                        value={t}
                        checked={theme === t}
                        onChange={() => {
                          setTheme(t)
                          localStorage.setItem('ledger-sync-theme', t)
                        }}
                        className="sr-only"
                      />
                      <Palette className="w-4 h-4" />
                      {t === 'system' ? 'System (Auto)' : 'Dark'}
                    </label>
                  ))}
                </div>
                {theme === 'system' && (
                  <FieldHint>
                    <span className="text-ios-yellow">Light theme coming soon. Currently defaults to dark.</span>
                  </FieldHint>
                )}
              </div>
            </div>
          </Section>
        )}

        {/* ================================================================= */}
        {/* SECTION: Notifications                                            */}
        {/* ================================================================= */}
        {localPrefs && (
          <Section
            index={sectionIndex++}
            icon={Bell}
            title="Notifications"
            description="Configure alerts for budgets, anomalies, and upcoming bills"
          >
            <div className="space-y-3">
              {/* Budget alerts */}
              <div className="flex items-center justify-between gap-4 py-3 border-b border-border">
                <div className="flex items-start gap-3">
                  <Receipt className="w-5 h-5 text-primary mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-white">Budget Alerts</p>
                    <p className="text-xs text-muted-foreground">
                      Notify when spending approaches budget thresholds
                    </p>
                  </div>
                </div>
                <Toggle
                  checked={localPrefs.notify_budget_alerts ?? true}
                  onChange={(val) => updateLocalPref('notify_budget_alerts', val)}
                />
              </div>

              {/* Anomaly alerts */}
              <div className="flex items-center justify-between gap-4 py-3 border-b border-border">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-primary mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-white">Anomaly Alerts</p>
                    <p className="text-xs text-muted-foreground">
                      Notify when unusual spending patterns are detected
                    </p>
                  </div>
                </div>
                <Toggle
                  checked={localPrefs.notify_anomalies ?? true}
                  onChange={(val) => updateLocalPref('notify_anomalies', val)}
                />
              </div>

              {/* Upcoming bills */}
              <div className="flex items-center justify-between gap-4 py-3 border-b border-border">
                <div className="flex items-start gap-3">
                  <Clock className="w-5 h-5 text-primary mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-white">Upcoming Bills</p>
                    <p className="text-xs text-muted-foreground">
                      Notify before recurring bills are due
                    </p>
                  </div>
                </div>
                <Toggle
                  checked={localPrefs.notify_upcoming_bills ?? true}
                  onChange={(val) => updateLocalPref('notify_upcoming_bills', val)}
                />
              </div>

              {/* Days ahead */}
              <div className="flex items-center gap-4 pt-2">
                <FieldLabel htmlFor="notify-days">Remind me</FieldLabel>
                <select
                  id="notify-days"
                  value={localPrefs.notify_days_ahead ?? 7}
                  onChange={(e) => updateLocalPref('notify_days_ahead', Number(e.target.value))}
                  className="px-3 py-1.5 bg-white/5 border border-border rounded-lg text-white text-sm focus:border-primary focus:outline-none"
                >
                  {DAYS_AHEAD_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value} className="bg-background">
                      {opt.label}
                    </option>
                  ))}
                </select>
                <span className="text-sm text-muted-foreground">before due date</span>
              </div>
            </div>
          </Section>
        )}

        {/* ================================================================= */}
        {/* SECTION: Advanced (collapsed by default)                          */}
        {/* ================================================================= */}
        {localPrefs && (
          <Section
            index={sectionIndex++}
            icon={Shield}
            title="Advanced"
            description="Anomaly detection, recurring transactions, credit card limits, excluded accounts"
            defaultCollapsed={true}
          >
            {/* Anomaly Detection */}
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-white flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-primary" />
                Anomaly Detection
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <FieldLabel htmlFor="expense-threshold">
                    Expense Threshold (Std Devs)
                  </FieldLabel>
                  <input
                    id="expense-threshold"
                    type="number"
                    min="1"
                    max="10"
                    step="0.5"
                    value={localPrefs.anomaly_expense_threshold}
                    onChange={(e) =>
                      updateLocalPref('anomaly_expense_threshold', Number(e.target.value))
                    }
                    className={inputClass}
                  />
                </div>
                <div>
                  <FieldLabel>Enabled Types</FieldLabel>
                  <div className="space-y-1.5">
                    {ANOMALY_TYPES.map((type) => {
                      const isEnabled = localPrefs.anomaly_types_enabled.includes(type.value)
                      return (
                        <label
                          key={type.value}
                          className="flex items-center gap-2 cursor-pointer"
                        >
                          <button
                            type="button"
                            onClick={() => toggleAnomalyType(type.value)}
                            className={`w-4 h-4 rounded flex items-center justify-center transition-colors ${
                              isEnabled
                                ? 'bg-primary text-white'
                                : 'bg-white/5 border border-border'
                            }`}
                          >
                            {isEnabled && <Check className="w-3 h-3" />}
                          </button>
                          <span className="text-sm text-white">{type.label}</span>
                        </label>
                      )
                    })}
                  </div>
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={localPrefs.auto_dismiss_recurring_anomalies}
                  onChange={(e) =>
                    updateLocalPref('auto_dismiss_recurring_anomalies', e.target.checked)
                  }
                  className="w-4 h-4 rounded bg-white/5 border-border text-primary focus:ring-primary"
                />
                <span className="text-sm text-white">Auto-dismiss recurring anomalies</span>
              </label>
            </div>

            {/* Recurring Transactions */}
            <div className="pt-4 border-t border-border space-y-3">
              <h3 className="text-sm font-medium text-white flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-primary" />
                Recurring Transactions
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <FieldLabel htmlFor="min-confidence">Min Confidence (%)</FieldLabel>
                  <input
                    id="min-confidence"
                    type="number"
                    min="0"
                    max="100"
                    value={localPrefs.recurring_min_confidence}
                    onChange={(e) =>
                      updateLocalPref('recurring_min_confidence', Number(e.target.value))
                    }
                    className={inputClass}
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="auto-confirm">Auto-confirm After</FieldLabel>
                  <div className="flex items-center gap-2">
                    <input
                      id="auto-confirm"
                      type="number"
                      min="2"
                      max="12"
                      value={localPrefs.recurring_auto_confirm_occurrences}
                      onChange={(e) =>
                        updateLocalPref(
                          'recurring_auto_confirm_occurrences',
                          Number(e.target.value),
                        )
                      }
                      className={inputClass}
                    />
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      occurrences
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Credit Card Limits */}
            <div className="pt-4 border-t border-border space-y-3">
              <h3 className="text-sm font-medium text-white flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-primary" />
                Credit Card Limits
              </h3>
              {creditCardAccounts.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No credit card accounts. Classify accounts as &quot;Credit Cards&quot; above.
                </p>
              ) : (
                <div className="space-y-2">
                  {creditCardAccounts.map((card) => (
                    <div key={card} className="flex items-center gap-3">
                      <span className="text-sm text-white min-w-0 flex-1 truncate" title={card}>
                        {card.replace(' Credit Card', '')}
                      </span>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs text-muted-foreground">Limit:</span>
                        <input
                          type="number"
                          min="0"
                          step="10000"
                          value={localPrefs.credit_card_limits[card] ?? 100000}
                          onChange={(e) =>
                            updateLocalPref('credit_card_limits', {
                              ...localPrefs.credit_card_limits,
                              [card]: Number(e.target.value),
                            })
                          }
                          className="w-32 px-2 py-1.5 bg-white/5 border border-border rounded-lg text-white text-sm focus:border-primary focus:outline-none"
                        />
                      </div>
                    </div>
                  ))}
                  <FieldHint>Default: {formatCurrency(100000)} per card</FieldHint>
                </div>
              )}
            </div>

            {/* Excluded Accounts */}
            <div className="pt-4 border-t border-border space-y-3">
              <h3 className="text-sm font-medium text-white flex items-center gap-2">
                <EyeOff className="w-4 h-4 text-primary" />
                Excluded Accounts
                {excludedAccounts.length > 0 && (
                  <span className="px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-ios-yellow/20 text-ios-yellow">
                    {excludedAccounts.length}
                  </span>
                )}
              </h3>
              <p className="text-xs text-muted-foreground">
                Excluded accounts are hidden from analytics and reporting.
              </p>
              {accounts.length === 0 ? (
                <p className="text-sm text-muted-foreground">No accounts found.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                  {accounts.map((account) => {
                    const isExcluded = excludedAccounts.includes(account)
                    return (
                      <label
                        key={account}
                        className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer hover:bg-white/5 transition-colors"
                      >
                        <button
                          type="button"
                          onClick={() => toggleExcludedAccount(account)}
                          className={`w-4 h-4 rounded flex items-center justify-center shrink-0 transition-colors ${
                            isExcluded
                              ? 'bg-ios-yellow text-black'
                              : 'bg-white/5 border border-border'
                          }`}
                        >
                          {isExcluded && <Check className="w-3 h-3" />}
                        </button>
                        <span
                          className={`text-sm truncate ${
                            isExcluded
                              ? 'text-muted-foreground line-through'
                              : 'text-white'
                          }`}
                        >
                          {account}
                        </span>
                      </label>
                    )
                  })}
                </div>
              )}
            </div>
          </Section>
        )}

        {/* ================================================================= */}
        {/* SECTION: Dashboard Widgets                                        */}
        {/* ================================================================= */}
        <Section
          index={sectionIndex}
          icon={LayoutGrid}
          title="Dashboard Widgets"
          description="Choose which Quick Insight cards appear on your Dashboard"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
            {DASHBOARD_WIDGETS.map((widget) => {
              const isVisible = visibleWidgets.includes(widget.key)
              return (
                <label
                  key={widget.key}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
                    isVisible ? 'hover:bg-white/5' : 'opacity-50 hover:opacity-75'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      const next = isVisible
                        ? visibleWidgets.filter((w) => w !== widget.key)
                        : [...visibleWidgets, widget.key]
                      setVisibleWidgets(next)
                      localStorage.setItem('ledger-sync-visible-widgets', JSON.stringify(next))
                    }}
                    className={`w-5 h-5 rounded flex items-center justify-center shrink-0 transition-colors ${
                      isVisible
                        ? 'bg-primary/20 text-primary border border-primary/50'
                        : 'bg-white/5 border border-border'
                    }`}
                  >
                    {isVisible && <Check className="w-3 h-3" />}
                  </button>
                  <span className="text-sm text-white">{widget.label}</span>
                </label>
              )
            })}
          </div>
          <button
            type="button"
            onClick={() => {
              const all = DASHBOARD_WIDGETS.map((w) => w.key)
              setVisibleWidgets(all)
              localStorage.setItem('ledger-sync-visible-widgets', JSON.stringify(all))
            }}
            className="text-xs text-primary hover:underline mt-2"
          >
            Show all widgets
          </button>
        </Section>

        {/* Reset Confirmation Dialog */}
        <ConfirmDialog
          open={showResetConfirm}
          onOpenChange={setShowResetConfirm}
          title="Reset All Settings"
          description="This will reset all your preferences to their default values. Account classifications will not be affected. This action cannot be undone."
          confirmLabel="Reset to Defaults"
          cancelLabel="Cancel"
          variant="warning"
          onConfirm={handleReset}
        />
      </div>
    </div>
  )
}
