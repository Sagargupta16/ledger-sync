/**
 * FIRE (Financial Independence, Retire Early) & Retirement Calculator
 *
 * References:
 * - FIRE movement: Mr. Money Mustache, JL Collins
 * - SWR: Trinity Study (4% rule, adjusted to 3% for India due to higher inflation)
 * - Indian context: 6-7% inflation, 10-12% equity returns, 7-8% debt returns
 */

export interface FIREResult {
  fireNumber: number
  coastFIRE: number
  leanFIRE: number
  fatFIRE: number
  yearsToFIRE: number
  currentSavingsRate: number
}

export interface RetirementResult {
  requiredCorpus: number
  monthlyExpenseAtRetirement: number
  monthlySIP: number
  lumpSumToday: number
  projectionData: Array<{ year: number; corpus: number; contributed: number }>
}

/**
 * Compute FIRE Number = Annual Expenses / SWR
 */
export function computeFIRENumber(annualExpenses: number, swr = 0.03): number {
  if (swr <= 0) return 0
  return Math.round(annualExpenses / swr)
}

/**
 * Coast FIRE = FIRE Number / (1 + realReturn)^yearsToRetire
 * The amount you need TODAY so it grows to your FIRE Number by retirement.
 */
export function computeCoastFIRE(
  fireNumber: number,
  realReturn: number,
  yearsToRetire: number,
): number {
  if (yearsToRetire <= 0 || realReturn <= -1) return fireNumber
  return Math.round(fireNumber / Math.pow(1 + realReturn, yearsToRetire))
}

/**
 * Lean FIRE = Essential Expenses Only / SWR
 */
export function computeLeanFIRE(essentialAnnualExpenses: number, swr = 0.03): number {
  if (swr <= 0) return 0
  return Math.round(essentialAnnualExpenses / swr)
}

/**
 * Fat FIRE = 2x FIRE Number (comfortable lifestyle with buffer)
 */
export function computeFatFIRE(fireNumber: number): number {
  return Math.round(fireNumber * 2)
}

/**
 * Years to FIRE, solving for n in the future-value equation:
 *   P(1+r)^n + S * [((1+r)^n - 1) / r] = F
 * where P = current portfolio, S = annual savings, r = real return, F = FIRE number.
 *
 * Rearranged:
 *   (1+r)^n = (F + S/r) / (P + S/r)
 *   n = ln((F + S/r) / (P + S/r)) / ln(1 + r)
 *
 * Handles edge cases: already at FIRE, zero savings, zero return, zero portfolio.
 */
export function computeYearsToFIRE(
  fireNumber: number,
  annualSavings: number,
  realReturn: number,
  currentPortfolio = 0,
): number {
  // Already there
  if (currentPortfolio >= fireNumber) return 0

  // Zero-growth case: portfolio never grows, must reach via savings alone
  if (realReturn <= 0) {
    if (annualSavings <= 0) return Infinity
    return Math.max(0, (fireNumber - currentPortfolio) / annualSavings)
  }

  // Zero-savings case: pure compounding of existing portfolio
  if (annualSavings <= 0) {
    if (currentPortfolio <= 0) return Infinity
    return Math.max(0, Math.log(fireNumber / currentPortfolio) / Math.log(1 + realReturn))
  }

  // General case: both portfolio growth and ongoing savings
  const savingsPerpetuity = annualSavings / realReturn
  const ratio = (fireNumber + savingsPerpetuity) / (currentPortfolio + savingsPerpetuity)
  if (ratio <= 0) return Infinity
  return Math.max(0, Math.log(ratio) / Math.log(1 + realReturn))
}

/**
 * Compute all FIRE variants.
 */
export function computeFIRE(params: {
  annualExpenses: number
  essentialAnnualExpenses: number
  annualSavings: number
  annualIncome: number
  currentPortfolio?: number
  swr?: number
  realReturn?: number
  yearsToRetire?: number
}): FIREResult {
  const {
    annualExpenses,
    essentialAnnualExpenses,
    annualSavings,
    annualIncome,
    currentPortfolio = 0,
    swr = 0.03,
    realReturn = 0.06,
    yearsToRetire = 25,
  } = params

  const fireNumber = computeFIRENumber(annualExpenses, swr)
  const coastFIRE = computeCoastFIRE(fireNumber, realReturn, yearsToRetire)
  const leanFIRE = computeLeanFIRE(essentialAnnualExpenses, swr)
  const fatFIRE = computeFatFIRE(fireNumber)
  const yearsToFIRE = computeYearsToFIRE(fireNumber, annualSavings, realReturn, currentPortfolio)
  const currentSavingsRate = annualIncome > 0 ? (annualSavings / annualIncome) * 100 : 0

  return { fireNumber, coastFIRE, leanFIRE, fatFIRE, yearsToFIRE, currentSavingsRate }
}

/**
 * Compute retirement corpus required and monthly SIP needed.
 *
 * @param monthlyExpenses - Current monthly expenses
 * @param inflationRate - Annual inflation (default 6.5% for India)
 * @param expectedReturn - Annual return on investments (default 12%)
 * @param yearsToRetirement - Years until retirement
 * @param swr - Safe withdrawal rate (default 3%)
 */
export function computeRetirementCorpus(params: {
  monthlyExpenses: number
  inflationRate?: number
  expectedReturn?: number
  yearsToRetirement: number
  swr?: number
}): RetirementResult {
  const {
    monthlyExpenses,
    inflationRate = 0.065,
    expectedReturn = 0.12,
    yearsToRetirement,
    swr = 0.03,
  } = params

  if (yearsToRetirement <= 0 || monthlyExpenses <= 0) {
    return { requiredCorpus: 0, monthlyExpenseAtRetirement: 0, monthlySIP: 0, lumpSumToday: 0, projectionData: [] }
  }

  // Monthly expenses at retirement (adjusted for inflation)
  const monthlyExpenseAtRetirement = monthlyExpenses * Math.pow(1 + inflationRate, yearsToRetirement)
  const annualExpenseAtRetirement = monthlyExpenseAtRetirement * 12

  // Corpus needed = annual expense at retirement / SWR
  const requiredCorpus = Math.round(annualExpenseAtRetirement / swr)

  // Monthly SIP needed: Corpus = SIP * [(1+r)^n - 1] / r * (1+r)
  // where r = monthly return, n = total months
  const monthlyReturn = expectedReturn / 12
  const totalMonths = yearsToRetirement * 12
  const fvFactor = (Math.pow(1 + monthlyReturn, totalMonths) - 1) / monthlyReturn * (1 + monthlyReturn)
  const monthlySIP = fvFactor > 0 ? Math.round(requiredCorpus / fvFactor) : 0

  // Lump sum today that would grow to the corpus
  const lumpSumToday = Math.round(requiredCorpus / Math.pow(1 + expectedReturn, yearsToRetirement))

  // Year-by-year projection
  const projectionData: RetirementResult['projectionData'] = []
  let accumulated = 0
  let totalContributed = 0
  for (let year = 1; year <= yearsToRetirement; year++) {
    const annualSIP = monthlySIP * 12
    totalContributed += annualSIP
    accumulated = (accumulated + annualSIP) * (1 + expectedReturn)
    projectionData.push({
      year,
      corpus: Math.round(accumulated),
      contributed: Math.round(totalContributed),
    })
  }

  return { requiredCorpus, monthlyExpenseAtRetirement: Math.round(monthlyExpenseAtRetirement), monthlySIP, lumpSumToday, projectionData }
}
