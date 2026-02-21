import { motion } from 'framer-motion'
import {
  Shield,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle,
  Info,
  ChevronDown,
  ChevronUp,
  Wallet,
  PiggyBank,
  CreditCard,
  ClipboardList,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTransactions } from '@/hooks/api/useTransactions'
import { useInvestmentAccountStore } from '@/store/investmentAccountStore'
import { formatCurrencyCompact } from '@/lib/formatters'
import type { Transaction } from '@/types'

// ─── FHN FinHealth Score Types ──────────────────────────────────────────────

type FinHealthTier = 'healthy' | 'coping' | 'vulnerable'
type Pillar = 'spend' | 'save' | 'borrow' | 'plan'

interface HealthMetric {
  name: string
  score: number
  weight: number
  status: FinHealthTier
  pillar: Pillar
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
  // Spend
  savingsRate: number
  essentialToIncomeRatio: number
  avgMonthlyIncome: number
  avgMonthlyExpense: number
  // Save
  emergencyFundMonths: number
  cumulativeNetSavings: number
  investmentRegularity: number
  investmentToIncomeRatio: number
  totalInvestmentInflow: number
  totalInvestmentOutflow: number
  // Borrow
  debtToIncomeRatio: number
  avgMonthlyDebt: number
  debtTrendPercent: number
  // Plan
  positiveSavingsRatio: number
  savingsVolatilityCV: number
  incomeCV: number
}

// ─── Category Lists ─────────────────────────────────────────────────────────

const DEBT_CATEGORIES = [
  'EMI', 'Loan', 'Credit Card Payment', 'Mortgage',
  'Personal Loan', 'Car Loan', 'Home Loan',
]

const DISCRETIONARY_CATEGORIES = [
  'Entertainment', 'Shopping', 'Dining', 'Travel',
  'Leisure', 'Recreation', 'Gifts', 'Subscriptions', 'Personal Care',
]

const ESSENTIAL_CATEGORIES = [
  'Rent', 'Utilities', 'Groceries', 'Healthcare',
  'Insurance', 'Education', 'Transportation', 'Fuel', 'Medicine',
]

const INVESTMENT_ACCOUNT_PATTERNS = [
  'mutual fund', 'mf', 'grow', 'zerodha', 'kuvera', 'coin',
  'smallcase', 'stocks', 'demat', 'ppf', 'nps', 'elss', 'epf',
]

const INVESTMENT_NOTE_KEYWORDS = [
  'sip', 'mutual fund', 'investment', 'ppf', 'nps', 'elss', 'epf',
]

// ─── Pillar Metadata ────────────────────────────────────────────────────────

const PILLAR_META: Record<Pillar, { label: string; icon: typeof Wallet }> = {
  spend: { label: 'Spend', icon: Wallet },
  save: { label: 'Save', icon: PiggyBank },
  borrow: { label: 'Borrow', icon: CreditCard },
  plan: { label: 'Plan', icon: ClipboardList },
}

const PILLAR_ORDER: Pillar[] = ['spend', 'save', 'borrow', 'plan']

// ─── Pure Helpers ───────────────────────────────────────────────────────────

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function tierFromScore(score: number): FinHealthTier {
  if (score >= 80) return 'healthy'
  if (score >= 40) return 'coping'
  return 'vulnerable'
}

function matchesCategoryList(category: string, list: string[]): boolean {
  const lower = category.toLowerCase()
  return list.some((c) => lower.includes(c.toLowerCase()))
}

function matchesPatterns(value: string, patterns: string[]): boolean {
  const lower = value.toLowerCase()
  return patterns.some((p) => lower.includes(p))
}

function formatSignedPercent(value: number): string {
  const prefix = value > 0 ? '+' : ''
  return `${prefix}${value.toFixed(1)}%`
}

function cvToScore(cv: number): number {
  if (cv < 30) return 90
  if (cv < 60) return 70
  if (cv < 100) return 50
  return 20
}

function cvToLabel(cv: number): string {
  if (cv < 30) return 'Low'
  if (cv < 60) return 'Moderate'
  return 'High'
}

function coefficientOfVariation(values: number[]): number {
  if (values.length === 0) return 0
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  if (mean === 0) return 0
  const variance = values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / values.length
  return (Math.sqrt(variance) / Math.abs(mean)) * 100
}

// ─── Investment Detection ───────────────────────────────────────────────────

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

// ─── Transaction Classification ─────────────────────────────────────────────

function createEmptyBucket(): MonthlyBucket {
  return {
    income: 0, expense: 0, debt: 0,
    investmentInflow: 0, investmentOutflow: 0,
    discretionary: 0, essential: 0, categories: {},
  }
}

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

// ─── Monthly Data Computation ───────────────────────────────────────────────

function computeMonthlyData(
  transactions: Transaction[],
  isInvestmentAccount: (name: string) => boolean,
): { months: string[]; monthlyData: Record<string, MonthlyBucket> } | null {
  if (transactions.length < 10) return null

  const monthlyData: Record<string, MonthlyBucket> = {}

  for (const tx of transactions) {
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

// ─── Analysis Computation ───────────────────────────────────────────────────

function computeAnalysis(
  months: string[],
  monthlyData: Record<string, MonthlyBucket>,
): AnalysisResult {
  const buckets = months.map((m) => monthlyData[m])
  const count = months.length
  const halfPoint = Math.floor(count / 2)

  // Basic aggregates
  const totalIncome = buckets.reduce((s, m) => s + m.income, 0)
  const totalExpense = buckets.reduce((s, m) => s + m.expense, 0)
  const avgMonthlyIncome = totalIncome / count
  const avgMonthlyExpense = totalExpense / count

  // SPEND: Savings rate
  const savingsRate = avgMonthlyIncome > 0
    ? ((avgMonthlyIncome - avgMonthlyExpense) / avgMonthlyIncome) * 100
    : 0

  // SPEND: Essential-to-income ratio
  const totalEssential = buckets.reduce((s, m) => s + m.essential, 0)
  const essentialToIncomeRatio = totalIncome > 0 ? (totalEssential / totalIncome) * 100 : 100

  // SAVE: Emergency fund — cumulative net savings / avg monthly expenses
  const cumulativeNetSavings = totalIncome - totalExpense
  const emergencyFundMonths = avgMonthlyExpense > 0
    ? Math.max(0, cumulativeNetSavings / avgMonthlyExpense)
    : 0

  // SAVE: Investment
  const totalInvestmentInflow = buckets.reduce((s, m) => s + m.investmentInflow, 0)
  const totalInvestmentOutflow = buckets.reduce((s, m) => s + m.investmentOutflow, 0)
  const monthlyNetInvestments = buckets.map((m) => m.investmentInflow - m.investmentOutflow)
  const monthsWithNetInvestments = monthlyNetInvestments.filter((n) => n > 0).length
  const investmentRegularity = monthsWithNetInvestments / count
  const totalNetInvestment = totalInvestmentInflow - totalInvestmentOutflow
  const investmentToIncomeRatio = totalIncome > 0
    ? (totalNetInvestment / totalIncome) * 100
    : 0

  // BORROW: Debt-to-income
  const totalDebt = buckets.reduce((s, m) => s + m.debt, 0)
  const avgMonthlyDebt = totalDebt / count
  const debtToIncomeRatio = avgMonthlyIncome > 0
    ? (avgMonthlyDebt / avgMonthlyIncome) * 100
    : 0

  // BORROW: Debt trend (compare first half vs second half avg debt)
  const firstHalfDebt = buckets.slice(0, halfPoint).reduce((s, m) => s + m.debt, 0) / (halfPoint || 1)
  const secondHalfDebt = buckets.slice(halfPoint).reduce((s, m) => s + m.debt, 0) / ((count - halfPoint) || 1)
  const debtTrendBase = secondHalfDebt > 0 ? 100 : 0
  const debtTrendPercent = firstHalfDebt > 0
    ? ((secondHalfDebt - firstHalfDebt) / firstHalfDebt) * 100
    : debtTrendBase

  // PLAN: Savings consistency
  const monthlySavingsRates = buckets.map((m) =>
    m.income > 0 ? ((m.income - m.expense) / m.income) * 100 : 0,
  )
  const positiveSavingsMonths = monthlySavingsRates.filter((r) => r > 0).length
  const positiveSavingsRatio = positiveSavingsMonths / count
  const savingsVolatilityCV = coefficientOfVariation(monthlySavingsRates.filter((r) => r > 0))

  // PLAN: Income stability
  const monthlyIncomes = buckets.map((m) => m.income)
  const incomeCV = coefficientOfVariation(monthlyIncomes)

  return {
    monthsAnalyzed: count,
    savingsRate,
    essentialToIncomeRatio,
    avgMonthlyIncome,
    avgMonthlyExpense,
    emergencyFundMonths,
    cumulativeNetSavings,
    investmentRegularity,
    investmentToIncomeRatio,
    totalInvestmentInflow,
    totalInvestmentOutflow,
    debtToIncomeRatio,
    avgMonthlyDebt,
    debtTrendPercent,
    positiveSavingsRatio,
    savingsVolatilityCV,
    incomeCV,
  }
}

// ─── FHN Indicator Scorers ──────────────────────────────────────────────────

// SPEND 1: Spend less than income
function scoreSpendLessThanIncome(data: AnalysisResult): HealthMetric {
  const rate = data.savingsRate
  let score: number
  if (rate >= 20) score = clamp(90 + (rate - 20) * 0.5, 90, 100)
  else if (rate >= 10) score = 70 + ((rate - 10) / 10) * 19
  else if (rate >= 0) score = 40 + (rate / 10) * 29
  else score = clamp(40 + rate * 2, 0, 39)

  return {
    name: 'Spend Less Than Income',
    score: Math.round(clamp(score, 0, 100)),
    weight: 12.5,
    status: tierFromScore(score),
    pillar: 'spend',
    description: rate >= 0 ? `${rate.toFixed(1)}% savings rate` : `${Math.abs(rate).toFixed(1)}% deficit`,
    details: [
      `Avg income: ${formatCurrencyCompact(data.avgMonthlyIncome)}/mo`,
      `Avg expenses: ${formatCurrencyCompact(data.avgMonthlyExpense)}/mo`,
      rate >= 20 ? 'Target met: saving 20%+ of income' : 'Target: save at least 20% of income',
    ],
  }
}

// SPEND 2: Essential expense ratio
function scoreEssentialRatio(data: AnalysisResult): HealthMetric {
  const ratio = data.essentialToIncomeRatio
  let score: number
  if (ratio <= 50) score = clamp(90 + (50 - ratio), 90, 100)
  else if (ratio <= 60) score = 70 + ((60 - ratio) / 10) * 19
  else if (ratio <= 75) score = 40 + ((75 - ratio) / 15) * 29
  else score = clamp(40 - (ratio - 75) * 2, 0, 39)

  return {
    name: 'Essential Expense Ratio',
    score: Math.round(clamp(score, 0, 100)),
    weight: 12.5,
    status: tierFromScore(score),
    pillar: 'spend',
    description: `${ratio.toFixed(0)}% of income on essentials`,
    details: [
      `Essentials: ${ratio.toFixed(1)}% of income`,
      ratio <= 50 ? '50/30/20 target met' : 'Target: essentials under 50% of income',
    ],
  }
}

// SAVE 3: Emergency fund coverage
function scoreEmergencyFund(data: AnalysisResult): HealthMetric {
  const months = data.emergencyFundMonths
  let score: number
  if (months >= 6) score = clamp(90 + (months - 6) * 2, 90, 100)
  else if (months >= 3) score = 70 + ((months - 3) / 3) * 19
  else if (months >= 1) score = 40 + ((months - 1) / 2) * 29
  else score = clamp(months * 40, 0, 39)

  return {
    name: 'Emergency Fund',
    score: Math.round(clamp(score, 0, 100)),
    weight: 12.5,
    status: tierFromScore(score),
    pillar: 'save',
    description: `${months.toFixed(1)} months covered`,
    details: [
      `Net savings: ${formatCurrencyCompact(data.cumulativeNetSavings)}`,
      `Avg monthly expenses: ${formatCurrencyCompact(data.avgMonthlyExpense)}`,
      months >= 6 ? 'Target met: 6+ months coverage' : 'Target: 6 months of expenses saved',
    ],
  }
}

// SAVE 4: Investment regularity
function scoreInvestment(data: AnalysisResult): HealthMetric {
  const ratio = data.investmentToIncomeRatio
  const regularity = data.investmentRegularity

  // Blend: 60% ratio score + 40% regularity score
  let ratioScore: number
  if (ratio >= 15) ratioScore = 90
  else if (ratio >= 10) ratioScore = 70 + ((ratio - 10) / 5) * 19
  else if (ratio >= 5) ratioScore = 40 + ((ratio - 5) / 5) * 29
  else if (ratio >= 0) ratioScore = (ratio / 5) * 39
  else ratioScore = 0

  const regularityScore = regularity * 100
  const score = ratioScore * 0.6 + regularityScore * 0.4

  const netInvestment = data.totalInvestmentInflow - data.totalInvestmentOutflow

  return {
    name: 'Investment Regularity',
    score: Math.round(clamp(score, 0, 100)),
    weight: 12.5,
    status: tierFromScore(score),
    pillar: 'save',
    description: ratio >= 0 ? `${ratio.toFixed(1)}% of income invested` : 'Net withdrawal',
    details: [
      `${Math.round(regularity * 100)}% months with net investments`,
      `Net invested: ${formatCurrencyCompact(netInvestment)}`,
      ...(data.totalInvestmentOutflow > 0 ? [`Withdrawals: ${formatCurrencyCompact(data.totalInvestmentOutflow)}`] : []),
    ],
  }
}

// BORROW 5: Debt-to-income ratio
function scoreDebtToIncome(data: AnalysisResult): HealthMetric {
  const dti = data.debtToIncomeRatio
  let score: number
  if (dti < 10) score = clamp(90 + (10 - dti), 90, 100)
  else if (dti <= 20) score = 70 + ((20 - dti) / 10) * 19
  else if (dti <= 36) score = 40 + ((36 - dti) / 16) * 29
  else score = clamp(40 - (dti - 36) * 1.5, 0, 39)

  let desc: string
  if (dti < 10) desc = 'Very low debt burden'
  else if (dti <= 20) desc = 'Low debt burden'
  else if (dti <= 36) desc = 'Moderate debt'
  else desc = 'High debt burden'

  return {
    name: 'Debt-to-Income',
    score: Math.round(clamp(score, 0, 100)),
    weight: 12.5,
    status: tierFromScore(score),
    pillar: 'borrow',
    description: desc,
    details: [
      `DTI ratio: ${dti.toFixed(1)}%`,
      `Avg debt payments: ${formatCurrencyCompact(data.avgMonthlyDebt)}/mo`,
      dti <= 36 ? 'Within banking threshold (36%)' : 'Above banking threshold (36%)',
    ],
  }
}

// BORROW 6: Debt trend
function scoreDebtTrend(data: AnalysisResult): HealthMetric {
  const trend = data.debtTrendPercent
  let score: number
  // Negative trend = debt declining = good
  if (trend <= -20) score = 95
  else if (trend <= -5) score = 80 + ((Math.abs(trend) - 5) / 15) * 15
  else if (trend <= 5) score = 70 + ((5 - Math.abs(trend)) / 5) * 9
  else if (trend <= 20) score = 40 + ((20 - trend) / 15) * 29
  else score = clamp(40 - (trend - 20) * 1.5, 0, 39)

  // If there's no debt at all, score is perfect
  if (data.avgMonthlyDebt === 0 && data.debtTrendPercent === 0) score = 100

  let desc: string
  if (data.avgMonthlyDebt === 0) desc = 'No debt detected'
  else if (trend <= -5) desc = 'Debt declining'
  else if (trend <= 5) desc = 'Debt stable'
  else desc = 'Debt growing'

  return {
    name: 'Debt Trend',
    score: Math.round(clamp(score, 0, 100)),
    weight: 12.5,
    status: tierFromScore(score),
    pillar: 'borrow',
    description: desc,
    details: [
      data.avgMonthlyDebt === 0
        ? 'No debt payments detected'
        : `Debt change: ${formatSignedPercent(trend)} (half-over-half)`,
      trend <= 0 ? 'Debt burden reducing or stable' : 'Debt burden increasing',
    ],
  }
}

// PLAN 7: Savings consistency
function scoreSavingsConsistency(data: AnalysisResult): HealthMetric {
  const ratio = data.positiveSavingsRatio
  const cv = data.savingsVolatilityCV

  // 70% weight on positive months ratio, 30% on consistency (low CV)
  const ratioScore = ratio * 100
  const cvScore = cvToScore(cv)
  const score = ratioScore * 0.7 + cvScore * 0.3

  return {
    name: 'Savings Consistency',
    score: Math.round(clamp(score, 0, 100)),
    weight: 12.5,
    status: tierFromScore(score),
    pillar: 'plan',
    description: `${Math.round(ratio * 100)}% months with positive savings`,
    details: [
      `Positive savings months: ${Math.round(ratio * 100)}%`,
      `Savings volatility: ${cvToLabel(cv)}`,
      ratio >= 0.9 ? 'Consistent savings habit' : 'Target: save in 90%+ of months',
    ],
  }
}

// PLAN 8: Income stability
function scoreIncomeStability(data: AnalysisResult): HealthMetric {
  const cv = data.incomeCV
  let score: number
  if (cv < 10) score = clamp(90 + (10 - cv), 90, 100)
  else if (cv <= 25) score = 70 + ((25 - cv) / 15) * 19
  else if (cv <= 50) score = 40 + ((50 - cv) / 25) * 29
  else score = clamp(40 - (cv - 50) * 0.8, 0, 39)

  let desc: string
  if (cv < 10) desc = 'Very stable income'
  else if (cv <= 25) desc = 'Stable income'
  else if (cv <= 50) desc = 'Moderate variability'
  else desc = 'Volatile income'

  return {
    name: 'Income Stability',
    score: Math.round(clamp(score, 0, 100)),
    weight: 12.5,
    status: tierFromScore(score),
    pillar: 'plan',
    description: desc,
    details: [
      `Income variability (CV): ${cv.toFixed(1)}%`,
      `Avg monthly income: ${formatCurrencyCompact(data.avgMonthlyIncome)}`,
      cv <= 25 ? 'Predictable income stream' : 'Consider building a larger buffer',
    ],
  }
}

// ─── Calculate All Metrics ──────────────────────────────────────────────────

function calculateMetrics(data: AnalysisResult): HealthMetric[] {
  return [
    scoreSpendLessThanIncome(data),
    scoreEssentialRatio(data),
    scoreEmergencyFund(data),
    scoreInvestment(data),
    scoreDebtToIncome(data),
    scoreDebtTrend(data),
    scoreSavingsConsistency(data),
    scoreIncomeStability(data),
  ]
}

// ─── UI Helpers ─────────────────────────────────────────────────────────────

function getOverallStatus(score: number) {
  if (score >= 80) return { label: 'Financially Healthy', tier: 'healthy' as FinHealthTier, color: 'text-ios-green', bgColor: 'bg-ios-green' }
  if (score >= 40) return { label: 'Financially Coping', tier: 'coping' as FinHealthTier, color: 'text-ios-orange', bgColor: 'bg-ios-orange' }
  return { label: 'Financially Vulnerable', tier: 'vulnerable' as FinHealthTier, color: 'text-ios-red', bgColor: 'bg-ios-red' }
}

function getSummary(score: number): string {
  if (score >= 80)
    return 'You are financially healthy — spending within means, building savings, and managing debt well. Keep it up!'
  if (score >= 60)
    return 'You are coping well financially but have room for improvement. Focus on strengthening your weaker pillars.'
  if (score >= 40)
    return 'Your finances need attention. Review your spending and debt levels, and try to build an emergency fund.'
  return 'Your financial health is vulnerable. Prioritize reducing expenses, managing debt, and establishing a savings habit.'
}

function getTierColor(tier: FinHealthTier) {
  switch (tier) {
    case 'healthy': return 'bg-ios-green'
    case 'coping': return 'bg-ios-orange'
    case 'vulnerable': return 'bg-ios-red'
  }
}

function getTierIcon(tier: FinHealthTier) {
  switch (tier) {
    case 'healthy': return <CheckCircle className="w-4 h-4 text-ios-green" />
    case 'coping': return <Info className="w-4 h-4 text-ios-orange" />
    case 'vulnerable': return <AlertTriangle className="w-4 h-4 text-ios-red" />
  }
}

function getPillarScore(metrics: HealthMetric[], pillar: Pillar): number {
  const pillarMetrics = metrics.filter((m) => m.pillar === pillar)
  if (pillarMetrics.length === 0) return 0
  return pillarMetrics.reduce((sum, m) => sum + m.score, 0) / pillarMetrics.length
}

function getPillarTrendIcon(score: number) {
  if (score >= 70) return <TrendingUp className="w-3.5 h-3.5 text-ios-green" />
  if (score >= 40) return <Info className="w-3.5 h-3.5 text-ios-orange" />
  return <TrendingDown className="w-3.5 h-3.5 text-ios-red" />
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="glass rounded-2xl border border-border p-6 animate-pulse">
      <div className="h-8 bg-muted rounded w-1/3 mb-4" />
      <div className="h-32 bg-muted rounded" />
    </div>
  )
}

function EmptyState() {
  return (
    <div className="glass rounded-2xl border border-border p-6">
      <h3 className="text-lg font-semibold mb-2">Financial Health Score</h3>
      <p className="text-muted-foreground">Need more transaction data to calculate health score.</p>
    </div>
  )
}

function ScoreHeader({
  status,
  monthsAnalyzed,
  overallScore,
}: Readonly<{
  status: ReturnType<typeof getOverallStatus>
  monthsAnalyzed: number
  overallScore: number
}>) {
  return (
    <div className="flex items-center justify-between mb-6">
      <div className="flex items-center gap-3">
        <div className={`p-3 rounded-xl ${status.bgColor}/20`}>
          <Shield className={`w-6 h-6 ${status.color}`} />
        </div>
        <div>
          <h3 className="text-lg font-semibold">FinHealth Score</h3>
          <p className="text-sm text-muted-foreground">Based on last {monthsAnalyzed} months</p>
        </div>
      </div>
      <div className="text-right">
        <p className={`text-3xl font-bold ${status.color}`}>{Math.round(overallScore)}</p>
        <p className={`text-sm font-medium ${status.color}`}>{status.label}</p>
      </div>
    </div>
  )
}

function CircularProgress({
  overallScore,
  statusColor,
}: Readonly<{
  overallScore: number
  statusColor: string
}>) {
  return (
    <div className="flex justify-center mb-4">
      <div className="relative w-28 h-28">
        <svg className="w-full h-full transform -rotate-90">
          <circle
            cx="56" cy="56" r="48"
            stroke="currentColor" strokeWidth="8" fill="none"
            className="text-muted/20"
          />
          <circle
            cx="56" cy="56" r="48"
            stroke="currentColor" strokeWidth="8" fill="none"
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

function PillarHeader({
  pillar,
  score,
  metrics,
}: Readonly<{
  pillar: Pillar
  score: number
  metrics: HealthMetric[]
}>) {
  const meta = PILLAR_META[pillar]
  const Icon = meta.icon
  const tier = tierFromScore(score)
  const pillarMetrics = metrics.filter((m) => m.pillar === pillar)

  if (pillarMetrics.length === 0) return null

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 text-muted-foreground" />
        <span className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {meta.label}
        </span>
        {getPillarTrendIcon(score)}
      </div>
      <div className="flex items-center gap-2">
        <div className={`w-2 h-2 rounded-full ${getTierColor(tier)}`} />
        <span className="text-xs text-muted-foreground">{Math.round(score)}/100</span>
      </div>
    </div>
  )
}

function MetricRow({
  metric,
  showDetails,
}: Readonly<{
  metric: HealthMetric
  showDetails: boolean
}>) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          {getTierIcon(metric.status)}
          <span>{metric.name}</span>
        </div>
        <span className="text-muted-foreground">{metric.description}</span>
      </div>
      <div className="h-2 bg-muted/30 rounded-full overflow-hidden">
        <div
          className={`h-full ${getTierColor(metric.status)} rounded-full transition-colors`}
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
}: Readonly<{
  showDetails: boolean
  onToggle: () => void
}>) {
  return (
    <button
      onClick={onToggle}
      className="w-full mt-4 pt-4 border-t border-border flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-white transition-colors"
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

// ─── Main Component ─────────────────────────────────────────────────────────

interface FinancialHealthScoreProps {
  transactions?: Transaction[]
}

export default function FinancialHealthScore({ transactions: propTransactions }: Readonly<FinancialHealthScoreProps>) {
  const { data: fetchedTransactions = [], isLoading: isFetching } = useTransactions()
  const transactions = propTransactions ?? fetchedTransactions
  const isLoading = !propTransactions && isFetching
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
      className="glass rounded-2xl border border-border p-6 shadow-xl"
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

      {/* Metrics grouped by pillar */}
      <div className="space-y-5">
        {PILLAR_ORDER.map((pillar) => {
          const pillarMetrics = metrics.filter((m) => m.pillar === pillar)
          if (pillarMetrics.length === 0) return null
          const pillarScore = getPillarScore(metrics, pillar)

          return (
            <div key={pillar} className="space-y-2">
              <PillarHeader pillar={pillar} score={pillarScore} metrics={metrics} />
              {pillarMetrics.map((metric) => (
                <MetricRow key={metric.name} metric={metric} showDetails={showDetails} />
              ))}
            </div>
          )
        })}
      </div>

      <DetailsToggle showDetails={showDetails} onToggle={() => setShowDetails(!showDetails)} />

      {/* Attribution */}
      <p className="text-caption text-center text-muted-foreground/50 mt-3">
        Based on Financial Health Network's FinHealth Score framework
      </p>
    </motion.div>
  )
}
