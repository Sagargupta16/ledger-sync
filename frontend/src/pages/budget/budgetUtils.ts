import { rawColors } from '@/constants/colors'

import type { BudgetRow } from './types'

export const STATUS_CONFIG = {
  safe: {
    color: rawColors.app.green,
    bg: 'bg-app-green/10',
    border: 'border-app-green/20',
    text: 'text-app-green',
  },
  warning: {
    color: rawColors.app.yellow,
    bg: 'bg-app-yellow/10',
    border: 'border-app-yellow/20',
    text: 'text-app-yellow',
  },
  danger: {
    color: rawColors.app.orange,
    bg: 'bg-app-orange/10',
    border: 'border-app-orange/20',
    text: 'text-app-orange',
  },
  exceeded: {
    color: rawColors.app.red,
    bg: 'bg-app-red/10',
    border: 'border-app-red/20',
    text: 'text-app-red',
  },
} as const

export function buildStatus(pct: number, alertThreshold: number): BudgetRow['status'] {
  if (pct >= 100) return 'exceeded'
  if (pct >= alertThreshold) return 'danger'
  if (pct >= alertThreshold * 0.75) return 'warning'
  return 'safe'
}
