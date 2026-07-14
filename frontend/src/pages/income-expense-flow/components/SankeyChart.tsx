import { motion } from 'framer-motion'
import { ArrowRightLeft } from 'lucide-react'
import { Sankey, Tooltip } from 'recharts'

import { ChartContainer, Spinner } from '@/components/ui'
import { chartTooltipProps } from '@/components/ui/ChartTooltip'
import { rawColors } from '@/constants/colors'
import { formatCurrency } from '@/lib/formatters'

import MobileFlowView from './MobileFlowView'

interface SankeyChartProps {
  isLoading: boolean
  isMobile: boolean
  sankeyData: { nodes: Array<{ name: string }>; links: Array<{ source: number; target: number; value: number }> }
  sankeyNodeComponent: React.ComponentType<{
    x: number
    y: number
    width: number
    height: number
    index: number
    payload: { name: string }
  }>
  topIncome: Array<{ name: string; amount: number }>
  topExpense: Array<{ name: string; amount: number }>
  totalIncome: number
  totalExpense: number
  netSavings: number
  currentFY: string
}

export function SankeyChart(props: Readonly<SankeyChartProps>) {
  const {
    isLoading,
    isMobile,
    sankeyData,
    sankeyNodeComponent,
    topIncome,
    topExpense,
    totalIncome,
    totalExpense,
    netSavings,
    currentFY,
  } = props

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      className="glass rounded-2xl border border-border p-3 sm:p-6 lg:p-8"
    >
      <div className="flex items-center justify-between mb-4 sm:mb-8">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-app-purple/20 rounded-xl">
            <ArrowRightLeft className="w-6 h-6 text-app-purple" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-foreground">
              <span className="sm:hidden">Cash Flow</span>
              <span className="hidden sm:inline">Cash Flow Sankey</span>
            </h3>
            <p className="text-sm text-muted-foreground">
              Income sources flowing to savings and expenses
            </p>
          </div>
        </div>
      </div>

      {isLoading && (
        <div className="flex h-[400px] items-center justify-center rounded-lg border border-border bg-[var(--overlay-1)] md:h-[550px] lg:h-[700px]">
          <Spinner size="lg" label="Loading flow diagram..." />
        </div>
      )}

      {!isLoading && isMobile && sankeyData.links.length > 0 && (
        <MobileFlowView
          incomeByCategory={topIncome}
          expenseByCategory={topExpense}
          totalIncome={totalIncome}
          totalExpense={totalExpense}
          netSavings={netSavings}
        />
      )}

      {/* Gate on LINKS, not nodes: the hook always emits the 3 fixed
          Income/Savings/Expenses nodes, so nodes.length is never 0. With no
          data there are 0 links and Recharts <Sankey> would render orphan nodes
          / a NaN layout. Links is the real "has data" signal. */}
      {!isLoading && !isMobile && sankeyData.links.length > 0 && (
        <div className="relative rounded-lg border border-border bg-[var(--overlay-1)] p-6">
          <ChartContainer
            height={700}
            ariaLabel="Sankey diagram showing income sources flowing into total income, then splitting into savings and expense categories."
          >
            <Sankey
              data={sankeyData}
              nodeWidth={20}
              nodePadding={60}
              margin={{ top: 30, right: 200, bottom: 30, left: 200 }}
              node={sankeyNodeComponent as never}
              link={{
                stroke: rawColors.app.purple,
                strokeOpacity: 0.25,
              }}
            >
              <defs>
                <linearGradient id="incomeGradient" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor={rawColors.app.green} stopOpacity={0.8} />
                  <stop offset="100%" stopColor={rawColors.app.green} stopOpacity={0.8} />
                </linearGradient>
                <linearGradient id="middleGradient" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor={rawColors.app.indigo} stopOpacity={0.9} />
                  <stop offset="100%" stopColor={rawColors.app.purple} stopOpacity={0.9} />
                </linearGradient>
                <linearGradient id="expenseGradient" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor={rawColors.app.red} stopOpacity={0.8} />
                  <stop offset="100%" stopColor={rawColors.app.red} stopOpacity={0.8} />
                </linearGradient>
              </defs>
              <Tooltip
                {...chartTooltipProps}
                formatter={(value, _name, item) => {
                  if (typeof value !== 'number') return ''
                  // Recharts' Sankey payload exposes the resolved source/target
                  // node objects on a link hover -- name the flow instead of a
                  // bare "Amount". Falls back to the node name for node hovers.
                  const link = item?.payload as
                    | { source?: { name?: string }; target?: { name?: string }; name?: string }
                    | undefined
                  const source = link?.source?.name
                  const target = link?.target?.name
                  const label =
                    source && target
                      ? `${source} -> ${target}`
                      : (link?.name ?? 'Amount')
                  return [formatCurrency(value), label]
                }}
              />
            </Sankey>
          </ChartContainer>

          <div className="mt-6 pt-6 border-t border-border flex flex-wrap justify-center gap-6">
            <div className="flex items-center gap-2">
              <div
                className="w-4 h-4 rounded"
                style={{
                  background: `linear-gradient(to right, ${rawColors.app.green}, ${rawColors.app.greenVibrant})`,
                }}
              />
              <span className="text-sm text-foreground">Income Sources</span>
            </div>
            <div className="flex items-center gap-2">
              <div
                className="w-4 h-4 rounded"
                style={{
                  background: `linear-gradient(to right, ${rawColors.app.indigo}, ${rawColors.app.purple})`,
                }}
              />
              <span className="text-sm text-foreground">Total Income / Savings</span>
            </div>
            <div className="flex items-center gap-2">
              <div
                className="w-4 h-4 rounded"
                style={{
                  background: `linear-gradient(to right, ${rawColors.app.red}, ${rawColors.app.redVibrant})`,
                }}
              />
              <span className="text-sm text-foreground">Expense Categories</span>
            </div>
          </div>
        </div>
      )}

      {!isLoading && sankeyData.links.length === 0 && (
        <div className="flex h-[400px] items-center justify-center rounded-lg border border-border bg-[var(--overlay-1)] md:h-[550px] lg:h-[700px]">
          <div className="text-center">
            <ArrowRightLeft className="w-16 h-16 text-text-quaternary mx-auto mb-4" />
            <p className="text-muted-foreground text-lg">
              No transaction data available for FY {currentFY}
            </p>
            <p className="text-text-tertiary text-sm mt-2">
              Select a different financial year or upload transaction data
            </p>
          </div>
        </div>
      )}
    </motion.div>
  )
}
