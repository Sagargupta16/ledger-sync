import { useMemo, useState } from 'react'
import { Save, SlidersHorizontal } from 'lucide-react'
import { toast } from 'sonner'

import ErrorState from '@/components/shared/ErrorState'
import { Button, CollapsibleSection } from '@/components/ui'
import { usePreferences, useUpdateAnomalySettings } from '@/hooks/api/usePreferences'
import { useDemoGuard } from '@/hooks/useDemoGuard'
import AnomalyDetectionSubsection from '@/pages/settings/sections/AnomalyDetectionSubsection'
import type { LocalPrefKey, LocalPrefs } from '@/pages/settings/types'

export default function AnomalyDetectionPanel() {
  const preferencesQuery = usePreferences()
  const updateAnomalySettings = useUpdateAnomalySettings()
  const { guardDemoAction } = useDemoGuard()
  const [edits, setEdits] = useState<
    Partial<
      Pick<
        LocalPrefs,
        'anomaly_expense_threshold' | 'anomaly_types_enabled' | 'auto_dismiss_recurring_anomalies'
      >
    >
  >({})
  const [hasChanges, setHasChanges] = useState(false)

  const localPrefs = useMemo<LocalPrefs | null>(
    () =>
      preferencesQuery.data
        ? ({ ...preferencesQuery.data, ...edits } as unknown as LocalPrefs)
        : null,
    [preferencesQuery.data, edits],
  )

  const updateLocalPref = <K extends LocalPrefKey>(key: K, value: LocalPrefs[K]) => {
    setEdits((current) => ({ ...current, [key]: value }))
    setHasChanges(true)
  }

  const handleSave = async () => {
    if (!localPrefs || guardDemoAction('Saving anomaly settings')) return
    try {
      await updateAnomalySettings.mutateAsync({
        anomaly_expense_threshold: localPrefs.anomaly_expense_threshold,
        anomaly_types_enabled: localPrefs.anomaly_types_enabled,
        auto_dismiss_recurring_anomalies: localPrefs.auto_dismiss_recurring_anomalies,
      })
      setHasChanges(false)
      setEdits({})
      toast.success('Anomaly settings saved')
    } catch {
      toast.error('Failed to save anomaly settings')
    }
  }

  if (preferencesQuery.isError) {
    return (
      <CollapsibleSection title="Anomaly Detection" icon={SlidersHorizontal} defaultExpanded>
        <ErrorState
          variant="compact"
          title="Unable to load detection settings"
          message="Retry before changing anomaly detection thresholds."
          onRetry={() => void preferencesQuery.refetch()}
        />
      </CollapsibleSection>
    )
  }

  if (!localPrefs) return null

  return (
    <CollapsibleSection title="Anomaly Detection" icon={SlidersHorizontal} defaultExpanded={false}>
      <AnomalyDetectionSubsection localPrefs={localPrefs} updateLocalPref={updateLocalPref} />
      <div className="flex items-center justify-end gap-3 pt-4">
        {hasChanges && (
          <span className="flex items-center gap-1.5 text-sm text-app-yellow">
            <span className="w-2 h-2 rounded-full bg-app-yellow animate-pulse" /> Unsaved
          </span>
        )}
        <Button
          type="button"
          icon={<Save className="w-4 h-4" />}
          onClick={() => void handleSave()}
          disabled={!hasChanges}
          isLoading={updateAnomalySettings.isPending}
        >
          Save
        </Button>
      </div>
    </CollapsibleSection>
  )
}
