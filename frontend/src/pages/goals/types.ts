import type { GoalProjectionResult } from '@/lib/finance/goalProjection'

export type { GoalDeadlineState } from '@/lib/finance/goalProjection'

export interface GoalProjection extends GoalProjectionResult {
  statusLabel: string
  statusColor: string
}

export type GoalDetails = {
  name: string
  goal_type: string
  target_amount: number
  target_date: string | null
  notes: string | null
}
