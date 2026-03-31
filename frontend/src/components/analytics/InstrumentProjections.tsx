import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { Landmark, IndianRupee, PiggyBank, TrendingUp, Percent } from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts'
import { rawColors } from '@/constants/colors'
import { formatCurrency } from '@/lib/formatters'
import { chartTooltipProps, ChartContainer, GRID_DEFAULTS, xAxisDefaults, yAxisDefaults, areaGradient, areaGradientUrl, shouldAnimate, LEGEND_DEFAULTS } from '@/components/ui'
import MetricCard from '@/components/shared/MetricCard'
import { projectPPF, projectEPF, projectNPS } from '@/lib/instrumentCalculators'
import type { ProjectionResult } from '@/lib/instrumentCalculators'

type Instrument = 'ppf' | 'epf' | 'nps'

const TABS: { key: Instrument; label: string }[] = [
  { key: 'ppf', label: 'PPF' },
  { key: 'epf', label: 'EPF' },
  { key: 'nps', label: 'NPS' },
]

function SliderInput({
  id,
  label,
  value,
  onChange,
  min,
  max,
  step,
  suffix,
  prefix,
}: {
  id: string
  label: string
  value: number
  onChange: (v: number) => void
  min: number
  max: number
  step: number
  suffix?: string
  prefix?: string
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label htmlFor={id} className="text-xs text-text-secondary">{label}</label>
        <span className="text-sm font-medium text-white">
          {prefix}{value.toLocaleString('en-IN')}{suffix}
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1.5 rounded-full appearance-none bg-white/10 accent-ios-blue cursor-pointer"
      />
    </div>
  )
}

function ProjectionChart({ data }: { data: ProjectionResult }) {
  const chartData = data.yearByYear.map((y) => ({
    year: `Y${y.year}`,
    Contributed: y.contributed,
    Returns: y.returns,
  }))

  return (
    <ChartContainer height={280}>
      <AreaChart data={chartData} margin={{ top: 5, right: 10, bottom: 5, left: 5 }}>
        <defs>
          {areaGradient('contributed', rawColors.ios.blue, 0.7, 0.1)}
          {areaGradient('returns', rawColors.ios.green, 0.7, 0.1)}
        </defs>
        <CartesianGrid {...GRID_DEFAULTS} />
        <XAxis {...xAxisDefaults(chartData.length)} dataKey="year" tickFormatter={undefined} />
        <YAxis {...yAxisDefaults()} />
        <Tooltip
          {...chartTooltipProps}
          formatter={(value: number | undefined) => formatCurrency(value ?? 0)}
        />
        <Legend {...LEGEND_DEFAULTS} />
        <Area
          type="monotone"
          dataKey="Contributed"
          stackId="1"
          stroke={rawColors.ios.blue}
          fill={areaGradientUrl('contributed')}
          strokeWidth={2}
          dot={false}
          isAnimationActive={shouldAnimate(chartData.length)}
          animationDuration={600}
          animationEasing="ease-out"
        />
        <Area
          type="monotone"
          dataKey="Returns"
          stackId="1"
          stroke={rawColors.ios.green}
          fill={areaGradientUrl('returns')}
          strokeWidth={2}
          dot={false}
          isAnimationActive={shouldAnimate(chartData.length)}
          animationDuration={600}
          animationEasing="ease-out"
        />
      </AreaChart>
    </ChartContainer>
  )
}

function PPFTab() {
  const [balance, setBalance] = useState(0)
  const [annual, setAnnual] = useState(150000)
  const [years, setYears] = useState(15)
  const [rate, setRate] = useState(7.1)

  const result = useMemo(() => projectPPF(balance, annual, years, rate), [balance, annual, years, rate])

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard title="Maturity Value" value={formatCurrency(result.projectedValue)} icon={TrendingUp} color="green" />
        <MetricCard title="Total Invested" value={formatCurrency(result.totalContributed)} icon={PiggyBank} color="blue" />
        <MetricCard title="Interest Earned" value={formatCurrency(result.totalReturns)} icon={IndianRupee} color="purple" />
        <MetricCard title="Rate" value={`${rate}% p.a.`} icon={Percent} color="orange" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SliderInput id="ppf-balance" label="Current Balance" value={balance} onChange={setBalance} min={0} max={5000000} step={10000} prefix="Rs " />
        <SliderInput id="ppf-annual" label="Annual Contribution" value={annual} onChange={setAnnual} min={500} max={150000} step={500} prefix="Rs " />
        <SliderInput id="ppf-years" label="Tenure" value={years} onChange={setYears} min={5} max={30} step={1} suffix=" yrs" />
        <SliderInput id="ppf-rate" label="Interest Rate" value={rate} onChange={setRate} min={5} max={10} step={0.1} suffix="%" />
      </div>
      <ProjectionChart data={result} />
      <p className="text-xs text-text-tertiary">PPF has a 15-year lock-in, extendable in 5-year blocks. Max contribution: Rs 1,50,000/yr. Interest is tax-free (EEE status).</p>
    </div>
  )
}

function EPFTab() {
  const [salary, setSalary] = useState(50000)
  const [empPct, setEmpPct] = useState(12)
  const [erPct, setErPct] = useState(3.67)
  const [rate, setRate] = useState(8.15)
  const [years, setYears] = useState(25)
  const [balance, setBalance] = useState(0)

  const result = useMemo(() => projectEPF(salary, empPct, erPct, rate, years, balance), [salary, empPct, erPct, rate, years, balance])
  const monthlyContribution = salary * (empPct + erPct) / 100

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard title="Maturity Value" value={formatCurrency(result.projectedValue)} icon={TrendingUp} color="green" />
        <MetricCard title="Total Contributed" value={formatCurrency(result.totalContributed)} icon={PiggyBank} color="blue" />
        <MetricCard title="Interest Earned" value={formatCurrency(result.totalReturns)} icon={IndianRupee} color="purple" />
        <MetricCard title="Monthly Contribution" value={formatCurrency(monthlyContribution)} icon={Percent} color="orange" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SliderInput id="epf-balance" label="Current Balance" value={balance} onChange={setBalance} min={0} max={10000000} step={10000} prefix="Rs " />
        <SliderInput id="epf-salary" label="Monthly Basic Salary" value={salary} onChange={setSalary} min={5000} max={500000} step={1000} prefix="Rs " />
        <SliderInput id="epf-emp" label="Employee %" value={empPct} onChange={setEmpPct} min={0} max={20} step={0.5} suffix="%" />
        <SliderInput id="epf-er" label="Employer EPF %" value={erPct} onChange={setErPct} min={0} max={12} step={0.01} suffix="%" />
        <SliderInput id="epf-rate" label="Interest Rate" value={rate} onChange={setRate} min={5} max={12} step={0.05} suffix="%" />
        <SliderInput id="epf-years" label="Years to Retirement" value={years} onChange={setYears} min={1} max={35} step={1} suffix=" yrs" />
      </div>
      <ProjectionChart data={result} />
      <p className="text-xs text-text-tertiary">Employee contributes 12% of basic, employer contributes 3.67% to EPF (remaining 8.33% goes to EPS). Interest up to Rs 2.5L contribution is tax-free.</p>
    </div>
  )
}

function NPSTab() {
  const [monthly, setMonthly] = useState(5000)
  const [equity, setEquity] = useState(50)
  const [corp, setCorp] = useState(30)
  const [govt, setGovt] = useState(20)
  const [years, setYears] = useState(25)
  const [balance, setBalance] = useState(0)

  // Keep allocation summing to 100
  const handleEquity = (v: number) => {
    const remaining = 100 - v
    const ratio = corp + govt > 0 ? corp / (corp + govt) : 0.5
    setEquity(v)
    setCorp(Math.round(remaining * ratio))
    setGovt(remaining - Math.round(remaining * ratio))
  }

  const result = useMemo(() => projectNPS(monthly, equity, corp, govt, 10, 8.5, 7.5, years, balance), [monthly, equity, corp, govt, years, balance])
  const weightedReturn = (equity / 100) * 10 + (corp / 100) * 8.5 + (govt / 100) * 7.5

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard title="Maturity Value" value={formatCurrency(result.projectedValue)} icon={TrendingUp} color="green" />
        <MetricCard title="Total Contributed" value={formatCurrency(result.totalContributed)} icon={PiggyBank} color="blue" />
        <MetricCard title="Interest Earned" value={formatCurrency(result.totalReturns)} icon={IndianRupee} color="purple" />
        <MetricCard title="Weighted Return" value={`${weightedReturn.toFixed(1)}% p.a.`} icon={Percent} color="orange" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SliderInput id="nps-balance" label="Current Balance" value={balance} onChange={setBalance} min={0} max={10000000} step={10000} prefix="Rs " />
        <SliderInput id="nps-monthly" label="Monthly Contribution" value={monthly} onChange={setMonthly} min={500} max={100000} step={500} prefix="Rs " />
        <SliderInput id="nps-equity" label="Equity (E)" value={equity} onChange={handleEquity} min={0} max={75} step={5} suffix="%" />
        <SliderInput id="nps-years" label="Years to Retirement" value={years} onChange={setYears} min={1} max={35} step={1} suffix=" yrs" />
      </div>
      <div className="flex items-center gap-4 text-xs text-text-tertiary">
        <span>Allocation: E {equity}% | C {corp}% | G {govt}%</span>
      </div>
      <ProjectionChart data={result} />
      <p className="text-xs text-text-tertiary">NPS Tier-I: Max 75% equity (auto-choice). At maturity, 60% is tax-free lump sum, 40% must buy annuity. Extra Rs 50K deduction under 80CCD(1B).</p>
    </div>
  )
}

export default function InstrumentProjections() {
  const [tab, setTab] = useState<Instrument>('ppf')

  return (
    <motion.div
      className="glass rounded-2xl border border-border p-6"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
    >
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <Landmark className="w-5 h-5 text-ios-blue" />
          <h3 className="text-lg font-semibold text-white">Instrument Maturity Projections</h3>
        </div>
        <div className="flex gap-1 p-0.5 rounded-lg bg-muted/20">
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${tab === key ? 'bg-white/10 text-white' : 'text-muted-foreground hover:text-white'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'ppf' && <PPFTab />}
      {tab === 'epf' && <EPFTab />}
      {tab === 'nps' && <NPSTab />}
    </motion.div>
  )
}
