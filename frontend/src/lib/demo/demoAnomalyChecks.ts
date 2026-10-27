/**
 * Demo ports of the backend's row checks over the demo transactions: fee and
 * interest charges (`core/analytics/anomaly_fee_patterns.py`) and possible
 * duplicates (`anomaly_ledger_checks.py`). Same patterns and gates.
 */

import { medianOf } from '@/lib/distribution'
import type { AnomalySeverityValue } from '@/services/api/analyticsV2Anomalies'
import type { Transaction } from '@/types'

import {
  dayIndex,
  groupBy,
  money,
  MONTH_NAMES,
  monthIndex,
  type DemoFinding,
} from './demoAnomalyDetectors'

/** `anomaly_fee_patterns.FEE_PATTERNS`: change the two together. */
const FEE_PATTERNS: readonly (readonly [string, RegExp, AnomalySeverityValue])[] = [
  ['Late payment fee', /\b(?:late\s*(?:payment\s*)?|overdue\s*)(?:fees?|charges?|penalty)\b/i, 'high'],
  [
    'Finance charge or card interest',
    /\bfinance\s*charges?\b|\b(?:card|cc|revolving|overdue)\s*interest\b|\binterest\s*(?:charged\s*)?on\s*(?:card|credit\s*card|outstanding|dues|overdue)\b/i,
    'high',
  ],
  [
    'Forex markup',
    /\b(?:(?:forex|fx|dcc)(?:\s*conversion)?|cross[\s-]*currency|currency\s*conversion|foreign(?:\s*(?:currency|exchange))?(?:\s*(?:transaction|txn))?|(?:international|intl)\s*(?:transaction|txn))\s*(?:mark[\s-]*up|fees?|charges?)\b|\bmark[\s-]*up\s*(?:fees?|charges?)\b/i,
    'medium',
  ],
  [
    'Card annual fee',
    /\b(?:card|cc)\s*(?:(?:fees?|charges?)\s*)?(?:annual|renewal|joining)\s*fees?\b|\b(?:annual|renewal|joining)\s*fees?\s*(?:[-:(,]\s*|(?:for|on|of)\s+)(?:(?!(?:via|by|using|with|through|paid)\b)\w+\s+){0,3}card\b/i,
    'medium',
  ],
]
/** `anomaly_fee_patterns._REVERSAL`: a waived, reversed or refunded charge is not one. */
const REVERSAL = /\b(?:waiv(?:er|ed)|revers(?:al|ed)|refund(?:ed)?)\b/i
/** `SCAN_CHARS`: the patterns read a bounded, whitespace-collapsed text. */
const SCAN_CHARS = 300

const PLACEHOLDERS = new Set(['unknown', 'miscellaneous', 'misc', 'other', 'n/a', 'na', '-'])
export const cleaned = (note?: string) => (note ?? '').split(/\s+/).filter(Boolean).join(' ')
/** "14 Sep 2026", the backend's `%d %b %Y`. */
const dayLabel = (date: string) =>
  `${date.slice(8, 10)} ${MONTH_NAMES[Number(date.slice(5, 7)) - 1]} ${date.slice(0, 4)}`

export function feeCharges(expenses: readonly Transaction[]): DemoFinding[] {
  return expenses.flatMap((t): DemoFinding[] => {
    const joined = [t.category, t.subcategory, t.note].filter(Boolean).join(' ')
    const text = cleaned(joined).slice(0, SCAN_CHARS)
    const hit = REVERSAL.test(text) ? undefined : FEE_PATTERNS.find(([, p]) => p.test(text))
    if (!hit) return []
    const [label, , severity] = hit
    return [
      {
        type: 'fee_charge',
        severity: severity === 'high' ? 'high' : 'medium',
        description: `${label} on ${t.account}: ${money(t.amount)} (${t.category}) on ${dayLabel(t.date)}`,
        transaction_id: t.id,
        period_key: t.date.slice(0, 7),
        expected_value: null,
        actual_value: t.amount,
        deviation_pct: null,
        when: t.date,
      },
    ]
  })
}

/** `_is_suspect` in `anomaly_ledger_checks.py`: a double entry, not a habit. */
function isSuspect(gap: number, others: readonly number[], amount: number, typicalMonth: number) {
  const typical = medianOf(others)
  if (gap === 0) return others.length === 0 || typical >= 8
  if (amount >= 0.05 * typicalMonth) return others.length === 0 || typical >= 12
  const spread = medianOf(others.map((g) => Math.abs(g - typical)))
  return others.length >= 2 && typical >= 20 && spread <= 0.25 * typical
}

export function duplicates(rows: readonly Transaction[], scale: (m: number) => number): DemoFinding[] {
  const keyed = rows.filter((t) => {
    const note = cleaned(t.note).toLowerCase()
    return note && !PLACEHOLDERS.has(note) && t.amount >= 0.005 * scale(monthIndex(t.date))
  })
  const key = (t: Transaction) =>
    [t.type, t.account, t.from_account, t.to_account, t.amount, cleaned(t.note).toLowerCase()].join('|')
  return [...groupBy(keyed, key).values()].flatMap((group) => {
    const sorted = [...group].sort((a, b) => a.date.localeCompare(b.date))
    const gaps = sorted.slice(1).map((t, i) => dayIndex(t.date) - dayIndex(sorted[i].date))
    return gaps.flatMap((gap, i): DemoFinding[] => {
      const [first, second] = [sorted[i], sorted[i + 1]]
      const others = gaps.filter((_, j) => j !== i)
      if (gap > 3 || !isSuspect(gap, others, second.amount, scale(monthIndex(second.date)))) return []
      const when =
        gap === 0
          ? `twice on ${dayLabel(second.date)}`
          : `on ${dayLabel(first.date)} and ${dayLabel(second.date)}`
      return [
        {
          type: 'duplicate_suspected',
          severity: gap === 0 ? 'high' : 'medium',
          description: `Possible duplicate on ${second.account}: ${money(second.amount)} for ${cleaned(second.note)} ${when}`,
          transaction_id: second.id,
          period_key: second.date.slice(0, 7),
          expected_value: null,
          actual_value: second.amount,
          deviation_pct: null,
          when: second.date,
        },
      ]
    })
  })
}
