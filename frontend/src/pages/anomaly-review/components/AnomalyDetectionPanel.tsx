import { Save, SlidersHorizontal } from 'lucide-react'

import ErrorState from '@/components/shared/ErrorState'
import LoadingSkeleton from '@/components/shared/LoadingSkeleton'
import { Button, CollapsibleSection } from '@/components/ui'
import AnomalyDetectionSubsection from '@/pages/settings/sections/AnomalyDetectionSubsection'

import { useAnomalyDetectionSettings } from '../useAnomalyDetectionSettings'
import AnomalyTypeToggles from './AnomalyTypeToggles'

export default function AnomalyDetectionPanel() {
  const settings = useAnomalyDetectionSettings()
  const { preferencesQuery, localPrefs } = settings

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

  if (preferencesQuery.isPending) {
    return (
      <div className="ledger-panel space-y-3 p-4" aria-busy="true">
        <span className="sr-only">Loading anomaly detection settings</span>
        <LoadingSkeleton className="h-5 w-48" />
        <LoadingSkeleton className="h-10 w-full" />
      </div>
    )
  }

  if (!localPrefs) return null

  return (
    <CollapsibleSection title="Anomaly Detection" icon={SlidersHorizontal} defaultExpanded={false}>
      <div className="space-y-5">
        <AnomalyDetectionSubsection
          localPrefs={localPrefs}
          updateLocalPref={settings.updateLocalPref}
        />
        <p className="text-xs leading-5 text-muted-foreground">
          The threshold also sets how far a category&apos;s month must sit above its typical
          month to count as unusual.
        </p>
        <AnomalyTypeToggles
          enabled={settings.enabledTypes}
          autoDismiss={localPrefs.auto_dismiss_recurring_anomalies}
          onTypeChange={settings.setTypeEnabled}
          onAutoDismissChange={(on) =>
            settings.updateLocalPref('auto_dismiss_recurring_anomalies', on)
          }
        />
      </div>
      <div className="flex items-center justify-end gap-3 pt-4">
        {settings.hasChanges && (
          <span className="flex items-center gap-1.5 text-sm text-app-yellow">
            <span className="w-2 h-2 rounded-full bg-app-yellow animate-pulse" /> Unsaved
          </span>
        )}
        <Button
          type="button"
          icon={<Save className="w-4 h-4" />}
          onClick={() => void settings.handleSave()}
          disabled={!settings.hasChanges}
          isLoading={settings.isSaving}
        >
          Save
        </Button>
      </div>
    </CollapsibleSection>
  )
}
