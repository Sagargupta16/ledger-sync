import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { ChevronLeft, ChevronRight, Receipt, Percent, BarChart3, Info } from 'lucide-react'
import { staggerContainer, fadeUpItem } from '@/constants/animations'
import { useTransactions } from '@/hooks/api/useTransactions'
import { usePreferences } from '@/hooks/api/usePreferences'
import { FY_START_MONTH } from '@/lib/taxCalculator'
import { formatCurrency, formatCurrencyCompact, formatCurrencyShort } from '@/lib/formatters'
import { computeGSTAnalysis, getExpenseFYs } from '@/lib/gstCalculator'
import {
  PageHeader,
  ChartContainer,
  chartTooltipProps,
  GRID_DEFAULTS,
  xAxisDefaults,
  yAxisDefaults,
  shouldAnimate,
  BAR_RADIUS,
} from '@/components/ui'
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
  ResponsiveContainer,
} from 'recharts'
import { rawColors } from '@/constants/colors'
import ChartEmptyState from '@/components/shared/ChartEmptyState'

// Slab colors (matching GST slab identity)
const SLAB_COLORS: Record<number, string> = {
  0: rawColors.app.green,
  3: rawColors.app.yellow,
  5: rawColors.app.teal,
  18: rawColors.app.indigo,
  28: rawColors.app.red,
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
        className="p-1.5 rounded-lg border border-border hover:bg-white/[0.06] disabled:opacity-30 transition-colors"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>
      <span className="text-sm font-medium min-w-[100px] text-center">{selectedFY}</span>
      <button
        type="button"
        onClick={() => idx > 0 && onSelect(fys[idx - 1])}
        disabled={idx <= 0}
        className="p-1.5 rounded-lg border border-border hover:bg-white/[0.06] disabled:opacity-30 transition-colors"
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

      {/* Disclaimer */}
      <div className="flex items-start gap-2 px-4 py-3 rounded-xl bg-app-blue/5 border border-app-blue/10 text-sm text-muted-foreground">
        <Info className="w-4 h-4 mt-0.5 text-app-blue shrink-0" />
        <span>
          GST amounts are <strong className="text-white">estimates</strong> based on typical category rates.
          Actual GST varies by item. Prices are assumed GST-inclusive.
        </span>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-app-blue/30 border-t-app-blue rounded-full animate-spin" />
        </div>
      )}

      {!isLoading && !hasData && (
        <ChartEmptyState message="No expense data found for this fiscal year" />
      )}

      {!isLoading && hasData && gstData && (
        <motion.div variants={staggerContainer} initial="hidden" animate="visible" className="space-y-6">
          {/* Summary Cards */}
          <motion.div variants={fadeUpItem} className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
              value={gstData.categoryBreakdown[0]?.category ?? '-'}
              subtitle={gstData.categoryBreakdown[0] ? formatCurrency(gstData.categoryBreakdown[0].gstAmount) : ''}
            />
          </motion.div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* GST by Slab */}
            <motion.div variants={fadeUpItem} className="glass rounded-2xl border border-border p-5">
              <h3 className="text-sm font-medium text-muted-foreground mb-4">GST by Slab</h3>
              <div className="h-[240px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={gstData.slabBreakdown}
                      dataKey="gstAmount"
                      nameKey="slab"
                      cx="50%"
                      cy="50%"
                      outerRadius={90}
                      innerRadius={50}
                      paddingAngle={2}
                      isAnimationActive={shouldAnimate(gstData.slabBreakdown.length)}
                    >
                      {gstData.slabBreakdown.map((entry) => (
                        <Cell key={entry.slab} fill={SLAB_COLORS[entry.slab] ?? rawColors.app.blue} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: number | undefined) => formatCurrency(value ?? 0)}
                      labelFormatter={(slab) => `${slab}% slab`}
                      {...chartTooltipProps}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-wrap gap-3 mt-2 justify-center">
                {gstData.slabBreakdown.map((s) => (
                  <div key={s.slab} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <div
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: SLAB_COLORS[s.slab] }}
                    />
                    {s.slab}%
                  </div>
                ))}
              </div>
            </motion.div>

            {/* Monthly GST Trend */}
            <motion.div variants={fadeUpItem} className="glass rounded-2xl border border-border p-5">
              <h3 className="text-sm font-medium text-muted-foreground mb-4">Monthly GST Trend</h3>
              <ChartContainer width="100%" height={270}>
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
                    formatter={(value: number | undefined) => formatCurrency(value ?? 0)}
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
            </motion.div>
          </div>

          {/* Category Breakdown Table */}
          <motion.div variants={fadeUpItem} className="glass rounded-2xl border border-border overflow-hidden">
            <div className="px-5 py-4 border-b border-border">
              <h3 className="text-sm font-medium text-muted-foreground">GST by Category</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="text-left px-5 py-3 font-medium">Category</th>
                    <th className="text-right px-5 py-3 font-medium">Spending</th>
                    <th className="text-right px-5 py-3 font-medium">GST Rate</th>
                    <th className="text-right px-5 py-3 font-medium">Est. GST</th>
                    <th className="text-right px-5 py-3 font-medium hidden sm:table-cell">Txns</th>
                  </tr>
                </thead>
                <tbody>
                  {gstData.categoryBreakdown.map((cat) => (
                    <tr
                      key={cat.category}
                      className="border-b border-border/50 hover:bg-white/[0.02] transition-colors"
                    >
                      <td className="px-5 py-3">
                        <span className="font-medium text-white">{cat.category}</span>
                        {cat.parentCategory !== cat.category && (
                          <span className="text-xs text-muted-foreground ml-2">{cat.parentCategory}</span>
                        )}
                      </td>
                      <td className="text-right px-5 py-3">{formatCurrencyCompact(cat.spending)}</td>
                      <td className="text-right px-5 py-3">
                        <span
                          className="inline-flex px-2 py-0.5 rounded-md text-xs font-medium"
                          style={{
                            backgroundColor: `${SLAB_COLORS[cat.gstRate] ?? rawColors.app.blue}20`,
                            color: SLAB_COLORS[cat.gstRate] ?? rawColors.app.blue,
                          }}
                        >
                          {cat.gstRate}%
                        </span>
                      </td>
                      <td className="text-right px-5 py-3 text-app-indigo font-medium">
                        {formatCurrencyCompact(cat.gstAmount)}
                      </td>
                      <td className="text-right px-5 py-3 text-muted-foreground hidden sm:table-cell">
                        {cat.transactionCount}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-border bg-white/[0.02]">
                    <td className="px-5 py-3 font-semibold text-white">Total</td>
                    <td className="text-right px-5 py-3 font-semibold">
                      {formatCurrencyCompact(gstData.totalSpending)}
                    </td>
                    <td className="text-right px-5 py-3 font-semibold text-muted-foreground">
                      {gstData.effectiveRate.toFixed(1)}%
                    </td>
                    <td className="text-right px-5 py-3 font-semibold text-app-indigo">
                      {formatCurrencyCompact(gstData.totalGST)}
                    </td>
                    <td className="hidden sm:table-cell" />
                  </tr>
                </tfoot>
              </table>
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
}: Readonly<{
  icon: React.ReactNode
  iconBg: string
  label: string
  value: string
  subtitle: string
}>) {
  return (
    <div className="glass rounded-2xl border border-border p-6">
      <div className="flex items-center gap-3">
        <div className={`p-3 rounded-xl ${iconBg}`}>{icon}</div>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold truncate">{value}</p>
          <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
        </div>
      </div>
    </div>
  )
}
