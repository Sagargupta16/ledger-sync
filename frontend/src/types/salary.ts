/** Compensation breakdown for a single fiscal year. */
export interface SalaryComponents {
  base_salary_annual: number
  hra_annual: number | null
  bonus_annual: number
  epf_monthly: number
  nps_monthly: number
  special_allowance_annual: number
  other_taxable_annual: number
}

/** A single vesting event within an RSU grant. */
export interface RsuVesting {
  date: string // YYYY-MM-DD
  quantity: number
}

/** An RSU grant with its vesting schedule. */
export interface RsuGrant {
  id: string
  stock_name: string
  stock_price: number
  grant_date: string | null
  notes: string | null
  vestings: RsuVesting[]
}

/** Growth parameters for multi-year projections. */
export interface GrowthAssumptions {
  base_salary_growth_pct: number
  bonus_growth_pct: number
  epf_scales_with_base: boolean
  nps_growth_pct: number
  stock_price_appreciation_pct: number
  projection_years: number
}

/** Default salary components for a new FY entry. */
export const DEFAULT_SALARY_COMPONENTS: SalaryComponents = {
  base_salary_annual: 0,
  hra_annual: null,
  bonus_annual: 0,
  epf_monthly: 3600,
  nps_monthly: 0,
  special_allowance_annual: 0,
  other_taxable_annual: 0,
}

/** Default growth assumptions. */
export const DEFAULT_GROWTH_ASSUMPTIONS: GrowthAssumptions = {
  base_salary_growth_pct: 0,
  bonus_growth_pct: 0,
  epf_scales_with_base: true,
  nps_growth_pct: 0,
  stock_price_appreciation_pct: 0,
  projection_years: 3,
}

/** Projected breakdown for a single fiscal year. */
export interface ProjectedFYBreakdown {
  fy: string
  baseSalary: number
  hra: number
  bonus: number
  epf: number
  nps: number
  specialAllowance: number
  otherTaxable: number
  rsuIncome: number
  rsuDetails: Array<{ stock_name: string; shares: number; value: number }>
  grossTaxable: number
  standardDeduction: number
  netTaxable: number
  totalTax: number
  takeHome: number
  effectiveTaxRate: number
  isProjected: boolean
}
