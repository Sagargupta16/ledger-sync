import { formatCurrencyCompact } from '@/lib/formatters'

import type { AnalysisResult, FinHealthTier, HealthMetric, Pillar } from './healthScoreTypes'
import {
  HEALTH_SCORE_RUBRIC,
  clamp,
  cvToLabel,
  cvToScore,
  formatSignedPercent,
  tierFromScore,
} from './healthScoreTypes'

// SPEND 1: Spend less than income
export function scoreSpendLessThanIncome(
  data: AnalysisResult,
  savingsGoalPercent: number = HEALTH_SCORE_RUBRIC.savingsRatePct,
): HealthMetric {
  const rate = data.savingsRate
  const target = savingsGoalPercent
  let score: number
  if (rate >= target) score = clamp(90 + (rate - target) * 0.5, 90, 100)
  else if (rate >= target / 2) score = 70 + ((rate - target / 2) / (target / 2)) * 19
  else if (rate >= 0) score = 40 + (rate / (target / 2)) * 29
  else score = clamp(40 + rate * 2, 0, 39)

  return {
    name: 'Spend Less Than Income',
    score: Math.round(clamp(score, 0, 100)),
    weight: 12.5,
    status: tierFromScore(score),
    pillar: 'spend',
    description: rate >= 0 ? `${rate.toFixed(1)}% savings rate` : `${Math.abs(rate).toFixed(1)}% deficit`,
    target: `>= ${target}%`,
    details: [
      `Avg income: ${formatCurrencyCompact(data.avgMonthlyIncome)}/mo`,
      `Avg expenses: ${formatCurrencyCompact(data.avgMonthlyExpense)}/mo`,
      rate >= target
        ? `Target met: saving ${target}%+ of income`
        : `Target: save at least ${target}% of income`,
    ],
  }
}

// SPEND 2: Essential expense ratio
export function scoreEssentialRatio(data: AnalysisResult): HealthMetric {
  const ratio = data.essentialToIncomeRatio
  const target = HEALTH_SCORE_RUBRIC.essentialRatioPct
  let score: number
  if (ratio <= target) score = clamp(90 + (target - ratio), 90, 100)
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
    target: `<= ${target}%`,
    details: [
      `Essentials: ${ratio.toFixed(1)}% of income`,
      ratio <= target
        ? '50/30/20 target met'
        : `Target: essentials under ${target}% of income`,
    ],
  }
}

// SAVE 3: Emergency fund
export function scoreEmergencyFund(data: AnalysisResult): HealthMetric {
  const months = data.emergencyFundMonths
  const target = HEALTH_SCORE_RUBRIC.emergencyFundMonths
  let score: number
  if (months >= target) score = clamp(90 + (months - target) * 2, 90, 100)
  else if (months >= 3) score = 70 + ((months - 3) / 3) * 19
  else if (months >= 1) score = 40 + ((months - 1) / 2) * 29
  else score = clamp(months * 40, 0, 39)

  return {
    name: 'Emergency Fund',
    score: Math.round(clamp(score, 0, 100)),
    weight: 12.5,
    status: tierFromScore(score),
    pillar: 'save',
    description: `${months.toFixed(1)} months of expenses (liquid)`,
    target: `>= ${target} months`,
    details: [
      `Liquid savings: ${formatCurrencyCompact(data.cumulativeNetSavings - (data.totalInvestmentInflow - data.totalInvestmentOutflow))}`,
      `Avg monthly expenses: ${formatCurrencyCompact(data.avgMonthlyExpense)}`,
      months >= target
        ? `Target met: ${target}+ months coverage`
        : `Target: ${target} months of expenses saved`,
    ],
  }
}

// SAVE 4: Investment regularity
export function scoreInvestment(data: AnalysisResult): HealthMetric {
  const ratio = data.investmentToIncomeRatio
  const regularity = data.investmentRegularity

  const target = HEALTH_SCORE_RUBRIC.investmentToIncomePct
  let ratioScore: number
  if (ratio >= target) ratioScore = 90
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
    target: `>= ${target}%`,
    details: [
      `${Math.round(regularity * 100)}% months with net investments`,
      `Net invested: ${formatCurrencyCompact(netInvestment)}`,
      ...(data.totalInvestmentOutflow > 0
        ? [`Withdrawals: ${formatCurrencyCompact(data.totalInvestmentOutflow)}`]
        : []),
    ],
  }
}

// BORROW 5: Debt-to-income
export function scoreDebtToIncome(data: AnalysisResult): HealthMetric {
  const dti = data.debtToIncomeRatio
  const maxDti = HEALTH_SCORE_RUBRIC.debtToIncomeMaxPct
  let score: number
  if (dti < 10) score = clamp(90 + (10 - dti), 90, 100)
  else if (dti <= 20) score = 70 + ((20 - dti) / 10) * 19
  else if (dti <= maxDti) score = 40 + ((maxDti - dti) / (maxDti - 20)) * 29
  else score = clamp(40 - (dti - maxDti) * 1.5, 0, 39)

  let desc: string
  if (dti < 10) desc = 'Very low debt burden'
  else if (dti <= 20) desc = 'Low debt burden'
  else if (dti <= maxDti) desc = 'Moderate debt'
  else desc = 'High debt burden'

  return {
    name: 'Debt-to-Income',
    score: Math.round(clamp(score, 0, 100)),
    weight: 12.5,
    status: tierFromScore(score),
    pillar: 'borrow',
    description: desc,
    target: `<= ${maxDti}%`,
    details: [
      `DTI ratio: ${dti.toFixed(1)}%`,
      `Avg debt payments: ${formatCurrencyCompact(data.avgMonthlyDebt)}/mo`,
      dti <= maxDti
        ? `Within banking threshold (${maxDti}%)`
        : `Above banking threshold (${maxDti}%)`,
    ],
  }
}

// BORROW 6: Debt trend
export function scoreDebtTrend(data: AnalysisResult): HealthMetric {
  const trend = data.debtTrendPercent
  let score: number
  if (trend <= -20) score = 95
  else if (trend <= -5) score = 80 + ((Math.abs(trend) - 5) / 15) * 15
  else if (trend <= 5) score = 70 + ((5 - Math.abs(trend)) / 5) * 9
  else if (trend <= 20) score = 40 + ((20 - trend) / 15) * 29
  else score = clamp(40 - (trend - 20) * 1.5, 0, 39)

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
    target: 'Declining or zero',
    details: [
      data.avgMonthlyDebt === 0
        ? 'No debt payments detected'
        : `Debt change: ${formatSignedPercent(trend)} (half-over-half)`,
      trend <= 0 ? 'Debt burden reducing or stable' : 'Debt burden increasing',
    ],
  }
}

// PLAN 7: Savings consistency
export function scoreSavingsConsistency(data: AnalysisResult): HealthMetric {
  const ratio = data.positiveSavingsRatio
  const cv = data.savingsVolatilityCV

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
    target: `>= ${HEALTH_SCORE_RUBRIC.savingsConsistencyPct}% months`,
    details: [
      `Positive savings months: ${Math.round(ratio * 100)}%`,
      `Savings volatility: ${cvToLabel(cv)}`,
      ratio >= HEALTH_SCORE_RUBRIC.savingsConsistencyPct / 100
        ? 'Consistent savings habit'
        : `Target: save in ${HEALTH_SCORE_RUBRIC.savingsConsistencyPct}%+ of months`,
    ],
  }
}

// PLAN 8: Income stability
export function scoreIncomeStability(data: AnalysisResult): HealthMetric {
  const cv = data.incomeCV
  const stableMax = HEALTH_SCORE_RUBRIC.incomeStabilityMaxCV
  let score: number
  if (cv < 10) score = clamp(90 + (10 - cv), 90, 100)
  else if (cv <= stableMax) score = 70 + ((stableMax - cv) / (stableMax - 10)) * 19
  else if (cv <= 50) score = 40 + ((50 - cv) / (50 - stableMax)) * 29
  else score = clamp(40 - (cv - 50) * 0.8, 0, 39)

  let desc: string
  if (cv < 10) desc = 'Very stable income'
  else if (cv <= stableMax) desc = 'Stable income'
  else if (cv <= 50) desc = 'Moderate variability'
  else desc = 'Volatile income'

  return {
    name: 'Income Stability',
    score: Math.round(clamp(score, 0, 100)),
    weight: 12.5,
    status: tierFromScore(score),
    pillar: 'plan',
    description: desc,
    target: `CV <= ${stableMax}%`,
    details: [
      `Income variability (CV): ${cv.toFixed(1)}%`,
      `Avg monthly income: ${formatCurrencyCompact(data.avgMonthlyIncome)}`,
      cv <= 25 ? 'Predictable income stream' : 'Consider building a larger buffer',
    ],
  }
}

export function calculateMetrics(
  data: AnalysisResult,
  savingsGoalPercent = 20,
): HealthMetric[] {
  return [
    scoreSpendLessThanIncome(data, savingsGoalPercent),
    scoreEssentialRatio(data),
    scoreEmergencyFund(data),
    scoreInvestment(data),
    scoreDebtToIncome(data),
    scoreDebtTrend(data),
    scoreSavingsConsistency(data),
    scoreIncomeStability(data),
  ]
}

// ─── UI helpers ──────────────────────────────────────────────────

export function getOverallStatus(score: number) {
  if (score >= 80)
    return {
      label: 'Financially Healthy',
      tier: 'healthy' as FinHealthTier,
      color: 'text-app-green',
      bgColor: 'bg-app-green',
    }
  if (score >= 40)
    return {
      label: 'Financially Coping',
      tier: 'coping' as FinHealthTier,
      color: 'text-app-orange',
      bgColor: 'bg-app-orange',
    }
  return {
    label: 'Financially Vulnerable',
    tier: 'vulnerable' as FinHealthTier,
    color: 'text-app-red',
    bgColor: 'bg-app-red',
  }
}

export function getSummary(score: number): string {
  if (score >= 80)
    return 'You are financially healthy — spending within means, building savings, and managing debt well. Keep it up!'
  if (score >= 60)
    return 'You are coping well financially but have room for improvement. Focus on strengthening your weaker pillars.'
  if (score >= 40)
    return 'Your finances need attention. Review your spending and debt levels, and try to build an emergency fund.'
  return 'Your financial health is vulnerable. Prioritize reducing expenses, managing debt, and establishing a savings habit.'
}

export function getTierColor(tier: FinHealthTier) {
  switch (tier) {
    case 'healthy':
      return 'bg-app-green'
    case 'coping':
      return 'bg-app-orange'
    case 'vulnerable':
      return 'bg-app-red'
  }
}

export function getPillarScore(metrics: HealthMetric[], pillar: Pillar): number {
  const pillarMetrics = metrics.filter((m) => m.pillar === pillar)
  if (pillarMetrics.length === 0) return 0
  return pillarMetrics.reduce((sum, m) => sum + m.score, 0) / pillarMetrics.length
}
