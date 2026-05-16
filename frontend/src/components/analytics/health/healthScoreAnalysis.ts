import type { Transaction } from '@/types'

import type { AnalysisResult, MonthlyBucket } from './healthScoreTypes'
import {
  DEBT_CATEGORIES,
  DISCRETIONARY_CATEGORIES,
  ESSENTIAL_CATEGORIES,
  checkIsInvestmentTransaction,
  checkIsInvestmentWithdrawal,
  coefficientOfVariation,
  matchesCategoryList,
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
  if (tx.type === 'Expense') {
    bucket.expense += amount
    bucket.categories[category] = (bucket.categories[category] || 0) + amount
    if (matchesCategoryList(category, DEBT_CATEGORIES)) bucket.debt += amount
    if (matchesCategoryList(category, DISCRETIONARY_CATEGORIES)) bucket.discretionary += amount
    const isEssential = matchesCategoryList(category, ESSENTIAL_CATEGORIES)
    const isUserFixed = userFixedCategories
      ? userFixedCategories.has(category.toLowerCase()) ||
        userFixedCategories.has(`${category}::${tx.subcategory || ''}`.toLowerCase())
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

  const months = Object.keys(monthlyData).sort((a, b) => a.localeCompare(b))

  const today = new Date()
  const currentMonth = today.toISOString().slice(0, 7)
  if (today.getDate() < 15 && months.includes(currentMonth)) {
    months.pop()
    delete monthlyData[currentMonth]
  }

  if (months.length < 3) return null
  return { months, monthlyData }
}

export function computeAnalysis(
  months: string[],
  monthlyData: Record<string, MonthlyBucket>,
): AnalysisResult {
  const buckets = months.map((m) => monthlyData[m])
  const count = months.length
  const halfPoint = Math.floor(count / 2)

  const totalIncome = buckets.reduce((s, m) => s + m.income, 0)
  const totalExpense = buckets.reduce((s, m) => s + m.expense, 0)
  const avgMonthlyIncome = totalIncome / count
  const avgMonthlyExpense = totalExpense / count

  const savingsRate =
    avgMonthlyIncome > 0
      ? ((avgMonthlyIncome - avgMonthlyExpense) / avgMonthlyIncome) * 100
      : 0

  const totalEssential = buckets.reduce((s, m) => s + m.essential, 0)
  const essentialToIncomeRatio = totalIncome > 0 ? (totalEssential / totalIncome) * 100 : 100

  const totalInvestmentInflow = buckets.reduce((s, m) => s + m.investmentInflow, 0)
  const totalInvestmentOutflow = buckets.reduce((s, m) => s + m.investmentOutflow, 0)
  const monthlyNetInvestments = buckets.map((m) => m.investmentInflow - m.investmentOutflow)
  const monthsWithNetInvestments = monthlyNetInvestments.filter((n) => n > 0).length
  const investmentRegularity = monthsWithNetInvestments / count
  const totalNetInvestment = totalInvestmentInflow - totalInvestmentOutflow
  const investmentToIncomeRatio =
    totalIncome > 0 ? (totalNetInvestment / totalIncome) * 100 : 0

  const cumulativeNetSavings = totalIncome - totalExpense
  const liquidSavings = Math.max(0, cumulativeNetSavings - Math.max(0, totalNetInvestment))
  const emergencyFundMonths = avgMonthlyExpense > 0 ? liquidSavings / avgMonthlyExpense : 0

  const totalDebt = buckets.reduce((s, m) => s + m.debt, 0)
  const avgMonthlyDebt = totalDebt / count
  const debtToIncomeRatio =
    avgMonthlyIncome > 0 ? (avgMonthlyDebt / avgMonthlyIncome) * 100 : 0

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
    m.income > 0 ? ((m.income - m.expense) / m.income) * 100 : 0,
  )
  const positiveSavingsMonths = monthlySavingsRates.filter((r) => r > 0).length
  const positiveSavingsRatio = positiveSavingsMonths / count
  const savingsVolatilityCV = coefficientOfVariation(monthlySavingsRates.filter((r) => r > 0))

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
