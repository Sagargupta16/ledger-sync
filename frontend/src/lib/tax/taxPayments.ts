/**
 * Ledger rows that paid income tax ahead of filing, matched on the row's own
 * category or subcategory; notes are never read. The two terms are the
 * advance-tax and self-assessment words of the shared tax-paid vocabulary
 * (`isTaxCategory` in pages/income-expense-flow/sankeyDrilldown.ts, backend
 * `metric_rules._TAX_PAID_RE`), so keep them in step with it.
 */
import type { Transaction } from '@/types'

export interface TaxPayment {
  /** `YYYY-MM-DD` */
  date: string
  /** INR, positive. */
  amount: number
}

const ADVANCE_TAX_PATTERN = /\badvance[\s-]?tax\b/i
const SELF_ASSESSMENT_PATTERN = /\bself[\s-]?assessment\b/i

const paymentsNamed = (pattern: RegExp) => (transactions: readonly Transaction[]): TaxPayment[] =>
  transactions
    .filter((tx) => tx.type === 'Expense' && (pattern.test(tx.category) || pattern.test(tx.subcategory ?? '')))
    .map((tx) => ({ date: tx.date.slice(0, 10), amount: Math.abs(tx.amount) }))

/** Expense rows named advance tax: instalments paid during the year. */
export const advanceTaxPayments = paymentsNamed(ADVANCE_TAX_PATTERN)

/** Expense rows named self-assessment tax: a year's balance paid after it ends, before filing. */
export const selfAssessmentPayments = paymentsNamed(SELF_ASSESSMENT_PATTERN)
