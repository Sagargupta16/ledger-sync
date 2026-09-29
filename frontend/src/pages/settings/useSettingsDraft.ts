/**
 * The Settings page's editable draft: local copies of preferences,
 * classifications, rules and compensation inputs, plus the edit handlers that
 * mark the draft dirty. Saving and server sync stay in `useSettingsState`.
 */

import { useCallback, useState } from 'react'

import type { SalaryComponents, RsuGrant, GrowthAssumptions } from '@/types/salary'
import { DEFAULT_GROWTH_ASSUMPTIONS } from '@/types/salary'

import type { LocalPrefs, LocalPrefKey, LocalRule } from './types'
import { INCOME_CLASSIFICATION_KEY_MAP } from './types'
import { getStoredWidgets } from './helpers'

export function useSettingsDraft() {
  const [classifications, setClassifications] = useState<Record<string, string>>({})
  const [localPrefs, setLocalPrefs] = useState<LocalPrefs | null>(null)
  const [hasChanges, setHasChanges] = useState(false)
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [draggedItem, setDraggedItem] = useState<string | null>(null)
  const [dragType, setDragType] = useState<'account' | null>(null)
  const [visibleWidgets, setVisibleWidgets] = useState<string[]>(getStoredWidgets)
  const [localSalaryStructure, setLocalSalaryStructure] = useState<Record<string, SalaryComponents>>({})
  const [localRsuGrants, setLocalRsuGrants] = useState<RsuGrant[]>([])
  const [localGrowthAssumptions, setLocalGrowthAssumptions] = useState<GrowthAssumptions>({ ...DEFAULT_GROWTH_ASSUMPTIONS })
  const [rules, setRules] = useState<LocalRule[]>([])

  // Categorization rule handlers
  const addRule = useCallback(() => {
    setRules((prev) => [
      ...prev,
      {
        localId: crypto.randomUUID(),
        match_field: 'note',
        pattern: '',
        category: '',
        subcategory: '',
        is_active: true,
      },
    ])
    setHasChanges(true)
  }, [])

  const removeRule = useCallback((localId: string) => {
    setRules((prev) => prev.filter((r) => r.localId !== localId))
    setHasChanges(true)
  }, [])

  const updateRule = useCallback(
    (localId: string, field: keyof LocalRule, value: string | boolean) => {
      setRules((prev) =>
        prev.map((r) => (r.localId === localId ? ({ ...r, [field]: value }) : r)),
      )
      setHasChanges(true)
    },
    [],
  )

  // Core updater
  const updateLocalPref = useCallback(
    <K extends LocalPrefKey>(key: K, value: LocalPrefs[K]) => {
      setLocalPrefs((prev) => (prev ? { ...prev, [key]: value } : prev))
      setHasChanges(true)
    },
    [],
  )

  /** Drop a saved classification key that matches zero ledger rows. */
  const removeIncomeKey = useCallback((key: string) => {
    setLocalPrefs((prev) => {
      if (!prev) return prev
      const next = { ...prev }
      for (const prefKey of Object.values(INCOME_CLASSIFICATION_KEY_MAP)) {
        next[prefKey] = next[prefKey].filter((saved) => saved !== key)
      }
      return next
    })
    setHasChanges(true)
  }, [])

  const updateSalaryStructure = useCallback((structure: Record<string, SalaryComponents>) => {
    setLocalSalaryStructure(structure)
    setHasChanges(true)
  }, [])

  const updateRsuGrants = useCallback((grants: RsuGrant[]) => {
    setLocalRsuGrants(grants)
    setHasChanges(true)
  }, [])

  const updateGrowthAssumptions = useCallback((assumptions: GrowthAssumptions) => {
    setLocalGrowthAssumptions(assumptions)
    setHasChanges(true)
  }, [])

  return {
    classifications, setClassifications,
    localPrefs, setLocalPrefs,
    hasChanges, setHasChanges,
    showResetConfirm, setShowResetConfirm,
    draggedItem, setDraggedItem, dragType, setDragType,
    visibleWidgets, setVisibleWidgets,
    localSalaryStructure, setLocalSalaryStructure, updateSalaryStructure,
    localRsuGrants, setLocalRsuGrants, updateRsuGrants,
    localGrowthAssumptions, setLocalGrowthAssumptions, updateGrowthAssumptions,
    rules, setRules, addRule, removeRule, updateRule,
    updateLocalPref, removeIncomeKey,
  }
}
