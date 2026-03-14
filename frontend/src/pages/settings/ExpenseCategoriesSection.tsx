/**
 * Expense Categories section - toggle categories as essential or fixed.
 */

import { Tags } from 'lucide-react'
import type { LocalPrefs, LocalPrefKey } from './types'
import { Section } from './components'
import { normalizeArray } from './helpers'

interface Props {
  index: number
  allExpenseCategories: string[]
  localPrefs: LocalPrefs
  fixedCategories: string[]
  updateLocalPref: <K extends LocalPrefKey>(key: K, value: LocalPrefs[K]) => void
}

export default function ExpenseCategoriesSection({
  index,
  allExpenseCategories,
  localPrefs,
  fixedCategories,
  updateLocalPref,
}: Readonly<Props>) {
  const toggleEssentialCategory = (cat: string) => {
    const isEssential = localPrefs.essential_categories.includes(cat)
    updateLocalPref(
      'essential_categories',
      isEssential
        ? localPrefs.essential_categories.filter((c) => c !== cat)
        : [...localPrefs.essential_categories, cat],
    )
  }

  const toggleFixedCategory = (cat: string) => {
    const current = normalizeArray(localPrefs.fixed_expense_categories)
    const isFixed = current.includes(cat)
    updateLocalPref(
      'fixed_expense_categories',
      isFixed ? current.filter((c) => c !== cat) : [...current, cat],
    )
  }

  return (
    <Section
      index={index}
      icon={Tags}
      title="Expense Categories"
      description="Toggle categories as essential or fixed monthly expenses"
    >
      {allExpenseCategories.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No expense categories found. Import some transactions first.
        </p>
      ) : (
        <div className="space-y-2">
          {/* Legend */}
          <div className="flex items-center gap-4 mb-3">
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="w-3 h-3 rounded-sm bg-ios-green/30 border border-ios-green/50" />{' '}
              Essential
            </span>
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="w-3 h-3 rounded-sm bg-ios-orange/30 border border-ios-orange/50" />{' '}
              Fixed
            </span>
          </div>

          {/* Category grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1">
            {allExpenseCategories.map((cat) => {
              const isEssential = localPrefs.essential_categories.includes(cat)
              const isFixed = fixedCategories.includes(cat)

              return (
                <div
                  key={cat}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/5 transition-colors"
                >
                  <span className="text-sm text-white flex-1 truncate">{cat}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      title="Essential"
                      onClick={() => toggleEssentialCategory(cat)}
                      className={`w-6 h-6 rounded-md flex items-center justify-center transition-colors text-xs font-bold ${
                        isEssential
                          ? 'bg-ios-green/25 text-ios-green border border-ios-green/50'
                          : 'bg-white/5 text-white/30 border border-border hover:border-ios-green/30 hover:text-ios-green/60'
                      }`}
                    >
                      E
                    </button>
                    <button
                      type="button"
                      title="Fixed"
                      onClick={() => toggleFixedCategory(cat)}
                      className={`w-6 h-6 rounded-md flex items-center justify-center transition-colors text-xs font-bold ${
                        isFixed
                          ? 'bg-ios-orange/25 text-ios-orange border border-ios-orange/50'
                          : 'bg-white/5 text-white/30 border border-border hover:border-ios-orange/30 hover:text-ios-orange/60'
                      }`}
                    >
                      F
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Summary */}
          <div className="flex flex-wrap gap-4 pt-2 text-xs text-muted-foreground">
            <span>{localPrefs.essential_categories.length} essential</span>
            <span>{fixedCategories.length} fixed</span>
          </div>
        </div>
      )}
    </Section>
  )
}
