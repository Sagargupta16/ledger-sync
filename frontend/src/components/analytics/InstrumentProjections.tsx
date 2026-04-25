import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { Landmark, IndianRupee, PiggyBank, TrendingUp, Percent } from 'lucide-react'
import { rawColors } from '@/constants/colors'
import { formatCurrency } from '@/lib/formatters'
import StandardAreaChart from '@/components/analytics/StandardAreaChart'
import MetricCard from '@/components/shared/MetricCard'
import { projectPPF, projectEPF, projectNPS } from '@/lib/instrumentCalculators'
import type { ProjectionResult } from '@/lib/instrumentCalculators'
import { useAccountBalances } from '@/hooks/api/useAnalytics'
import type { AccountBalances } from '@/services/api/calculations'

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
}: Readonly<{
  id: string
  label: string
  value: number
  onChange: (v: number) => void
  min: number
  max: number
  step: number
  suffix?: string
  prefix?: string
}>) {
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
        className="w-full h-1.5 rounded-full appearance-none bg-white/10 accent-app-blue cursor-pointer"
      />
    </div>
  )
}

function ProjectionChart({ data }: Readonly<{ data: ProjectionResult }>) {
  const chartData = data.yearByYear.map((y) => ({
    year: `Y${y.year}`,
    Contributed: y.contributed,
    Returns: y.returns,
  }))

  return (
    <StandardAreaChart
      data={chartData}
      dataKey="year"
      height={280}
      stacked
      tooltipFormatter={formatCurrency}
      areas={[
        { key: 'Contributed', color: rawColors.app.blue, fillOpacity: 0.7 },
        { key: 'Returns', color: rawColors.app.green, fillOpacity: 0.7 },
      ]}
    />
  )
}

function PPFTab({ initialBalance }: Readonly<{ initialBalance: number }>) {
  const [balance, setBalance] = useState(initialBalance)
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

function EPFTab({ initialBalance }: Readonly<{ initialBalance: number }>) {
  const [salary, setSalary] = useState(50000)
  const [contribPct, setContribPct] = useState(12)
  const [rate, setRate] = useState(8.25)
  const [years, setYears] = useState(25)
  const [balance, setBalance] = useState(initialBalance)

  // Employee + employer both contribute the same %, total = 2x
  const yourShare = salary * contribPct / 100
  const totalMonthly = yourShare * 2
  // Min contribution: 12% of Rs 15,000 (PF wage ceiling) = Rs 1,800
  const minContrib = Math.max(1800, salary * 12 / 100)

  const result = useMemo(
    () => projectEPF(salary, contribPct, contribPct, rate, years, balance),
    [salary, contribPct, rate, years, balance],
  )

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard title="Maturity Value" value={formatCurrency(result.projectedValue)} icon={TrendingUp} color="green" />
        <MetricCard title="Total Contributed" value={formatCurrency(result.totalContributed)} icon={PiggyBank} color="blue" />
        <MetricCard title="Interest Earned" value={formatCurrency(result.totalReturns)} icon={IndianRupee} color="purple" />
        <MetricCard title="Monthly (You + Employer)" value={formatCurrency(totalMonthly)} icon={Percent} color="orange"
          subtitle={`Rs ${Math.round(yourShare).toLocaleString('en-IN')} x 2`} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SliderInput id="epf-balance" label="Current EPF Balance" value={balance} onChange={setBalance} min={0} max={10000000} step={10000} prefix="Rs " />
        <SliderInput id="epf-salary" label="Monthly Basic Salary" value={salary} onChange={setSalary} min={15000} max={500000} step={1000} prefix="Rs " />
        <SliderInput id="epf-pct" label={`Contribution (min Rs ${minContrib.toLocaleString('en-IN')})`} value={contribPct} onChange={setContribPct} min={12} max={20} step={0.5} suffix="%" />
        <SliderInput id="epf-rate" label="Interest Rate (FY25: 8.25%)" value={rate} onChange={setRate} min={5} max={12} step={0.05} suffix="%" />
        <SliderInput id="epf-years" label="Years to Retirement" value={years} onChange={setYears} min={1} max={35} step={1} suffix=" yrs" />
      </div>
      <ProjectionChart data={result} />
      <p className="text-xs text-text-tertiary">Both employee and employer contribute {contribPct}% of basic. Minimum: 12% (Rs 1,800/mo on PF wage ceiling of Rs 15,000). Employee can voluntarily increase up to 20% (VPF).</p>
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

  const result = useMemo(() => projectNPS({
    monthlyContribution: monthly, equityPct: equity, corpBondPct: corp, govtBondPct: govt, years, currentBalance: balance,
  }), [monthly, equity, corp, govt, years, balance])
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

function findAccountBalance(data: AccountBalances | undefined, pattern: string): number {
  if (!data?.accounts) return 0
  const key = Object.keys(data.accounts).find((k) => k.toLowerCase().includes(pattern))
  return key ? Math.max(0, data.accounts[key].balance) : 0
}

export default function InstrumentProjections() {
  const { data: accountBalances } = useAccountBalances()
  const ppfBalance = useMemo(() => findAccountBalance(accountBalances, 'ppf'), [accountBalances])
  const epfBalance = useMemo(() => findAccountBalance(accountBalances, 'epf'), [accountBalances])
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
          <Landmark className="w-5 h-5 text-app-blue" />
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

      {tab === 'ppf' && <PPFTab initialBalance={ppfBalance} />}
      {tab === 'epf' && <EPFTab initialBalance={epfBalance} />}
      {tab === 'nps' && <NPSTab />}
    </motion.div>
  )
}
