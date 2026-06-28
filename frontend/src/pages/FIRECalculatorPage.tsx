import { useState, useMemo } from 'react'

import { motion } from 'framer-motion'
import { Flame, Calculator } from 'lucide-react'
import { staggerContainer, fadeUpItem } from '@/constants/animations'
import { PageSkeleton } from '@/components/shared/LoadingSkeleton'
import EmptyState from '@/components/shared/EmptyState'
import { useTotals, useMonthlyAggregation } from '@/hooks/api/useAnalytics'
import { formatCurrency } from '@/lib/formatters'
import { computeFIRE, computeRetirementCorpus } from '@/lib/fireCalculator'
import { rawColors } from '@/constants/colors'
import MetricCard from '@/components/shared/MetricCard'
import StandardAreaChart from '@/components/analytics/StandardAreaChart'
import StandardBarChart from '@/components/analytics/StandardBarChart'
import { PageHeader, currencyTooltipFormatter } from '@/components/ui'
import { formatCurrencyShort } from '@/lib/formatters'

function SliderInput({ id, label, value, min, max, step, unit, valueText, onChange }: Readonly<{
  id: string; label: string; value: number; min: number; max: number; step: number; unit: string
  valueText?: string
  onChange: (v: number) => void
}>) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label htmlFor={id} className="text-xs font-medium text-muted-foreground">{label}</label>
        <span className="text-xs font-semibold text-foreground">{value}{unit}</span>
      </div>
      {/* Visible track stays thin (h-1.5) but the input fills a >=44px tall box
          so the pointer/touch hit area is accessible for dragging. */}
      <div className="flex items-center min-h-[44px]">
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          aria-valuetext={valueText ?? `${value}${unit}`}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full h-1.5 rounded-full appearance-none bg-[var(--overlay-5)] accent-app-blue cursor-pointer"
        />
      </div>
    </div>
  )
}

function savingsRateSubtitle(rate: number): string {
  if (rate >= 50) return 'FIRE-ready pace'
  if (rate >= 20) return 'Good, increase for FIRE'
  return 'Needs improvement'
}

export default function FIRECalculatorPage() {
  const { data: monthlyData, isLoading } = useMonthlyAggregation()
  const { data: totals } = useTotals()
  const [activeTab, setActiveTab] = useState<'fire' | 'retirement'>('fire')

  // FIRE inputs with defaults from transaction data. The distinct-month count
  // is the number of keys in the monthly rollup (one per YYYY-MM) -- no need to
  // pull the full ledger just to count months.
  const autoValues = useMemo(() => {
    const totalIncome = totals?.total_income ?? 0
    const totalExpenses = Math.abs(totals?.total_expenses ?? 0)
    const months = Object.keys(monthlyData ?? {}).length || 1
    const annualIncome = (totalIncome / months) * 12
    const annualExpenses = (totalExpenses / months) * 12
    const annualSavings = annualIncome - annualExpenses
    const monthlyExpenses = annualExpenses / 12
    return { annualIncome, annualExpenses, annualSavings, monthlyExpenses }
  }, [monthlyData, totals])

  // FIRE adjustable params
  const [swr, setSwr] = useState(3)
  const [realReturn, setRealReturn] = useState(6)
  const [yearsToRetire, setYearsToRetire] = useState(25)
  // Barista FIRE: expected part-time / passion-work MONTHLY income after
  // leaving full-time work. Default 0 = no assumed side income (pure FIRE).
  const [baristaMonthlyIncome, setBaristaMonthlyIncome] = useState(0)

  // Retirement adjustable params
  const [inflation, setInflation] = useState(6.5)
  const [expectedReturn, setExpectedReturn] = useState(12)
  const [retirementYears, setRetirementYears] = useState(25)

  const fireResult = useMemo(() => computeFIRE({
    annualExpenses: autoValues.annualExpenses,
    essentialAnnualExpenses: autoValues.annualExpenses * 0.6,
    annualSavings: autoValues.annualSavings,
    annualIncome: autoValues.annualIncome,
    swr: swr / 100,
    realReturn: realReturn / 100,
    yearsToRetire,
    baristaAnnualIncome: baristaMonthlyIncome * 12,
  }), [autoValues, swr, realReturn, yearsToRetire, baristaMonthlyIncome])

  const retirementResult = useMemo(() => computeRetirementCorpus({
    monthlyExpenses: autoValues.monthlyExpenses,
    inflationRate: inflation / 100,
    expectedReturn: expectedReturn / 100,
    yearsToRetirement: retirementYears,
    swr: swr / 100,
  }), [autoValues.monthlyExpenses, inflation, expectedReturn, retirementYears, swr])

  if (isLoading) return <PageSkeleton />

  return (
    <div className="min-h-dvh p-4 md:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6 md:space-y-8">
        <PageHeader
          title="FIRE & Retirement Calculator"
          subtitle="Plan your financial independence using your actual spending data"
          action={
            // Only render the tablist when the panels it controls exist (no-data
            // shows an EmptyState instead, so aria-controls would dangle).
            autoValues.annualExpenses > 0 ? (
              <div className="flex gap-1 p-1 rounded-lg bg-muted/20" role="tablist" aria-label="Calculator mode">
                <button
                  role="tab"
                  id="fire-tab"
                  aria-selected={activeTab === 'fire'}
                  aria-controls="fire-panel"
                  onClick={() => setActiveTab('fire')}
                  className={`px-4 py-2.5 sm:py-1.5 rounded-md text-sm font-medium transition-colors ${activeTab === 'fire' ? 'bg-[var(--overlay-5)] text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  <Flame className="w-4 h-4 inline mr-1.5" />FIRE
                </button>
                <button
                  role="tab"
                  id="retirement-tab"
                  aria-selected={activeTab === 'retirement'}
                  aria-controls="retirement-panel"
                  onClick={() => setActiveTab('retirement')}
                  className={`px-4 py-2.5 sm:py-1.5 rounded-md text-sm font-medium transition-colors ${activeTab === 'retirement' ? 'bg-[var(--overlay-5)] text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  <Calculator className="w-4 h-4 inline mr-1.5" />Retirement
                </button>
              </div>
            ) : undefined
          }
        />
      <motion.div
        initial="hidden"
        animate="visible"
        variants={staggerContainer}
        className="space-y-6 md:space-y-8"
      >

        {autoValues.annualExpenses <= 0 ? (
          <EmptyState
            variant="card"
            icon={Flame}
            title="No spending data yet"
            description="FIRE and retirement targets are derived from your actual income and expenses. Upload a bank statement to see your numbers."
            actionLabel="Upload transactions"
            actionHref="/upload"
          />
        ) : activeTab === 'fire' ? (
          <div role="tabpanel" id="fire-panel" aria-labelledby="fire-tab" className="space-y-6 md:space-y-8">
            {/* FIRE Metrics */}
            <motion.div variants={fadeUpItem} className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-6">
              <MetricCard title="FIRE Number" value={formatCurrency(fireResult.fireNumber)} icon={Flame} color="red" subtitle={`At ${swr}% SWR`} />
              <MetricCard title="Years to FIRE" value={fireResult.yearsToFIRE === Infinity ? 'N/A' : `${fireResult.yearsToFIRE.toFixed(1)} yrs`} icon={Flame} color="orange" subtitle={`At ${realReturn}% real return`} />
              <MetricCard title="Coast FIRE" value={formatCurrency(fireResult.coastFIRE)} icon={Flame} color="teal" subtitle="Amount needed today" />
              <MetricCard title="Savings Rate" value={`${fireResult.currentSavingsRate.toFixed(1)}%`} icon={Flame} color="green" subtitle={savingsRateSubtitle(fireResult.currentSavingsRate)} />
            </motion.div>

            {/* FIRE Variants -- one shared INR axis so the tiers are directly
                comparable (Fat = 2x Standard, Lean < Standard) at a glance,
                instead of four isolated number tiles. */}
            <motion.div variants={fadeUpItem} className="glass rounded-2xl border border-border p-4 sm:p-6">
              <h3 className="text-lg font-semibold mb-4">FIRE Variants</h3>
              <StandardBarChart
                data={[
                  { tier: 'Lean', corpus: fireResult.leanFIRE, color: rawColors.app.green },
                  { tier: 'Barista', corpus: fireResult.baristaFIRE, color: rawColors.app.teal },
                  { tier: 'Standard', corpus: fireResult.fireNumber, color: rawColors.app.blue },
                  { tier: 'Fat', corpus: fireResult.fatFIRE, color: rawColors.app.purple },
                ]}
                layout="vertical"
                yCategoryKey="tier"
                dataKey="tier"
                yWidth={72}
                height={200}
                bars={[
                  {
                    key: 'corpus',
                    color: rawColors.app.blue,
                    getCellColor: (row) => (row as { color: string }).color,
                  },
                ]}
                showLegend={false}
                tooltipFormatter={(v) => formatCurrency(v)}
                xTickFormatter={(v) => formatCurrencyShort(v as number)}
                ariaLabel="Horizontal bar chart comparing the corpus needed for Lean, Barista, Standard and Fat FIRE"
              />
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 mt-3 text-xs text-text-tertiary">
                <p><span className="text-app-green font-medium">Lean</span> · essentials only (60%)</p>
                <p>
                  <span className="text-app-teal font-medium">Barista</span> ·{' '}
                  {baristaMonthlyIncome > 0
                    ? `${formatCurrencyShort(baristaMonthlyIncome)}/mo part-time`
                    : 'set part-time income below'}
                </p>
                <p><span className="text-app-blue font-medium">Standard</span> · current lifestyle</p>
                <p><span className="text-app-purple font-medium">Fat</span> · 2x with buffer</p>
              </div>
            </motion.div>

            {/* FIRE Sliders */}
            <motion.div variants={fadeUpItem} className="glass rounded-2xl border border-border p-4 sm:p-6">
              <h3 className="text-lg font-semibold mb-4">Adjust Assumptions</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-4 sm:gap-6">
                <SliderInput id="fire-swr" label="Safe Withdrawal Rate" value={swr} min={2} max={5} step={0.5} unit="%" valueText={`${swr} percent`} onChange={setSwr} />
                <SliderInput id="fire-return" label="Real Return (post-inflation)" value={realReturn} min={2} max={12} step={0.5} unit="%" valueText={`${realReturn} percent`} onChange={setRealReturn} />
                <SliderInput id="fire-years" label="Years to FIRE" value={yearsToRetire} min={5} max={40} step={1} unit=" yrs" valueText={`${yearsToRetire} years`} onChange={setYearsToRetire} />
                <SliderInput
                  id="fire-barista"
                  label="Barista / Part-time income"
                  value={baristaMonthlyIncome}
                  min={0}
                  max={200_000}
                  step={5_000}
                  unit="/mo"
                  valueText={`${formatCurrency(baristaMonthlyIncome)} per month`}
                  onChange={setBaristaMonthlyIncome}
                />
              </div>
              <p className="text-xs text-text-tertiary mt-4">
                India defaults: 3% SWR (higher inflation vs 4% US rule), 6% real return (12% nominal - 6% inflation).
                Set a non-zero barista income to see how much smaller your corpus needs to be with part-time work.
              </p>
            </motion.div>
          </div>
        ) : (
          <div role="tabpanel" id="retirement-panel" aria-labelledby="retirement-tab" className="space-y-6 md:space-y-8">
            {/* Retirement Metrics */}
            <motion.div variants={fadeUpItem} className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-6">
              <MetricCard title="Required Corpus" value={formatCurrency(retirementResult.requiredCorpus)} icon={Calculator} color="blue" subtitle={`In ${retirementYears} years`} />
              <MetricCard title="Monthly SIP Needed" value={formatCurrency(retirementResult.monthlySIP)} icon={Calculator} color="green" subtitle={`At ${expectedReturn}% return`} />
              <MetricCard title="Future Monthly Expense" value={formatCurrency(retirementResult.monthlyExpenseAtRetirement)} icon={Calculator} color="red" subtitle={`At ${inflation}% inflation`} />
              <MetricCard title="Lump Sum Today" value={formatCurrency(retirementResult.lumpSumToday)} icon={Calculator} color="purple" subtitle="One-time investment alternative" />
            </motion.div>

            {/* Projection Chart */}
            {retirementResult.projectionData.length > 0 && (
              <motion.div variants={fadeUpItem} className="glass rounded-2xl border border-border p-4 sm:p-6">
                <h3 className="text-lg font-semibold mb-4">Corpus Growth Projection</h3>
                <div
                  role="img"
                  aria-label={`Projected retirement corpus growth over ${retirementYears} years, comparing total corpus against amount contributed`}
                >
                  <StandardAreaChart
                    data={retirementResult.projectionData}
                    dataKey="year"
                    height={320}
                    xTickFormatter={(v) => `Yr ${v}`}
                    tooltipFormatter={currencyTooltipFormatter}
                    areas={[
                      { key: 'corpus', color: rawColors.app.blue, label: 'Total Corpus' },
                      {
                        key: 'contributed',
                        color: rawColors.app.green,
                        label: 'Contributed',
                        strokeDasharray: '4 4',
                      },
                    ]}
                  />
                </div>
              </motion.div>
            )}

            {/* Retirement Sliders */}
            <motion.div variants={fadeUpItem} className="glass rounded-2xl border border-border p-4 sm:p-6">
              <h3 className="text-lg font-semibold mb-4">Adjust Assumptions</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-4 sm:gap-6">
                <SliderInput id="ret-inflation" label="Inflation Rate" value={inflation} min={3} max={10} step={0.5} unit="%" valueText={`${inflation} percent`} onChange={setInflation} />
                <SliderInput id="ret-return" label="Expected Return" value={expectedReturn} min={6} max={18} step={0.5} unit="%" valueText={`${expectedReturn} percent`} onChange={setExpectedReturn} />
                <SliderInput id="ret-years" label="Years to Retirement" value={retirementYears} min={5} max={40} step={1} unit=" yrs" valueText={`${retirementYears} years`} onChange={setRetirementYears} />
              </div>
              <p className="text-xs text-text-tertiary mt-4">
                Indian defaults: 6.5% inflation (CPI avg), 12% equity return (Nifty 50 long-term CAGR)
              </p>
            </motion.div>
          </div>
        )}
      </motion.div>
      </div>
    </div>
  )
}
