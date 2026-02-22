/**
 * Notification Preferences Tab
 *
 * Toggle switches for budget alerts, anomaly alerts, and upcoming bills,
 * plus a dropdown for how many days ahead to notify for bills.
 */

import { Bell, AlertTriangle, Receipt, Clock } from 'lucide-react'
import type { LocalPrefs, LocalPrefKey } from './types'

interface NotificationPreferencesTabProps {
  localPrefs: LocalPrefs
  updateLocalPref: <K extends LocalPrefKey>(key: K, value: LocalPrefs[K]) => void
}

const DAYS_AHEAD_OPTIONS = [
  { value: 3, label: '3 days' },
  { value: 5, label: '5 days' },
  { value: 7, label: '7 days' },
  { value: 14, label: '14 days' },
]

interface ToggleRowProps {
  readonly id: string
  readonly icon: React.ElementType
  readonly label: string
  readonly description: string
  readonly checked: boolean
  readonly onChange: (checked: boolean) => void
}

function ToggleRow({ id, icon: Icon, label, description, checked, onChange }: ToggleRowProps) {
  return (
    <div className="flex items-center justify-between gap-4 py-4 border-b border-border last:border-b-0">
      <div className="flex items-start gap-3">
        <Icon className="w-5 h-5 text-primary mt-0.5" />
        <div>
          <label htmlFor={id} className="text-sm font-medium text-white cursor-pointer">
            {label}
          </label>
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        </div>
      </div>
      <button
        id={id}
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
    </div>
  )
}

export default function NotificationPreferencesTab({
  localPrefs,
  updateLocalPref,
}: Readonly<NotificationPreferencesTabProps>) {
  return (
    <div className="space-y-8">
      <h2 className="text-xl font-semibold text-white">Notification Preferences</h2>

      {/* Toggle Switches Section */}
      <div className="glass rounded-lg p-5 border border-border">
        <h3 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
          <Bell className="w-5 h-5 text-primary" />
          Alerts &amp; Notifications
        </h3>
        <p className="text-sm text-muted-foreground mb-4">
          Choose which notifications you want to receive.
        </p>

        <div className="divide-y divide-border">
          <ToggleRow
            id="notify-budget-alerts"
            icon={Receipt}
            label="Budget Alerts"
            description="Notify when spending approaches or exceeds your budget thresholds."
            checked={localPrefs.notify_budget_alerts ?? true}
            onChange={(val) => updateLocalPref('notify_budget_alerts', val)}
          />
          <ToggleRow
            id="notify-anomalies"
            icon={AlertTriangle}
            label="Anomaly Alerts"
            description="Notify when unusual spending patterns or anomalies are detected."
            checked={localPrefs.notify_anomalies ?? true}
            onChange={(val) => updateLocalPref('notify_anomalies', val)}
          />
          <ToggleRow
            id="notify-upcoming-bills"
            icon={Clock}
            label="Upcoming Bills"
            description="Notify before recurring bills and fixed expenses are due."
            checked={localPrefs.notify_upcoming_bills ?? true}
            onChange={(val) => updateLocalPref('notify_upcoming_bills', val)}
          />
        </div>
      </div>

      {/* Days Ahead Section */}
      <div className="glass rounded-lg p-5 border border-border">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Clock className="w-5 h-5 text-primary" />
          Bill Reminder Timing
        </h3>
        <div className="max-w-sm space-y-3">
          <label htmlFor="notify-days-ahead" className="block text-sm font-medium text-foreground">
            Notify Before Due Date
          </label>
          <select
            id="notify-days-ahead"
            value={localPrefs.notify_days_ahead ?? 7}
            onChange={(e) => updateLocalPref('notify_days_ahead', Number(e.target.value))}
            className="w-full px-4 py-2 bg-white/5 border border-border-strong rounded-lg text-white focus:border-primary"
          >
            {DAYS_AHEAD_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value} className="bg-background">
                {opt.label}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">
            How many days before a recurring bill is due should you be notified. Default: 7 days
          </p>
        </div>
      </div>
    </div>
  )
}
