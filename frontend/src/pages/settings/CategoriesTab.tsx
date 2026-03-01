/**
 * Categories Tab (Grouped)
 *
 * Combines three sections under collapsible panels:
 * 1. Essential Categories (drag-and-drop via DragDropCategoryList)
 * 2. Fixed Monthly Expenses (drag-and-drop via DragDropCategoryList)
 * 3. Income Classification (inline from IncomeClassificationTab)
 */

import { motion } from 'framer-motion'
import { TrendingUp, Receipt, DollarSign, GripVertical, X } from 'lucide-react'
import CollapsibleSection from '@/components/ui/CollapsibleSection'
import DragDropCategoryList from './DragDropCategoryList'
import type { LocalPrefs, IncomeClassificationType } from './types'
import { INCOME_CLASSIFICATION_TYPES, INCOME_CLASSIFICATION_KEY_MAP } from './types'

interface CategoriesTabProps {
  localPrefs: LocalPrefs
  allExpenseCategories: string[]
  allIncomeCategories: Record<string, string[]>
  dragType: 'account' | 'category' | 'income-category' | null
  onDragStart: (item: string, type: 'account' | 'category' | 'income-category') => void
  onDragEnd: () => void
  onDragOver: (e: React.DragEvent) => void
  // Essential categories handlers
  onDropOnEssential: () => void
  onRemoveFromEssential: (category: string) => void
  // Fixed expenses handlers
  onDropOnFixedExpenses: () => void
  onRemoveFromFixedExpenses: (category: string) => void
  // Income classification handlers
  onDropOnIncomeClassification: (classificationType: IncomeClassificationType) => void
  onRemoveIncomeClassification: (classificationType: IncomeClassificationType, item: string) => void
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

export default function CategoriesTab({
  localPrefs,
  allExpenseCategories,
  allIncomeCategories,
  dragType,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDropOnEssential,
  onRemoveFromEssential,
  onDropOnFixedExpenses,
  onRemoveFromFixedExpenses,
  onDropOnIncomeClassification,
  onRemoveIncomeClassification,
}: Readonly<CategoriesTabProps>) {
  const fixedCategories = normalizeCategories(localPrefs.fixed_expense_categories)

  // ---------------------------------------------------------------------------
  // Income Classification logic
  // ---------------------------------------------------------------------------
  const getUnclassifiedIncomeSubcategories = () => {
    const allClassified = new Set<string>([
      ...localPrefs.taxable_income_categories,
      ...localPrefs.investment_returns_categories,
      ...localPrefs.non_taxable_income_categories,
      ...localPrefs.other_income_categories,
    ])

    return Object.entries(allIncomeCategories).flatMap(([cat, subs]) =>
      subs.map((sub) => `${cat}::${sub}`).filter((item) => !allClassified.has(item)),
    )
  }

  const parseIncomeItem = (item: string) => {
    const [category, subcategory] = item.split('::')
    return { category, subcategory, display: subcategory || category }
  }

  const unclassifiedSubcategories = getUnclassifiedIncomeSubcategories()

  return (
    <div className="space-y-4">
      {/* Section 1: Essential Categories */}
      <CollapsibleSection
        title="Essential Categories"
        icon={TrendingUp}
        defaultExpanded={true}
        badge={localPrefs.essential_categories.length}
      >
        <DragDropCategoryList
          title="Essential Categories"
          description="Drag expense categories from the left to mark them as essential (non-discretionary)"
          availableCategories={allExpenseCategories}
          selectedCategories={localPrefs.essential_categories}
          accentColor="ios-green"
          dragType={dragType}
          activeDragType="category"
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onDragOver={onDragOver}
          onDrop={onDropOnEssential}
          onRemove={onRemoveFromEssential}
        />
      </CollapsibleSection>

      {/* Section 2: Fixed Monthly Expenses */}
      <CollapsibleSection
        title="Fixed Monthly Expenses"
        icon={Receipt}
        defaultExpanded={true}
        badge={fixedCategories.length}
      >
        <DragDropCategoryList
          title="Fixed Monthly Expenses"
          description="Drag expense categories from the left to mark them as fixed/mandatory monthly expenses (rent, EMIs, subscriptions, insurance, etc.)"
          availableCategories={allExpenseCategories}
          selectedCategories={fixedCategories}
          accentColor="ios-orange"
          dragType={dragType}
          activeDragType="category"
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onDragOver={onDragOver}
          onDrop={onDropOnFixedExpenses}
          onRemove={onRemoveFromFixedExpenses}
        />
      </CollapsibleSection>

      {/* Section 3: Income Classification */}
      <CollapsibleSection
        title="Income Classification"
        icon={DollarSign}
        defaultExpanded={true}
        badge={
          localPrefs.taxable_income_categories.length +
          localPrefs.investment_returns_categories.length +
          localPrefs.non_taxable_income_categories.length +
          localPrefs.other_income_categories.length
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Classify your income subcategories by tax treatment. Drag items from the left into the
            appropriate classification box.
          </p>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Available Income Subcategories - Source */}
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-muted-foreground"></span>
                Unclassified Income ({unclassifiedSubcategories.length})
              </h3>
              <div className="bg-white/5 border border-border rounded-xl p-4 min-h-[400px]">
                {/* Group by parent category */}
                {Object.entries(allIncomeCategories).map(([category, subs]) => {
                  const unclassifiedSubs = subs.filter((sub) =>
                    unclassifiedSubcategories.includes(`${category}::${sub}`),
                  )
                  if (unclassifiedSubs.length === 0) return null
                  return (
                    <div key={category} className="mb-4">
                      <p className="text-xs text-text-tertiary mb-2 font-medium">{category}</p>
                      <div className="flex flex-wrap gap-2">
                        {unclassifiedSubs.map((sub) => (
                          <motion.div
                            key={`${category}::${sub}`}
                            draggable
                            onDragStart={() =>
                              onDragStart(`${category}::${sub}`, 'income-category')
                            }
                            onDragEnd={onDragEnd}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 border border-border-strong rounded-full cursor-move hover:bg-white/20 transition-colors"
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
                  <p className="text-text-tertiary text-sm">All income subcategories classified</p>
                )}
              </div>
            </div>

            {/* Income Classification Drop Zones */}
            <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
              {INCOME_CLASSIFICATION_TYPES.map((classType) => {
                const targetKey =
                  INCOME_CLASSIFICATION_KEY_MAP[classType.value as IncomeClassificationType]
                const items = localPrefs[targetKey]

                return (
                  <section
                    key={classType.value}
                    aria-label={`Drop zone for ${classType.label}`}
                    onDragOver={onDragOver}
                    onDrop={() =>
                      onDropOnIncomeClassification(classType.value as IncomeClassificationType)
                    }
                    className={`bg-white/5 rounded-xl border-2 border-dashed p-4 transition-colors min-h-[180px] ${
                      dragType === 'income-category'
                        ? 'border-border-strong bg-white/10'
                        : 'border-border-strong hover:border-border-strong'
                    }`}
                  >
                    <div
                      className={`bg-gradient-to-r ${classType.color} rounded-lg px-3 py-2 mb-2`}
                    >
                      <h4 className="text-sm font-semibold text-white">{classType.label}</h4>
                    </div>
                    <p className="text-xs text-muted-foreground mb-3">{classType.description}</p>
                    <div className="flex flex-wrap gap-2">
                      {items.map((item) => {
                        const { display } = parseIncomeItem(item)
                        return (
                          <motion.div
                            key={item}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 border border-border-strong rounded-full"
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                          >
                            <span className="text-sm text-white">{display}</span>
                            <button
                              onClick={() =>
                                onRemoveIncomeClassification(
                                  classType.value as IncomeClassificationType,
                                  item,
                                )
                              }
                              className="text-muted-foreground hover:text-ios-red transition-colors"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </motion.div>
                        )
                      })}
                      {items.length === 0 && (
                        <div className="flex items-center justify-center w-full h-16 text-text-tertiary">
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
      </CollapsibleSection>
    </div>
  )
}
