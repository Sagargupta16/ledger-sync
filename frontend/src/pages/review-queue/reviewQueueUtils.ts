import type { ReviewCategoryOption, ReviewItem, ReviewQueue } from '@/services/api/reviewQueue'

import type { CategoryLabel, ReviewProgressCounts } from './types'

/** Cards brought back by Undo (latest first), then the batch, minus decided rows. */
export function openItems(
  batch: readonly ReviewItem[],
  restored: readonly ReviewItem[],
  decided: ReadonlySet<string>,
): ReviewItem[] {
  const seen = new Set<string>()
  const open: ReviewItem[] = []
  for (const item of [...restored, ...batch]) {
    if (decided.has(item.transaction_id) || seen.has(item.transaction_id)) continue
    seen.add(item.transaction_id)
    open.push(item)
  }
  return open
}

/**
 * Reviewed rows of the window right now. The server counted at read time; a
 * decision on this batch adds one, and a card undone from an earlier batch
 * (reviewed when this batch was read) takes one away.
 */
export function progressCounts(
  queue: ReviewQueue,
  decided: ReadonlySet<string>,
  restored: readonly ReviewItem[],
): ReviewProgressCounts {
  const total = queue.remaining + queue.reviewed
  const inBatch = new Set(queue.items.map((item) => item.transaction_id))
  const decidedHere = queue.items.filter((item) => decided.has(item.transaction_id)).length
  const reopened = restored.filter(
    (item) => !inBatch.has(item.transaction_id) && !decided.has(item.transaction_id),
  ).length
  const reviewed = Math.min(total, Math.max(0, queue.reviewed + decidedHere - reopened))
  return { reviewed, total, windowDays: queue.window_days }
}

/** Categories of the row's own type, most used first (the server's order). */
export function optionsFor(
  categories: readonly ReviewCategoryOption[],
  item: ReviewItem,
): ReviewCategoryOption[] {
  return categories.filter((option) => option.type === item.type)
}

export function sameLabel(a: CategoryLabel, b: CategoryLabel): boolean {
  return a.category === b.category && (a.subcategory ?? null) === (b.subcategory ?? null)
}

export function labelText(label: CategoryLabel): string {
  return label.subcategory ? `${label.category} · ${label.subcategory}` : label.category
}

/** True while typing, so single-letter shortcuts never steal a keystroke. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
}
