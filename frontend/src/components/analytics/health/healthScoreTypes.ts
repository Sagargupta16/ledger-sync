import type { Transaction } from '@/types'

export type FinHealthTier = 'healthy' | 'coping' | 'vulnerable'
export type Pillar = 'spend' | 'save' | 'borrow' | 'plan'

export interface HealthMetric {
  name: string
  score: number
  weight: number
  status: FinHealthTier
  pillar: Pillar
  description: string
  target: string
  details?: string[]
}

export interface MonthlyBucket {
  income: number
  expense: number
  debt: number
  investmentInflow: number
  investmentOutflow: number
  discretionary: number
  essential: number
  categories: Record<string, number>
}

export interface AnalysisResult {
  monthsAnalyzed: number
  savingsRate: number
  essentialToIncomeRatio: number
  avgMonthlyIncome: number
  avgMonthlyExpense: number
  emergencyFundMonths: number
  cumulativeNetSavings: number
  investmentRegularity: number
  investmentToIncomeRatio: number
  totalInvestmentInflow: number
  totalInvestmentOutflow: number
  debtToIncomeRatio: number
  avgMonthlyDebt: number
  debtTrendPercent: number
  positiveSavingsRatio: number
  savingsVolatilityCV: number
  incomeCV: number
}

export const DEBT_CATEGORIES = [
  'EMI',
  'Loan',
  'Credit Card Payment',
  'Mortgage',
  'Personal Loan',
  'Car Loan',
  'Home Loan',
]

export const DISCRETIONARY_CATEGORIES = [
  'Entertainment',
  'Shopping',
  'Dining',
  'Travel',
  'Leisure',
  'Recreation',
  'Gifts',
  'Subscriptions',
  'Personal Care',
]

export const ESSENTIAL_CATEGORIES = [
  'Rent',
  'Utilities',
  'Groceries',
  'Healthcare',
  'Insurance',
  'Education',
  'Transportation',
  'Fuel',
  'Medicine',
]

export const INVESTMENT_ACCOUNT_PATTERNS = [
  'mutual fund',
  'mf',
  'grow',
  'zerodha',
  'kuvera',
  'coin',
  'smallcase',
  'stocks',
  'demat',
  'ppf',
  'nps',
  'elss',
  'epf',
]

export const INVESTMENT_NOTE_KEYWORDS = [
  'sip',
  'mutual fund',
  'investment',
  'ppf',
  'nps',
  'elss',
  'epf',
]

/**
 * Primary targets for the 8 FinHealth metrics. Tweak in one place;
 * the score* functions reference the same constants.
 */
export const HEALTH_SCORE_RUBRIC = {
  savingsRatePct: 20,
  essentialRatioPct: 50,
  emergencyFundMonths: 6,
  investmentToIncomePct: 15,
  debtToIncomeMaxPct: 36,
  debtTrendGoodPct: -5,
  savingsConsistencyPct: 90,
  incomeStabilityMaxCV: 25,
} as const

// ─── Pure helpers ─────────────────────────────────────────────────

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

export function tierFromScore(score: number): FinHealthTier {
  if (score >= 80) return 'healthy'
  if (score >= 40) return 'coping'
  return 'vulnerable'
}

export function matchesCategoryList(category: string, list: string[]): boolean {
  const lower = category.toLowerCase()
  return list.some((c) => lower.includes(c.toLowerCase()))
}

export function matchesPatterns(value: string, patterns: string[]): boolean {
  const lower = value.toLowerCase()
  return patterns.some((p) => lower.includes(p))
}

export function formatSignedPercent(value: number): string {
  const prefix = value > 0 ? '+' : ''
  return `${prefix}${value.toFixed(1)}%`
}

export function cvToScore(cv: number): number {
  if (cv < 30) return 90
  if (cv < 60) return 70
  if (cv < 100) return 50
  return 20
}

export function cvToLabel(cv: number): string {
  if (cv < 30) return 'Low'
  if (cv < 60) return 'Moderate'
  return 'High'
}

export function coefficientOfVariation(values: number[]): number {
  if (values.length === 0) return 0
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  if (mean === 0) return 0
  const variance = values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / values.length
  return (Math.sqrt(variance) / Math.abs(mean)) * 100
}

// ─── Investment detection ─────────────────────────────────────────

export function checkIsInvestmentTransaction(
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

export function isToAccountInvestment(
  toAccount: string | undefined,
  isInvestmentAccount: (name: string) => boolean,
): boolean {
  if (!toAccount) return false
  if (isInvestmentAccount(toAccount)) return true
  return matchesPatterns(toAccount.toLowerCase(), INVESTMENT_ACCOUNT_PATTERNS)
}

export function checkIsInvestmentWithdrawal(
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
