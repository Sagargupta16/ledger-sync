import { MONTHS_PER_YEAR } from '@/lib/dateUtils'
import { calculateTax } from '@/lib/taxCalculator'

import type { TaxPlanningModel } from '../useTaxPlanning'

export interface AdvanceTaxEstimate {
  /** Income tax for the year with surcharge and cess, as the page estimates it. */
  projectedTax: number
  /** Tax on the employment income alone: what salary TDS covers. */
  salaryTds: number
}

/**
 * The planner's starting figures, read from the page's own estimate so the
 * advance-tax base matches the liability shown above it.
 *
 * Professional tax is left out: it is a state levy, not income tax. Salary TDS
 * (1961 Act s.192, 2025 Act s.392) withholds the year's tax on salary,
 * including RSU perquisites, at the average rate, so the estimate is the tax on
 * the employment income alone and what remains is tax on other income. The
 * user replaces it with the Form 26AS or AIS figure.
 */
export function advanceTaxEstimate(planning: TaxPlanningModel): AdvanceTaxEstimate {
  const projectedTax = Math.max(0, planning.display.totalTax - planning.display.professionalTax)
  const annual = planning.annualTaxComputation
  // An employment-only forecast: everything in it is salary.
  if (planning.useSalaryProjection && !annual) return { projectedTax, salaryTds: projectedTax }

  const result = annual ?? planning.taxComputation
  const employment = result.hasEmploymentIncome ? Math.max(0, result.grossEmploymentIncome ?? 0) : 0
  if (employment === 0) return { projectedTax, salaryTds: 0 }
  const salaryTax = calculateTax(
    employment,
    result.taxSlabs,
    Math.min(result.standardDeduction, employment),
    false,
    MONTHS_PER_YEAR,
    result.isNewRegime,
    result.fyYear,
  )
  return { projectedTax, salaryTds: salaryTax.totalTax }
}
