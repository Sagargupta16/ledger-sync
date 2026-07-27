import type { Transaction } from '@/types'
import type { CFPScoreInputs } from '@/lib/financialHealthCalculator'
import {
  completeMonthKeys,
  investmentAllocationRatePercent,
  savingsRatePercentOr,
  shareOfIncomePercent,
  sumFlows,
} from '@/lib/savingsRate'
import { isSpending } from '@/lib/expenseClassification'

import type { AnalysisResult, BalancePosition, MonthlyBucket } from './healthScoreTypes'
import {
  DEBT_CATEGORIES,
  DISCRETIONARY_CATEGORIES,
  ESSENTIAL_CATEGORIES,
  checkIsInvestmentTransaction,
  checkIsInvestmentWithdrawal,
  matchesCategoryList,
  weightedCoefficientOfVariation,
} from './healthScoreTypes'

export function createEmptyBucket(): MonthlyBucket {
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

export function classifyTransaction(
  tx: Transaction,
  bucket: MonthlyBucket,
  isInvestmentAccount: (name: string) => boolean,
  userFixedCategories?: Set<string>,
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
  // A realised capital loss is filed as an Expense row but is a negative
  // investment return, so counting it depresses the savings-rate and
  // cash-flow components of the score.
  if (tx.type === 'Expense' && isSpending(tx)) {
    bucket.expense += amount
    bucket.categories[category] = (bucket.categories[category] || 0) + amount
    if (matchesCategoryList(category, DEBT_CATEGORIES)) bucket.debt += amount
    if (matchesCategoryList(category, DISCRETIONARY_CATEGORIES)) bucket.discretionary += amount
    const isEssential = matchesCategoryList(category, ESSENTIAL_CATEGORIES)
    const isUserFixed = userFixedCategories
      ? userFixedCategories.has(category.toLowerCase()) ||
        userFixedCategories.has(`${category}::${tx.subcategory ?? ''}`.toLowerCase())
      : false
    if (isEssential || isUserFixed) bucket.essential += amount
  }
}

export function computeMonthlyData(
  transactions: Transaction[],
  isInvestmentAccount: (name: string) => boolean,
  userFixedCategories?: Set<string>,
): { months: string[]; monthlyData: Record<string, MonthlyBucket> } | null {
  if (transactions.length < 10) return null

  const monthlyData: Record<string, MonthlyBucket> = {}

  for (const tx of transactions) {
    const month = tx.date.slice(0, 7)
    if (!monthlyData[month]) {
      monthlyData[month] = createEmptyBucket()
    }
    classifyTransaction(tx, monthlyData[month], isInvestmentAccount, userFixedCategories)
  }

  const allMonths = Object.keys(monthlyData).sort((a, b) => a.localeCompare(b))

  // Drop every unfinished month unconditionally. The old rule only dropped the
  // current month before the 15th, so the same ledger reported two different
  // savings rates depending on the calendar day the user opened the app (on the
  // real ledger the in-progress month reads -696.8% and moves the all-time rate
  // by 1.6pp). It also used `months.pop()`, which removes the LAST key -- a
  // single future-dated row makes that the wrong month.
  const months = completeMonthKeys(allMonths)
  const kept = new Set(months)
  for (const month of allMonths) {
    if (!kept.has(month)) delete monthlyData[month]
  }

  // The floor counts FINISHED months only, so it is one month stricter than it
  // used to be from the 15th onward: an account whose whole history is
  // "this month plus the two before it" now returns null and the panel renders
  // its empty state where it previously showed a score. That is deliberate --
  // the score it used to show was two finished months blended with a
  // part-month that reads several hundred percent negative -- but it is a real
  // change for brand-new accounts, not just a precision tweak.
  if (months.length < 3) return null
  return { months, monthlyData }
}

export function computeAnalysis(
  months: string[],
  monthlyData: Record<string, MonthlyBucket>,
  balances: BalancePosition | null = null,
): AnalysisResult {
  const buckets = months.map((m) => monthlyData[m])
  const count = months.length
  const halfPoint = Math.floor(count / 2)

  // Pool via the shared helper so the totals handed to every downstream ratio
  // (and to computeCFPScore) are the observed sums, never `avg * count`.
  const pooled = sumFlows(buckets)
  const totalIncome = pooled.income
  const totalExpense = pooled.expense
  const avgMonthlyIncome = totalIncome / count
  const avgMonthlyExpense = totalExpense / count

  // Pooled over the period via the shared definition -- not derived from the
  // two monthly averages, which only agree while both use the same divisor.
  //
  // This is the CONSUMPTION rate: `totalExpense` already had realised capital
  // losses filtered out by `classifyTransaction`, so the question answered is
  // "what share of income did I not spend on goods and services". It is NOT the
  // `savings_rate` field on `/api/calculations/totals`, which is
  // `net_savings / income` and DOES carry the loss (40% where this reads 60% on
  // the same rows). The two are different questions, both correct under their own
  // name -- see "TWO RATES, TWO QUESTIONS" in lib/savingsRate.ts. Do not
  // "reconcile" this against the endpoint field.
  const savingsRate = savingsRatePercentOr({ income: totalIncome, expense: totalExpense })

  const totalEssential = buckets.reduce((s, m) => s + m.essential, 0)
  // No income means essentials consume everything, hence the 100 fallback --
  // the opposite choice from the debt ratio below, which is why the fallback is
  // explicit at each call site.
  const essentialToIncomeRatio = shareOfIncomePercent(totalEssential, totalIncome, 100)

  const totalInvestmentInflow = buckets.reduce((s, m) => s + m.investmentInflow, 0)
  const totalInvestmentOutflow = buckets.reduce((s, m) => s + m.investmentOutflow, 0)
  const monthlyNetInvestments = buckets.map((m) => m.investmentInflow - m.investmentOutflow)
  const monthsWithNetInvestments = monthlyNetInvestments.filter((n) => n > 0).length
  const investmentRegularity = monthsWithNetInvestments / count
  const totalNetInvestment = totalInvestmentInflow - totalInvestmentOutflow
  // A distinct metric from the savings rate on purpose: see the docstring on
  // investmentAllocationRatePercent. Transfers are the numerator here.
  const investmentToIncomeRatio = investmentAllocationRatePercent(totalNetInvestment, totalIncome)

  const cumulativeNetSavings = totalIncome - totalExpense
  // Prefer the real liquid balance (bank + cash + wallets). Only when no
  // balance feed is available do we fall back to the old cumulative-flow
  // proxy -- which understates badly for anyone whose lifetime investing
  // exceeds their lifetime cash surplus (it clamps to 0).
  const flowProxyLiquid = Math.max(0, cumulativeNetSavings - Math.max(0, totalNetInvestment))
  const liquidSavings = balances ? balances.liquidAssets : flowProxyLiquid
  const emergencyFundMonths = avgMonthlyExpense > 0 ? liquidSavings / avgMonthlyExpense : 0

  const totalDebt = buckets.reduce((s, m) => s + m.debt, 0)
  const avgMonthlyDebt = totalDebt / count
  // Pooled totals, not the two averages: same ratio, one fewer divisor to drift.
  const debtToIncomeRatio = shareOfIncomePercent(totalDebt, totalIncome)

  const firstHalfDebt =
    buckets.slice(0, halfPoint).reduce((s, m) => s + m.debt, 0) / (halfPoint || 1)
  const secondHalfDebt =
    buckets.slice(halfPoint).reduce((s, m) => s + m.debt, 0) / (count - halfPoint || 1)
  const debtTrendBase = secondHalfDebt > 0 ? 100 : 0
  const debtTrendPercent =
    firstHalfDebt > 0
      ? ((secondHalfDebt - firstHalfDebt) / firstHalfDebt) * 100
      : debtTrendBase

  const monthlySavingsRates = buckets.map((m) =>
    savingsRatePercentOr({ income: m.income, expense: m.expense }),
  )
  const positiveSavingsMonths = monthlySavingsRates.filter((r) => r > 0).length
  const positiveSavingsRatio = positiveSavingsMonths / count

  // Stability/volatility are about RECENT consistency, so measure them over the
  // last 12 months -- not the full history. Over a multi-year ramp (a student
  // going from ~Rs0 to a salary) the all-time income CV is ~130%, which floors
  // every stability score at 0 even when the last year is rock-steady (CV ~10%).
  // Within that window we recency-weight (JPMC/RiskMetrics EWMA of deviations)
  // so a couple of older lean months don't dominate a now-steady reading.
  const VOLATILITY_WINDOW = 12
  const recentBuckets = buckets.slice(-VOLATILITY_WINDOW)
  const recentSavingsRates = recentBuckets
    .map((m) => savingsRatePercentOr({ income: m.income, expense: m.expense }))
    .filter((r) => r > 0)
  const savingsVolatilityCV = weightedCoefficientOfVariation(recentSavingsRates)

  // Income CV over recent months that actually had income (a pre-earning month
  // of Rs0 isn't "income instability"; it's no income yet).
  const recentIncomes = recentBuckets.map((m) => m.income).filter((v) => v > 0)
  const incomeCV = weightedCoefficientOfVariation(recentIncomes)

  return {
    monthsAnalyzed: count,
    savingsRate,
    essentialToIncomeRatio,
    totalIncome,
    totalExpense,
    totalEssentialExpense: totalEssential,
    totalDebt,
    avgMonthlyIncome,
    avgMonthlyExpense,
    avgMonthlyEssentialExpense: totalEssential / count,
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
    balances,
  }
}

/**
 * Build the CFP scorer's inputs from an analysis result.
 *
 * The single place this mapping happens. Both callers previously reconstituted
 * the period totals as `avgMonthlyIncome * monthsAnalyzed` and
 * `avgMonthlyExpense * monthsAnalyzed`, which is a lossy round-trip of sums the
 * analysis already had -- and it silently diverges the moment the two averages
 * stop sharing a divisor, shifting the weighted composite with no failing test.
 * `totalDebtOutstanding` stays a flow proxy (debt SERVICE summed over the
 * window, not a balance); it is only used when no real balance feed is attached.
 */
export function cfpInputsFromAnalysis(data: AnalysisResult): CFPScoreInputs {
  return {
    totalIncome: data.totalIncome,
    totalExpenses: data.totalExpense,
    avgMonthlyIncome: data.avgMonthlyIncome,
    avgMonthlyExpense: data.avgMonthlyExpense,
    avgMonthlyEssentialExpense: data.avgMonthlyEssentialExpense,
    avgMonthlyDebt: data.avgMonthlyDebt,
    cumulativeNetSavings: data.cumulativeNetSavings,
    netInvestments: data.totalInvestmentInflow - data.totalInvestmentOutflow,
    totalDebtOutstanding: data.totalDebt,
    balances: data.balances,
  }
}
