import { motion, AnimatePresence } from 'framer-motion'
import { TrendingUp, TrendingDown, Equal, Upload, Lightbulb } from 'lucide-react'
import { rawColors } from '@/constants/colors'
import EmptyState from '@/components/shared/EmptyState'
import { PageHeader } from '@/components/ui'
import { useComparisonData } from './useComparisonData'
import { PeriodSelector } from './components/PeriodSelector'
import { KpiCard } from './components/KpiCard'
import { OverviewMetricRow } from './components/OverviewMetricRow'
import { QuickStat } from './components/QuickStat'
import { SpendingDistribution } from './components/SpendingDistribution'
import { CategorySection } from './components/CategorySection'

export default function ComparisonPage() {
  const {
    isLoading, transactions,
    mode, setMode,
    monthOptions, yearOptions, fyOptions,
    effectiveMonthA, effectiveMonthB,
    yearA, yearB, fyA, fyB,
    setMonthA, setMonthB, setYearA, setYearB, setFyA, setFyB,
    periodA, periodB,
    expenseDeltas, incomeDeltas,
    distributionA, distributionB,
    insights,
  } = useComparisonData()

  if (isLoading) {
    return (
      <div className="p-4 md:p-6 lg:p-8 space-y-6 md:space-y-8">
        <div className="h-10 w-72 bg-white/5 rounded-xl animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6">
          {['income', 'expenses', 'savings', 'rate'].map((name) => (
            <div key={`skel-${name}`} className="h-48 bg-white/5 rounded-2xl animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  if (transactions.length === 0) {
    return (
      <div className="p-4 md:p-8">
        <EmptyState
          title="No transactions yet"
          description="Upload your Excel data to start comparing periods."
          icon={Upload}
        />
      </div>
    )
  }

  const overviewMax = Math.max(periodA.income, periodB.income, periodA.expense, periodB.expense, 1)

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-6 md:space-y-8">
      {/* Header */}
      <PageHeader
        title="Period Comparison"
        subtitle="Compare financial metrics across time periods"
        action={
          <div className="flex items-center gap-1 p-1 glass-thin rounded-xl" role="tablist">
            {([['month', 'Month'], ['year', 'Year'], ['fy', 'FY']] as const).map(([val, label]) => (
              <motion.button
                key={val}
                role="tab"
                aria-selected={mode === val}
                onClick={() => setMode(val)}
                className={`relative px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  mode === val ? 'text-white' : 'text-muted-foreground hover:text-white hover:bg-white/10'
                }`}
                whileTap={{ scale: 0.97 }}
              >
                {mode === val && (
                  <motion.div
                    layoutId="comparisonModeTab"
                    className="absolute inset-0 rounded-lg"
                    style={{ backgroundColor: rawColors.app.indigo }}
                    initial={false}
                    transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                  />
                )}
                <span className="relative z-10">{label}</span>
              </motion.button>
            ))}
          </div>
        }
      />

      {/* Period Selectors */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass rounded-2xl border border-border p-6"
      >
        <div className="flex flex-col sm:flex-row items-center gap-4 justify-center">
          <PeriodSelector
            mode={mode} label="Period A"
            monthOptions={monthOptions} yearOptions={yearOptions} fyOptions={fyOptions}
            month={effectiveMonthA} year={yearA} fy={fyA}
            onMonth={setMonthA} onYear={setYearA} onFy={setFyA}
          />
          <div className="flex items-center gap-2 text-muted-foreground">
            <Equal className="w-5 h-5" />
            <span className="text-sm font-medium">vs</span>
          </div>
          <PeriodSelector
            mode={mode} label="Period B"
            monthOptions={monthOptions} yearOptions={yearOptions} fyOptions={fyOptions}
            month={effectiveMonthB} year={yearB} fy={fyB}
            onMonth={setMonthB} onYear={setYearB} onFy={setFyB}
          />
        </div>
      </motion.div>

      {/* KPI Overview */}
      <AnimatePresence mode="wait">
        <motion.div
          key={`${periodA.label}-${periodB.label}`}
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5"
        >
          <KpiCard title="Income" valueA={periodA.income} valueB={periodB.income} labelA={periodA.label} labelB={periodB.label} color={rawColors.app.green} />
          <KpiCard title="Expenses" valueA={periodA.expense} valueB={periodB.expense} labelA={periodA.label} labelB={periodB.label} color={rawColors.app.red} invertChange />
          <KpiCard title="Savings" valueA={periodA.savings} valueB={periodB.savings} labelA={periodA.label} labelB={periodB.label} color={rawColors.app.blue} />
          <KpiCard title="Savings Rate" valueA={periodA.savingsRate} valueB={periodB.savingsRate} labelA={periodA.label} labelB={periodB.label} color={rawColors.app.purple} isPercent />
        </motion.div>
      </AnimatePresence>

      {/* Financial Overview */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass rounded-2xl border border-border p-4 md:p-6">
        <h2 className="text-lg font-semibold mb-4">Financial Overview</h2>
        <div className="space-y-6">
          <OverviewMetricRow label="Income" valueA={periodA.income} valueB={periodB.income} labelA={periodA.label} labelB={periodB.label} color={rawColors.app.green} maxValue={overviewMax} />
          <OverviewMetricRow label="Expenses" valueA={periodA.expense} valueB={periodB.expense} labelA={periodA.label} labelB={periodB.label} color={rawColors.app.red} maxValue={overviewMax} invertChange />
          <OverviewMetricRow label="Savings" valueA={periodA.savings} valueB={periodB.savings} labelA={periodA.label} labelB={periodB.label} color={rawColors.app.blue} maxValue={overviewMax} />
          <OverviewMetricRow label="Savings Rate" valueA={periodA.savingsRate} valueB={periodB.savingsRate} labelA={periodA.label} labelB={periodB.label} color={rawColors.app.purple} maxValue={100} isPercent />
        </div>
      </motion.div>

      {/* Spending Distribution (Butterfly Chart) */}
      <SpendingDistribution periodA={periodA} periodB={periodB} distributionA={distributionA} distributionB={distributionB} />

      {/* Category Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <CategorySection
          icon={<TrendingDown className="w-5 h-5 text-app-red" />}
          title="Expense Categories"
          deltas={expenseDeltas}
          periodA={periodA} periodB={periodB}
          invertChange
          delay={0.15}
        />
        <CategorySection
          icon={<TrendingUp className="w-5 h-5 text-app-green" />}
          title="Income Categories"
          deltas={incomeDeltas}
          periodA={periodA} periodB={periodB}
          delay={0.2}
        />
      </div>

      {/* Quick Stats */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="glass rounded-2xl border border-border p-4 md:p-6">
        <h2 className="text-lg font-semibold mb-4">Quick Stats</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <QuickStat label="Transactions" valueA={periodA.transactions} valueB={periodB.transactions} labelA={periodA.label} labelB={periodB.label} />
          <QuickStat label="Avg Daily Spend" valueA={periodA.expense / 30} valueB={periodB.expense / 30} labelA={periodA.label} labelB={periodB.label} isCurrency />
          <QuickStat label="Categories Used" valueA={Object.keys(periodA.categories).length} valueB={Object.keys(periodB.categories).length} labelA={periodA.label} labelB={periodB.label} />
          <QuickStat label="Top Expense" valueA={Math.max(...Object.values(periodA.categories).map((c) => c.expense), 0)} valueB={Math.max(...Object.values(periodB.categories).map((c) => c.expense), 0)} labelA={periodA.label} labelB={periodB.label} isCurrency />
        </div>
      </motion.div>

      {/* Insights */}
      {insights.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }} className="glass rounded-2xl border border-border p-4 md:p-6">
          <div className="flex items-center gap-2 mb-4">
            <Lightbulb className="w-5 h-5 text-app-orange" />
            <h2 className="text-lg font-semibold">Key Insights</h2>
          </div>
          <div className="space-y-2">
            {insights.map((insight, i) => (
              <motion.div key={insight} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4 + i * 0.05 }} className="flex items-start gap-3 p-3 rounded-xl bg-white/5">
                <div className="w-1.5 h-1.5 rounded-full bg-app-orange mt-1.5 shrink-0" />
                <p className="text-sm text-foreground">{insight}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}
    </div>
  )
}
