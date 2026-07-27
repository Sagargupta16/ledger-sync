import {
  AlertCircle,
  AlertTriangle,
  Archive,
  ArrowRightLeft,
  CalendarX,
  Copy,
  HelpCircle,
  Info,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react'

import { rawColors } from '@/constants/colors'
import type { Anomaly, AnomalySeverityValue, AnomalyTypeValue } from '@/services/api/analyticsV2'
import { ANOMALY_TYPE_VALUES, EMITTED_ANOMALY_TYPES } from '@/services/api/analyticsV2'

/**
 * The single label/icon/style vocabulary for anomalies.
 *
 * Every map here is an exhaustive `Record` over the backend enum, so adding an
 * `AnomalyType` member to `ANOMALY_TYPE_VALUES` fails type-check HERE instead of
 * rendering `undefined` in a className at runtime. Read them through the
 * accessors below, never by direct index: `severity` is a free-text `String(20)`
 * column on the backend, so a value outside the known set can reach the browser,
 * and `SEVERITY_STYLES[unknown].bg` throws rather than degrading.
 */
export const ANOMALY_TYPE_LABELS: Record<AnomalyTypeValue, string> = {
  high_expense: 'High Expense',
  unusual_category: 'Unusual Category',
  large_transfer: 'Large Transfer',
  duplicate_suspected: 'Possible Duplicate',
  missing_recurring: 'Missing Recurring',
  budget_exceeded: 'Budget Exceeded',
  closed_account_activity: 'Closed Account Activity',
}

export const ANOMALY_TYPE_ICONS: Record<AnomalyTypeValue, LucideIcon> = {
  high_expense: TrendingUp,
  unusual_category: HelpCircle,
  large_transfer: ArrowRightLeft,
  duplicate_suspected: Copy,
  missing_recurring: CalendarX,
  budget_exceeded: AlertTriangle,
  closed_account_activity: Archive,
}

export const SEVERITY_LABELS: Record<AnomalySeverityValue, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
}

export const SEVERITY_ICONS: Record<AnomalySeverityValue, LucideIcon> = {
  high: AlertTriangle,
  medium: AlertCircle,
  low: Info,
}

export interface SeverityStyle {
  bg: string
  text: string
  border: string
  iconColor: string
}

export const SEVERITY_STYLES: Record<AnomalySeverityValue, SeverityStyle> = {
  high: {
    bg: 'bg-app-red/15',
    text: 'text-app-red',
    border: 'border-app-red/20',
    iconColor: rawColors.app.red,
  },
  medium: {
    bg: 'bg-app-orange/15',
    text: 'text-app-orange',
    border: 'border-app-orange/20',
    iconColor: rawColors.app.orange,
  },
  low: {
    bg: 'bg-app-yellow/15',
    text: 'text-app-yellow',
    border: 'border-app-yellow/20',
    iconColor: rawColors.app.yellow,
  },
}

/** Neutral chip for a severity the backend invented after this build shipped. */
const UNKNOWN_SEVERITY_STYLE: SeverityStyle = {
  bg: 'bg-[var(--overlay-5)]',
  text: 'text-muted-foreground',
  border: 'border-border',
  iconColor: rawColors.chart.neutral,
}

/**
 * Human label for a wire `anomaly_type`.
 *
 * Falls back to the raw value rather than an empty string: a snake_case token is
 * ugly but still tells the user WHICH kind of finding this row is, whereas the
 * blank the old direct index produced told them nothing.
 */
export function anomalyTypeLabel(type: Anomaly['anomaly_type']): string {
  return ANOMALY_TYPE_LABELS[type] ?? type
}

export function anomalyTypeIcon(type: Anomaly['anomaly_type']): LucideIcon {
  return ANOMALY_TYPE_ICONS[type] ?? AlertCircle
}

export function severityIcon(severity: Anomaly['severity']): LucideIcon {
  return SEVERITY_ICONS[severity] ?? Info
}

export function severityStyle(severity: Anomaly['severity']): SeverityStyle {
  return SEVERITY_STYLES[severity] ?? UNKNOWN_SEVERITY_STYLE
}

/**
 * Options for the anomaly-type filter, derived from the label map so the two can
 * never drift.
 *
 * Only the types a detector actually writes are offered:
 * `core/analytics/anomalies.py` emits three of the seven enum members, so a chip
 * for `unusual_category`, `large_transfer`, `duplicate_suspected` or
 * `missing_recurring` would filter to an empty list every time. The maps above
 * still cover all seven because a row written by a future detector must render.
 */
export const ANOMALY_TYPE_FILTER_OPTIONS: readonly { value: string; label: string }[] = [
  { value: '', label: 'All Types' },
  ...ANOMALY_TYPE_VALUES.filter((type) =>
    (EMITTED_ANOMALY_TYPES as readonly string[]).includes(type),
  ).map((type) => ({ value: type, label: ANOMALY_TYPE_LABELS[type] })),
]

export const DETECTED_AT_OPTIONS: Intl.DateTimeFormatOptions = {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
}
