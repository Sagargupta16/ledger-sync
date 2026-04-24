import { motion } from 'framer-motion'
import { Save, RotateCcw } from 'lucide-react'
import PageHeader from '@/components/ui/PageHeader'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { useSettingsState } from './useSettingsState'
import AccountClassificationsSection from './sections/AccountClassificationsSection'
import InvestmentMappingsSection from './sections/InvestmentMappingsSection'
import ExpenseCategoriesSection from './sections/ExpenseCategoriesSection'
import IncomeClassificationSection from './sections/IncomeClassificationSection'
import SalaryStructureSection from './sections/SalaryStructureSection'
import FinancialSettingsSection from './sections/FinancialSettingsSection'
import DisplayPreferencesSection from './sections/DisplayPreferencesSection'
import NotificationsSection from './sections/NotificationsSection'
import AIAssistantSection from './sections/AIAssistantSection'
import AdvancedSection from './sections/AdvancedSection'
import DashboardWidgetsSection from './sections/DashboardWidgetsSection'

export default function SettingsPage() {
  const s = useSettingsState()

  // Drag handlers (thin wrappers that update hook state)
  const handleDragStart = (item: string) => {
    s.setDraggedItem(item)
    s.setDragType('account')
  }
  const handleDragEnd = () => {
    s.setDraggedItem(null)
    s.setDragType(null)
  }
  const handleDropOnCategory = (category: string) => {
    const item = s.draggedItem
    if (item && s.dragType === 'account') {
      s.setClassifications((prev) => ({ ...prev, [item]: category }))
      s.setHasChanges(true)
    }
    handleDragEnd()
  }

  // Loading skeleton
  if (s.isLoading) {
    return (
      <div className="min-h-screen p-4 md:p-6 lg:p-8">
        <div className="max-w-5xl mx-auto space-y-4">
          {['skeleton-1', 'skeleton-2', 'skeleton-3', 'skeleton-4'].map((id) => (
            <div
              key={id}
              className="glass rounded-2xl border border-border h-24 animate-pulse opacity-30"
            />
          ))}
        </div>
      </div>
    )
  }

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
              {s.hasChanges && (
                <span className="text-sm text-app-yellow flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-app-yellow animate-pulse" /> Unsaved
                </span>
              )}
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={() => s.setShowResetConfirm(true)}
                className="flex items-center gap-2 px-4 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-colors text-sm"
              >
                <RotateCcw className="w-4 h-4" />
                <span className="hidden sm:inline">Reset</span>
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={s.handleSave}
                disabled={!s.hasChanges || s.isSaving}
                className="flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-primary to-secondary text-white rounded-lg hover:shadow-lg hover:shadow-primary/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
              >
                <Save className="w-4 h-4" />
                <span>{s.isSaving ? 'Saving...' : 'Save'}</span>
              </motion.button>
            </div>
          }
        />

        <AccountClassificationsSection
          index={sectionIndex++}
          unclassifiedAccounts={s.unclassifiedAccounts}
          accountsByCategory={s.accountsByCategory}
          balancesLoading={s.balancesLoading}
          balanceData={s.balanceData}
          dragType={s.dragType}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDropOnCategory={handleDropOnCategory}
        />

        {s.localPrefs && (
          <InvestmentMappingsSection
            index={sectionIndex++}
            investmentAccounts={s.investmentAccounts}
            unmappedInvestmentAccounts={s.unmappedInvestmentAccounts}
            localPrefs={s.localPrefs}
            updateLocalPref={s.updateLocalPref}
          />
        )}

        {s.localPrefs && (
          <ExpenseCategoriesSection
            index={sectionIndex++}
            allExpenseCategories={s.allExpenseCategories}
            localPrefs={s.localPrefs}
            fixedCategories={s.fixedCategories}
            updateLocalPref={s.updateLocalPref}
          />
        )}

        {s.localPrefs && (
          <IncomeClassificationSection
            index={sectionIndex++}
            allIncomeCategories={s.allIncomeCategories}
            localPrefs={s.localPrefs}
            unclassifiedIncomeItems={s.unclassifiedIncomeItems}
            setLocalPrefs={s.setLocalPrefs}
            setHasChanges={s.setHasChanges}
          />
        )}

        <SalaryStructureSection
          index={sectionIndex++}
          localSalaryStructure={s.localSalaryStructure}
          updateSalaryStructure={s.updateSalaryStructure}
          localRsuGrants={s.localRsuGrants}
          updateRsuGrants={s.updateRsuGrants}
          localGrowthAssumptions={s.localGrowthAssumptions}
          updateGrowthAssumptions={s.updateGrowthAssumptions}
        />

        <AIAssistantSection index={sectionIndex++} />

        {s.localPrefs && (
          <FinancialSettingsSection
            index={sectionIndex++}
            localPrefs={s.localPrefs}
            updateLocalPref={s.updateLocalPref}
          />
        )}

        {s.localPrefs && (
          <DisplayPreferencesSection
            index={sectionIndex++}
            localPrefs={s.localPrefs}
            theme={s.theme}
            setTheme={s.setTheme}
            updateLocalPref={s.updateLocalPref}
          />
        )}

        {s.localPrefs && (
          <NotificationsSection
            index={sectionIndex++}
            localPrefs={s.localPrefs}
            updateLocalPref={s.updateLocalPref}
          />
        )}

        {s.localPrefs && (
          <AdvancedSection
            index={sectionIndex++}
            localPrefs={s.localPrefs}
            accounts={s.accounts}
            creditCardAccounts={s.creditCardAccounts}
            excludedAccounts={s.excludedAccounts}
            updateLocalPref={s.updateLocalPref}
          />
        )}

        <DashboardWidgetsSection
          index={sectionIndex}
          visibleWidgets={s.visibleWidgets}
          setVisibleWidgets={s.setVisibleWidgets}
        />

        <ConfirmDialog
          open={s.showResetConfirm}
          onOpenChange={s.setShowResetConfirm}
          title="Reset All Settings"
          description="This will reset all your preferences to their default values. Account classifications will not be affected. This action cannot be undone."
          confirmLabel="Reset to Defaults"
          cancelLabel="Cancel"
          variant="warning"
          onConfirm={s.handleReset}
        />
      </div>
    </div>
  )
}
