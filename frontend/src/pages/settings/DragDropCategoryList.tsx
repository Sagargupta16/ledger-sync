/**
 * DragDropCategoryList
 *
 * Shared drag-and-drop two-panel component used by Essential Categories
 * and Fixed Monthly Expenses sections. Left panel shows available items
 * with drag handles; right panel is the drop zone with remove buttons.
 */

import { motion } from 'framer-motion'
import { GripVertical, X } from 'lucide-react'

interface DragDropCategoryListProps {
  readonly title: string
  readonly description: string
  readonly availableCategories: string[]
  readonly selectedCategories: string[]
  readonly accentColor: string
  readonly dragType: 'account' | 'category' | 'income-category' | null
  readonly activeDragType: 'category'
  readonly onDragStart: (item: string, type: 'account' | 'category' | 'income-category') => void
  readonly onDragEnd: () => void
  readonly onDragOver: (e: React.DragEvent) => void
  readonly onDrop: () => void
  readonly onRemove: (category: string) => void
}

export default function DragDropCategoryList({
  title,
  description,
  availableCategories,
  selectedCategories,
  accentColor,
  dragType,
  activeDragType,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  onRemove,
}: DragDropCategoryListProps) {
  // Items available to drag (not yet in selected list)
  const available = availableCategories.filter((cat) => !selectedCategories.includes(cat))

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Available Categories - Source */}
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-muted-foreground"></span>
            Available Categories ({available.length})
          </h3>
          <div className="bg-white/5 border border-border rounded-xl p-4 min-h-[200px]">
            <div className="flex flex-wrap gap-2">
              {available.map((category) => (
                <motion.div
                  key={category}
                  draggable
                  onDragStart={() => onDragStart(category, activeDragType)}
                  onDragEnd={onDragEnd}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 border border-border-strong rounded-full cursor-move hover:bg-white/20 transition-colors"
                  whileHover={{ scale: 1.05 }}
                >
                  <GripVertical className="w-3 h-3 text-white/40" />
                  <span className="text-sm text-white">{category}</span>
                </motion.div>
              ))}
              {available.length === 0 && (
                <p className="text-text-tertiary text-sm">All categories assigned</p>
              )}
            </div>
          </div>
        </div>

        {/* Selected Categories Drop Zone */}
        <div className="lg:col-span-2 space-y-3">
          <h3 className={`text-sm font-medium text-${accentColor} flex items-center gap-2`}>
            <span className={`w-2 h-2 rounded-full bg-${accentColor}`}></span>
            {title} ({selectedCategories.length})
          </h3>
          <section
            aria-label={`Drop zone for ${title.toLowerCase()}`}
            onDragOver={onDragOver}
            onDrop={onDrop}
            className={`bg-white/5 rounded-xl border-2 border-dashed p-4 min-h-[200px] transition-colors ${
              dragType === activeDragType
                ? `border-${accentColor} bg-${accentColor}/10`
                : 'border-border-strong hover:border-border-strong'
            }`}
          >
            <div className="flex flex-wrap gap-2">
              {selectedCategories.map((category) => (
                <motion.div
                  key={category}
                  className={`flex items-center gap-1.5 px-3 py-1.5 bg-${accentColor}/20 border border-${accentColor}/40 rounded-full`}
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                >
                  <span className={`text-sm text-${accentColor}`}>{category}</span>
                  <button
                    onClick={() => onRemove(category)}
                    className={`text-${accentColor} hover:text-ios-red transition-colors`}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </motion.div>
              ))}
              {selectedCategories.length === 0 && (
                <div className="flex items-center justify-center w-full h-16 text-text-tertiary">
                  <p className="text-sm">Drop categories here</p>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
