import { MONTHS_PER_YEAR } from '@/lib/dateUtils'
import type { SalaryComponents } from '@/types/salary'

/** Cash payroll and retained shares are separate forms of compensation. */
export function settleSalaryCompensation({
  cashEarnings,
  cashDeductions,
  totalTax,
  netShareValue,
  shareWithholding,
  priorShareCredit = 0,
}: {
  cashEarnings: number
  cashDeductions: number
  totalTax: number
  netShareValue: number
  shareWithholding: number
  priorShareCredit?: number
}) {
  const availableShareCredit = shareWithholding + priorShareCredit
  const payrollTax = Math.max(0, totalTax - availableShareCredit)
  const excessShareWithholding = Math.max(0, availableShareCredit - totalTax)
  const cashTakeHome = cashEarnings - cashDeductions - payrollTax
  return {
    payrollTax,
    cashTakeHome,
    netShareValue,
    netCompensation: cashTakeHome + netShareValue,
    excessShareWithholding,
  }
}
/** Payroll earnings before employee deductions, excluding separately tracked contributions. */
export function salaryCashEarnings(salary: Pick<SalaryComponents,
  'base_salary_annual' | 'hra_annual' | 'bonus_annual' | 'special_allowance_annual' | 'other_taxable_annual'
>) {
  const annual = [
    salary.base_salary_annual,
    salary.hra_annual,
    salary.bonus_annual,
    salary.special_allowance_annual,
    salary.other_taxable_annual,
  ].reduce<number>((total, value) => total + (Number(value) || 0), 0)
  return { annual, monthly: annual / MONTHS_PER_YEAR }
}
