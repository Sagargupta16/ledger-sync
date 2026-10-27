import type { ReactNode } from 'react'
import { Lock } from 'lucide-react'

import { Toggle } from '@/pages/settings/sectionPrimitives'
import type { AnomalyTypeValue } from '@/services/api/analyticsV2Anomalies'

import { ALWAYS_ON_TYPE, TOGGLE_ORDER } from '../anomalySettings'
import { anomalyTypeLabel } from '../constants'
import { reviewCopy } from '../typeCopy'

interface Props {
  enabled: ReadonlySet<AnomalyTypeValue>
  autoDismiss: boolean
  onTypeChange: (type: AnomalyTypeValue, on: boolean) => void
  onAutoDismissChange: (on: boolean) => void
}

function Row({
  label,
  hint,
  control,
}: Readonly<{ label: string; hint: string; control: ReactNode }>) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border py-2 last:border-b-0">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-xs leading-5 text-muted-foreground">{hint}</p>
      </div>
      {control}
    </div>
  )
}

/**
 * Which detectors run, and whether findings a recurring pattern explains are
 * dismissed automatically. Closed-account activity is a data check and stays
 * on, so its row shows a lock instead of a switch.
 */
export default function AnomalyTypeToggles({
  enabled,
  autoDismiss,
  onTypeChange,
  onAutoDismissChange,
}: Readonly<Props>) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium text-foreground">Detectors</h3>
        <div className="mt-1 grid grid-cols-1 gap-x-6 md:grid-cols-2">
          {TOGGLE_ORDER.map((type) => (
            <Row
              key={type}
              label={anomalyTypeLabel(type)}
              hint={reviewCopy(type).explanation}
              control={
                <Toggle
                  id={`anomaly-type-${type}`}
                  aria-label={`${anomalyTypeLabel(type)} detector`}
                  checked={enabled.has(type)}
                  onChange={(on) => onTypeChange(type, on)}
                />
              }
            />
          ))}
          <Row
            label={anomalyTypeLabel(ALWAYS_ON_TYPE)}
            hint={reviewCopy(ALWAYS_ON_TYPE).explanation}
            control={
              <span className="inline-flex min-h-11 shrink-0 items-center gap-1 text-xs text-text-tertiary">
                <Lock className="h-3.5 w-3.5" aria-hidden />
                Always on
              </span>
            }
          />
        </div>
      </div>
      <Row
        label="Auto-dismiss recurring matches"
        hint="A large expense that is an entry of a recurring pattern, or a category month explained by a bill on a longer-than-monthly schedule, is filed as dismissed with a note."
        control={
          <Toggle
            id="anomaly-auto-dismiss"
            aria-label="Auto-dismiss findings that match a recurring pattern"
            checked={autoDismiss}
            onChange={onAutoDismissChange}
          />
        }
      />
    </div>
  )
}
