import { shareOfIncomePercent } from '@/lib/savingsRate'
import { computeTaxPlanning, type TaxRegime } from './taxPlanning'

function taxPlanForIncome(
  income: number,
  fyYear: number,
  regime: TaxRegime,
  hasEmploymentIncome: boolean,
) {
  return computeTaxPlanning({
    selectedFY: `FY ${fyYear}-${String((fyYear + 1) % 100).padStart(2, '0')}`,
    recordedTaxableIncome: income,
    recordedEmploymentIncome: hasEmploymentIncome ? income : 0,
    salaryMonthsCount: hasEmploymentIncome ? 12 : 0,
    hasEmploymentIncome,
    incomeBasis: 'gross',
    preferredRegime: regime,
  })
}

export function effectiveTaxRate(
  income: number,
  fyYear: number,
  regime: TaxRegime,
  hasEmploymentIncome: boolean,
): number {
  if (income <= 0) return 0
  const tax = taxPlanForIncome(income, fyYear, regime, hasEmploymentIncome)
  return shareOfIncomePercent(tax.totalTax, income)
}

export interface TaxRateCurvePoint {
  income: number
  newRegimeRate?: number
  oldRegimeRate: number
}

/** Hypothetical full-year income under the regimes available in the shared tax plan. */
export function buildTaxRateCurve(maxIncome: number, fyYear: number, hasEmploymentIncome: boolean) {
  const { newRegimeAvailable } = taxPlanForIncome(maxIncome, fyYear, 'new', hasEmploymentIncome)
  const points: TaxRateCurvePoint[] = Array.from({ length: 101 }, (_, index) => {
    const income = Math.round(maxIncome * index / 100)
    return {
      income,
      newRegimeRate: newRegimeAvailable
        ? Number(effectiveTaxRate(income, fyYear, 'new', hasEmploymentIncome).toFixed(2))
        : undefined,
      oldRegimeRate: Number(effectiveTaxRate(income, fyYear, 'old', hasEmploymentIncome).toFixed(2)),
    }
  })
  return { points, newRegimeAvailable }
}
