export interface GoalProjection {
  monthsRemaining: number
  requiredMonthlySavings: number | null
  projectedDate: Date | null
  monthsToComplete: number | null
  status: 'achieved' | 'on_track' | 'slightly_behind' | 'behind' | 'no_data'
  statusLabel: string
  statusColor: string
  monthsDelta: number | null // positive = ahead of schedule
}

export type GoalOverride = {
  name: string
  target_amount: number
  target_date: string
}
