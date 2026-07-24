/**
 * Notifications section - budget alerts, anomaly alerts, upcoming bills.
 */

import { Bell, Receipt, AlertTriangle, Clock } from 'lucide-react'
import type { LocalPrefs, LocalPrefKey } from '../types'
import { Section, Toggle, FieldLabel } from '../sectionPrimitives'
import { DAYS_AHEAD_OPTIONS } from '../helpers'

interface Props {
  index: number
  localPrefs: LocalPrefs
  updateLocalPref: <K extends LocalPrefKey>(key: K, value: LocalPrefs[K]) => void
}

export default function NotificationsSection({
  index,
  localPrefs,
  updateLocalPref,
}: Readonly<Props>) {
  return (
    <Section
      index={index}
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
              <p className="text-sm font-medium text-foreground">Budget Alerts</p>
              <p className="text-xs text-muted-foreground">
                Notify when spending approaches budget thresholds
              </p>
            </div>
          </div>
          <Toggle
            id="notify-budget-alerts"
            aria-label="Budget alerts"
            checked={localPrefs.notify_budget_alerts ?? true}
            onChange={(val) => updateLocalPref('notify_budget_alerts', val)}
          />
        </div>

        {/* Anomaly alerts */}
        <div className="flex items-center justify-between gap-4 py-3 border-b border-border">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-primary mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-foreground">Anomaly Alerts</p>
              <p className="text-xs text-muted-foreground">
                Notify when unusual spending patterns are detected
              </p>
            </div>
          </div>
          <Toggle
            id="notify-anomalies"
            aria-label="Anomaly alerts"
            checked={localPrefs.notify_anomalies ?? true}
            onChange={(val) => updateLocalPref('notify_anomalies', val)}
          />
        </div>

        {/* Upcoming bills */}
        <div className="flex items-center justify-between gap-4 py-3 border-b border-border">
          <div className="flex items-start gap-3">
            <Clock className="w-5 h-5 text-primary mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-foreground">Upcoming Bills</p>
              <p className="text-xs text-muted-foreground">
                Notify before recurring bills are due
              </p>
            </div>
          </div>
          <Toggle
            id="notify-upcoming-bills"
            aria-label="Upcoming bill alerts"
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
            className="ledger-control min-h-11 rounded-lg border border-border px-3 py-1.5 text-sm text-foreground focus:border-primary focus:outline-none sm:min-h-10"
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
  )
}
