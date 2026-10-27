/**
 * Demo answer for `GET /api/analytics/v2/anomalies`, built from the demo
 * transactions with the same detectors the backend runs: the baseline ones in
 * `demoAnomalyDetectors.ts`, the row checks in `demoAnomalyChecks.ts`.
 *
 * The envelope matches the handler: `type` / `severity` filter exactly,
 * reviewed and dismissed rows are hidden unless `include_reviewed` is true,
 * `limit` caps `data` (default 50, at most 200), and `count` / `summary` cover
 * every match. A large expense that is an entry of a demo recurring pattern is
 * auto-dismissed the way the backend's default setting files it. Missing
 * entries are not checked: the demo commitments are a fixed list rather than
 * patterns detected from the demo rows.
 */

import { getTodayKey } from '@/lib/dateKeys'
import type { Anomaly, AnomalySeverityValue } from '@/services/api/analyticsV2Anomalies'
import type { Transaction } from '@/types'

import { generateDemoRecurring } from './demoAnalyticsV2'
import { type ScheduleExplainer, unusualCategories } from './demoAnomalyCategories'
import { cleaned, duplicates, feeCharges } from './demoAnomalyChecks'
import {
  groupBy,
  highExpenseMonths,
  largeTransactions,
  largeTransfers,
  spendScale,
  type DemoFinding,
} from './demoAnomalyDetectors'

let demoPatterns: ReturnType<typeof generateDemoRecurring> | undefined

/** `RecurringIndex.match`: the demo pattern a row is an entry of, if any. */
function recurringMatch(t: Transaction) {
  demoPatterns ??= generateDemoRecurring()
  return demoPatterns.find(
    (p) =>
      p.is_active &&
      p.type === t.type &&
      p.name.toLowerCase() === cleaned(t.note).toLowerCase() &&
      Math.abs(t.amount - p.expected_amount) <= Math.max(2 * p.variance, 0.15 * p.expected_amount),
  )
}

const EVERY_MONTH = new Set(['daily', 'weekly', 'biweekly', 'monthly'])

/** `RecurringIndex.scheduled_share` for the unusual-category auto-dismiss. */
const explainBySchedule: ScheduleExplainer = (rows) => {
  const names: string[] = []
  let paid = 0
  for (const t of rows) {
    const pattern = recurringMatch(t)
    if (!pattern || EVERY_MONTH.has(pattern.frequency ?? '')) continue
    paid += t.amount
    if (!names.includes(pattern.name)) names.push(pattern.name)
  }
  return { paid, names }
}

/**
 * `_DISMISSIBLE`. Not large transfers: backend recurring patterns are only
 * income or expense, so a transfer never matches one.
 */
const DISMISSIBLE = new Set<DemoFinding['type']>(['high_expense'])

/** `auto_dismiss_matches`: a large expense that is a recurring entry. */
function autoDismiss(findings: DemoFinding[], byId: ReadonlyMap<string, Transaction>): void {
  for (const finding of findings) {
    const t = finding.transaction_id ? byId.get(finding.transaction_id) : undefined
    if (!DISMISSIBLE.has(finding.type) || !t || finding.autoDismiss) continue
    const match = recurringMatch(t)
    if (match) finding.autoDismiss = `Auto-dismissed: an entry of the recurring ${match.name}.`
  }
}

/** `anomaly_rules.cap_findings`: what one refresh keeps per type (25 when unlisted). */
const TYPE_CAPS: Partial<Record<DemoFinding['type'], number>> = {
  unusual_category: 20,
  large_transfer: 15,
  duplicate_suspected: 20,
  missing_recurring: 15,
}

function capPerType(findings: readonly DemoFinding[]): DemoFinding[] {
  const newest = (a: DemoFinding, b: DemoFinding) => b.when.localeCompare(a.when)
  const deviation = (a: DemoFinding, b: DemoFinding) => (b.deviation_pct ?? 0) - (a.deviation_pct ?? 0)
  const open = findings.filter((f) => !f.autoDismiss)
  const kept: DemoFinding[] = []
  for (const [type, rows] of groupBy(open, (f) => f.type)) {
    if (type === 'high_expense') {
      const months = rows.filter((f) => f.period_key).sort(deviation).slice(0, 25)
      const singles = rows.filter((f) => !f.period_key).sort(deviation)
      kept.push(...months, ...singles.slice(0, 50 - months.length))
    } else {
      kept.push(...[...rows].sort(newest).slice(0, TYPE_CAPS[type] ?? 25))
    }
  }
  const dismissed = findings.filter((f) => f.autoDismiss).sort(newest).slice(0, 25)
  return [...kept, ...dismissed]
}

function detect(txs: readonly Transaction[]): Anomaly[] {
  const expenses = txs.filter((t) => t.type === 'Expense')
  const scale = spendScale(expenses)
  const findings = [...highExpenseMonths(expenses), ...largeTransactions(expenses)]
  const singles = new Set(findings.flatMap((f) => (f.transaction_id ? [f.transaction_id] : [])))
  const transfers = txs.filter((t) => t.type === 'Transfer')
  findings.push(
    ...unusualCategories(expenses, scale, singles, explainBySchedule),
    ...largeTransfers(transfers, scale),
    ...duplicates(txs, scale),
    ...feeCharges(expenses),
  )
  autoDismiss(findings, new Map(txs.map((t) => [t.id, t])))
  const detectedAt = `${getTodayKey()}T06:00:00`
  return capPerType(findings).map(
    (f, index): Anomaly => ({
      id: index + 1,
      anomaly_type: f.type,
      severity: f.severity,
      description: f.description,
      transaction_id: f.transaction_id,
      period_key: f.period_key,
      expected_value: f.expected_value,
      actual_value: f.actual_value,
      deviation_pct: f.deviation_pct,
      detected_at: detectedAt,
      is_reviewed: f.autoDismiss !== undefined,
      is_dismissed: f.autoDismiss !== undefined,
      review_notes: f.autoDismiss ?? null,
      reviewed_at: null,
    }),
  )
}

const cache = new WeakMap<readonly Transaction[], Anomaly[]>()

/** A `DemoResolver` (`services/api/client.ts`); the URL adds nothing here. */
export function generateDemoAnomalyList(
  txs: Transaction[],
  params: Record<string, unknown>,
): { data: Anomaly[]; count: number; summary: Record<AnomalySeverityValue, number> } {
  let rows = cache.get(txs)
  if (!rows) {
    rows = detect(txs)
    cache.set(txs, rows)
  }
  if (params.type) rows = rows.filter((a) => a.anomaly_type === params.type)
  if (params.severity) rows = rows.filter((a) => a.severity === params.severity)
  if (params.include_reviewed !== true) rows = rows.filter((a) => !a.is_reviewed && !a.is_dismissed)
  const limit = Number(params.limit)
  const bySeverity = (severity: AnomalySeverityValue) =>
    rows.filter((a) => a.severity === severity).length
  return {
    data: rows.slice(0, Number.isInteger(limit) && limit >= 1 ? Math.min(limit, 200) : 50),
    count: rows.length,
    summary: { high: bySeverity('high'), medium: bySeverity('medium'), low: bySeverity('low') },
  }
}
