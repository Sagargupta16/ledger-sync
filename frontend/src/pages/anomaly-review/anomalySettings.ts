/**
 * How `anomaly_types_enabled` turns into the detectors that run.
 *
 * The mirror of `enabled_anomaly_types` in
 * `backend/src/ledger_sync/core/analytics/anomaly_rules.py`; change both
 * together so the toggles show what the engine will do.
 *
 * - Unset, or exactly the four the old grid offered (the column default and the
 *   reset value): every detector runs.
 * - A list naming none of the newer types came from that old grid: it is
 *   honoured for those four and every newer type stays on.
 * - Anything else is a complete allow-list. This panel always writes
 *   `closed_account_activity`, which it keeps on, so its lists take this branch.
 */

import { ANOMALY_TYPE_VALUES, type AnomalyTypeValue } from '@/services/api/analyticsV2Anomalies'

import { ANOMALY_TYPE_ORDER } from './typeCopy'

const LEGACY_TOGGLE_TYPES: readonly AnomalyTypeValue[] = [
  'high_expense',
  'unusual_category',
  'large_transfer',
  'budget_exceeded',
]

/** A data check that stays on; its presence marks a list saved by this panel. */
export const ALWAYS_ON_TYPE: AnomalyTypeValue = 'closed_account_activity'

/** The types the panel offers a switch for, in display order. */
export const TOGGLE_ORDER: readonly AnomalyTypeValue[] = ANOMALY_TYPE_ORDER.filter(
  (type) => type !== ALWAYS_ON_TYPE,
)

function isAnomalyType(value: unknown): value is AnomalyTypeValue {
  return (ANOMALY_TYPE_VALUES as readonly unknown[]).includes(value)
}

export function resolveEnabledTypes(
  stored: readonly unknown[] | null | undefined,
): Set<AnomalyTypeValue> {
  if (!Array.isArray(stored)) return new Set(ANOMALY_TYPE_VALUES)
  const named = new Set(stored.filter(isAnomalyType))
  const isLegacyDefault =
    named.size === LEGACY_TOGGLE_TYPES.length && LEGACY_TOGGLE_TYPES.every((t) => named.has(t))
  if (isLegacyDefault) return new Set(ANOMALY_TYPE_VALUES)
  const newer = ANOMALY_TYPE_VALUES.filter((type) => !LEGACY_TOGGLE_TYPES.includes(type))
  if (!newer.some((type) => named.has(type))) newer.forEach((type) => named.add(type))
  return named
}

/** The list to save: enabled types in a stable order, the always-on check included. */
export function serializeEnabledTypes(enabled: ReadonlySet<AnomalyTypeValue>): string[] {
  return ANOMALY_TYPE_VALUES.filter((type) => type === ALWAYS_ON_TYPE || enabled.has(type))
}
