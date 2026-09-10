import type { FinancialGoal, UpdateGoalRequest } from '@/services/api/analyticsV2'

export const LEGACY_GOAL_STORAGE_KEYS = {
  allocations: 'ledger-sync-goal-allocations',
  overrides: 'ledger-sync-goal-overrides',
  hidden: 'ledger-sync-deleted-goals',
} as const

const REVIEW_PREFIX = 'ledger-sync-goal-recovery'
const MAX_AMOUNT = 9_999_999_999_999.99

type GoalValues = Pick<FinancialGoal, 'current_amount' | 'name' | 'target_amount' | 'target_date'>
export type RecoveryField = keyof GoalValues

export interface RecoveryChange {
  field: RecoveryField
  current: string | number | null
  value: string | number | null
  token: string
}

export interface LegacyGoalRecovery {
  goal: FinancialGoal
  changes: RecoveryChange[]
  hidden: boolean
  signature: string
}

export interface LegacyGoalData {
  allocations: Record<string, unknown>
  overrides: Record<string, unknown>
  hidden: unknown[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readJson(key: string): unknown {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) as unknown : null
  } catch {
    return null
  }
}

export function readLegacyGoalData(): LegacyGoalData {
  const allocations = readJson(LEGACY_GOAL_STORAGE_KEYS.allocations)
  const overrides = readJson(LEGACY_GOAL_STORAGE_KEYS.overrides)
  const hidden = readJson(LEGACY_GOAL_STORAGE_KEYS.hidden)
  return {
    allocations: isRecord(allocations) ? allocations : {},
    overrides: isRecord(overrides) ? overrides : {},
    hidden: Array.isArray(hidden) ? hidden as unknown[] : [],
  }
}

function isAmount(value: unknown, minimum: number): value is number {
  return typeof value === 'number' && Number.isFinite(value)
    && value >= minimum && value <= MAX_AMOUNT && Number(value.toFixed(2)) === value
}

function isCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return year > 0 && month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1]
}

function legacyValues(data: LegacyGoalData, goalId: number): Partial<GoalValues> {
  const values: Partial<GoalValues> = {}
  const allocation = data.allocations[String(goalId)]
  if (isAmount(allocation, 0)) values.current_amount = allocation

  const override = data.overrides[String(goalId)]
  if (!isRecord(override)) return values
  // HEAD stored the three detail fields together. Reject malformed records as a unit.
  if (typeof override.name !== 'string' || !override.name.trim()
    || override.name.trim().length > 255 || !isAmount(override.target_amount, 0.01)
    || !isCalendarDate(override.target_date)) return values

  return {
    ...values,
    name: override.name.trim(),
    target_amount: override.target_amount,
    target_date: override.target_date,
  }
}

function reviewKey(userId: number, goalId: number, field: RecoveryField | 'hidden'): string {
  return `${REVIEW_PREFIX}:${userId}:${goalId}:${field}`
}

function wasReviewed(userId: number, goalId: number, field: RecoveryField | 'hidden', token: string): boolean {
  try {
    return localStorage.getItem(reviewKey(userId, goalId, field)) === token
  } catch {
    return false
  }
}

export function goalRecoveryVersion(goal: FinancialGoal): string {
  return JSON.stringify([
    goal.id, goal.name, goal.goal_type, goal.current_amount, goal.target_amount,
    goal.target_date, goal.notes, goal.updated_at,
  ])
}

export function getLegacyGoalRecovery(
  goals: FinancialGoal[],
  userId: number,
  data: LegacyGoalData,
): LegacyGoalRecovery[] {
  return goals.flatMap((goal) => {
    if (!Number.isSafeInteger(goal.id) || goal.id <= 0) return []
    const values = legacyValues(data, goal.id)
    const changes = (Object.keys(values) as RecoveryField[]).flatMap((field) => {
      const value = values[field]
      if (value === undefined) return []
      const current = field === 'target_date' ? goal.target_date?.slice(0, 10) ?? null : goal[field]
      const token = JSON.stringify(value)
      if (value === current || wasReviewed(userId, goal.id, field, token)) return []
      return [{ field, current, value, token }]
    })
    const hidden = data.hidden.includes(goal.id) && !wasReviewed(userId, goal.id, 'hidden', 'true')
    if (!changes.length && !hidden) return []
    return [{
      goal,
      changes,
      hidden,
      signature: JSON.stringify([goalRecoveryVersion(goal), changes, hidden]),
    }]
  })
}

export function recoveryPatch(changes: RecoveryChange[]): UpdateGoalRequest {
  return Object.fromEntries(changes.map(({ field, value }) => [field, value]))
}

/**
 * Keep the original keys intact. Account/field acknowledgements make recovery
 * one-time without a read-modify-write that could erase another tab's edits.
 */
export function acknowledgeGoalRecovery(
  userId: number,
  recovery: LegacyGoalRecovery,
  changes: RecoveryChange[],
  includeHidden: boolean,
): boolean {
  const latest = readLegacyGoalData()
  const values = legacyValues(latest, recovery.goal.id)
  try {
    for (const change of changes) {
      if (JSON.stringify(values[change.field]) === change.token) {
        localStorage.setItem(reviewKey(userId, recovery.goal.id, change.field), change.token)
      }
    }
    if (includeHidden && latest.hidden.includes(recovery.goal.id)) {
      localStorage.setItem(reviewKey(userId, recovery.goal.id, 'hidden'), 'true')
    }
    return true
  } catch {
    return false
  }
}
