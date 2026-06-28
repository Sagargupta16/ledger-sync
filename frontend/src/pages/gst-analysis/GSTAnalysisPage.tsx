import { useState, useMemo } from 'react'

import { motion } from 'framer-motion'
import { ChevronLeft, ChevronRight, Receipt, Percent, BarChart3, Info } from 'lucide-react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
} from 'recharts'

import { staggerContainer, fadeUpItem } from '@/constants/animations'
import { useTransactions } from '@/hooks/api/useTransactions'
import { usePreferences } from '@/hooks/api/usePreferences'
import { FY_START_MONTH } from '@/lib/taxCalculator'
import { formatCurrency, formatCurrencyCompact, formatCurrencyShort } from '@/lib/formatters'
import { computeGSTAnalysis, getExpenseFYs } from '@/lib/gstCalculator'
import type { GSTCategoryBreakdown } from '@/lib/gstCalculator'
import {
  PageHeader,
  ChartContainer,
  chartTooltipProps,
  currencyTooltipFormatter,
  GRID_DEFAULTS,
  xAxisDefaults,
  yAxisDefaults,
  shouldAnimate,
  BAR_RADIUS,
  DataTable,
  type DataTableColumn,
  Spinner,
} from '@/components/ui'
import { rawColors } from '@/constants/colors'
import ChartEmptyState from '@/components/shared/ChartEmptyState'
import { ProgressBar } from '@/components/shared'

// Slab colors (matching GST slab identity). Covers both the legacy slabs
// (12/28%, for transactions before the 2025-09-22 GST 2.0 cutover) and the
// current ones (40% luxury de-merit rate).
const SLAB_COLORS: Record<number, string> = {
  0: rawColors.app.green,
  3: rawColors.app.yellow,
  5: rawColors.app.teal,
  12: rawColors.app.blue,
  18: rawColors.app.indigo,
  28: rawColors.app.orange,
  40: rawColors.app.red,
}

function buildGSTCategoryColumns(maxSpending: number): DataTableColumn<GSTCategoryBreakdown>[] {
  return [
  {
    key: 'category',
    header: 'Category',
    sortType: 'text',
    mobilePrimary: true,
    cell: (cat) => (
      <>
        <span className="font-medium text-foreground">{cat.category}</span>
        {cat.parentCategory !== cat.category && (
          <span className="text-xs text-muted-foreground ml-2">{cat.parentCategory}</span>
        )}
      </>
    ),
  },
  {
    key: 'spending',
    header: 'Spending',
    align: 'right',
    sortable: true,
    sortValue: (cat) => cat.spending,
    cell: (cat) => (
      <div className="flex items-center justify-end gap-2.5">
        <ProgressBar
          value={cat.spending}
          max={maxSpending}
          color={rawColors.app.indigo}
          height={6}
          className="w-16 sm:w-20 shrink-0"
          ariaLabel={`${cat.category} spending share`}
        />
        <span className="tabular-nums">{formatCurrencyCompact(cat.spending)}</span>
      </div>
    ),
  },
  {
    key: 'gstRate',
    header: 'GST Rate',
    align: 'right',
    cell: (cat) => (
      <span
        className="inline-flex px-2 py-0.5 rounded-md text-xs font-medium"
        style={{
          backgroundColor: `${SLAB_COLORS[cat.gstRate] ?? rawColors.app.blue}20`,
          color: SLAB_COLORS[cat.gstRate] ?? rawColors.app.blue,
        }}
      >
        {cat.gstRate}%
      </span>
    ),
  },
  {
    key: 'gstAmount',
    header: 'Est. GST',
    align: 'right',
    sortable: true,
    cell: (cat) => (
      <span className="text-app-indigo font-medium">{formatCurrencyCompact(cat.gstAmount)}</span>
    ),
  },
  {
    key: 'transactionCount',
    header: 'Txns',
    align: 'right',
    sortable: true,
    widthClass: 'hidden sm:table-cell',
    cellClassName: () => 'hidden sm:table-cell',
    cell: (cat) => <span className="text-muted-foreground">{cat.transactionCount}</span>,
  },
  ]
}

function FYNavigator({
  fys,
  selectedFY,
  onSelect,
}: Readonly<{ fys: string[]; selectedFY: string; onSelect: (fy: string) => void }>) {
  const idx = fys.indexOf(selectedFY)
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => idx < fys.length - 1 && onSelect(fys[idx + 1])}
        disabled={idx >= fys.length - 1}
        aria-label="Previous fiscal year"
        className="p-2.5 sm:p-1.5 rounded-lg border border-border hover:bg-[var(--overlay-3)] disabled:opacity-30 transition-colors"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>
      <span className="text-sm font-medium min-w-[100px] text-center">{selectedFY}</span>
      <button
        type="button"
        onClick={() => idx > 0 && onSelect(fys[idx - 1])}
        disabled={idx <= 0}
        aria-label="Next fiscal year"
        className="p-2.5 sm:p-1.5 rounded-lg border border-border hover:bg-[var(--overlay-3)] disabled:opacity-30 transition-colors"
      >
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  )
}

export default function GSTAnalysisPage() {
  const { data: transactions, isLoading } = useTransactions()
  const { data: preferences } = usePreferences()
  const fiscalYearStartMonth = preferences?.fiscal_year_start_month ?? FY_START_MONTH

  const allFYs = useMemo(
    () => getExpenseFYs(transactions ?? [], fiscalYearStartMonth),
    [transactions, fiscalYearStartMonth],
  )

  const [selectedFY, setSelectedFY] = useState<string | null>(null)
  const effectiveFY = selectedFY ?? allFYs[0] ?? ''

  const gstData = useMemo(
    () => (transactions && effectiveFY)
      ? computeGSTAnalysis(transactions, effectiveFY, fiscalYearStartMonth)
      : null,
    [transactions, effectiveFY, fiscalYearStartMonth],
  )

  const hasData = gstData && gstData.totalSpending > 0
  // The GST-by-slab pie keys on gstAmount, so exempt spend (0% slab: rent, fuel,
  // insurance, transfers) would add an empty, dead-legend slice. Keep 0% rows in
  // the table (their spending is meaningful) but drop them from the pie/legend.
  const gstSlabsWithTax = (gstData?.slabBreakdown ?? []).filter((s) => s.gstAmount > 0)

  // Scale the in-cell spending bars to the largest category so the widest bar
  // fills the track and the rest read as a share of it.
  const categoryColumns = useMemo(() => {
    const maxSpending = Math.max(
      0,
      ...(gstData?.categoryBreakdown ?? []).map((cat) => cat.spending),
    )
    return buildGSTCategoryColumns(maxSpending)
  }, [gstData])

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
      <PageHeader
        title="Indirect Tax (GST)"
        subtitle="Estimated GST paid on your expenses"
        action={
          allFYs.length > 0 && (
            <FYNavigator
              fys={allFYs}
              selectedFY={effectiveFY}
              onSelect={setSelectedFY}
            />
          )
        }
      />

      {/* Disclaimer -- made more explicit because users were reading these as
          precise numbers. Bank statements don't line-item GST; unless you
          upload receipts, anything here is a lifestyle-scale approximation. */}
      <div className="flex items-start gap-2 px-4 py-3 rounded-xl bg-app-orange/5 border border-app-orange/20 text-sm text-muted-foreground">
        <Info className="w-4 h-4 mt-0.5 text-app-orange shrink-0" />
        <span>
          <strong className="text-foreground">Approximate figures only.</strong>{' '}
          GST isn't line-itemed in bank statements, so we apply typical slab
          rates per category (restaurants 5%, electronics 18%, etc.) to your
          inclusive-of-tax spend. Use this for lifestyle-scale awareness of
          indirect tax paid -- not for filing.
        </span>
      </div>

      {isLoading && <Spinner label="Loading GST analysis" className="py-20" />}

      {!isLoading && !hasData && (
        <ChartEmptyState message="No expense data found for this fiscal year" />
      )}

      {!isLoading && hasData && gstData && (
        <motion.div variants={staggerContainer} initial="hidden" animate="visible" className="space-y-6">
          {/* Summary Cards */}
          <motion.div variants={fadeUpItem} className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
            <SummaryCard
              icon={<Receipt className="w-6 h-6 text-app-red" />}
              iconBg="bg-app-red/20"
              label="Estimated GST Paid"
              value={formatCurrency(gstData.totalGST)}
              subtitle={`on ${formatCurrencyCompact(gstData.totalSpending)} total spending`}
            />
            <SummaryCard
              icon={<Percent className="w-6 h-6 text-app-indigo" />}
              iconBg="bg-app-indigo/20"
              label="Effective GST Rate"
              value={`${gstData.effectiveRate.toFixed(1)}%`}
              subtitle="Weighted average across categories"
            />
            <SummaryCard
              icon={<BarChart3 className="w-6 h-6 text-app-purple" />}
              iconBg="bg-app-purple/20"
              label="Top GST Category"
              value={gstData.categoryBreakdown[0] ? formatCurrency(gstData.categoryBreakdown[0].gstAmount) : '-'}
              subtitle={gstData.categoryBreakdown[0]?.category ?? ''}
              className="col-span-2 sm:col-span-1"
            />
          </motion.div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* GST by Slab */}
            <motion.div variants={fadeUpItem} className="glass rounded-2xl border border-border p-5">
              <h3 className="text-sm font-medium text-muted-foreground mb-4">GST by Slab</h3>
              <div className="h-[270px]">
                <ChartContainer
                  width="100%"
                  height="100%"
                  ariaLabel="Estimated GST paid split by tax slab rate"
                >
                  <PieChart>
                    <Pie
                      data={gstSlabsWithTax}
                      dataKey="gstAmount"
                      nameKey="slab"
                      cx="50%"
                      cy="50%"
                      outerRadius={90}
                      innerRadius={50}
                      paddingAngle={2}
                      isAnimationActive={shouldAnimate(gstSlabsWithTax.length)}
                    >
                      {gstSlabsWithTax.map((entry) => (
                        <Cell key={entry.slab} fill={SLAB_COLORS[entry.slab] ?? rawColors.app.blue} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={currencyTooltipFormatter}
                      labelFormatter={(slab) => `${slab}% slab`}
                      {...chartTooltipProps}
                    />
                  </PieChart>
                </ChartContainer>
              </div>
              <div className="flex flex-wrap gap-2 mt-2 justify-center">
                {gstSlabsWithTax.map((s) => {
                  const share = gstData.totalGST > 0 ? (s.gstAmount / gstData.totalGST) * 100 : 0
                  return (
                    <div
                      key={s.slab}
                      className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg bg-[var(--overlay-2)] border border-border"
                    >
                      <div
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: SLAB_COLORS[s.slab] }}
                      />
                      <span className="font-medium text-foreground">{s.slab}%</span>
                      <span className="tabular-nums text-app-indigo">
                        {formatCurrencyCompact(s.gstAmount)}
                      </span>
                      <span className="tabular-nums text-text-tertiary">
                        {share.toFixed(0)}%
                      </span>
                    </div>
                  )
                })}
              </div>
            </motion.div>

            {/* Monthly GST Trend */}
            <motion.div variants={fadeUpItem} className="glass rounded-2xl border border-border p-5">
              <h3 className="text-sm font-medium text-muted-foreground mb-4">Monthly GST Trend</h3>
              {gstData.monthlyTrend.length <= 1 ? (
                <ChartEmptyState
                  height={270}
                  message="Need at least two months of spending to show a trend"
                />
              ) : (
                <ChartContainer
                  width="100%"
                  height={270}
                  ariaLabel="Estimated GST paid each month across the selected fiscal year"
                >
                  <BarChart data={gstData.monthlyTrend}>
                    <CartesianGrid {...GRID_DEFAULTS} />
                    <XAxis
                      dataKey="monthLabel"
                      {...xAxisDefaults(gstData.monthlyTrend.length)}
                    />
                    <YAxis
                      {...yAxisDefaults()}
                      tickFormatter={(v: number) => formatCurrencyShort(v)}
                    />
                    <Tooltip
                      formatter={currencyTooltipFormatter}
                      {...chartTooltipProps}
                    />
                    <Bar
                      dataKey="gstAmount"
                      fill={rawColors.app.indigo}
                      radius={BAR_RADIUS}
                      isAnimationActive={shouldAnimate(gstData.monthlyTrend.length)}
                    />
                  </BarChart>
                </ChartContainer>
              )}
            </motion.div>
          </div>

          {/* Category Breakdown Table */}
          <motion.div variants={fadeUpItem} className="glass rounded-2xl border border-border overflow-hidden">
            <div className="px-5 py-4 border-b border-border">
              <h3 className="text-sm font-medium text-muted-foreground">GST by Category</h3>
            </div>
            <DataTable<GSTCategoryBreakdown>
              columns={categoryColumns}
              rows={gstData.categoryBreakdown}
              rowKey={(cat) => cat.category}
              initialSort={{ key: 'gstAmount', dir: 'desc' }}
              ariaLabel="GST estimated per category"
              mobileCards
            />
            <div className="border-t border-border bg-[var(--overlay-1)] px-4 py-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-1 text-sm">
              <span className="font-semibold text-foreground">Total</span>
              <span className="flex items-center gap-4 tabular-nums">
                <span className="font-semibold">{formatCurrencyCompact(gstData.totalSpending)}</span>
                <span className="font-semibold text-muted-foreground">
                  {gstData.effectiveRate.toFixed(1)}%
                </span>
                <span className="font-semibold text-app-indigo">
                  {formatCurrencyCompact(gstData.totalGST)}
                </span>
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </div>
  )
}

function SummaryCard({
  icon,
  iconBg,
  label,
  value,
  subtitle,
  className,
}: Readonly<{
  icon: React.ReactNode
  iconBg: string
  label: string
  value: string
  subtitle: string
  className?: string
}>) {
  return (
    <div className={`glass rounded-2xl border border-border p-4 sm:p-6 ${className ?? ''}`}>
      <div className="flex items-center gap-3">
        <div className={`p-2.5 sm:p-3 rounded-xl ${iconBg}`}>{icon}</div>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-xl sm:text-2xl font-bold truncate">{value}</p>
          <p className="text-xs text-muted-foreground mt-1 truncate">{subtitle}</p>
        </div>
      </div>
    </div>
  )
}
