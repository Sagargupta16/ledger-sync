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

/**
 * Point-in-time balance picture derived from real account balances (not a
 * flow proxy). Liquid = current balances of bank/cash/wallet accounts; the
 * emergency-fund and liquidity ratios divide this by monthly living expenses.
 * Per FHN/CFSI "Have sufficient liquid savings", the numerator is observed
 * liquid account balances, never (lifetime income - expenses - investments).
 */
export interface BalancePosition {
  /** Bank + cash + wallet balances (positive only). The emergency buffer. */
  liquidAssets: number
  /** Investment/retirement account balances (positive only). Not liquid. */
  investmentAssets: number
  /** Sum of negative balances (credit cards, loans) as a positive number. */
  totalLiabilities: number
  /** liquidAssets + investmentAssets. */
  totalAssets: number
  /** totalAssets - totalLiabilities. */
  netWorth: number
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
  /**
   * Real balance position from account balances, when available. Null when
   * the score is computed from transactions alone (e.g. a preview with no
   * balance feed) -- scorers then fall back to the cumulative-flow proxy.
   */
  balances: BalancePosition | null
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
  // Median household monthly-income CV is ~38% (JPMorgan Chase Institute), so
  // "stable" must sit around/above the median, not below it. A 25% cap flagged
  // typical earners as volatile. CV > 100% is the genuine extreme tail (~8%).
  incomeStabilityMaxCV: 40,
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

/**
 * Recency-weighted coefficient of variation (%). Recent months count more
 * than old ones, so a now-steady earner isn't flagged "volatile" by long-past
 * student months of ~Rs0 income. `values` must be oldest-first; weights decay
 * geometrically by `decay` per step back in time (RiskMetrics-style EWMA of
 * deviations from the weighted mean, adapted from lambda~0.97 monthly).
 *
 * Returns 0 for empty input or a zero weighted mean.
 */
export function weightedCoefficientOfVariation(values: number[], decay = 0.9): number {
  const n = values.length
  if (n === 0) return 0
  // Newest gets weight 1, each older step multiplies by `decay`.
  const weights = values.map((_, i) => Math.pow(decay, n - 1 - i))
  const wSum = weights.reduce((a, b) => a + b, 0)
  if (wSum === 0) return 0
  const wMean = values.reduce((s, v, i) => s + v * weights[i], 0) / wSum
  if (wMean === 0) return 0
  const wVar = values.reduce((s, v, i) => s + weights[i] * Math.pow(v - wMean, 2), 0) / wSum
  return (Math.sqrt(wVar) / Math.abs(wMean)) * 100
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
