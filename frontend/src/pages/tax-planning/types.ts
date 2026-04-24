import type { Transaction } from '@/types'

export type TaxRegimeOverride = 'new' | 'old' | null

export interface YearlyTaxDatum {
  fy: string
  paidTax: number
  projected: number
  cumulative: number
}

/** Result of classifying an income transaction for tax grouping */
export interface IncomeGroupAccumulator {
  [key: string]: {
    total: number
    transactions: Transaction[]
  }
}

export interface FYData {
  income: number
  expense: number
  taxableIncome: number
  salaryMonths: Set<string>
  transactions: Transaction[]
  incomeGroups: IncomeGroupAccumulator
}

export interface IncomeClassification {
  taxable: string[]
  investmentReturns: string[]
  nonTaxable: string[]
  other: string[]
}
