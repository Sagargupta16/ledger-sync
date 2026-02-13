/**
 * Income Classification Tab
 *
 * Drag-and-drop interface for classifying income subcategories by
 * tax treatment (taxable, investment returns, cashbacks, other).
 */

import { motion } from 'framer-motion'
import { GripVertical, X } from 'lucide-react'
import type { LocalPrefs, IncomeClassificationType } from './types'
import { INCOME_CLASSIFICATION_TYPES, INCOME_CLASSIFICATION_KEY_MAP } from './types'

interface IncomeClassificationTabProps {
  localPrefs: LocalPrefs
  allIncomeCategories: Record<string, string[]>
  dragType: 'account' | 'category' | 'income-category' | null
  onDragStart: (item: string, type: 'account' | 'category' | 'income-category') => void
  onDragEnd: () => void
  onDragOver: (e: React.DragEvent) => void
  onDropOnIncomeClassification: (classificationType: IncomeClassificationType) => void
  onRemoveIncomeClassification: (
    classificationType: IncomeClassificationType,
    item: string
  ) => void
}

export default function IncomeClassificationTab({
  localPrefs,
  allIncomeCategories,
  dragType,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDropOnIncomeClassification,
  onRemoveIncomeClassification,
}: Readonly<IncomeClassificationTabProps>) {
  // Get income subcategories that haven't been classified yet
  // Returns array of "Category::Subcategory" strings
  const getUnclassifiedIncomeSubcategories = () => {
    const allClassified = new Set<string>([
      ...localPrefs.taxable_income_categories,
      ...localPrefs.investment_returns_categories,
      ...localPrefs.non_taxable_income_categories,
      ...localPrefs.other_income_categories,
    ])

    // Return "Category::Subcategory" strings that haven't been classified yet
    return Object.entries(allIncomeCategories).flatMap(([cat, subs]) =>
      subs
        .map((sub) => `${cat}::${sub}`)
        .filter((item) => !allClassified.has(item))
    )
  }

  // Helper to parse "Category::Subcategory" and get display name
  const parseIncomeItem = (item: string) => {
    const [category, subcategory] = item.split('::')
    return { category, subcategory, display: subcategory || category }
  }

  const unclassifiedSubcategories = getUnclassifiedIncomeSubcategories()

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-white">Income Classification</h2>
        <p className="text-sm text-gray-400 mt-1">
          Classify your income subcategories by tax treatment. Drag items from the left into the
          appropriate classification box.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Available Income Subcategories - Source */}
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-gray-400 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-gray-500"></span>
            Unclassified Income ({unclassifiedSubcategories.length})
          </h3>
          <div className="bg-white/5 border border-white/10 rounded-xl p-4 min-h-[400px]">
            {/* Group by parent category */}
            {Object.entries(allIncomeCategories).map(([category, subs]) => {
              const unclassifiedSubs = subs.filter((sub) =>
                unclassifiedSubcategories.includes(`${category}::${sub}`)
              )
              if (unclassifiedSubs.length === 0) return null
              return (
                <div key={category} className="mb-4">
                  <p className="text-xs text-gray-500 mb-2 font-medium">{category}</p>
                  <div className="flex flex-wrap gap-2">
                    {unclassifiedSubs.map((sub) => (
                      <motion.div
                        key={`${category}::${sub}`}
                        draggable
                        onDragStart={() =>
                          onDragStart(`${category}::${sub}`, 'income-category')
                        }
                        onDragEnd={onDragEnd}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 border border-white/20 rounded-full cursor-move hover:bg-white/20 transition-all"
                        whileHover={{ scale: 1.05 }}
                      >
                        <GripVertical className="w-3 h-3 text-white/40" />
                        <span className="text-sm text-white">{sub}</span>
                      </motion.div>
                    ))}
                  </div>
                </div>
              )
            })}
            {unclassifiedSubcategories.length === 0 && (
              <p className="text-gray-500 text-sm">All income subcategories classified</p>
            )}
          </div>
        </div>

        {/* Income Classification Drop Zones */}
        <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
          {INCOME_CLASSIFICATION_TYPES.map((classType) => {
            const targetKey = INCOME_CLASSIFICATION_KEY_MAP[classType.value as IncomeClassificationType]
            const items = localPrefs[targetKey]

            return (
              <section
                key={classType.value}
                aria-label={`Drop zone for ${classType.label}`}
                onDragOver={onDragOver}
                onDrop={() =>
                  onDropOnIncomeClassification(
                    classType.value as IncomeClassificationType
                  )
                }
                className={`bg-white/5 rounded-xl border-2 border-dashed p-4 transition-all min-h-[180px] ${
                  dragType === 'income-category'
                    ? 'border-white/40 bg-white/10'
                    : 'border-white/20 hover:border-white/30'
                }`}
              >
                <div
                  className={`bg-gradient-to-r ${classType.color} rounded-lg px-3 py-2 mb-2`}
                >
                  <h4 className="text-sm font-semibold text-white">{classType.label}</h4>
                </div>
                <p className="text-xs text-gray-400 mb-3">{classType.description}</p>
                <div className="flex flex-wrap gap-2">
                  {items.map((item) => {
                    const { display } = parseIncomeItem(item)
                    return (
                      <motion.div
                        key={item}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 border border-white/20 rounded-full"
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                      >
                        <span className="text-sm text-white">{display}</span>
                        <button
                          onClick={() =>
                            onRemoveIncomeClassification(
                              classType.value as IncomeClassificationType,
                              item
                            )
                          }
                          className="text-gray-400 hover:text-red-400 transition-colors"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </motion.div>
                    )
                  })}
                  {items.length === 0 && (
                    <div className="flex items-center justify-center w-full h-16 text-gray-500">
                      <p className="text-sm">Drop income types here</p>
                    </div>
                  )}
                </div>
              </section>
            )
          })}
        </div>
      </div>
    </div>
  )
}
