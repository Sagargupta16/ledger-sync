import { AnimatePresence, motion } from 'motion/react'
import { Save, RotateCcw } from 'lucide-react'
import ErrorState from '@/components/shared/ErrorState'
import { Button, PageContainer, PageHeader } from '@/components/ui'
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
  const isPending = s.isSaving || s.isResetting || s.applyingRules
  const saveActionLabel = s.saveError ? 'Retry save' : 'Save changes'
  const saveLabel = s.isSaving ? 'Saving changes...' : saveActionLabel
  const unsavedLabel = s.saveError ? 'Save incomplete' : 'Unsaved changes'

  // Drag handlers (thin wrappers that update hook state)
  const handleDragStart = (item: string) => {
    if (isPending) return
    s.setDraggedItem(item)
    s.setDragType('account')
  }
  const handleDragEnd = () => {
    s.setDraggedItem(null)
    s.setDragType(null)
  }
  const handleDropOnCategory = (category: string) => {
    if (isPending) return
    const item = s.draggedItem
    if (item && s.dragType === 'account') {
      s.setClassifications((prev) => ({ ...prev, [item]: category }))
      s.setHasChanges(true)
    }
    handleDragEnd()
  }
  // Keyboard/tap fallback for the drag-and-drop classifier.
  const handleAssignAccount = (account: string, category: string) => {
    if (isPending) return
    s.setClassifications((prev) => ({ ...prev, [account]: category }))
    s.setHasChanges(true)
  }

  // Loading skeleton
  if (s.isLoading) {
    return (
      <PageContainer maxWidth="5xl" className="space-y-4">
        <PageHeader title="Settings" subtitle="Configure your financial preferences" />
        <div role="status" aria-live="polite" aria-label="Loading settings" className="space-y-3">
          {['skeleton-1', 'skeleton-2', 'skeleton-3', 'skeleton-4'].map((id) => (
            <div
              key={id}
              className="ledger-panel h-20 animate-pulse opacity-30"
              aria-hidden="true"
            />
          ))}
        </div>
      </PageContainer>
    )
  }

  if (s.loadError) {
    return (
      <PageContainer maxWidth="5xl" className="space-y-5">
        <PageHeader
          title="Settings"
          subtitle="Configure your financial preferences"
        />
        <ErrorState
          variant="card"
          title="Could not load settings"
          message="Your existing settings were not changed. Check your connection and try again."
          onRetry={() => void s.retrySettings()}
        />
      </PageContainer>
    )
  }

  let sectionIndex = 0

  let statusMessage = 'Save changes when you are ready to apply your preferences.'
  if (s.isSaving) {
    statusMessage = 'Saving settings and refreshing your financial views...'
  } else if (s.isResetting) {
    statusMessage = 'Resetting preferences...'
  } else if (s.savedAt && !s.hasChanges) {
    statusMessage = `Saved at ${s.savedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
  }

  return (
    <PageContainer maxWidth="5xl" className="space-y-5">
        {/* Page Header */}
        <PageHeader
          title="Settings"
          subtitle="Configure your financial preferences"
          action={
            <div className="flex flex-wrap items-center gap-3">
              {s.hasChanges && !isPending && (
                <span className="flex items-center gap-1.5 text-sm text-warning-text">
                  <span className="w-2 h-2 rounded-full bg-app-yellow animate-pulse" /> Unsaved
                </span>
              )}
              <Button
                id="reset-settings"
                type="button"
                variant="secondary"
                onClick={() => s.setShowResetConfirm(true)}
                disabled={isPending}
                isLoading={s.isResetting}
                icon={<RotateCcw className="h-4 w-4" />}
                aria-label="Reset settings"
              >
                <span className="hidden sm:inline">Reset</span>
              </Button>
              <Button
                id="save-settings"
                type="button"
                // handleSave/handleReset/handleApplyRules are async but each
                // wraps its body in try/catch with a sonner toast on failure,
                // so they never reject; `void` adapts them to void-returning
                // handler props without swallowing an unreported error.
                onClick={() => void s.handleSave()}
                disabled={!s.hasChanges || isPending}
                isLoading={s.isSaving}
                aria-busy={s.isSaving}
                icon={<Save className="h-4 w-4" />}
              >
                <span>{saveLabel}</span>
              </Button>
            </div>
          }
        />

        <output aria-live="polite" className="block text-sm text-muted-foreground">
          {statusMessage}
        </output>

        {s.saveError && (
          <div role="alert" className="rounded-lg border border-app-red/25 bg-app-red/5 px-4 py-3">
            <p className="text-sm font-medium text-app-red">Changes need attention</p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">{s.saveError}</p>
          </div>
        )}

        <fieldset disabled={isPending} aria-busy={isPending} className="min-w-0 space-y-5 border-0 p-0">
        <legend className="sr-only">Settings preferences</legend>
        {/* Group: Money Setup -- keep the primary financial controls open and secondary details compact */}
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
          defaultCollapsed
        />

        {/* Group: Categories & Classification -- collapsed until the user needs detailed setup */}
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
          defaultCollapsed
        />

        {s.localPrefs && (
          <ExpenseCategoriesSection
            index={sectionIndex++}
            allExpenseCategories={s.allExpenseCategories}
            localPrefs={s.localPrefs}
            fixedCategories={s.fixedCategories}
            updateLocalPref={s.updateLocalPref}
            defaultCollapsed
          />
        )}

        {s.localPrefs && (
          <IncomeClassificationSection
            index={sectionIndex++}
            allIncomeCategories={s.allIncomeCategories}
            localPrefs={s.localPrefs}
            incomeAudit={s.incomeAudit}
            applyIncomeSuggestions={s.applyIncomeSuggestions}
            removeIncomeKey={s.removeIncomeKey}
            setLocalPrefs={s.setLocalPrefs}
            setHasChanges={s.setHasChanges}
            defaultCollapsed
          />
        )}

        <CategorizationRulesSection
          index={sectionIndex++}
          rules={s.rules}
          onAddRule={s.addRule}
          onRemoveRule={s.removeRule}
          onUpdateRule={s.updateRule}
          onApplyRules={() => void s.handleApplyRules()}
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
            closedAccounts={s.closedAccounts}
            updateLocalPref={s.updateLocalPref}
          />
        )}
        </fieldset>

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
              className="fixed inset-x-0 z-40 flex justify-start bottom-[calc(68px+env(safe-area-inset-bottom,0px)+0.75rem)] pl-4 pr-24 sm:justify-center sm:px-4 lg:bottom-[calc(env(safe-area-inset-bottom,0px)+1.25rem)]"
            >
              <div className="flex items-center gap-3 rounded-lg border border-[var(--hairline-2)] bg-surface-dropdown/95 px-4 py-2.5 shadow-sm">
                <span className="hidden items-center gap-1.5 text-sm text-warning-text sm:flex">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-app-yellow" />
                  {' '}{s.isSaving ? 'Saving changes' : unsavedLabel}
                </span>
                <Button
                  id="save-settings-floating"
                  type="button"
                  onClick={() => void s.handleSave()}
                  disabled={isPending}
                  isLoading={s.isSaving}
                  aria-busy={s.isSaving}
                  icon={<Save className="h-4 w-4" />}
                >
                  <span>{saveLabel}</span>
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
    </PageContainer>
  )
}
