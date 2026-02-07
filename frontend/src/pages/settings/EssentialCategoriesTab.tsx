/**
 * Essential Categories Tab
 *
 * Drag-and-drop interface for marking expense categories as essential
 * (non-discretionary spending).
 */

import { motion } from 'framer-motion'
import { GripVertical, X } from 'lucide-react'
import type { LocalPrefs } from './types'

interface EssentialCategoriesTabProps {
  localPrefs: LocalPrefs
  allExpenseCategories: string[]
  dragType: 'account' | 'category' | 'income-category' | null
  onDragStart: (item: string, type: 'account' | 'category' | 'income-category') => void
  onDragEnd: () => void
  onDragOver: (e: React.DragEvent) => void
  onDropOnEssential: () => void
  onRemoveFromEssential: (category: string) => void
}

export default function EssentialCategoriesTab({
  localPrefs,
  allExpenseCategories,
  dragType,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDropOnEssential,
  onRemoveFromEssential,
}: EssentialCategoriesTabProps) {
  // Get available expense categories (not yet marked as essential)
  const availableEssentialCategories = allExpenseCategories.filter(
    (cat) => !localPrefs.essential_categories.includes(cat)
  )

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-white">Essential Categories</h2>
        <p className="text-sm text-gray-400 mt-1">
          Drag expense categories from the left to mark them as essential (non-discretionary)
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Available Categories - Source */}
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-gray-400 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-gray-500"></span>
            Available Categories ({availableEssentialCategories.length})
          </h3>
          <div className="bg-white/5 border border-white/10 rounded-xl p-4 min-h-[400px]">
            <div className="flex flex-wrap gap-2">
              {availableEssentialCategories.map((category) => (
                <motion.div
                  key={category}
                  draggable
                  onDragStart={() => onDragStart(category, 'category')}
                  onDragEnd={onDragEnd}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 border border-white/20 rounded-full cursor-move hover:bg-white/20 transition-all"
                  whileHover={{ scale: 1.05 }}
                >
                  <GripVertical className="w-3 h-3 text-white/40" />
                  <span className="text-sm text-white">{category}</span>
                </motion.div>
              ))}
              {availableEssentialCategories.length === 0 && (
                <p className="text-gray-500 text-sm">All categories marked as essential</p>
              )}
            </div>
          </div>
        </div>

        {/* Essential Categories Drop Zone */}
        <div className="lg:col-span-2 space-y-3">
          <h3 className="text-sm font-medium text-emerald-400 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            Essential Categories ({localPrefs.essential_categories.length})
          </h3>
          <div
            onDragOver={onDragOver}
            onDrop={onDropOnEssential}
            className={`bg-white/5 rounded-xl border-2 border-dashed p-4 min-h-[400px] transition-all ${
              dragType === 'category'
                ? 'border-emerald-400 bg-emerald-500/10'
                : 'border-white/20 hover:border-white/30'
            }`}
          >
            <div className="flex flex-wrap gap-2">
              {localPrefs.essential_categories.map((category) => (
                <motion.div
                  key={category}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/20 border border-emerald-500/40 rounded-full"
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                >
                  <span className="text-sm text-emerald-300">{category}</span>
                  <button
                    onClick={() => onRemoveFromEssential(category)}
                    className="text-emerald-300 hover:text-red-400 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </motion.div>
              ))}
              {localPrefs.essential_categories.length === 0 && (
                <div className="flex items-center justify-center w-full h-16 text-gray-500">
                  <p className="text-sm">Drop categories here</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
