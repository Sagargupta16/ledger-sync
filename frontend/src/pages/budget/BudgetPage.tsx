import { motion } from 'framer-motion'
import {
  AlertTriangle,
  BarChart3,
  CheckCircle,
  PiggyBank,
  Plus,
  Target,
  TrendingDown,
} from 'lucide-react'

import { PageHeader } from '@/components/ui'
import { fadeUpItem, staggerContainer } from '@/constants/animations'
import { rawColors } from '@/constants/colors'
import { formatCurrency } from '@/lib/formatters'
import StatCard from '@/pages/year-in-review/components/StatCard'

import { AddBudgetForm } from './components/AddBudgetForm'
import { BudgetCharts } from './components/BudgetCharts'
import { BudgetRowItem } from './components/BudgetRowItem'
import { useBudget } from './useBudget'

export default function BudgetPage() {
  const m = useBudget()

  return (
    <div className="min-h-dvh p-4 md:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6 md:space-y-8">
        <PageHeader
          title="Budget Tracker"
          subtitle="Set limits and track spending by category"
          action={
            <div className="flex flex-wrap items-center justify-center gap-3">
              <div className="flex items-center gap-1 p-1 glass-thin rounded-xl" role="tablist">
                {(
                  [
                    ['category', 'Category'],
                    ['subcategory', 'Subcategory'],
                  ] as const
                ).map(([val, label]) => (
                  <motion.button
                    key={val}
                    role="tab"
                    aria-selected={m.viewMode === val}
                    onClick={() => m.setViewMode(val)}
                    className={`relative px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      m.viewMode === val
                        ? 'text-white'
                        : 'text-muted-foreground hover:text-white hover:bg-white/10'
                    }`}
                    whileTap={{ scale: 0.97 }}
                  >
                    {m.viewMode === val && (
                      <motion.div
                        layoutId="budgetViewTab"
                        className="absolute inset-0 rounded-lg"
                        style={{ backgroundColor: rawColors.app.green }}
                        initial={false}
                        transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                      />
                    )}
                    <span className="relative z-10">{label}</span>
                  </motion.button>
                ))}
              </div>
              <motion.button
                onClick={() => m.setIsAdding(true)}
                whileTap={{ scale: 0.97 }}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white transition-colors"
                style={{
                  background: `linear-gradient(135deg, ${rawColors.app.green}, ${rawColors.app.teal})`,
                }}
              >
                <Plus className="w-4 h-4" /> Add Budget
              </motion.button>
            </div>
          }
        />

        {m.summary.count > 0 && (
          <motion.div
            className="grid grid-cols-2 md:grid-cols-4 gap-5"
            initial="hidden"
            animate="visible"
            variants={staggerContainer}
          >
            <motion.div variants={fadeUpItem}>
              <StatCard
                label="Total Budget"
                value={formatCurrency(m.summary.totalBudget)}
                icon={Target}
                color={rawColors.app.blue}
              />
            </motion.div>
            <motion.div variants={fadeUpItem}>
              <StatCard
                label="Total Spent"
                value={formatCurrency(m.summary.totalSpent)}
                icon={TrendingDown}
                color={
                  m.summary.totalSpent > m.summary.totalBudget
                    ? rawColors.app.red
                    : rawColors.app.green
                }
              />
            </motion.div>
            <motion.div variants={fadeUpItem}>
              <StatCard
                label="On Track"
                value={String(m.summary.onTrack)}
                icon={CheckCircle}
                color={rawColors.app.green}
              />
            </motion.div>
            <motion.div variants={fadeUpItem}>
              <StatCard
                label="Exceeded"
                value={String(m.summary.exceeded)}
                icon={AlertTriangle}
                color={rawColors.app.red}
              />
            </motion.div>
          </motion.div>
        )}

        <AddBudgetForm
          isAdding={m.isAdding}
          setIsAdding={m.setIsAdding}
          viewMode={m.viewMode}
          formCategory={m.formCategory}
          setFormCategory={m.setFormCategory}
          formSubcategory={m.formSubcategory}
          setFormSubcategory={m.setFormSubcategory}
          formLimit={m.formLimit}
          setFormLimit={m.setFormLimit}
          budgetPeriod={m.budgetPeriod}
          setBudgetPeriod={m.setBudgetPeriod}
          availableCategories={m.availableCategories}
          allCategories={m.allCategories}
          subcategoriesForCategory={m.subcategoriesForCategory}
          onAdd={m.handleAdd}
        />

        {m.filteredRows.length > 0 ? (
          <>
            <BudgetCharts
              chartData={m.chartData}
              burndownData={m.burndownData}
              usageData={m.usageData}
            />

            <div className="space-y-3">
              {m.filteredRows.map((row) => {
                const key = row.subcategory ? `${row.category}::${row.subcategory}` : row.category
                return (
                  <BudgetRowItem
                    key={key}
                    row={row}
                    isEditing={m.editKey === key}
                    alertThreshold={m.alertThreshold}
                    isFixed={m.fixedExpenseCategories.has(key.toLowerCase())}
                    momentum={m.categoryMomentum.get(row.category)}
                    todayDayOfMonth={m.monthProgress.todayDay}
                    daysInMonth={m.monthProgress.daysInMonth}
                    onEdit={() => m.setEditKey(key)}
                    onCancelEdit={() => m.setEditKey(null)}
                    onSave={(limit, period) => {
                      m.setBudget(key, limit, period)
                      m.setEditKey(null)
                    }}
                    onDelete={() => m.removeBudget(key)}
                  />
                )
              })}
            </div>
          </>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="glass rounded-2xl border border-border p-12 text-center"
          >
            <PiggyBank className="w-16 h-16 text-text-quaternary mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No budgets set yet</h3>
            <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">
              Set spending limits for your categories to start tracking. We'll suggest limits based
              on your spending patterns.
            </p>
            <button
              onClick={() => m.setIsAdding(true)}
              className="px-5 py-2.5 rounded-xl text-sm font-medium text-white transition-colors"
              style={{ backgroundColor: rawColors.app.green }}
            >
              <Plus className="w-4 h-4 inline mr-1.5" /> Create Your First Budget
            </button>
          </motion.div>
        )}

        {m.availableCategories.length > 0 && m.filteredRows.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass rounded-2xl border border-border p-6"
          >
            <div className="flex items-center gap-2 mb-4">
              <BarChart3 className="w-5 h-5 text-muted-foreground" />
              <h3 className="text-sm font-medium">Suggested Budgets</h3>
              <span className="text-xs text-text-tertiary">Based on current spending</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {(() => {
                // Suggestions reflect the selected budget period: monthly uses
                // current-month spend (/mo), yearly uses fiscal-year spend (/yr).
                const isYearly = m.budgetPeriod === 'yearly'
                const periodSuffix = isYearly ? '/yr' : '/mo'
                const spendFor = (c: string) =>
                  isYearly
                    ? m.spendingData.byCategoryYearly[c] ||
                      m.spendingData.bySubcategoryYearly[c] ||
                      0
                    : m.spendingData.byCategory[c] || m.spendingData.bySubcategory[c] || 0
                return m.availableCategories
                  .filter((c) => spendFor(c) > 500)
                  .slice(0, 8)
                  .map((cat) => {
                    const spent = spendFor(cat)
                    const displayName = cat.includes('::') ? cat.split('::')[1] : cat
                    return (
                      <motion.button
                        key={cat}
                        onClick={() => m.handleQuickAdd(cat, spent)}
                        whileTap={{ scale: 0.95 }}
                        className="px-3 py-1.5 rounded-full text-xs font-medium transition-colors hover:scale-105"
                        style={{
                          backgroundColor: `${rawColors.app.green}15`,
                          color: rawColors.app.green,
                        }}
                      >
                        + {displayName} ({formatCurrency(spent)}
                        {periodSuffix})
                      </motion.button>
                    )
                  })
              })()}
            </div>
          </motion.div>
        )}
      </div>
    </div>
  )
}
