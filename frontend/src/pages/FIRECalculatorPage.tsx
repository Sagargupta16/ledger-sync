import { useState, useMemo } from 'react'

import { motion } from 'framer-motion'
import { Flame, Calculator } from 'lucide-react'
import { staggerContainer, fadeUpItem } from '@/constants/animations'
import { useTransactions } from '@/hooks/api/useTransactions'
import { PageSkeleton } from '@/components/shared/LoadingSkeleton'
import { useTotals } from '@/hooks/api/useAnalytics'
import { formatCurrency } from '@/lib/formatters'
import { computeFIRE, computeRetirementCorpus } from '@/lib/fireCalculator'
import { rawColors } from '@/constants/colors'
import MetricCard from '@/components/shared/MetricCard'
import StandardAreaChart from '@/components/analytics/StandardAreaChart'
import { PageHeader } from '@/components/ui'

function SliderInput({ id, label, value, min, max, step, unit, onChange }: Readonly<{
  id: string; label: string; value: number; min: number; max: number; step: number; unit: string
  onChange: (v: number) => void
}>) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label htmlFor={id} className="text-xs font-medium text-muted-foreground">{label}</label>
        <span className="text-xs font-semibold text-foreground">{value}{unit}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1.5 rounded-full appearance-none bg-white/10 accent-app-blue cursor-pointer"
      />
    </div>
  )
}

function savingsRateSubtitle(rate: number): string {
  if (rate >= 50) return 'FIRE-ready pace'
  if (rate >= 20) return 'Good, increase for FIRE'
  return 'Needs improvement'
}

export default function FIRECalculatorPage() {
  const { data: transactions = [], isLoading } = useTransactions()
  const { data: totals } = useTotals()
  const [activeTab, setActiveTab] = useState<'fire' | 'retirement'>('fire')

  // FIRE inputs with defaults from transaction data
  const autoValues = useMemo(() => {
    const totalIncome = totals?.total_income ?? 0
    const totalExpenses = Math.abs(totals?.total_expenses ?? 0)
    // Estimate annual values (assume data spans ~12 months)
    const months = new Set(transactions.map((t) => t.date.substring(0, 7))).size || 1
    const annualIncome = (totalIncome / months) * 12
    const annualExpenses = (totalExpenses / months) * 12
    const annualSavings = annualIncome - annualExpenses
    const monthlyExpenses = annualExpenses / 12
    return { annualIncome, annualExpenses, annualSavings, monthlyExpenses }
  }, [transactions, totals])

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
    <div className="min-h-screen p-4 md:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6 md:space-y-8">
        <PageHeader
          title="FIRE & Retirement Calculator"
          subtitle="Plan your financial independence using your actual spending data"
          action={
            <div className="flex gap-1 p-1 rounded-lg bg-muted/20">
              <button
                onClick={() => setActiveTab('fire')}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${activeTab === 'fire' ? 'bg-white/10 text-white' : 'text-muted-foreground hover:text-white'}`}
              >
                <Flame className="w-4 h-4 inline mr-1.5" />FIRE
              </button>
              <button
                onClick={() => setActiveTab('retirement')}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${activeTab === 'retirement' ? 'bg-white/10 text-white' : 'text-muted-foreground hover:text-white'}`}
              >
                <Calculator className="w-4 h-4 inline mr-1.5" />Retirement
              </button>
            </div>
          }
        />
      <motion.div
        initial="hidden"
        animate="visible"
        variants={staggerContainer}
        className="space-y-6 md:space-y-8"
      >

        {activeTab === 'fire' ? (
          <>
            {/* FIRE Metrics */}
            <motion.div variants={fadeUpItem} className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-6">
              <MetricCard title="FIRE Number" value={formatCurrency(fireResult.fireNumber)} icon={Flame} color="red" subtitle={`At ${swr}% SWR`} />
              <MetricCard title="Years to FIRE" value={fireResult.yearsToFIRE === Infinity ? 'N/A' : `${fireResult.yearsToFIRE.toFixed(1)} yrs`} icon={Flame} color="orange" subtitle={`At ${realReturn}% real return`} />
              <MetricCard title="Coast FIRE" value={formatCurrency(fireResult.coastFIRE)} icon={Flame} color="teal" subtitle="Amount needed today" />
              <MetricCard title="Savings Rate" value={`${fireResult.currentSavingsRate.toFixed(1)}%`} icon={Flame} color="green" subtitle={savingsRateSubtitle(fireResult.currentSavingsRate)} />
            </motion.div>

            {/* FIRE Variants */}
            <motion.div variants={fadeUpItem} className="glass rounded-2xl border border-border p-6">
              <h3 className="text-lg font-semibold mb-4">FIRE Variants</h3>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-4 rounded-xl bg-app-green/5 border border-app-green/20">
                  <p className="text-xs text-muted-foreground mb-1">Lean FIRE</p>
                  <p className="text-xl font-bold text-app-green">{formatCurrency(fireResult.leanFIRE)}</p>
                  <p className="text-xs text-text-tertiary mt-1">Essential expenses only (60%)</p>
                </div>
                <div className="p-4 rounded-xl bg-app-teal/5 border border-app-teal/20">
                  <p className="text-xs text-muted-foreground mb-1">Barista FIRE</p>
                  <p className="text-xl font-bold text-app-teal">{formatCurrency(fireResult.baristaFIRE)}</p>
                  <p className="text-xs text-text-tertiary mt-1">
                    {baristaMonthlyIncome > 0
                      ? `With ${formatCurrency(baristaMonthlyIncome)}/mo part-time`
                      : 'Set part-time income below'}
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-app-blue/5 border border-app-blue/20">
                  <p className="text-xs text-muted-foreground mb-1">Standard FIRE</p>
                  <p className="text-xl font-bold text-app-blue">{formatCurrency(fireResult.fireNumber)}</p>
                  <p className="text-xs text-text-tertiary mt-1">Current lifestyle maintained</p>
                </div>
                <div className="p-4 rounded-xl bg-app-purple/5 border border-app-purple/20">
                  <p className="text-xs text-muted-foreground mb-1">Fat FIRE</p>
                  <p className="text-xl font-bold text-app-purple">{formatCurrency(fireResult.fatFIRE)}</p>
                  <p className="text-xs text-text-tertiary mt-1">2x lifestyle with buffer</p>
                </div>
              </div>
            </motion.div>

            {/* FIRE Sliders */}
            <motion.div variants={fadeUpItem} className="glass rounded-2xl border border-border p-6">
              <h3 className="text-lg font-semibold mb-4">Adjust Assumptions</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                <SliderInput id="fire-swr" label="Safe Withdrawal Rate" value={swr} min={2} max={5} step={0.5} unit="%" onChange={setSwr} />
                <SliderInput id="fire-return" label="Real Return (post-inflation)" value={realReturn} min={2} max={12} step={0.5} unit="%" onChange={setRealReturn} />
                <SliderInput id="fire-years" label="Years to Retirement" value={yearsToRetire} min={5} max={40} step={1} unit=" yrs" onChange={setYearsToRetire} />
                <SliderInput
                  id="fire-barista"
                  label="Barista / Part-time income"
                  value={baristaMonthlyIncome}
                  min={0}
                  max={200_000}
                  step={5_000}
                  unit="/mo"
                  onChange={setBaristaMonthlyIncome}
                />
              </div>
              <p className="text-xs text-text-quaternary mt-4">
                India defaults: 3% SWR (higher inflation vs 4% US rule), 6% real return (12% nominal - 6% inflation).
                Set a non-zero barista income to see how much smaller your corpus needs to be with part-time work.
              </p>
            </motion.div>
          </>
        ) : (
          <>
            {/* Retirement Metrics */}
            <motion.div variants={fadeUpItem} className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-6">
              <MetricCard title="Required Corpus" value={formatCurrency(retirementResult.requiredCorpus)} icon={Calculator} color="blue" subtitle={`In ${retirementYears} years`} />
              <MetricCard title="Monthly SIP Needed" value={formatCurrency(retirementResult.monthlySIP)} icon={Calculator} color="green" subtitle={`At ${expectedReturn}% return`} />
              <MetricCard title="Future Monthly Expense" value={formatCurrency(retirementResult.monthlyExpenseAtRetirement)} icon={Calculator} color="red" subtitle={`At ${inflation}% inflation`} />
              <MetricCard title="Lump Sum Today" value={formatCurrency(retirementResult.lumpSumToday)} icon={Calculator} color="purple" subtitle="One-time investment alternative" />
            </motion.div>

            {/* Projection Chart */}
            {retirementResult.projectionData.length > 0 && (
              <motion.div variants={fadeUpItem} className="glass rounded-2xl border border-border p-6">
                <h3 className="text-lg font-semibold mb-4">Corpus Growth Projection</h3>
                <StandardAreaChart
                  data={retirementResult.projectionData}
                  dataKey="year"
                  height={320}
                  xTickFormatter={(v) => `Yr ${v}`}
                  tooltipFormatter={(value) => formatCurrency(value)}
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
              </motion.div>
            )}

            {/* Retirement Sliders */}
            <motion.div variants={fadeUpItem} className="glass rounded-2xl border border-border p-6">
              <h3 className="text-lg font-semibold mb-4">Adjust Assumptions</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                <SliderInput id="ret-inflation" label="Inflation Rate" value={inflation} min={3} max={10} step={0.5} unit="%" onChange={setInflation} />
                <SliderInput id="ret-return" label="Expected Return" value={expectedReturn} min={6} max={18} step={0.5} unit="%" onChange={setExpectedReturn} />
                <SliderInput id="ret-years" label="Years to Retirement" value={retirementYears} min={5} max={40} step={1} unit=" yrs" onChange={setRetirementYears} />
              </div>
              <p className="text-xs text-text-quaternary mt-4">
                Indian defaults: 6.5% inflation (CPI avg), 12% equity return (Nifty 50 long-term CAGR)
              </p>
            </motion.div>
          </>
        )}
      </motion.div>
      </div>
    </div>
  )
}
