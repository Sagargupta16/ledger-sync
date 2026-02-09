import { motion } from 'framer-motion'
import { Shield, TrendingUp, AlertTriangle, CheckCircle, Info, ChevronDown, ChevronUp } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTransactions } from '@/hooks/api/useTransactions'
import { useInvestmentAccountStore } from '@/store/investmentAccountStore'
import { formatCurrencyCompact } from '@/lib/formatters'
import type { Transaction } from '@/types'

interface HealthMetric {
  name: string
  score: number
  weight: number
  status: 'excellent' | 'good' | 'fair' | 'poor'
  description: string
  details?: string[]
}

interface MonthlyBucket {
  income: number
  expense: number
  debt: number
  investmentInflow: number
  investmentOutflow: number
  discretionary: number
  essential: number
  categories: Record<string, number>
}

interface AnalysisResult {
  monthsAnalyzed: number
  cashflowMargin: number
  surplusRatio: number
  avgMonthlyIncome: number
  avgMonthlyExpense: number
  avgSavingsRate: number
  savingsConsistency: number
  savingsTrendPositive: boolean
  debtToIncomeRatio: number
  overspendingFrequency: number
  avgMonthlyDebt: number
  discretionaryRatio: number
  spendingVolatility: number
  lifestyleInflation: number
  positiveSavingsRatio: number
  avgPositiveSavingsRate: number
  investmentRegularity: number
  netInvestmentToIncomeRatio: number
  investmentConsistency: number
  totalNetInvestment: number
  totalInvestmentInflow: number
  totalInvestmentOutflow: number
  incomeStability: number
  incomeGrowth: number
}

// Categories that indicate debt/EMI payments
const DEBT_CATEGORIES = ['EMI', 'Loan', 'Credit Card Payment', 'Mortgage', 'Personal Loan', 'Car Loan', 'Home Loan']

// Categories that indicate discretionary spending
const DISCRETIONARY_CATEGORIES = ['Entertainment', 'Shopping', 'Dining', 'Travel', 'Leisure', 'Recreation', 'Gifts', 'Subscriptions', 'Personal Care']

// Categories that indicate essential spending
const ESSENTIAL_CATEGORIES = ['Rent', 'Utilities', 'Groceries', 'Healthcare', 'Insurance', 'Education', 'Transportation', 'Fuel', 'Medicine']

// Investment account name patterns (to_account must contain these for transfers TO be investments)
const INVESTMENT_ACCOUNT_PATTERNS = ['mutual fund', 'mf', 'grow', 'zerodha', 'kuvera', 'coin', 'smallcase', 'stocks', 'demat', 'ppf', 'nps', 'elss', 'epf']

// Investment note/category keywords
const INVESTMENT_NOTE_KEYWORDS = ['sip', 'mutual fund', 'investment', 'ppf', 'nps', 'elss', 'epf']

// ---------- Pure helper functions ----------

function deriveStatus(score: number): HealthMetric['status'] {
  if (score >= 80) return 'excellent'
  if (score >= 60) return 'good'
  if (score >= 40) return 'fair'
  return 'poor'
}

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, score))
}

function scoreCashflowMargin(margin: number): number {
  if (margin >= 30) return 50
  if (margin >= 20) return 40
  if (margin >= 10) return 30
  if (margin >= 0) return 15
  return 0
}

function describeCashflow(margin: number): string {
  if (margin >= 20) return 'Healthy surplus'
  if (margin >= 0) return 'Breaking even'
  return 'Deficit spending'
}

function scoreSavingsRate(rate: number): number {
  if (rate >= 30) return 50
  if (rate >= 20) return 40
  if (rate >= 10) return 25
  if (rate >= 0) return 10
  return 0
}

function describeDebt(ratio: number): string {
  if (ratio < 20) return 'Low debt burden'
  if (ratio < 40) return 'Moderate debt'
  return 'High debt burden'
}

function debtRatioPenalty(ratio: number): number {
  if (ratio > 50) return 60
  if (ratio > 40) return 45
  if (ratio > 30) return 30
  if (ratio > 20) return 15
  if (ratio > 10) return 5
  return 0
}

function describeDiscipline(score: number): string {
  if (score >= 70) return 'Well controlled'
  if (score >= 50) return 'Moderate control'
  return 'Needs attention'
}

function discretionaryPenalty(ratio: number): number {
  if (ratio > 40) return 25
  if (ratio > 30) return 15
  if (ratio > 20) return 5
  return 0
}

function volatilityPenalty(volatility: number): number {
  if (volatility > 50) return 25
  if (volatility > 30) return 15
  if (volatility > 20) return 5
  return 0
}

function lifestyleInflationAdjustment(inflation: number): number {
  if (inflation > 30) return -30
  if (inflation > 15) return -15
  if (inflation > 5) return -5
  if (inflation < -5) return 10
  return 0
}

function describeSavingsBuffer(score: number): string {
  if (score >= 70) return 'Building reserves'
  if (score >= 40) return 'Some savings'
  return 'Improve savings habit'
}

function scoreAvgPositiveSavingsRate(rate: number): number {
  if (rate >= 25) return 50
  if (rate >= 20) return 40
  if (rate >= 15) return 30
  if (rate >= 10) return 20
  if (rate >= 5) return 10
  return 0
}

function scoreNetInvestmentRatio(ratio: number): number {
  if (ratio >= 20) return 40
  if (ratio >= 15) return 30
  if (ratio >= 10) return 20
  if (ratio >= 5) return 10
  if (ratio >= 0) return 5
  return 0
}

function describeInvestment(netRatio: number): string {
  if (netRatio >= 15) return 'Strong investor'
  if (netRatio >= 5) return 'Regular investing'
  if (netRatio >= 0) return 'Some investing'
  return 'Net withdrawal'
}

function createEmptyBucket(): MonthlyBucket {
  return {
    income: 0,
    expense: 0,
    debt: 0,
    investmentInflow: 0,
    investmentOutflow: 0,
    discretionary: 0,
    essential: 0,
    categories: {},
  }
}

function matchesCategoryList(category: string, list: string[]): boolean {
  const lower = category.toLowerCase()
  return list.some((c) => lower.includes(c.toLowerCase()))
}

function matchesPatterns(value: string, patterns: string[]): boolean {
  const lower = value.toLowerCase()
  return patterns.some((p) => lower.includes(p))
}

function halfAverage(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((a, b) => a + b, 0) / values.length
}

// ---------- Investment detection ----------

function checkIsInvestmentTransaction(
  tx: Transaction,
  isInvestmentAccount: (name: string) => boolean,
): boolean {
  if (tx.type !== 'Transfer' || !tx.to_account) return false

  const toAccount = tx.to_account.toLowerCase()
  const note = (tx.note || '').toLowerCase()
  const category = (tx.category || '').toLowerCase()

  if (isInvestmentAccount(tx.to_account)) return true
  if (matchesPatterns(toAccount, INVESTMENT_ACCOUNT_PATTERNS)) return true
  if (matchesPatterns(note, INVESTMENT_NOTE_KEYWORDS)) return true
  if (matchesPatterns(category, INVESTMENT_NOTE_KEYWORDS)) return true

  return false
}

function isToAccountInvestment(
  toAccount: string | undefined,
  isInvestmentAccount: (name: string) => boolean,
): boolean {
  if (!toAccount) return false
  if (isInvestmentAccount(toAccount)) return true
  return matchesPatterns(toAccount.toLowerCase(), INVESTMENT_ACCOUNT_PATTERNS)
}

function checkIsInvestmentWithdrawal(
  tx: Transaction,
  isInvestmentAccount: (name: string) => boolean,
): boolean {
  if (tx.type !== 'Transfer' || !tx.from_account) return false

  const fromAccount = tx.from_account.toLowerCase()
  const toIsInvestment = isToAccountInvestment(tx.to_account, isInvestmentAccount)

  if (isInvestmentAccount(tx.from_account) && !toIsInvestment) return true
  if (matchesPatterns(fromAccount, INVESTMENT_ACCOUNT_PATTERNS) && !toIsInvestment) return true

  return false
}

// ---------- Monthly data classification ----------

function classifyTransaction(
  tx: Transaction,
  bucket: MonthlyBucket,
  isInvestmentAccount: (name: string) => boolean,
): void {
  const amount = Math.abs(tx.amount)
  const category = tx.category || 'Other'

  if (checkIsInvestmentTransaction(tx, isInvestmentAccount)) {
    bucket.investmentInflow += amount
    return
  }
  if (checkIsInvestmentWithdrawal(tx, isInvestmentAccount)) {
    bucket.investmentOutflow += amount
    return
  }
  if (tx.type === 'Income') {
    bucket.income += amount
    return
  }
  if (tx.type === 'Expense') {
    bucket.expense += amount
    bucket.categories[category] = (bucket.categories[category] || 0) + amount
    if (matchesCategoryList(category, DEBT_CATEGORIES)) bucket.debt += amount
    if (matchesCategoryList(category, DISCRETIONARY_CATEGORIES)) bucket.discretionary += amount
    if (matchesCategoryList(category, ESSENTIAL_CATEGORIES)) bucket.essential += amount
  }
}

// ---------- Metric builders ----------

function buildCashflowMetric(data: AnalysisResult): HealthMetric {
  const marginPoints = scoreCashflowMargin(data.cashflowMargin)
  const surplusPoints = data.surplusRatio * 50
  const score = marginPoints + surplusPoints

  return {
    name: 'Cashflow Strength',
    score,
    weight: 25,
    status: deriveStatus(score),
    description: describeCashflow(data.cashflowMargin),
    details: [
      `Avg margin: ${data.cashflowMargin.toFixed(1)}%`,
      `${Math.round(data.surplusRatio * 100)}% months with surplus`,
    ],
  }
}

function buildSavingsMetric(data: AnalysisResult): HealthMetric {
  const ratePoints = scoreSavingsRate(data.avgSavingsRate)
  const consistencyPoints = (data.savingsConsistency / 100) * 30
  const trendPoints = data.savingsTrendPositive ? 20 : 5
  const score = ratePoints + consistencyPoints + trendPoints

  return {
    name: 'Savings Trend',
    score,
    weight: 20,
    status: deriveStatus(score),
    description: `${data.avgSavingsRate.toFixed(1)}% avg savings rate`,
    details: [
      `Avg savings rate: ${data.avgSavingsRate.toFixed(1)}%`,
      `Trend: ${data.savingsTrendPositive ? 'Improving' : 'Declining'}`,
    ],
  }
}

function buildDebtMetric(data: AnalysisResult): HealthMetric {
  const penalty = debtRatioPenalty(data.debtToIncomeRatio)
  const overspendPenalty = data.overspendingFrequency * 40
  const score = clampScore(100 - penalty - overspendPenalty)

  return {
    name: 'Debt Management',
    score,
    weight: 20,
    status: deriveStatus(score),
    description: describeDebt(data.debtToIncomeRatio),
    details: [
      `Debt-to-income: ${data.debtToIncomeRatio.toFixed(1)}%`,
      `Overspending: ${Math.round(data.overspendingFrequency * 100)}% of months`,
    ],
  }
}

function buildDisciplineMetric(data: AnalysisResult): HealthMetric {
  const discPenalty = discretionaryPenalty(data.discretionaryRatio)
  const volPenalty = volatilityPenalty(data.spendingVolatility)
  const inflationAdj = lifestyleInflationAdjustment(data.lifestyleInflation)
  const score = clampScore(100 - discPenalty - volPenalty + inflationAdj)

  const inflationSign = data.lifestyleInflation > 0 ? '+' : ''

  return {
    name: 'Expense Discipline',
    score,
    weight: 15,
    status: deriveStatus(score),
    description: describeDiscipline(score),
    details: [
      `Discretionary: ${data.discretionaryRatio.toFixed(1)}% of expenses`,
      `Lifestyle change: ${inflationSign}${data.lifestyleInflation.toFixed(1)}%`,
    ],
  }
}

function buildSavingsBufferMetric(data: AnalysisResult): HealthMetric {
  const frequencyPoints = data.positiveSavingsRatio * 50
  const ratePoints = scoreAvgPositiveSavingsRate(data.avgPositiveSavingsRate)
  const score = Math.min(100, frequencyPoints + ratePoints)

  return {
    name: 'Savings Buffer',
    score,
    weight: 10,
    status: deriveStatus(score),
    description: describeSavingsBuffer(score),
    details: [
      `${Math.round(data.positiveSavingsRatio * 100)}% months with positive savings`,
      `Avg savings rate: ${data.avgPositiveSavingsRate.toFixed(1)}% when saving`,
    ],
  }
}

function buildInvestmentMetric(data: AnalysisResult): HealthMetric {
  const netRatio = data.netInvestmentToIncomeRatio
  const regularityPoints = data.investmentRegularity * 40
  const ratioPoints = scoreNetInvestmentRatio(netRatio)
  const consistencyPoints = (data.investmentConsistency / 100) * 20
  const score = Math.min(100, regularityPoints + ratioPoints + consistencyPoints)

  const details = [
    `${Math.round(data.investmentRegularity * 100)}% months with net investments`,
    `${netRatio.toFixed(1)}% of income (net invested)`,
  ]
  if (data.totalInvestmentOutflow > 0) {
    details.push(`Withdrawals: ${formatCurrencyCompact(data.totalInvestmentOutflow)}`)
  }

  return {
    name: 'Investment Behavior',
    score,
    weight: 10,
    status: deriveStatus(score),
    description: describeInvestment(netRatio),
    details,
  }
}

function calculateMetrics(data: AnalysisResult): HealthMetric[] {
  return [
    buildCashflowMetric(data),
    buildSavingsMetric(data),
    buildDebtMetric(data),
    buildDisciplineMetric(data),
    buildSavingsBufferMetric(data),
    buildInvestmentMetric(data),
  ]
}

// ---------- Analysis computation ----------

function computeMonthlyData(
  transactions: Transaction[],
  isInvestmentAccount: (name: string) => boolean,
): { months: string[]; monthlyData: Record<string, MonthlyBucket> } | null {
  if (transactions.length < 10) return null

  const recentTransactions = transactions

  const monthlyData: Record<string, MonthlyBucket> = {}

  for (const tx of recentTransactions) {
    const month = tx.date.slice(0, 7)
    if (!monthlyData[month]) {
      monthlyData[month] = createEmptyBucket()
    }
    classifyTransaction(tx, monthlyData[month], isInvestmentAccount)
  }

  const months = Object.keys(monthlyData).sort((a, b) => a.localeCompare(b))

  // Remove current month if incomplete (less than 15 days in)
  const today = new Date()
  const currentMonth = today.toISOString().slice(0, 7)
  if (today.getDate() < 15 && months.includes(currentMonth)) {
    months.pop()
    delete monthlyData[currentMonth]
  }

  if (months.length < 3) return null
  return { months, monthlyData }
}

function computeAnalysis(
  months: string[],
  monthlyData: Record<string, MonthlyBucket>,
): AnalysisResult {
  const monthlyValues = months.map((m) => monthlyData[m])
  const count = months.length
  const halfPoint = Math.floor(count / 2)

  // Cashflow
  const surplusMonths = monthlyValues.filter((m) => m.income > m.expense).length
  const surplusRatio = surplusMonths / count
  const totalIncome = monthlyValues.reduce((s, m) => s + m.income, 0)
  const totalExpense = monthlyValues.reduce((s, m) => s + m.expense, 0)
  const avgMonthlyIncome = totalIncome / count
  const avgMonthlyExpense = totalExpense / count
  const cashflowMargin =
    avgMonthlyIncome > 0 ? ((avgMonthlyIncome - avgMonthlyExpense) / avgMonthlyIncome) * 100 : 0

  // Savings
  const monthlySavingsRates = monthlyValues.map((m) =>
    m.income > 0 ? ((m.income - m.expense) / m.income) * 100 : 0,
  )
  const avgSavingsRate = monthlySavingsRates.reduce((a, b) => a + b, 0) / count
  const savingsVariance =
    monthlySavingsRates.reduce((s, r) => s + Math.pow(r - avgSavingsRate, 2), 0) / count
  const savingsStdDev = Math.sqrt(savingsVariance)
  const savingsConsistency =
    Math.abs(avgSavingsRate) > 0
      ? Math.max(0, 100 - (savingsStdDev / Math.abs(avgSavingsRate)) * 50)
      : 0

  const firstHalfAvgSavings = halfAverage(monthlySavingsRates.slice(0, halfPoint))
  const secondHalfAvgSavings = halfAverage(monthlySavingsRates.slice(halfPoint))
  const savingsTrendPositive = secondHalfAvgSavings >= firstHalfAvgSavings

  // Debt
  const totalDebt = monthlyValues.reduce((s, m) => s + m.debt, 0)
  const avgMonthlyDebt = totalDebt / count
  const debtToIncomeRatio =
    avgMonthlyIncome > 0 ? (avgMonthlyDebt / avgMonthlyIncome) * 100 : 0
  const monthsWithHighSpending = monthlyValues.filter((m) => m.expense > m.income * 1.2).length
  const overspendingFrequency = monthsWithHighSpending / count

  // Expense discipline
  const totalDiscretionary = monthlyValues.reduce((s, m) => s + m.discretionary, 0)
  const discretionaryRatio = totalExpense > 0 ? (totalDiscretionary / totalExpense) * 100 : 0
  const monthlyExpenses = monthlyValues.map((m) => m.expense)
  const expenseVariance =
    monthlyExpenses.reduce((s, e) => s + Math.pow(e - avgMonthlyExpense, 2), 0) / count
  const spendingVolatility =
    avgMonthlyExpense > 0 ? (Math.sqrt(expenseVariance) / avgMonthlyExpense) * 100 : 0
  const firstHalfAvgExpense = halfAverage(monthlyExpenses.slice(0, halfPoint))
  const secondHalfAvgExpense = halfAverage(monthlyExpenses.slice(halfPoint))
  const lifestyleInflation =
    firstHalfAvgExpense > 0
      ? ((secondHalfAvgExpense - firstHalfAvgExpense) / firstHalfAvgExpense) * 100
      : 0

  // Savings buffer
  const positiveSavingsMonths = monthlySavingsRates.filter((r) => r > 0).length
  const positiveSavingsRatio = positiveSavingsMonths / count
  const avgPositiveSavingsRate =
    monthlySavingsRates.filter((r) => r > 0).reduce((a, b) => a + b, 0) /
    (positiveSavingsMonths || 1)

  // Investment
  const monthlyNetInvestments = monthlyValues.map((m) => m.investmentInflow - m.investmentOutflow)
  const totalInvestmentInflow = monthlyValues.reduce((s, m) => s + m.investmentInflow, 0)
  const totalInvestmentOutflow = monthlyValues.reduce((s, m) => s + m.investmentOutflow, 0)
  const totalNetInvestment = totalInvestmentInflow - totalInvestmentOutflow
  const monthsWithNetInvestments = monthlyNetInvestments.filter((n) => n > 0).length
  const investmentRegularity = monthsWithNetInvestments / count
  const netInvestmentToIncomeRatio =
    totalIncome > 0 ? (totalNetInvestment / totalIncome) * 100 : 0
  const avgMonthlyInflow = totalInvestmentInflow / count
  const inflowVariance =
    avgMonthlyInflow > 0
      ? monthlyValues
          .map((m) => m.investmentInflow)
          .reduce((s, i) => s + Math.pow(i - avgMonthlyInflow, 2), 0) / count
      : 0
  const investmentConsistency =
    avgMonthlyInflow > 0
      ? Math.max(0, 100 - (Math.sqrt(inflowVariance) / avgMonthlyInflow) * 50)
      : 0

  // Income quality
  const incomeVariance =
    monthlyValues.reduce((s, m) => s + Math.pow(m.income - avgMonthlyIncome, 2), 0) / count
  const incomeStability =
    avgMonthlyIncome > 0
      ? Math.max(0, 100 - (Math.sqrt(incomeVariance) / avgMonthlyIncome) * 50)
      : 0
  const firstHalfAvgIncome = halfAverage(
    monthlyValues.slice(0, halfPoint).map((m) => m.income),
  )
  const secondHalfAvgIncome = halfAverage(
    monthlyValues.slice(halfPoint).map((m) => m.income),
  )
  const incomeGrowth =
    firstHalfAvgIncome > 0
      ? ((secondHalfAvgIncome - firstHalfAvgIncome) / firstHalfAvgIncome) * 100
      : 0

  return {
    monthsAnalyzed: count,
    cashflowMargin,
    surplusRatio,
    avgMonthlyIncome,
    avgMonthlyExpense,
    avgSavingsRate,
    savingsConsistency,
    savingsTrendPositive,
    debtToIncomeRatio,
    overspendingFrequency,
    avgMonthlyDebt,
    discretionaryRatio,
    spendingVolatility,
    lifestyleInflation,
    positiveSavingsRatio,
    avgPositiveSavingsRate,
    investmentRegularity,
    netInvestmentToIncomeRatio,
    investmentConsistency,
    totalNetInvestment,
    totalInvestmentInflow,
    totalInvestmentOutflow,
    incomeStability,
    incomeGrowth,
  }
}

// ---------- UI helpers ----------

function getOverallStatus(score: number) {
  if (score >= 80) return { label: 'Excellent', color: 'text-green-500', bgColor: 'bg-green-500' }
  if (score >= 60) return { label: 'Good', color: 'text-blue-500', bgColor: 'bg-blue-500' }
  if (score >= 40) return { label: 'Fair', color: 'text-yellow-500', bgColor: 'bg-yellow-500' }
  return { label: 'Needs Work', color: 'text-red-500', bgColor: 'bg-red-500' }
}

function getSummary(score: number): string {
  if (score >= 80)
    return 'Excellent financial health! Strong cashflow, good savings, and disciplined spending.'
  if (score >= 65)
    return 'Good financial health with room for improvement in savings or expense management.'
  if (score >= 50)
    return 'Fair financial health. Focus on building emergency fund and reducing discretionary spending.'
  if (score >= 35)
    return 'Financial health needs attention. Prioritize debt management and expense control.'
  return 'Financial health requires immediate action. Create a budget and reduce non-essential expenses.'
}

function getStatusIcon(metricStatus: HealthMetric['status']) {
  switch (metricStatus) {
    case 'excellent':
      return <CheckCircle className="w-4 h-4 text-green-500" />
    case 'good':
      return <TrendingUp className="w-4 h-4 text-blue-500" />
    case 'fair':
      return <Info className="w-4 h-4 text-yellow-500" />
    case 'poor':
      return <AlertTriangle className="w-4 h-4 text-red-500" />
  }
}

function getStatusColor(metricStatus: HealthMetric['status']) {
  switch (metricStatus) {
    case 'excellent':
      return 'bg-green-500'
    case 'good':
      return 'bg-blue-500'
    case 'fair':
      return 'bg-yellow-500'
    case 'poor':
      return 'bg-red-500'
  }
}

// ---------- Sub-components ----------

function LoadingSkeleton() {
  return (
    <div className="glass rounded-2xl border border-white/10 p-6 animate-pulse">
      <div className="h-8 bg-muted rounded w-1/3 mb-4" />
      <div className="h-32 bg-muted rounded" />
    </div>
  )
}

function EmptyState() {
  return (
    <div className="glass rounded-2xl border border-white/10 p-6">
      <h3 className="text-lg font-semibold mb-2">Financial Health Score</h3>
      <p className="text-muted-foreground">Need more transaction data to calculate health score.</p>
    </div>
  )
}

function ScoreHeader({
  status,
  monthsAnalyzed,
  overallScore,
}: {
  status: { label: string; color: string; bgColor: string }
  monthsAnalyzed: number
  overallScore: number
}) {
  return (
    <div className="flex items-center justify-between mb-6">
      <div className="flex items-center gap-3">
        <div className={`p-3 rounded-xl ${status.bgColor}/20`}>
          <Shield className={`w-6 h-6 ${status.color}`} />
        </div>
        <div>
          <h3 className="text-lg font-semibold">Financial Health Score</h3>
          <p className="text-sm text-muted-foreground">Based on last {monthsAnalyzed} months</p>
        </div>
      </div>
      <div className="text-right">
        <p className={`text-3xl font-bold ${status.color}`}>{Math.round(overallScore)}</p>
        <p className={`text-sm ${status.color}`}>{status.label}</p>
      </div>
    </div>
  )
}

function CircularProgress({
  overallScore,
  statusColor,
}: {
  overallScore: number
  statusColor: string
}) {
  return (
    <div className="flex justify-center mb-4">
      <div className="relative w-28 h-28">
        <svg className="w-full h-full transform -rotate-90">
          <circle
            cx="56"
            cy="56"
            r="48"
            stroke="currentColor"
            strokeWidth="8"
            fill="none"
            className="text-muted/20"
          />
          <circle
            cx="56"
            cy="56"
            r="48"
            stroke="currentColor"
            strokeWidth="8"
            fill="none"
            strokeDasharray={`${(overallScore / 100) * 301} 301`}
            strokeLinecap="round"
            className={statusColor}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-2xl font-bold ${statusColor}`}>{Math.round(overallScore)}</span>
          <span className="text-xs text-muted-foreground">/ 100</span>
        </div>
      </div>
    </div>
  )
}

function MetricRow({
  metric,
  showDetails,
}: {
  metric: HealthMetric
  showDetails: boolean
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          {getStatusIcon(metric.status)}
          <span>{metric.name}</span>
          <span className="text-xs text-muted-foreground">({metric.weight}%)</span>
        </div>
        <span className="text-muted-foreground">{metric.description}</span>
      </div>
      <div className="h-2 bg-muted/30 rounded-full overflow-hidden">
        <div
          className={`h-full ${getStatusColor(metric.status)} rounded-full transition-all`}
          style={{ width: `${metric.score}%` }}
        />
      </div>
      {showDetails && metric.details && (
        <div className="pl-6 pt-1 text-xs text-muted-foreground space-y-0.5">
          {metric.details.map((detail) => (
            <p key={detail}>{'\u2022'} {detail}</p>
          ))}
        </div>
      )}
    </div>
  )
}

function DetailsToggle({
  showDetails,
  onToggle,
}: {
  showDetails: boolean
  onToggle: () => void
}) {
  return (
    <button
      onClick={onToggle}
      className="w-full mt-4 pt-4 border-t border-white/10 flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-white transition-colors"
    >
      {showDetails ? (
        <>
          <ChevronUp className="w-4 h-4" />
          Hide Details
        </>
      ) : (
        <>
          <ChevronDown className="w-4 h-4" />
          Show Details
        </>
      )}
    </button>
  )
}

// ---------- Main component ----------

export default function FinancialHealthScore() {
  const { data: transactions = [], isLoading } = useTransactions()
  const [showDetails, setShowDetails] = useState(false)
  const isInvestmentAccount = useInvestmentAccountStore((state) => state.isInvestmentAccount)

  const analysisData = useMemo(() => {
    if (!transactions.length) return null

    const result = computeMonthlyData(transactions, isInvestmentAccount)
    if (!result) return null

    return computeAnalysis(result.months, result.monthlyData)
  }, [transactions, isInvestmentAccount])

  if (isLoading) return <LoadingSkeleton />

  if (!analysisData) return <EmptyState />

  const metrics = calculateMetrics(analysisData)
  if (metrics.length === 0) return <EmptyState />

  const overallScore = metrics.reduce((sum, m) => sum + (m.score * m.weight) / 100, 0)
  const status = getOverallStatus(overallScore)

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-2xl border border-white/10 p-6 shadow-xl"
    >
      <ScoreHeader
        status={status}
        monthsAnalyzed={analysisData.monthsAnalyzed}
        overallScore={overallScore}
      />

      <CircularProgress overallScore={overallScore} statusColor={status.color} />

      {/* Summary */}
      <p className="text-sm text-center text-muted-foreground mb-6 px-4">
        {getSummary(overallScore)}
      </p>

      {/* Metrics Breakdown */}
      <div className="space-y-3">
        {metrics.map((metric) => (
          <MetricRow key={metric.name} metric={metric} showDetails={showDetails} />
        ))}
      </div>

      <DetailsToggle showDetails={showDetails} onToggle={() => setShowDetails(!showDetails)} />
    </motion.div>
  )
}
