/** Compensation breakdown for a single fiscal year. */
export interface SalaryComponents {
  base_salary_annual: number
  hra_annual: number | null
  bonus_annual: number
  /** Employee payroll deduction; it does not reduce new-regime taxable earnings. */
  epf_monthly: number
  nps_monthly: number
  special_allowance_annual: number
  other_taxable_annual: number
}

/** A single vesting event within an RSU grant. */
export interface RsuVesting {
  date: string // YYYY-MM-DD
  /** Shares that vested, BEFORE any tax withholding. The tax basis. */
  quantity: number
  /** Stock price on the vest date (display currency). Set once a vesting is in the past. */
  price_at_vest?: number | null
  /**
   * Shares actually received after sell-to-cover withholding, when the employer
   * withheld part of the vest to pay tax. Reporting only -- Indian perquisite
   * value is taxed on the FULL vest, so `quantity` stays the basis for every
   * projection. Fractional because brokers credit fractional residuals; zero
   * records full withholding. Missing actuals display an estimate of 30% tax
   * plus 4% cess on the tax, without persisting an inferred received quantity.
   */
  net_quantity?: number | null
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
  /** Missing/null preserves the saved zero-growth one-time bonus behavior. */
  bonus_mode?: 'recurring' | 'one_time' | null
  epf_scales_with_base: boolean
  nps_growth_pct: number
  stock_price_appreciation_pct: number
  projection_years: number
}

/** One gross vest and its received shares, valued once for annual/monthly use. */
export interface ValuedRsuVesting {
  grantId: string
  stockName: string
  date: string
  fy: string
  fyStartYear: number
  monthIndex: number
  vested: boolean
  price: number
  grossQuantity: number
  netQuantity: number
  grossValue: number
  netValue: number
  withholdingValue: number
  isNetQuantityEstimated: boolean
  isPriceEstimated: boolean
  isWithholdingEstimated: boolean
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
  fyStartMonth: number
  baseSalary: number
  hra: number
  bonus: number
  epf: number
  nps: number
  specialAllowance: number
  otherTaxable: number
  rsuIncome: number
  rsuDetails: Array<{ stock_name: string; shares: number; value: number }>
  rsuVestingEvents: ValuedRsuVesting[]
  cashEarnings: number
  cashDeductions: number
  grossTaxable: number
  standardDeduction: number
  netTaxable: number
  totalTax: number
  takeHome: number
  cashTakeHome: number
  netShareValue: number
  netCompensation: number
  payrollTax: number
  rsuWithholding: number
  rsuRecordedWithholding: number
  rsuEstimatedWithholding: number
  excessShareWithholding: number
  effectiveTaxRate: number
  isProjected: boolean
}
