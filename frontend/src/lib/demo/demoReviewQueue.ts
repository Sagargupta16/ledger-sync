import type {
  ReviewableType,
  ReviewCategoryOption,
  ReviewItem,
  ReviewQueue,
  ReviewSuggestion,
} from '@/services/api/reviewQueue'
import { addDaysToKey, getTodayKey } from '@/lib/dateUtils'
import type { Transaction } from '@/types'

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 50
const DEFAULT_DAYS = 30

type Reviewable = Transaction & { type: ReviewableType }

const isReviewable = (t: Transaction): t is Reviewable => t.type === 'Income' || t.type === 'Expense'
const labelKey = (category: string, subcategory: string | null | undefined) =>
  `${category}::${subcategory ?? ''}`

function boundedInt(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Number(value)
  return Number.isInteger(parsed) ? Math.min(Math.max(parsed, min), max) : fallback
}

function categoryOptions(rows: readonly Reviewable[]): ReviewCategoryOption[] {
  const byKey = new Map<string, { option: ReviewCategoryOption; subs: Map<string, number> }>()
  for (const t of rows) {
    const key = `${t.type}::${t.category}`
    const entry = byKey.get(key) ?? {
      option: { type: t.type, category: t.category, subcategories: [], count: 0 },
      subs: new Map<string, number>(),
    }
    entry.option.count += 1
    if (t.subcategory) entry.subs.set(t.subcategory, (entry.subs.get(t.subcategory) ?? 0) + 1)
    byKey.set(key, entry)
  }
  return [...byKey.values()]
    .map(({ option, subs }) => ({
      ...option,
      subcategories: [...subs.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name),
    }))
    .sort((a, b) => a.type.localeCompare(b.type) || b.count - a.count || a.category.localeCompare(b.category))
}

/**
 * Stand-in for the per-user suggester: the labels other rows of the same type
 * on the same account carry most often, as a share of those rows.
 */
function suggestionsFor(item: Reviewable, rows: readonly Reviewable[]): ReviewSuggestion[] {
  const own = labelKey(item.category, item.subcategory)
  const counts = new Map<string, { category: string; subcategory: string | null; count: number }>()
  let total = 0
  for (const t of rows) {
    if (t.type !== item.type || t.account !== item.account || t.id === item.id) continue
    total += 1
    const key = labelKey(t.category, t.subcategory)
    const entry = counts.get(key) ?? { category: t.category, subcategory: t.subcategory ?? null, count: 0 }
    entry.count += 1
    counts.set(key, entry)
  }
  return [...counts.entries()]
    .filter(([key]) => key !== own)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 2)
    .map(([, { category, subcategory, count }]) => ({
      category,
      subcategory,
      confidence: Math.round((count / total) * 1000) / 1000,
    }))
}

/**
 * Mirrors GET /api/review-queue on the demo ledger. Demo decisions are not
 * saved, so the queue is the newest batch only: `remaining` is that batch.
 * Fits the demo route table's `(txs, params, url)` resolver; the URL adds nothing.
 */
export function generateDemoReviewQueue(txs: Transaction[], params: Record<string, unknown>): ReviewQueue {
  const limit = boundedInt(params.limit, DEFAULT_LIMIT, 1, MAX_LIMIT)
  const days = boundedInt(params.days, DEFAULT_DAYS, 7, 366)
  const rows = txs.filter(isReviewable)
  const categories = categoryOptions(rows)
  const newest = rows.reduce<string | null>((max, t) => (max === null || t.date > max ? t.date : max), null)
  if (newest === null) {
    return { items: [], remaining: 0, reviewed: 0, window_start: null, window_days: days, categories }
  }
  const today = getTodayKey()
  // The window ends on the newest row's day, or today; later rows wait for their day.
  const anchor = newest.slice(0, 10) < today ? newest.slice(0, 10) : today
  const start = addDaysToKey(anchor, -(days - 1))
  const items: ReviewItem[] = rows
    .filter((t) => t.date.slice(0, 10) >= start && t.date.slice(0, 10) <= anchor)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, limit)
    .map((t) => ({
      transaction_id: t.id,
      date: t.date.slice(0, 10),
      amount: Math.abs(t.amount),
      type: t.type,
      account: t.account,
      category: t.category,
      subcategory: t.subcategory || null,
      note: t.note || null,
      suggestions: suggestionsFor(t, rows),
    }))
  return {
    items,
    remaining: items.length,
    reviewed: 0,
    window_start: start,
    window_days: days,
    categories,
  }
}
