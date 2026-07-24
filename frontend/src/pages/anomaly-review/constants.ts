import {
  AlertCircle,
  AlertTriangle,
  Archive,
  ArrowRightLeft,
  HelpCircle,
  Info,
  TrendingUp,
} from 'lucide-react'

import { rawColors } from '@/constants/colors'
import type { Anomaly } from '@/hooks/api/useAnalyticsV2'

export const ANOMALY_TYPE_LABELS: Record<Anomaly['anomaly_type'], string> = {
  high_expense: 'High Expense',
  unusual_category: 'Unusual Category',
  large_transfer: 'Large Transfer',
  budget_exceeded: 'Budget Exceeded',
  closed_account_activity: 'Closed Account Activity',
}

export const ANOMALY_TYPE_ICONS: Record<Anomaly['anomaly_type'], typeof TrendingUp> = {
  high_expense: TrendingUp,
  unusual_category: HelpCircle,
  large_transfer: ArrowRightLeft,
  budget_exceeded: AlertTriangle,
  closed_account_activity: Archive,
}

export const SEVERITY_ICONS: Record<Anomaly['severity'], typeof AlertTriangle> = {
  high: AlertTriangle,
  medium: AlertCircle,
  low: Info,
}

export const SEVERITY_STYLES: Record<
  Anomaly['severity'],
  { bg: string; text: string; border: string; iconColor: string }
> = {
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

export const DETECTED_AT_OPTIONS: Intl.DateTimeFormatOptions = {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
}
