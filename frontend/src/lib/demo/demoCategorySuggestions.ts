/**
 * Demo twin of `GET /api/category-suggestions/status` (backend
 * `core/category_suggester_store.py`), built from the demo ledger: categorized
 * income and expense rows, and the most categories within one of the two types.
 *
 * The suggestions themselves come from a POST of unsaved upload rows, which
 * demo mode refuses (and file upload is blocked there), so only the status has
 * a twin.
 */
import type { Transaction } from '@/types'

const MIN_TRAINING_ROWS = 30
const MIN_CATEGORIES = 2
const CONFIDENCE_FLOOR = 0.5
/** Backend `PLACEHOLDER_LABELS`, sorted the way the status route sends them. */
const PLACEHOLDER_LABELS = [
  '', '-', '--', '?', 'general', 'misc', 'miscellaneous', 'n/a', 'na', 'none', 'null',
  'other', 'others', 'uncategorised', 'uncategorized', 'unknown',
]
const PLACEHOLDERS = new Set(PLACEHOLDER_LABELS)

const normalize = (value: string | null | undefined) =>
  (value ?? '').trim().split(/\s+/).join(' ').toLowerCase()

export function generateDemoCategorySuggestionStatus(txs: Transaction[]): unknown {
  const categories = { Income: new Set<string>(), Expense: new Set<string>() }
  let trainingRows = 0
  for (const tx of txs) {
    if (tx.type !== 'Income' && tx.type !== 'Expense') continue
    if (PLACEHOLDERS.has(normalize(tx.category)) && PLACEHOLDERS.has(normalize(tx.subcategory))) continue
    categories[tx.type].add(tx.category)
    trainingRows += 1
  }
  const categoryCount = Math.max(categories.Income.size, categories.Expense.size)
  return {
    ready: trainingRows >= MIN_TRAINING_ROWS && categoryCount >= MIN_CATEGORIES,
    training_rows: trainingRows,
    category_count: categoryCount,
    min_training_rows: MIN_TRAINING_ROWS,
    min_categories: MIN_CATEGORIES,
    confidence_floor: CONFIDENCE_FLOOR,
    placeholder_labels: PLACEHOLDER_LABELS,
  }
}
