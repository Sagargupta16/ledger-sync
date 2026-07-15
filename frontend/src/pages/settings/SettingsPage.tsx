import { AnimatePresence, motion } from 'framer-motion'
import { Save, RotateCcw } from 'lucide-react'
import { PageContainer, PageHeader } from '@/components/ui'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { useSettingsState } from './useSettingsState'
import { GroupHeader } from './sectionPrimitives'
import DisplayPreferencesSection from './sections/DisplayPreferencesSection'
import NotificationsSection from './sections/NotificationsSection'
import DashboardWidgetsSection from './sections/DashboardWidgetsSection'
import AIAssistantSection from './sections/AIAssistantSection'
import FinancialSettingsSection from './sections/FinancialSettingsSection'
import SalaryStructureSection from './sections/SalaryStructureSection'
import AccountClassificationsSection from './sections/AccountClassificationsSection'
import ExpenseCategoriesSection from './sections/ExpenseCategoriesSection'
import IncomeClassificationSection from './sections/IncomeClassificationSection'
import CategorizationRulesSection from './sections/CategorizationRulesSection'
import InvestmentMappingsSection from './sections/InvestmentMappingsSection'
import AdvancedSection from './sections/AdvancedSection'

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
  // Keyboard/tap fallback for the drag-and-drop classifier.
  const handleAssignAccount = (account: string, category: string) => {
    s.setClassifications((prev) => ({ ...prev, [account]: category }))
    s.setHasChanges(true)
  }

  // Loading skeleton
  if (s.isLoading) {
    return (
      <PageContainer maxWidth="5xl" className="space-y-4">
        {['skeleton-1', 'skeleton-2', 'skeleton-3', 'skeleton-4'].map((id) => (
          <div
            key={id}
            className="glass rounded-2xl border border-border h-24 animate-pulse opacity-30"
          />
        ))}
      </PageContainer>
    )
  }

  let sectionIndex = 0

  return (
    <PageContainer maxWidth="5xl" className="space-y-5">
        {/* Page Header */}
        <PageHeader
          title="Settings"
          subtitle="Configure your financial preferences"
          action={
            <div className="flex flex-wrap items-center justify-center gap-3">
              {s.hasChanges && (
                <span className="text-sm text-app-yellow flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-app-yellow animate-pulse" /> Unsaved
                </span>
              )}
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={() => s.setShowResetConfirm(true)}
                className="flex items-center gap-2 px-4 py-2 bg-[var(--overlay-5)] text-foreground rounded-lg hover:bg-[var(--overlay-6)] transition-colors text-sm"
              >
                <RotateCcw className="w-4 h-4" />
                <span className="hidden sm:inline">Reset</span>
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={s.handleSave}
                disabled={!s.hasChanges || s.isSaving}
                className="flex items-center gap-2 rounded-md border border-foreground bg-foreground px-5 py-2 text-sm font-medium text-background transition-colors hover:bg-foreground/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                <span>{s.isSaving ? 'Saving...' : 'Save'}</span>
              </motion.button>
            </div>
          }
        />

        {/* Group: Money Setup -- essential first-run config, expanded by default */}
        <GroupHeader>Money Setup</GroupHeader>

        {s.localPrefs && (
          <FinancialSettingsSection
            index={sectionIndex++}
            localPrefs={s.localPrefs}
            updateLocalPref={s.updateLocalPref}
            defaultCollapsed={false}
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
          defaultCollapsed={false}
        />

        {/* Group: Categories & Classification -- essential first-run config, expanded by default */}
        <GroupHeader>Categories &amp; Classification</GroupHeader>

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
          onAssignAccount={handleAssignAccount}
          defaultCollapsed={false}
        />

        {s.localPrefs && (
          <ExpenseCategoriesSection
            index={sectionIndex++}
            allExpenseCategories={s.allExpenseCategories}
            localPrefs={s.localPrefs}
            fixedCategories={s.fixedCategories}
            updateLocalPref={s.updateLocalPref}
            defaultCollapsed={false}
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
            defaultCollapsed={false}
          />
        )}

        <CategorizationRulesSection
          index={sectionIndex++}
          rules={s.rules}
          onAddRule={s.addRule}
          onRemoveRule={s.removeRule}
          onUpdateRule={s.updateRule}
          onApplyRules={s.handleApplyRules}
          applying={s.applyingRules}
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

        {/* Group: Profile & Display -- personalization, collapsed by default */}
        <GroupHeader>Profile &amp; Display</GroupHeader>

        {s.localPrefs && (
          <DisplayPreferencesSection
            index={sectionIndex++}
            localPrefs={s.localPrefs}
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

        <DashboardWidgetsSection
          index={sectionIndex++}
          visibleWidgets={s.visibleWidgets}
          setVisibleWidgets={s.setVisibleWidgets}
        />

        <AIAssistantSection index={sectionIndex++} />

        {/* Group: Advanced -- rare/power-user config, collapsed by default */}
        <GroupHeader>Advanced</GroupHeader>

        {s.localPrefs && (
          <AdvancedSection
            index={sectionIndex}
            localPrefs={s.localPrefs}
            accounts={s.accounts}
            creditCardAccounts={s.creditCardAccounts}
            excludedAccounts={s.excludedAccounts}
            updateLocalPref={s.updateLocalPref}
          />
        )}

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

        {/* Floating save bar: settings sections run several screens deep, so
            saving must not require scrolling back to the header. Appears only
            with unsaved changes; sits above the mobile tab bar. */}
        <AnimatePresence>
          {s.hasChanges && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              transition={{ duration: 0.18 }}
              className="fixed inset-x-0 z-40 flex justify-center px-4 bottom-[calc(68px+env(safe-area-inset-bottom,0px)+0.75rem)] lg:bottom-[calc(env(safe-area-inset-bottom,0px)+1.25rem)]"
            >
              <div className="flex items-center gap-3 rounded-lg border border-[var(--hairline-2)] bg-surface-dropdown/95 px-4 py-2.5 shadow-[var(--glass-shadow-strong)] backdrop-blur-lg">
                <span className="flex items-center gap-1.5 text-sm text-app-yellow">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-app-yellow" />
                  Unsaved changes
                </span>
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={s.handleSave}
                  disabled={s.isSaving}
                  className="flex items-center gap-2 rounded-md border border-foreground bg-foreground px-4 py-1.5 text-sm font-medium text-background transition-colors hover:bg-foreground/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Save className="h-4 w-4" />
                  <span>{s.isSaving ? 'Saving...' : 'Save'}</span>
                </motion.button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
    </PageContainer>
  )
}
