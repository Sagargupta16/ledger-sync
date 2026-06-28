import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'

import { rawColors } from '@/constants/colors'

import type { BudgetPeriod, ViewMode } from '../types'

interface AddBudgetFormProps {
  isAdding: boolean
  setIsAdding: (v: boolean) => void
  viewMode: ViewMode
  formCategory: string
  setFormCategory: (v: string) => void
  formSubcategory: string
  setFormSubcategory: (v: string) => void
  formLimit: string
  setFormLimit: (v: string) => void
  budgetPeriod: BudgetPeriod
  setBudgetPeriod: (v: BudgetPeriod) => void
  availableCategories: string[]
  allCategories: string[]
  subcategoriesForCategory: Record<string, string[]>
  onAdd: () => void
}

export function AddBudgetForm(props: Readonly<AddBudgetFormProps>) {
  const {
    isAdding,
    setIsAdding,
    viewMode,
    formCategory,
    setFormCategory,
    formSubcategory,
    setFormSubcategory,
    formLimit,
    setFormLimit,
    budgetPeriod,
    setBudgetPeriod,
    availableCategories,
    allCategories,
    subcategoriesForCategory,
    onAdd,
  } = props

  return (
    <AnimatePresence>
      {isAdding && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="glass rounded-2xl border border-border p-4 sm:p-6 overflow-hidden"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">New Budget</h3>
            <button
              onClick={() => setIsAdding(false)}
              aria-label="Close new budget form"
              className="p-2.5 sm:p-1.5 rounded-lg hover:bg-[var(--overlay-5)]"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex flex-wrap gap-4 items-end">
            {viewMode === 'category' ? (
              <div className="flex-1 min-w-0 sm:min-w-48">
                <label
                  htmlFor="budget-category"
                  className="text-xs text-muted-foreground mb-1 block"
                >
                  Category
                </label>
                <select
                  id="budget-category"
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg bg-surface-3 backdrop-blur-xl border border-border text-sm text-foreground cursor-pointer hover:bg-surface-hover transition-colors"
                >
                  <option value="">Select category</option>
                  {availableCategories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <>
                <div className="flex-1 min-w-0 sm:min-w-40">
                  <label
                    htmlFor="budget-cat-sub"
                    className="text-xs text-muted-foreground mb-1 block"
                  >
                    Category
                  </label>
                  <select
                    id="budget-cat-sub"
                    value={formCategory}
                    onChange={(e) => {
                      setFormCategory(e.target.value)
                      setFormSubcategory('')
                    }}
                    className="w-full px-3 py-2.5 rounded-lg bg-surface-3 backdrop-blur-xl border border-border text-sm text-foreground cursor-pointer hover:bg-surface-hover transition-colors"
                  >
                    <option value="">Select category</option>
                    {allCategories
                      .filter((c) => subcategoriesForCategory[c]?.length)
                      .map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                  </select>
                </div>
                <div className="flex-1 min-w-0 sm:min-w-40">
                  <label
                    htmlFor="budget-subcategory"
                    className="text-xs text-muted-foreground mb-1 block"
                  >
                    Subcategory
                  </label>
                  <select
                    id="budget-subcategory"
                    value={formSubcategory}
                    onChange={(e) => setFormSubcategory(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-lg bg-surface-3 backdrop-blur-xl border border-border text-sm text-foreground cursor-pointer hover:bg-surface-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:text-muted-foreground"
                    disabled={!formCategory}
                  >
                    <option value="">Select subcategory</option>
                    {(subcategoriesForCategory[formCategory] || []).map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            )}
            <div className="flex-1 min-w-28 sm:flex-none sm:w-36">
              <label htmlFor="budget-limit" className="text-xs text-muted-foreground mb-1 block">
                Limit (₹)
              </label>
              <input
                id="budget-limit"
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                value={formLimit}
                onChange={(e) => setFormLimit(e.target.value)}
                placeholder="Amount"
                className="w-full px-3 py-2.5 rounded-lg bg-surface-3 backdrop-blur-xl border border-border text-sm text-foreground placeholder:text-text-quaternary"
              />
            </div>
            <div className="flex-1 min-w-28 sm:flex-none sm:w-32">
              <label htmlFor="budget-period" className="text-xs text-muted-foreground mb-1 block">
                Period
              </label>
              <select
                id="budget-period"
                value={budgetPeriod}
                onChange={(e) => setBudgetPeriod(e.target.value as BudgetPeriod)}
                className="w-full px-3 py-2.5 rounded-lg bg-surface-3 backdrop-blur-xl border border-border text-sm text-foreground cursor-pointer hover:bg-surface-hover transition-colors"
              >
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
              </select>
            </div>
            <button
              onClick={onAdd}
              disabled={!formCategory || !formLimit}
              className="w-full sm:w-auto px-5 py-2.5 rounded-lg text-sm font-medium text-foreground disabled:opacity-40 transition-colors"
              style={{ backgroundColor: rawColors.app.green }}
            >
              Add
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
