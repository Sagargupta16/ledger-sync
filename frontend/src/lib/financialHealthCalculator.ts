/**
 * CFP (Certified Financial Planner) standard financial ratios.
 *
 * These are the 6 canonical ratios used by CFPs worldwide to assess
 * a client's financial health. Each maps to a 0-100 sub-score with
 * thresholds based on industry standards.
 *
 * References:
 * - CFP Board Financial Planning Body of Knowledge
 * - RBI Financial Literacy Guidelines
 * - FPSB India Financial Planning Standards
 */

export interface CFPRatio {
  name: string
  value: number
  score: number
  target: string
  status: 'good' | 'warning' | 'poor'
  description: string
  formattedValue: string
}

export interface CFPScoreResult {
  ratios: CFPRatio[]
  compositeScore: number
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

function mapToScore(value: number, thresholds: [number, number, number, number, number]): number {
  // thresholds: [poor_max, warning_low, target, good, excellent]
  const [poorMax, warningLow, target, good, excellent] = thresholds
  if (value >= excellent) return 100
  if (value >= good) return 80 + ((value - good) / (excellent - good)) * 20
  if (value >= target) return 60 + ((value - target) / (good - target)) * 20
  if (value >= warningLow) return 40 + ((value - warningLow) / (target - warningLow)) * 20
  if (value >= poorMax) return 20 + ((value - poorMax) / (warningLow - poorMax)) * 20
  return clamp((value / poorMax) * 20, 0, 20)
}

function mapToScoreInverse(value: number, thresholds: [number, number, number, number, number]): number {
  // For ratios where lower is better (e.g., debt service ratio)
  // thresholds: [excellent, good, target, warning, poor]
  const [excellent, good, target, warning, poor] = thresholds
  if (value <= excellent) return 100
  if (value <= good) return 80 + ((good - value) / (good - excellent)) * 20
  if (value <= target) return 60 + ((target - value) / (target - good)) * 20
  if (value <= warning) return 40 + ((warning - value) / (warning - target)) * 20
  if (value <= poor) return 20 + ((poor - value) / (poor - warning)) * 20
  return clamp(20 - ((value - poor) / poor) * 20, 0, 20)
}

function statusFromScore(score: number): 'good' | 'warning' | 'poor' {
  if (score >= 60) return 'good'
  if (score >= 40) return 'warning'
  return 'poor'
}

/** Pick description by value thresholds (avoids nested ternaries). Checks high-to-low. */
function describeByThreshold(value: number, levels: Array<[number, string]>, fallback: string): string {
  for (const [threshold, desc] of levels) {
    if (value >= threshold) return desc
  }
  return fallback
}

/** Same as describeByThreshold but for "lower is better" metrics (checks low-to-high). */
function describeByThresholdInverse(value: number, levels: Array<[number, string]>, fallback: string): string {
  for (const [threshold, desc] of levels) {
    if (value <= threshold) return desc
  }
  return fallback
}

/**
 * 1. Savings Rate = (Income - Expenses) / Income
 * Target: >= 20% (CFP standard)
 */
function computeSavingsRate(income: number, expenses: number): CFPRatio {
  const value = income > 0 ? ((income - expenses) / income) * 100 : 0
  const score = mapToScore(value, [-10, 0, 10, 20, 30])
  return {
    name: 'Savings Rate',
    value,
    score: Math.round(clamp(score, 0, 100)),
    target: '>= 20%',
    status: statusFromScore(score),
    description: describeByThreshold(value, [[20, 'Excellent savings discipline'], [10, 'Building towards the 20% target']], 'Focus on increasing savings'),
    formattedValue: `${value.toFixed(1)}%`,
  }
}

/**
 * 2. Liquidity Ratio = Liquid Assets / Monthly Expenses
 * Target: >= 3 months (CFP minimum), 6 months ideal
 */
function computeLiquidityRatio(liquidAssets: number, monthlyExpenses: number): CFPRatio {
  const value = monthlyExpenses > 0 ? liquidAssets / monthlyExpenses : 0
  const score = mapToScore(value, [0, 1, 3, 6, 9])
  return {
    name: 'Liquidity Ratio',
    value,
    score: Math.round(clamp(score, 0, 100)),
    target: '>= 3 months',
    status: statusFromScore(score),
    description: describeByThreshold(value, [[6, 'Strong liquidity buffer'], [3, 'Adequate emergency coverage']], 'Build emergency reserves'),
    formattedValue: `${value.toFixed(1)} mo`,
  }
}

/**
 * 3. Debt Service Ratio = Monthly Debt Payments / Gross Monthly Income
 * Target: <= 36% (banking back-end standard). Tiers per CFSI/FHN
 * "Have a sustainable debt load": green < 36%, yellow 36-43%, red > 43%.
 */
function computeDebtServiceRatio(monthlyDebt: number, monthlyIncome: number): CFPRatio {
  const value = monthlyIncome > 0 ? (monthlyDebt / monthlyIncome) * 100 : 0
  const score = mapToScoreInverse(value, [10, 20, 36, 43, 55])
  return {
    name: 'Debt Service Ratio',
    value,
    score: Math.round(clamp(score, 0, 100)),
    target: '<= 36%',
    status: statusFromScore(score),
    description: describeByThresholdInverse(value, [[20, 'Healthy debt levels'], [36, 'Within banking limits'], [43, 'Elevated debt load']], 'High debt burden'),
    formattedValue: `${value.toFixed(1)}%`,
  }
}

/**
 * 4. Investment-to-Income Ratio = Net Investments / Total Income
 * Target: >= 15% (India: higher due to no employer pension for most)
 */
function computeInvestmentRatio(netInvestments: number, totalIncome: number): CFPRatio {
  const value = totalIncome > 0 ? (netInvestments / totalIncome) * 100 : 0
  const score = mapToScore(value, [-5, 0, 5, 15, 25])
  return {
    name: 'Investment Ratio',
    value,
    score: Math.round(clamp(score, 0, 100)),
    target: '>= 15%',
    status: statusFromScore(score),
    description: describeByThreshold(value, [[15, 'Strong wealth-building pace'], [5, 'Good start, increase gradually']], 'Begin a regular investment habit'),
    formattedValue: `${value.toFixed(1)}%`,
  }
}

/**
 * 5. Solvency Ratio = Net Worth / Total Assets
 * Target: >= 50% (higher is better, approaching 100% as debt is paid off).
 * Uses real net worth from account balances when available; otherwise
 * approximated from cumulative savings minus outstanding debt.
 */
function computeSolvencyRatio(netWorth: number, totalAssets: number): CFPRatio {
  let value: number
  if (totalAssets > 0) value = (netWorth / totalAssets) * 100
  else value = netWorth >= 0 ? 100 : 0
  const score = mapToScore(value, [0, 25, 50, 75, 90])
  return {
    name: 'Solvency Ratio',
    value,
    score: Math.round(clamp(score, 0, 100)),
    target: '> 50%',
    status: statusFromScore(score),
    description: describeByThreshold(value, [[75, 'Strong net worth position'], [50, 'Positive solvency']], 'Focus on reducing liabilities'),
    formattedValue: `${value.toFixed(0)}%`,
  }
}

/**
 * 6. Emergency Fund Coverage = Liquid Balance / Monthly Living Expenses
 * Target: 3-6 months (FHN/CFSI score against total living expenses).
 * 6+ months = top tier, 3-5 next, under 1 month = red.
 */
function computeEmergencyFundCoverage(liquidBalance: number, monthlyExpenses: number): CFPRatio {
  const value = monthlyExpenses > 0 ? liquidBalance / monthlyExpenses : 0
  const score = mapToScore(value, [0, 1, 3, 6, 12])
  return {
    name: 'Emergency Fund',
    value,
    score: Math.round(clamp(score, 0, 100)),
    target: '3-6 months',
    status: statusFromScore(score),
    description: describeByThreshold(value, [[6, 'Well-cushioned for emergencies'], [3, 'Minimum coverage met']], 'Prioritize building emergency fund'),
    formattedValue: `${value.toFixed(1)} mo`,
  }
}

// Weights per CFP standard (total = 100)
const WEIGHTS = [20, 15, 20, 15, 15, 15] as const

/**
 * Real balance position from account balances. When supplied, the liquidity,
 * solvency, and emergency-fund ratios use observed balances instead of the
 * cumulative-flow proxy (which reads 0 for anyone whose lifetime investing
 * exceeds their lifetime cash surplus).
 */
export interface BalanceInputs {
  liquidAssets: number
  investmentAssets: number
  totalLiabilities: number
  totalAssets: number
  netWorth: number
}

/**
 * Compute all 6 CFP ratios and a weighted composite score.
 */
export function computeCFPScore(params: {
  totalIncome: number
  totalExpenses: number
  avgMonthlyIncome: number
  avgMonthlyExpense: number
  avgMonthlyEssentialExpense: number
  avgMonthlyDebt: number
  cumulativeNetSavings: number
  netInvestments: number
  totalDebtOutstanding: number
  /** Real balances; when present, override the flow-based asset proxy. */
  balances?: BalanceInputs | null
}): CFPScoreResult {
  const {
    totalIncome,
    totalExpenses,
    avgMonthlyIncome,
    avgMonthlyExpense,
    avgMonthlyDebt,
    cumulativeNetSavings,
    netInvestments,
    totalDebtOutstanding,
    balances,
  } = params

  let liquidAssets: number
  let totalAssets: number
  let netWorth: number
  if (balances) {
    // Observed balances: liquid = bank/cash/wallets, and net worth already
    // nets out real liabilities (negative-balance accounts).
    liquidAssets = balances.liquidAssets
    totalAssets = balances.totalAssets
    netWorth = balances.netWorth
  } else {
    // Fallback proxy: liquid = net savings minus money locked in investments.
    liquidAssets = Math.max(0, cumulativeNetSavings - Math.max(0, netInvestments))
    totalAssets = liquidAssets + Math.max(0, netInvestments)
    // Net worth must subtract outstanding debt; otherwise solvency is always
    // 100% (netWorth === totalAssets) and debt has no effect on the score.
    netWorth = totalAssets - Math.max(0, totalDebtOutstanding)
  }

  // Emergency fund is scored on total monthly living expenses (FHN/CFSI use
  // total living expenses, not essential-only).
  const ratios: CFPRatio[] = [
    computeSavingsRate(totalIncome, totalExpenses),
    computeLiquidityRatio(liquidAssets, avgMonthlyExpense),
    computeDebtServiceRatio(avgMonthlyDebt, avgMonthlyIncome),
    computeInvestmentRatio(netInvestments, totalIncome),
    computeSolvencyRatio(netWorth, totalAssets > 0 ? totalAssets : 1),
    computeEmergencyFundCoverage(liquidAssets, avgMonthlyExpense),
  ]

  const compositeScore = Math.round(
    ratios.reduce((sum, r, i) => sum + r.score * WEIGHTS[i], 0) / 100,
  )

  return { ratios, compositeScore }
}
