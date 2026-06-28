/**
 * Contextual Budget Defaults panel for the Budget page.
 *
 * Renders the Settings `BudgetDefaultsSubsection` as-is inside a collapsible
 * panel so the same controls are reachable in-context. Save behavior is
 * identical to Settings: it writes the same fields via the dedicated
 * budget-defaults preferences endpoint. The Settings page keeps its own copy.
 */

import { useMemo, useState } from 'react'
import { Save, Sliders } from 'lucide-react'
import { toast } from 'sonner'

import { CollapsibleSection } from '@/components/ui'
import { usePreferences, useUpdateBudgetDefaults } from '@/hooks/api/usePreferences'
import { useDemoGuard } from '@/hooks/useDemoGuard'
import type { LocalPrefs, LocalPrefKey } from '@/pages/settings/types'
import BudgetDefaultsSubsection from '@/pages/settings/sections/BudgetDefaultsSubsection'

type BudgetDefaults = Pick<
  LocalPrefs,
  'default_budget_alert_threshold' | 'auto_create_budgets' | 'budget_rollover_enabled'
>

export default function BudgetDefaultsPanel() {
  const { data: preferences } = usePreferences()
  const updateBudgetDefaults = useUpdateBudgetDefaults()
  const { guardDemoAction } = useDemoGuard()

  const [edits, setEdits] = useState<Partial<BudgetDefaults>>({})
  const [hasChanges, setHasChanges] = useState(false)

  const localPrefs = useMemo<LocalPrefs | null>(() => {
    if (!preferences) return null
    return { ...preferences, ...edits } as unknown as LocalPrefs
  }, [preferences, edits])

  const updateLocalPref = <K extends LocalPrefKey>(key: K, value: LocalPrefs[K]) => {
    setEdits((prev) => ({ ...prev, [key]: value }))
    setHasChanges(true)
  }

  const handleSave = async () => {
    if (!localPrefs || guardDemoAction('Saving budget defaults')) return
    try {
      await updateBudgetDefaults.mutateAsync({
        default_budget_alert_threshold: localPrefs.default_budget_alert_threshold,
        auto_create_budgets: localPrefs.auto_create_budgets,
        budget_rollover_enabled: localPrefs.budget_rollover_enabled,
      })
      setHasChanges(false)
      setEdits({})
      toast.success('Budget defaults saved')
    } catch {
      toast.error('Failed to save budget defaults')
    }
  }

  if (!localPrefs) return null

  return (
    <CollapsibleSection title="Budget Defaults" icon={Sliders} defaultExpanded={false}>
      <BudgetDefaultsSubsection localPrefs={localPrefs} updateLocalPref={updateLocalPref} />
      <div className="flex items-center justify-end gap-3 pt-4">
        {hasChanges && (
          <span className="text-sm text-app-yellow flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-app-yellow animate-pulse" /> Unsaved
          </span>
        )}
        <button
          type="button"
          onClick={handleSave}
          disabled={!hasChanges || updateBudgetDefaults.isPending}
          className="flex items-center gap-2 px-4 py-2.5 sm:py-2 min-h-11 rounded-lg bg-gradient-to-r from-primary to-secondary text-on-accent text-sm font-medium transition-all hover:shadow-lg hover:shadow-primary/25 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Save className="w-4 h-4" />
          {updateBudgetDefaults.isPending ? 'Saving...' : 'Save'}
        </button>
      </div>
    </CollapsibleSection>
  )
}
