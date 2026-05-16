/**
 * Barrel re-export. Implementations split into healthScoreTypes,
 * healthScoreAnalysis, and healthScoreScorers to keep each file
 * under the 500-LOC ceiling.
 */
export * from './healthScoreTypes'
export {
  classifyTransaction,
  computeAnalysis,
  computeMonthlyData,
  createEmptyBucket,
} from './healthScoreAnalysis'
export {
  calculateMetrics,
  getOverallStatus,
  getPillarScore,
  getSummary,
  getTierColor,
  scoreDebtToIncome,
  scoreDebtTrend,
  scoreEmergencyFund,
  scoreEssentialRatio,
  scoreIncomeStability,
  scoreInvestment,
  scoreSavingsConsistency,
  scoreSpendLessThanIncome,
} from './healthScoreScorers'
