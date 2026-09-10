/**
 * Forward TDS schedule -- models how an employer deducts tax month by month.
 *
 * Unlike a reactive "tax on income received to date" view, payroll projects
 * your full-year income from April and deducts tax proportionally, truing-up
 * whenever income changes. The current Tax Planning caller uses:
 *
 *   - Recurring taxable compensation excluding bonus and RSU as the flat base.
 *   - Annual bonus split into 12 equal monthly extras.
 *   - RSU vestings as dated extras in their vesting month.
 *
 * Per month the algorithm is:
 *   baselineMonthly = calculateTax(regular*12) / 12          (flat all year)
 *   on an extra's month, add the MARGINAL tax on that extra:
 *     calculateTax(regular*12 + extrasIncludingThis)
 *       - calculateTax(regular*12 + extrasBeforeThis)
 *
 * So regular salary TDS is a flat baseline. Bonus adds a monthly marginal
 * increment, while an RSU's tax appears as a one-month spike. The marginal tax
 * is computed progressively (including prior extras) so slab stacking stays
 * correct, and the monthly amounts telescope to exactly the full-year tax on
 * total income.
 */

import { calculateGrossFromNet, calculateTax, type TaxSlab } from '@/lib/taxCalculator'
import { MONTHS_PER_YEAR } from '@/lib/dateUtils'
import { sumRsuCompensation, valueRsuVestings, type RsuValuationOptions } from '@/lib/rsuVesting'
import { settleSalaryCompensation } from '@/lib/salaryCompensation'
import type { RsuGrant, ValuedRsuVesting } from '@/types/salary'

/** Month labels in fiscal-year order, starting from the FY start month. */
const ALL_MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const

/** One row of the month-by-month TDS schedule. */
export interface TdsMonthRow {
  /** Short month label, e.g. "Apr". */
  month: string
  /** 0-based index within the fiscal year (0 = FY start month). */
  monthIndex: number
  /** Taxable income credited this month (regular + configured extras). */
  monthIncome: number
  /** Projected full-year income known as of this month. */
  projectedAnnual: number
  /** Tax on the projected annual income at this point in the year. */
  annualTax: number
  /** Baseline TDS plus marginal tax on extras assigned to this month. */
  monthlyTds: number
  /** Running planned tax liability through this month, not proof of payment. */
  cumulativeTds: number
  /** Compatibility alias for cashTakeHome; retained shares are separate. */
  takeHome: number
  cashIncome: number
  cashDeductions: number
  cashTds: number
  cumulativeCashTds: number
  cashTakeHome: number
  netShareValue: number
  netCompensation: number
  rsuGrossIncome: number
  rsuWithholding: number
  rsuRecordedWithholding: number
  rsuEstimatedWithholding: number
  excessShareWithholding: number
}

export interface TdsScheduleParams {
  /** Recurring taxable income per month used to establish the flat baseline. */
  regularMonthlyIncome: number
  /** Cash extras by FY month. Do not also include RSUs supplied as valued events. */
  extraByMonth: Record<number, number>
  rsuVestingEvents?: ValuedRsuVesting[]
  /** Employee payroll deductions reduce cash, not new-regime taxable earnings. */
  monthlyCashDeductions?: number
  /** Month (1-12) the fiscal year starts on (India: 4 = April). */
  fyStartMonth: number
  slabs: TaxSlab[]
  standardDeduction: number
  applyProfessionalTax?: boolean
  isNewRegime: boolean
  fyStartYear: number
}

/**
 * Bucket RSU vestings into 0-based fiscal-month indices for a target FY.
 *
 * Only vestings that fall inside the given fiscal year are included; the
 * returned map feeds ``extraByMonth``. Index 0 = the FY start month.
 */
export function rsuExtrasByFyMonth(
  grants: RsuGrant[],
  fyStartYear: number,
  fyStartMonth: number,
  options: Omit<RsuValuationOptions, 'fyStartMonth'> = {},
): Record<number, number> {
  const out: Record<number, number> = {}
  for (const event of valueRsuVestings(grants, { ...options, fyStartMonth })) {
    if (event.fyStartYear !== fyStartYear) continue
    out[event.monthIndex] = (out[event.monthIndex] ?? 0) + event.grossValue
  }
  return out
}

export interface TaxPaidTillDate {
  /** Estimated withholding from cash and shares through the months paid so far. */
  taxPaid: number
  /** Gross taxable income accrued so far (base accrued + gross bonus). */
  incomeReceived: number
  /** Base salary gross accrued = baseAnnual / 12 * monthsPaid. */
  baseAccrued: number
  /** Gross bonus (incl. RSU) backed out from the salary surplus. */
  bonusGross: number
  /** Net extra compensation above expected base, including matched net shares. */
  bonusNet: number
  cashBonusGross: number
  cashTaxPaid: number
  rsuGrossIncome: number
  netShareValue: number
  rsuWithholding: number
  rsuRecordedWithholding: number
  rsuEstimatedWithholding: number
}

export interface TaxPaidTillDateParams {
  /** Fixed base salary for the full year (from Settings -- the certain thing). */
  baseAnnual: number
  /** Number of months you have actually been paid this FY. */
  monthsPaid: number
  /** Recorded net employment receipts; identify included RSU value separately. */
  receivedNet: number
  rsuVestingEvents?: ValuedRsuVesting[]
  /** Identified RSU receipts already in receivedNet; exclude them from cash inference. */
  rsuNetIncludedInReceivedNet?: number
  monthlyCashDeductions?: number
  slabs: TaxSlab[]
  standardDeduction: number
  isNewRegime: boolean
  fyStartYear: number
}

/**
 * Tax deducted at source "till date", derived from the salary actually
 * credited to the bank. Confirmed model with the user:
 *
 *   base TDS is cut every month on the projected full-year base:
 *     baseTdsPerMonth   = tax(baseAnnual) / 12
 *     expectedNetBase/mo = baseAnnual/12 - baseTdsPerMonth   (in-hand base)
 *
 * Cash and matched net shares are combined once to solve the incremental net
 * equation with calculateGrossFromNet. This follows actual tax slabs, rebate
 * relief and surcharge boundaries. Known gross shares are then separated from
 * inferred cash bonus. Share withholding is a tax payment, not more taxable
 * income or a second tax deduction. These are estimates, not payroll records.
 */
export function computeTaxPaidTillDate(params: TaxPaidTillDateParams): TaxPaidTillDate {
  const {
    baseAnnual,
    monthsPaid,
    receivedNet,
    slabs,
    standardDeduction,
    isNewRegime,
    fyStartYear,
    rsuVestingEvents = [],
    rsuNetIncludedInReceivedNet = 0,
    monthlyCashDeductions = 0,
  } = params

  const taxOn = (income: number): number =>
    calculateTax(income, slabs, standardDeduction, true, MONTHS_PER_YEAR, isNewRegime, fyStartYear)
      .totalTax

  const months = Math.max(0, Math.min(monthsPaid, MONTHS_PER_YEAR))
  const baseAnnualTax = taxOn(baseAnnual)
  const baseTdsPerMonth = baseAnnualTax / MONTHS_PER_YEAR
  const baseGrossPerMonth = baseAnnual / MONTHS_PER_YEAR
  const expectedNetBasePerMonth = baseGrossPerMonth - baseTdsPerMonth

  const baseAccrued = baseGrossPerMonth * months
  const cashDeductions = monthlyCashDeductions * months
  const rsu = sumRsuCompensation(
    rsuVestingEvents.filter((event) => event.vested && event.fyStartYear === fyStartYear),
  )
  const cashReceived = Math.max(0, receivedNet - rsuNetIncludedInReceivedNet)
  const bonusNet = Math.max(
    0, cashReceived + cashDeductions + rsu.netValue - expectedNetBasePerMonth * months,
  )
  const inferredExtras = bonusNet === 0 ? 0 : Math.max(0, calculateGrossFromNet(
    baseAnnual - baseAnnualTax + bonusNet,
    {
      slabs,
      standardDeduction,
      applyProfessionalTax: true,
      salaryMonthsCount: MONTHS_PER_YEAR,
      isNewRegime,
      fyStartYear,
    },
  ) - baseAnnual)
  const cashBonusGross = Math.max(0, inferredExtras - rsu.grossValue)
  const bonusGross = cashBonusGross + rsu.grossValue
  // A shortfall against regular net salary can be an unrecorded payroll
  // deduction, so it is not proof of additional tax when no surplus exists.
  const cashTaxPaid = bonusNet === 0
    ? baseTdsPerMonth * months
    : Math.max(0, baseAccrued + cashBonusGross - cashDeductions - cashReceived)

  return {
    taxPaid: cashTaxPaid + rsu.withholdingValue,
    incomeReceived: baseAccrued + bonusGross,
    baseAccrued,
    bonusGross,
    bonusNet,
    cashBonusGross,
    cashTaxPaid,
    rsuGrossIncome: rsu.grossValue,
    netShareValue: rsu.netValue,
    rsuWithholding: rsu.withholdingValue,
    rsuRecordedWithholding: rsu.recordedWithholding,
    rsuEstimatedWithholding: rsu.estimatedWithholding,
  }
}

/** Month label for a given 0-based offset from the FY start month. */
function monthLabel(fyStartMonth: number, offset: number): string {
  // fyStartMonth is 1-12; ALL_MONTHS is 0-indexed by calendar month.
  return ALL_MONTHS[(fyStartMonth - 1 + offset) % MONTHS_PER_YEAR]
}

/**
 * Build the 12-month forward TDS schedule.
 *
 * Returns one row per fiscal month. Each row contains the flat baseline plus
 * marginal tax on extras assigned to that month, so a dated RSU vesting
 * produces a one-month spike.
 */
export function buildTdsSchedule(params: TdsScheduleParams): TdsMonthRow[] {
  const {
    regularMonthlyIncome,
    extraByMonth,
    fyStartMonth,
    slabs,
    standardDeduction,
    isNewRegime,
    fyStartYear,
    rsuVestingEvents = [],
    monthlyCashDeductions = 0,
    applyProfessionalTax = true,
  } = params

  const regularAnnual = regularMonthlyIncome * MONTHS_PER_YEAR

  const taxOn = (income: number): number =>
    calculateTax(income, slabs, standardDeduction, applyProfessionalTax, MONTHS_PER_YEAR, isNewRegime, fyStartYear)
      .totalTax

  // Flat baseline TDS: the tax on regular salary alone, spread evenly.
  const regularAnnualTax = taxOn(regularAnnual)
  const baselineMonthlyTds = regularAnnualTax / MONTHS_PER_YEAR

  const rows: TdsMonthRow[] = []
  let cumulativeTds = 0
  let cumulativeCashTds = 0
  let shareCredit = 0
  let extrasBefore = 0 // extras that landed in earlier months

  for (let i = 0; i < MONTHS_PER_YEAR; i++) {
    const rsu = sumRsuCompensation(rsuVestingEvents.filter(
      (event) => event.fyStartYear === fyStartYear && event.monthIndex === i,
    ))
    const cashIncome = regularMonthlyIncome + (extraByMonth[i] ?? 0)
    const extra = (extraByMonth[i] ?? 0) + rsu.grossValue
    const monthIncome = regularMonthlyIncome + extra

    // Marginal tax on THIS month's extra, stacked on regular + prior extras so
    // progressive slabs apply correctly. Zero in months with no extra.
    const marginalExtraTax = extra > 0
      ? taxOn(regularAnnual + extrasBefore + extra) - taxOn(regularAnnual + extrasBefore)
      : 0
    extrasBefore += extra

    // Projected annual income known as of this month (regular + extras landed).
    const projectedAnnual = regularAnnual + extrasBefore

    const monthlyTds = Math.max(0, baselineMonthlyTds + marginalExtraTax)
    cumulativeTds += monthlyTds
    const compensation = settleSalaryCompensation({
      cashEarnings: cashIncome,
      cashDeductions: monthlyCashDeductions,
      totalTax: monthlyTds,
      netShareValue: rsu.netValue,
      shareWithholding: rsu.withholdingValue,
      priorShareCredit: shareCredit,
    })
    shareCredit = compensation.excessShareWithholding
    cumulativeCashTds += compensation.payrollTax

    rows.push({
      month: monthLabel(fyStartMonth, i),
      monthIndex: i,
      monthIncome,
      projectedAnnual,
      annualTax: taxOn(projectedAnnual),
      monthlyTds,
      cumulativeTds,
      takeHome: compensation.cashTakeHome,
      cashIncome,
      cashDeductions: monthlyCashDeductions,
      cashTds: compensation.payrollTax,
      cumulativeCashTds,
      cashTakeHome: compensation.cashTakeHome,
      netShareValue: compensation.netShareValue,
      netCompensation: compensation.netCompensation,
      rsuGrossIncome: rsu.grossValue,
      rsuWithholding: rsu.withholdingValue,
      rsuRecordedWithholding: rsu.recordedWithholding,
      rsuEstimatedWithholding: rsu.estimatedWithholding,
      excessShareWithholding: compensation.excessShareWithholding,
    })
  }

  return rows
}
