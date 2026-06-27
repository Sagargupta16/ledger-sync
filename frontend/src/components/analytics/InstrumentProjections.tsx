import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { Landmark, IndianRupee, PiggyBank, TrendingUp, Percent } from 'lucide-react'
import { formatCurrency } from '@/lib/formatters'
import { StaleDataBadge } from '@/components/shared/StaleDataBadge'
import MetricCard from '@/components/shared/MetricCard'
import { projectPPF, projectEPF, projectNPS } from '@/lib/instrumentCalculators'
import { useAccountBalances } from '@/hooks/api/useAnalytics'
import { useInstrumentRates } from '@/hooks/api/useInstrumentRates'
import type { InstrumentRates } from '@/services/api/rates'

import { ProjectionChart, SliderInput } from './instrumentProjectionComponents'
import {
  TABS,
  computeEpfContribution,
  computeWeightedReturn,
  findAccountBalance,
  rebalanceNpsAllocation,
  type Instrument,
} from './instrumentProjectionUtils'

function PPFTab({
  initialBalance,
  rates,
}: Readonly<{ initialBalance: number; rates: InstrumentRates }>) {
  const [balance, setBalance] = useState(initialBalance)
  const [annual, setAnnual] = useState(150000)
  const [years, setYears] = useState(15)
  const [rate, setRate] = useState(rates.ppf.rate_pct)

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

function EPFTab({
  initialBalance,
  rates,
}: Readonly<{ initialBalance: number; rates: InstrumentRates }>) {
  const [salary, setSalary] = useState(50000)
  const [contribPct, setContribPct] = useState(12)
  const [rate, setRate] = useState(rates.epf.rate_pct)
  const [years, setYears] = useState(25)
  const [balance, setBalance] = useState(initialBalance)

  const result = useMemo(
    () => projectEPF(salary, contribPct, rate, years, balance),
    [salary, contribPct, rate, years, balance],
  )

  const { yourShare, employerEpf, totalMonthly, minContrib } = computeEpfContribution(salary, contribPct)

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard title="Maturity Value" value={formatCurrency(result.projectedValue)} icon={TrendingUp} color="green" />
        <MetricCard title="Total Contributed" value={formatCurrency(result.totalContributed)} icon={PiggyBank} color="blue" />
        <MetricCard title="Interest Earned" value={formatCurrency(result.totalReturns)} icon={IndianRupee} color="purple" />
        <MetricCard title="Monthly (You + Employer)" value={formatCurrency(totalMonthly)} icon={Percent} color="orange"
          subtitle={`You Rs ${Math.round(yourShare).toLocaleString('en-IN')} + Employer Rs ${Math.round(employerEpf).toLocaleString('en-IN')}`} />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SliderInput id="epf-balance" label="Current EPF Balance" value={balance} onChange={setBalance} min={0} max={10000000} step={10000} prefix="Rs " />
        <SliderInput id="epf-salary" label="Monthly Basic Salary" value={salary} onChange={setSalary} min={15000} max={500000} step={1000} prefix="Rs " />
        <SliderInput id="epf-pct" label={`Contribution (min Rs ${minContrib.toLocaleString('en-IN')})`} value={contribPct} onChange={setContribPct} min={12} max={20} step={0.5} suffix="%" />
        <SliderInput id="epf-rate" label={`Interest Rate (current: ${rates.epf.rate_pct}%)`} value={rate} onChange={setRate} min={5} max={12} step={0.05} suffix="%" />
        <SliderInput id="epf-years" label="Years to Retirement" value={years} onChange={setYears} min={1} max={35} step={1} suffix=" yrs" />
      </div>
      <ProjectionChart data={result} />
      <p className="text-xs text-text-tertiary">You contribute {contribPct}% of basic; your employer adds 12%, but 8.33% of the capped Rs 15,000 wage (max Rs 1,250/mo) goes to EPS pension, not the EPF corpus. Minimum: 12% (Rs 1,800/mo on the PF wage ceiling). Employee can voluntarily increase up to 20% (VPF).</p>
    </div>
  )
}

function NPSTab({ rates }: Readonly<{ rates: InstrumentRates }>) {
  const defaultAlloc = rates.nps.default_allocation_pct
  const returns = rates.nps.historical_return_pct
  const [monthly, setMonthly] = useState(5000)
  const [equity, setEquity] = useState(defaultAlloc.equity)
  const [corp, setCorp] = useState(defaultAlloc.corp_bond)
  const [govt, setGovt] = useState(defaultAlloc.govt_bond)
  const [years, setYears] = useState(25)
  const [balance, setBalance] = useState(0)

  const handleEquity = (v: number) => {
    const next = rebalanceNpsAllocation(v, corp, govt)
    setEquity(next.equity)
    setCorp(next.corp)
    setGovt(next.govt)
  }

  const result = useMemo(() => projectNPS({
    monthlyContribution: monthly,
    equityPct: equity,
    corpBondPct: corp,
    govtBondPct: govt,
    equityReturn: returns.equity,
    corpReturn: returns.corp_bond,
    govtReturn: returns.govt_bond,
    years,
    currentBalance: balance,
  }), [monthly, equity, corp, govt, returns, years, balance])
  const weightedReturn = computeWeightedReturn(equity, corp, govt, returns)

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
  const { data: accountBalances } = useAccountBalances()
  const { data: rates, isFallback } = useInstrumentRates()
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
          <StaleDataBadge
            isFallback={isFallback}
            reason="Couldn't fetch the latest instrument rates -- using compiled-in defaults until the next refresh."
          />
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

      {tab === 'ppf' && <PPFTab initialBalance={ppfBalance} rates={rates} />}
      {tab === 'epf' && <EPFTab initialBalance={epfBalance} rates={rates} />}
      {tab === 'nps' && <NPSTab rates={rates} />}
    </motion.div>
  )
}
