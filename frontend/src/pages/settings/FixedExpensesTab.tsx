/**
 * Fixed Monthly Expenses Tab
 *
 * Drag-and-drop interface for marking expense categories as fixed/mandatory
 * monthly expenses (rent, EMIs, subscriptions, etc.).
 */

import { motion } from 'framer-motion'
import { GripVertical, X } from 'lucide-react'
import type { LocalPrefs } from './types'

interface FixedExpensesTabProps {
  localPrefs: LocalPrefs
  allExpenseCategories: string[]
  dragType: 'account' | 'category' | 'income-category' | null
  onDragStart: (item: string, type: 'account' | 'category' | 'income-category') => void
  onDragEnd: () => void
  onDragOver: (e: React.DragEvent) => void
  onDropOnFixedExpenses: () => void
  onRemoveFromFixedExpenses: (category: string) => void
}

/** Safely coerce the stored value (may be JSON string or array) to string[] */
function normalizeCategories(value: string[] | string): string[] {
  if (Array.isArray(value)) return value
  if (typeof value === 'string' && value.length > 0) {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}

export default function FixedExpensesTab({
  localPrefs,
  allExpenseCategories,
  dragType,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDropOnFixedExpenses,
  onRemoveFromFixedExpenses,
}: Readonly<FixedExpensesTabProps>) {
  const fixedCategories = normalizeCategories(localPrefs.fixed_expense_categories)

  // Available = all expense categories that are NOT already marked as fixed
  const availableCategories = allExpenseCategories.filter(
    (cat) => !fixedCategories.includes(cat)
  )

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-white">Fixed Monthly Expenses</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Drag expense categories from the left to mark them as fixed/mandatory monthly expenses
          (rent, EMIs, subscriptions, insurance, etc.)
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Available Categories - Source */}
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-muted-foreground"></span>
            Available Categories ({availableCategories.length})
          </h3>
          <div className="bg-white/5 border border-border rounded-xl p-4 min-h-[400px]">
            <div className="flex flex-wrap gap-2">
              {availableCategories.map((category) => (
                <motion.div
                  key={category}
                  draggable
                  onDragStart={() => onDragStart(category, 'category')}
                  onDragEnd={onDragEnd}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 border border-border-strong rounded-full cursor-move hover:bg-white/20 transition-colors"
                  whileHover={{ scale: 1.05 }}
                >
                  <GripVertical className="w-3 h-3 text-white/40" />
                  <span className="text-sm text-white">{category}</span>
                </motion.div>
              ))}
              {availableCategories.length === 0 && (
                <p className="text-text-tertiary text-sm">All categories marked as fixed expenses</p>
              )}
            </div>
          </div>
        </div>

        {/* Fixed Expenses Drop Zone */}
        <div className="lg:col-span-2 space-y-3">
          <h3 className="text-sm font-medium text-ios-orange flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-ios-orange"></span>
            Fixed Monthly Expenses ({fixedCategories.length})
          </h3>
          <section
            aria-label="Drop zone for fixed expense categories"
            onDragOver={onDragOver}
            onDrop={onDropOnFixedExpenses}
            className={`bg-white/5 rounded-xl border-2 border-dashed p-4 min-h-[400px] transition-colors ${
              dragType === 'category'
                ? 'border-ios-orange bg-ios-orange/10'
                : 'border-border-strong hover:border-border-strong'
            }`}
          >
            <div className="flex flex-wrap gap-2">
              {fixedCategories.map((category) => (
                <motion.div
                  key={category}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-ios-orange/20 border border-ios-orange/40 rounded-full"
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                >
                  <span className="text-sm text-ios-orange">{category}</span>
                  <button
                    onClick={() => onRemoveFromFixedExpenses(category)}
                    className="text-ios-orange hover:text-ios-red transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </motion.div>
              ))}
              {fixedCategories.length === 0 && (
                <div className="flex items-center justify-center w-full h-16 text-text-tertiary">
                  <p className="text-sm">Drop categories here to mark as fixed expenses</p>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
