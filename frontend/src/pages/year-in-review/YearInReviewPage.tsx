import { motion } from 'framer-motion'
import {
  Flame,
  TrendingDown,
  TrendingUp,
  DollarSign,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react'
import { useChartDimensions } from '@/hooks/useChartDimensions'
import { PageSkeleton } from '@/components/shared/LoadingSkeleton'
import { formatCurrencyCompact } from '@/lib/formatters'
import { rawColors } from '@/constants/colors'
import { PageContainer, PageHeader } from '@/components/ui'
import EmptyState from '@/components/shared/EmptyState'
import ErrorState from '@/components/shared/ErrorState'
import AnalyticsTimeFilter from '@/components/shared/AnalyticsTimeFilter'
import { ProgressBar } from '@/components/shared'
import StatCard from '@/pages/year-in-review/components/StatCard'
import DayOfWeekChart, { type DayCell } from '@/pages/year-in-review/components/DayOfWeekChart'
import { useYearInReview } from './useYearInReview'
import { DAYS, heatmapColors, modeAccent } from './types'
import MobileMonthlySummary from './components/MobileMonthlySummary'
import HeatmapWeeks from './components/HeatmapWeeks'
import HeatmapDayDetail from './components/HeatmapDayDetail'
import MonthlyBreakdownChart from './components/MonthlyBreakdownChart'
import YearInsightsPanel from './components/YearInsightsPanel'

export default function YearInReviewPage() {
  const dims = useChartDimensions()
  const {
    transactions,
    isLoading,
    isError,
    mode,
    setMode,
    hoveredDay,
    setHoveredDay,
    viewMode,
    setViewMode,
    currentYear,
    setCurrentYear,
    currentMonth,
    setCurrentMonth,
    currentFY,
    setCurrentFY,
    dataDateRange,
    fiscalYearStartMonth,
    selectedYear,
    isFYMode,
    grid,
    modeMax,
    monthLabels,
    stats,
    monthlyBarData,
  } = useYearInReview()

  if (isLoading) return <PageSkeleton />
  if (isError) {
    return (
      <PageContainer>
        <ErrorState
          variant="card"
          title="Couldn't load your year in review"
          message="We couldn't fetch your transactions. Please try again."
          onRetry={() => globalThis.location.reload()}
        />
      </PageContainer>
    )
  }
  if (transactions.length === 0) {
    return (
      <PageContainer>
        <EmptyState
          icon={Flame}
          title="No transaction data yet"
          description="Upload your bank statements to see your annual financial review -- spending heatmaps, streaks, and year-over-year highlights."
          actionLabel="Upload Data"
          actionHref="/upload"
          variant="card"
        />
      </PageContainer>
    )
  }

  const modeLabel = { expense: 'Spending', income: 'Earning', net: 'Net cash flow' }[mode]

  return (
    <PageContainer>
      <PageHeader
        title="Year in Review"
        subtitle="Your annual financial highlights and insights"
        action={
          <div className="flex flex-wrap items-center justify-center gap-3">
            <AnalyticsTimeFilter
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              currentYear={currentYear}
              currentMonth={currentMonth}
              currentFY={currentFY}
              onYearChange={setCurrentYear}
              onMonthChange={setCurrentMonth}
              onFYChange={setCurrentFY}
              minDate={dataDateRange.minDate}
              maxDate={dataDateRange.maxDate}
              fiscalYearStartMonth={fiscalYearStartMonth}
              availableModes={['yearly', 'fy']}
            />

            <div className="flex w-full items-center gap-1 rounded-lg border border-[var(--hairline-1)] bg-[var(--overlay-2)] p-1 sm:w-auto" role="tablist">
              {(
                [
                  ['expense', 'Spending', TrendingDown],
                  ['income', 'Earning', TrendingUp],
                  ['net', 'Savings', DollarSign],
                ] as const
              ).map(([val, label, Icon]) => (
                <motion.button
                  key={val}
                  role="tab"
                  aria-selected={mode === val}
                  onClick={() => setMode(val)}
                  className={`relative flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors sm:min-h-8 sm:flex-none sm:px-3 sm:py-1.5 ${
                    mode === val
                      ? 'text-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-[var(--overlay-5)]'
                  }`}
                  whileTap={{ scale: 0.97 }}
                >
                  {mode === val && (
                    <motion.div
                      layoutId="heatmapModeTab"
                      className="absolute inset-0 rounded-lg"
                      style={{ backgroundColor: modeAccent[val] }}
                      initial={false}
                      transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                    />
                  )}
                  <Icon className="w-3.5 h-3.5 relative z-10" />
                  <span className="relative z-10">{label}</span>
                </motion.button>
              ))}
            </div>
          </div>
        }
      />

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-5">
        <StatCard
          label="Total Spending"
          value={formatCurrencyCompact(stats.totalExpense)}
          icon={TrendingDown}
          color={rawColors.app.red}
        />
        <StatCard
          label="Total Earning"
          value={formatCurrencyCompact(stats.totalIncome)}
          icon={TrendingUp}
          color={rawColors.app.green}
        />
        <StatCard
          label="Savings Rate"
          value={`${stats.savingsRate.toFixed(1)}%`}
          icon={stats.savingsRate >= 0 ? ArrowUpRight : ArrowDownRight}
          color={stats.savingsRate >= 20 ? rawColors.app.green : rawColors.app.orange}
          footer={
            <ProgressBar
              value={stats.savingsRate}
              max={50}
              target={20}
              color={stats.savingsRate >= 20 ? rawColors.app.green : rawColors.app.orange}
              height={6}
              ariaLabel={`Savings rate ${stats.savingsRate.toFixed(1)} percent against a 20 percent target`}
            />
          }
        />
        <StatCard
          label="Daily Average"
          value={formatCurrencyCompact(stats.dailyAvg)}
          icon={BarChart3}
          color={rawColors.app.blue}
        />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass rounded-2xl border border-border p-4 sm:p-6"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Flame className="w-5 h-5" style={{ color: modeAccent[mode] }} />
            {{ expense: 'Spending', income: 'Earning', net: 'Savings' }[mode]} Heatmap --{' '}
            {isFYMode ? currentFY : selectedYear}
          </h2>
          <div className="flex items-center gap-1.5 text-xs text-text-tertiary">
            <span>Less</span>
            {heatmapColors[mode].map((color) => (
              <div
                key={color}
                className="w-3 h-3 rounded-sm"
                style={{ backgroundColor: color }}
              />
            ))}
            <span>More</span>
          </div>
        </div>

        <div className="hidden md:block">
          <div className="overflow-x-auto">
            <div className="min-w-[820px]">
              <div className="flex ml-10 mb-1">
                {monthLabels.map((ml) => (
                  <div
                    key={`${ml.month}-${ml.weekIndex}`}
                    className="text-xs text-text-tertiary"
                    style={{
                      position: 'relative',
                      left: `${ml.weekIndex * 15}px`,
                      width: 0,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {ml.month}
                  </div>
                ))}
              </div>

              <div className="flex gap-0.5">
                <div className="flex flex-col gap-0.5 mr-1.5 pt-0">
                  {DAYS.map((d, i) => (
                    <div
                      key={d}
                      className="h-[13px] flex items-center text-caption text-text-tertiary leading-none"
                    >
                      {i % 2 === 1 ? d : ''}
                    </div>
                  ))}
                </div>

                <section
                  className="flex gap-0.5"
                  aria-label={`${modeLabel} heatmap grid`}
                  onMouseOver={(e) => {
                    const target = (e.target as HTMLElement).closest<HTMLElement>(
                      '[data-cell-date]',
                    )
                    if (target) {
                      const date = target.dataset.cellDate
                      const found: DayCell | undefined = grid.find((c) => c.date === date)
                      setHoveredDay(found ?? null)
                    }
                  }}
                  onFocus={(e) => {
                    const target = (e.target as HTMLElement).closest<HTMLElement>(
                      '[data-cell-date]',
                    )
                    if (target) {
                      const date = target.dataset.cellDate
                      const found: DayCell | undefined = grid.find((c) => c.date === date)
                      setHoveredDay(found ?? null)
                    }
                  }}
                  onMouseLeave={() => setHoveredDay(null)}
                  onBlur={() => setHoveredDay(null)}
                >
                  <HeatmapWeeks grid={grid} mode={mode} modeMax={modeMax} />
                </section>
              </div>
            </div>
          </div>
        </div>

        <MobileMonthlySummary
          mode={mode}
          monthlyExpense={stats.monthlyExpense}
          monthlyIncome={stats.monthlyIncome}
        />

        <div className="mt-4 pt-3 border-t border-border flex items-center gap-6 text-xs min-h-[28px]">
          <HeatmapDayDetail hoveredDay={hoveredDay} />
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <MonthlyBreakdownChart monthlyBarData={monthlyBarData} dims={dims} />
        <YearInsightsPanel stats={stats} />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="glass rounded-2xl border border-border p-4 sm:p-6"
      >
        <h2 className="text-lg font-semibold mb-4">Spending by Day of Week</h2>
        <DayOfWeekChart grid={grid} />
      </motion.div>
    </PageContainer>
  )
}
