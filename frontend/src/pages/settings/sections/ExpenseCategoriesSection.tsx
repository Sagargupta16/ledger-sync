/**
 * Expense Categories section - toggle categories as essential or fixed.
 */

import { Tags } from 'lucide-react'
import EmptyState from '@/components/shared/EmptyState'
import type { LocalPrefs, LocalPrefKey } from '../types'
import { Section } from '../sectionPrimitives'
import { normalizeArray } from '../helpers'

interface Props {
  index: number
  allExpenseCategories: string[]
  localPrefs: LocalPrefs
  fixedCategories: string[]
  updateLocalPref: <K extends LocalPrefKey>(key: K, value: LocalPrefs[K]) => void
  defaultCollapsed?: boolean
}

export default function ExpenseCategoriesSection({
  index,
  allExpenseCategories,
  localPrefs,
  fixedCategories,
  updateLocalPref,
  defaultCollapsed = true,
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
      defaultCollapsed={defaultCollapsed}
    >
      {allExpenseCategories.length === 0 ? (
        <EmptyState
          variant="compact"
          icon={EmptyState.icons.upload}
          title="No expense categories yet"
          description="Upload your bank statements to see categories you can tag as essential or fixed."
          actionLabel="Upload transactions"
          actionHref="/upload"
        />
      ) : (
        <div className="space-y-2">
          {/* Legend */}
          <div className="flex items-center gap-4 mb-3">
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="w-3 h-3 rounded-sm bg-app-green/30 border border-app-green/50" />{' '}
              Essential
            </span>
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="w-3 h-3 rounded-sm bg-app-orange/30 border border-app-orange/50" />{' '}
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
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-[var(--overlay-2)] transition-colors"
                >
                  <span className="text-sm text-foreground flex-1 truncate">{cat}</span>
                  <div className="flex items-center gap-1 shrink-0 -my-2.5">
                    <button
                      id={`essential-category-${encodeURIComponent(cat)}`}
                      type="button"
                      title="Essential"
                      aria-label={`Mark ${cat} as essential`}
                      aria-pressed={isEssential}
                      onClick={() => toggleEssentialCategory(cat)}
                      className="min-w-[44px] min-h-[44px] flex items-center justify-center"
                    >
                      <span
                        className={`w-6 h-6 rounded-md flex items-center justify-center transition-colors text-xs font-bold ${
                          isEssential
                            ? 'bg-app-green/25 text-app-green border border-app-green/50'
                            : 'bg-[var(--overlay-2)] text-foreground/30 border border-border hover:border-app-green/30 hover:text-app-green/60'
                        }`}
                      >
                        E
                      </span>
                    </button>
                    <button
                      id={`fixed-category-${encodeURIComponent(cat)}`}
                      type="button"
                      title="Fixed"
                      aria-label={`Mark ${cat} as a fixed monthly expense`}
                      aria-pressed={isFixed}
                      onClick={() => toggleFixedCategory(cat)}
                      className="min-w-[44px] min-h-[44px] flex items-center justify-center"
                    >
                      <span
                        className={`w-6 h-6 rounded-md flex items-center justify-center transition-colors text-xs font-bold ${
                          isFixed
                            ? 'bg-app-orange/25 text-app-orange border border-app-orange/50'
                            : 'bg-[var(--overlay-2)] text-foreground/30 border border-border hover:border-app-orange/30 hover:text-app-orange/60'
                        }`}
                      >
                        F
                      </span>
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
