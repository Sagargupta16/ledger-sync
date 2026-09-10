import { motion } from 'motion/react'
import {
  Activity,
  ArrowUpRight,
  Briefcase,
  DollarSign,
  PiggyBank,
  TrendingUp,
  Wallet,
  type LucideIcon,
} from 'lucide-react'

import StandardPieChart from '@/components/analytics/StandardPieChart'
import EmptyState from '@/components/shared/EmptyState'
import ProgressBar from '@/components/shared/ProgressBar'
import { FADE_UP } from '@/constants/animations'
import { formatCurrency } from '@/lib/formatters'

import type { IncomeCategoryDatum } from '../useIncomeAnalysis'

/**
 * Category -> icon. Cosmetic only (unmatched keys fall back to DollarSign), but
 * the keys still have to match reality: real exports carry "Refunds &
 * Cashbacks" (PLURAL), so the singular key alone showed the generic icon for
 * every cashback and refund row. Both spellings are mapped.
 */
const INCOME_CATEGORY_ICONS: Record<string, LucideIcon> = {
  'Employment Income': Briefcase,
  'Investment Income': TrendingUp,
  'Refund & Cashbacks': Wallet,
  'Refunds & Cashbacks': Wallet,
  'One-time Income': PiggyBank,
  'Other Income': DollarSign,
  'Business/Self Employment Income': Activity,
}

interface IncomeCategorySectionProps {
  readonly data: readonly IncomeCategoryDatum[]
  readonly totalIncome: number
  readonly onSelectCategory: (name: string) => void
}

export default function IncomeCategorySection({
  data,
  totalIncome,
  onSelectCategory,
}: IncomeCategorySectionProps) {
  return (
    <motion.section
      className="ledger-panel min-w-0 p-4 sm:p-6"
      {...FADE_UP}
      aria-labelledby="income-category-title"
    >
      <p className="ledger-meta mb-2 text-app-green">Where income comes from</p>
      <h2 id="income-category-title" className="text-xl font-semibold tracking-tight text-foreground">
        Income by Category
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">Select a source to inspect its transactions.</p>

      {data.length > 0 ? (
        <div className="mt-6 grid min-w-0 grid-cols-1 items-center gap-6 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.6fr)] lg:gap-8">
          {/* No role="img" wrapper here -- it would enclose the chart's sr-only
              data table and ARIA presentational children would hide it again.
              `ariaLabel` puts the label on the chart's own wrapper instead. */}
          <div className="min-w-0">
            <StandardPieChart
              data={[...data]}
              height={280}
              innerRadius="64%"
              outerRadius="88%"
              showLegend={false}
              onSliceClick={onSelectCategory}
              ariaLabel="Donut chart breaking down total income by source category"
            />
            <p className="mt-2 text-center text-xs text-muted-foreground">
              Total income <span className="ml-2 font-mono tabular-nums text-foreground">{formatCurrency(totalIncome)}</span>
            </p>
          </div>
          <div className="min-w-0">
            <div className="mb-1 flex justify-between border-b border-border pb-3 text-xs text-muted-foreground">
              <span>Source</span>
              <span>Amount / share</span>
            </div>
            <ul className="divide-y divide-border/60" aria-label="Income sources">
              {data.map((item) => {
                const Icon = INCOME_CATEGORY_ICONS[item.category] || DollarSign
                const percentage =
                  totalIncome > 0 ? ((item.value / totalIncome) * 100).toFixed(1) : '0'

                return (
                  <li key={item.name}>
                    <motion.button
                      type="button"
                      onClick={() => onSelectCategory(item.name)}
                      whileTap={{ scale: 0.99 }}
                      className="group w-full min-w-0 rounded-md py-4 text-left transition-colors hover:bg-[var(--overlay-2)] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    >
                      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-2">
                        <div className="flex min-w-0 items-start gap-2.5">
                          <Icon className="mt-0.5 size-4 shrink-0" style={{ color: item.color }} aria-hidden="true" />
                          <p className="break-words text-sm font-medium text-foreground">{item.name}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-mono text-sm font-semibold tabular-nums text-foreground sm:text-base">
                            {formatCurrency(item.value)}
                          </p>
                          <p className="mt-1 font-mono text-xs tabular-nums text-muted-foreground">{percentage}% of income</p>
                        </div>
                        <div className="col-span-2 flex items-center gap-3 pl-6.5">
                          <div className="flex-1">
                            <ProgressBar value={Number(percentage)} max={100} color={item.color} height={4} />
                          </div>
                          <ArrowUpRight className="size-4 shrink-0 text-muted-foreground group-hover:text-app-blue" aria-hidden="true" />
                        </div>
                      </div>
                    </motion.button>
                  </li>
                )
              })}
            </ul>
          </div>
        </div>
      ) : (
        /*
          Pointed at Settings ("Configure income categories") and it could not
          help: this breakdown is the backend's `category_breakdown`, which
          buckets income rows by `transaction.category` alone
          (`calculations_helpers.py::_compute_income_analysis`). The Settings
          income-classification lists drive the cashback total, nothing here, so
          a user who followed that advice classified categories and watched the
          chart stay empty. The two causes that DO empty it are no income rows at
          all and a date range with none in it -- so the action matches the
          sibling `IncomeTrendSection` and points at /upload, with the range
          named as the second cause.
        */
        <EmptyState
          icon={Wallet}
          title="No income data available"
          description="Start by uploading your transaction data to see income by category. Already uploaded? Widen the selected date range."
          actionLabel="Upload Data"
          actionHref="/upload"
          variant="chart"
        />
      )}
    </motion.section>
  )
}
