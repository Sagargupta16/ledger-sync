export {
  buildYearlyTaxData,
  classifyAndAccumulateIncome,
  computePaidTax,
  computePrevFYDisplay,
  computeProjectedTax,
  createEmptyFYData,
  groupTransactionsByFY,
} from '@/lib/finance/taxHistory'
export type { PrevFYDisplayParams } from '@/lib/finance/taxHistory'

export {
  calculateBreakEvenDeduction,
  compareTaxRegimes,
  computeTaxForFY,
  computeTaxPlanning,
  resolveSelectedRegime,
} from '@/lib/finance/taxPlanning'
