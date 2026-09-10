import type { KeyboardEvent } from 'react'

import { motion, AnimatePresence } from 'motion/react'
import { TrendingUp, TrendingDown, Equal, Upload, Lightbulb } from 'lucide-react'
import { rawColors } from '@/constants/colors'
import { SEMANTIC_COLORS } from '@/constants/chartColors'
import EmptyState from '@/components/shared/EmptyState'
import PageErrorState from '@/components/shared/PageErrorState'
import PartialPeriodNotice from '@/components/shared/PartialPeriodNotice'
import LoadingSkeleton, { CardGridSkeleton } from '@/components/shared/LoadingSkeleton'
import { PageContainer, PageHeader } from '@/components/ui'
import { useComparisonData } from './useComparisonData'
import { PeriodSelector } from './components/PeriodSelector'
import { KpiCard } from './components/KpiCard'
import { OverviewMetricRow } from './components/OverviewMetricRow'
import { QuickStat } from './components/QuickStat'
import { SpendingDistribution } from './components/SpendingDistribution'
import { CategorySection } from './components/CategorySection'

const COMPARISON_MODES = [
  ['month', 'Month'],
  ['year', 'Year'],
  ['fy', 'FY'],
] as const

type ComparisonMode = (typeof COMPARISON_MODES)[number][0]

function handleModeKeyDown(
  event: KeyboardEvent<HTMLButtonElement>,
  mode: ComparisonMode,
  setMode: (nextMode: ComparisonMode) => void,
) {
  const currentIndex = COMPARISON_MODES.findIndex(([value]) => value === mode)
  let nextIndex: number

  if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % COMPARISON_MODES.length
  else if (event.key === 'ArrowLeft') {
    nextIndex = (currentIndex - 1 + COMPARISON_MODES.length) % COMPARISON_MODES.length
  } else if (event.key === 'Home') nextIndex = 0
  else if (event.key === 'End') nextIndex = COMPARISON_MODES.length - 1
  else return

  event.preventDefault()
  setMode(COMPARISON_MODES[nextIndex][0])
  const tabs =
    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
  tabs?.[nextIndex]?.focus()
}

export default function ComparisonPage() {
  const {
    isLoading, isError, retry, transactions,
    mode, setMode,
    monthOptions, yearOptions, fyOptions,
    effectiveMonthA, effectiveMonthB,
    yearA, yearB, fyA, fyB,
    setMonthA, setMonthB, setYearA, setYearB, setFyA, setFyB,
    periodA, periodB, partialPeriod,
    expenseDeltas, incomeDeltas,
    distributionA, distributionB,
    insights,
  } = useComparisonData()

  if (isLoading) {
    return (
      <PageContainer>
        <LoadingSkeleton className="h-10 w-72" />
        <CardGridSkeleton count={4} cols="grid-cols-1 sm:grid-cols-2" />
      </PageContainer>
    )
  }

  if (isError) {
    return (
      <PageErrorState
        title="Comparison"
        subtitle="Compare financial metrics across time periods"
        onRetry={retry}
      />
    )
  }

  if (transactions.length === 0) {
    return (
      <PageContainer>
        <PageHeader
          title="Comparison"
          subtitle="Compare financial metrics across time periods"
        />
        <EmptyState
          title="No transactions yet"
          description="Upload your Excel data to start comparing periods."
          icon={Upload}
          actionLabel="Upload Data"
          actionHref="/upload"
        />
      </PageContainer>
    )
  }

  const overviewMax = Math.max(periodA.income, periodB.income, periodA.expense, periodB.expense, 1)

  return (
    <PageContainer>
      {/* Header */}
      <PageHeader
        title="Comparison"
        subtitle="Compare financial metrics across time periods"
        action={
          <div
            className="ledger-control flex items-center gap-1 rounded-lg border p-1"
            role="tablist"
            aria-label="Comparison period type"
          >
            {COMPARISON_MODES.map(([val, label]) => (
              <motion.button
                key={val}
                type="button"
                role="tab"
                aria-selected={mode === val}
                tabIndex={mode === val ? 0 : -1}
                onClick={() => setMode(val)}
                onKeyDown={(event) => handleModeKeyDown(event, val, setMode)}
                className={`relative min-h-11 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors lg:pointer-fine:min-h-0 lg:pointer-fine:py-1.5 ${
                  mode === val ? 'text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-[var(--overlay-5)]'
                  }`}
                whileTap={{ scale: 0.97 }}
              >
                {mode === val && (
                  <motion.div
                    layoutId="comparisonModeTab"
                    className="absolute inset-0 rounded-md border border-app-blue/30 bg-app-blue/10"
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
        className="ledger-panel p-4 sm:p-6"
      >
        <div className="grid grid-cols-1 items-center gap-4 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
          <PeriodSelector
            mode={mode} label="Period A"
            monthOptions={monthOptions} yearOptions={yearOptions} fyOptions={fyOptions}
            month={effectiveMonthA} year={yearA} fy={fyA}
            onMonth={setMonthA} onYear={setYearA} onFy={setFyA}
          />
          <div className="flex items-center justify-center gap-2 text-muted-foreground sm:pt-6">
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

      {partialPeriod && (
        <PartialPeriodNotice
          label={partialPeriod.label}
          daysElapsed={partialPeriod.daysElapsed}
          daysTotal={partialPeriod.daysTotal}
          treatment={`Both periods are cut to the first ${partialPeriod.daysElapsed} days so the comparison is like-for-like.`}
        />
      )}

      {/* KPI Overview */}
      <AnimatePresence mode="wait">
        <motion.div
          key={`${periodA.label}-${periodB.label}`}
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className="grid grid-cols-1 gap-x-6 gap-y-6 border-b border-border pb-6 min-[360px]:grid-cols-2 xl:grid-cols-4"
        >
          <KpiCard title="Income" valueA={periodA.income} valueB={periodB.income} labelA={periodA.label} labelB={periodB.label} color={SEMANTIC_COLORS.income} />
          <KpiCard title="Expenses" valueA={periodA.expense} valueB={periodB.expense} labelA={periodA.label} labelB={periodB.label} color={SEMANTIC_COLORS.expense} invertChange />
          <KpiCard title="Savings" valueA={periodA.savings} valueB={periodB.savings} labelA={periodA.label} labelB={periodB.label} color={SEMANTIC_COLORS.savings} />
          <KpiCard title="Savings Rate" valueA={periodA.savingsRate} valueB={periodB.savingsRate} labelA={periodA.label} labelB={periodB.label} color={rawColors.app.blue} isPercent />
        </motion.div>
      </AnimatePresence>

      {/* Financial Overview */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="ledger-panel p-4 md:p-6">
        <p className="ledger-meta mb-2 text-app-blue">Two periods, one scale</p>
        <h2 className="text-xl font-semibold tracking-tight">Financial Overview</h2>
        <p className="mb-6 mt-1 text-sm leading-relaxed text-muted-foreground">
          Faded bars show {periodA.label}; solid bars show {periodB.label}. Bar length shows magnitude; values retain their sign.
        </p>
        <div className="divide-y divide-border/60">
          <OverviewMetricRow label="Income" valueA={periodA.income} valueB={periodB.income} labelA={periodA.label} labelB={periodB.label} color={SEMANTIC_COLORS.income} maxValue={overviewMax} />
          <OverviewMetricRow label="Expenses" valueA={periodA.expense} valueB={periodB.expense} labelA={periodA.label} labelB={periodB.label} color={SEMANTIC_COLORS.expense} maxValue={overviewMax} invertChange />
          <OverviewMetricRow label="Savings" valueA={periodA.savings} valueB={periodB.savings} labelA={periodA.label} labelB={periodB.label} color={SEMANTIC_COLORS.savings} maxValue={overviewMax} />
          <OverviewMetricRow label="Savings Rate" valueA={periodA.savingsRate} valueB={periodB.savingsRate} labelA={periodA.label} labelB={periodB.label} color={rawColors.app.blue} maxValue={100} isPercent />
        </div>
      </motion.div>

      {/* Spending Distribution (Butterfly Chart) */}
      <SpendingDistribution periodA={periodA} periodB={periodB} distributionA={distributionA} distributionB={distributionB} />

      {/* Category Breakdown */}
      <div className="grid grid-cols-1 gap-6">
        <CategorySection
          icon={<TrendingDown className="w-5 h-5 text-app-red" />}
          title="Expense Categories"
          deltas={expenseDeltas}
          periodA={periodA} periodB={periodB}
          invertChange
          delay={0.04}
        />
        <CategorySection
          icon={<TrendingUp className="w-5 h-5 text-app-green" />}
          title="Income Categories"
          deltas={incomeDeltas}
          periodA={periodA} periodB={periodB}
          delay={0.08}
        />
      </div>

      {/* Quick Stats */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18, ease: 'easeOut' }} className="ledger-panel p-4 md:p-6">
        <h2 className="text-lg font-semibold mb-4">Quick Stats</h2>
        <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 sm:gap-4 lg:grid-cols-4">
          <QuickStat label="Transactions" valueA={periodA.transactions} valueB={periodB.transactions} labelA={periodA.label} labelB={periodB.label} />
          <QuickStat label="Avg Daily Spend" valueA={periodA.expense / periodA.days} valueB={periodB.expense / periodB.days} labelA={periodA.label} labelB={periodB.label} isCurrency />
          <QuickStat label="Categories Used" valueA={Object.keys(periodA.categories).length} valueB={Object.keys(periodB.categories).length} labelA={periodA.label} labelB={periodB.label} />
          <QuickStat label="Top Expense" valueA={Math.max(...Object.values(periodA.categories).map((c) => c.expense), 0)} valueB={Math.max(...Object.values(periodB.categories).map((c) => c.expense), 0)} labelA={periodA.label} labelB={periodB.label} isCurrency />
        </div>
      </motion.div>

      {/* Insights */}
      {insights.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18, ease: 'easeOut' }} className="ledger-panel p-4 md:p-6">
          <div className="flex items-center gap-2 mb-4">
            <Lightbulb className="w-5 h-5 text-app-orange" />
            <h2 className="text-lg font-semibold">Key Insights</h2>
          </div>
          <div className="space-y-2">
            {insights.map((insight, i) => (
              <motion.div key={insight} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(i * 0.015, 0.1), duration: 0.18 }} className="flex items-start gap-3 rounded-lg bg-[var(--overlay-2)] p-3">
                <div className="w-1.5 h-1.5 rounded-full bg-app-orange mt-1.5 shrink-0" />
                <p className="text-sm text-foreground">{insight}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}
    </PageContainer>
  )
}
