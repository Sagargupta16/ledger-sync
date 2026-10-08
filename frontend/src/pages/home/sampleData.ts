/**
 * Illustrative figures for the anonymous landing page. Nothing here is read
 * from an account, and every visual that renders it carries a "Sample data"
 * label. The figures are internally consistent: the money-flow month is the
 * last chart month, and every KPI is derived from the same numbers.
 */
import { colors } from '@/constants/colors'

const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
})

export const formatInr = (value: number): string => inr.format(Math.round(value))
export const formatPercent = (value: number): string => `${value.toFixed(1)}%`

export interface FlowBranch {
  key: string
  label: string
  value: number
  /** CSS custom property reference, safe for SVG fill/stroke. */
  color: string
}

export interface SampleMonth {
  month: string
  income: number
  spending: number
}

export interface SampleKpi {
  label: string
  value: number
  format: (value: number) => string
  note: string
  noteClass: string
}

/** April to September of the sample fiscal year (the Indian FY starts in April). */
export const SAMPLE_FY = 'FY 2026-27'
export const SAMPLE_MONTHS: readonly SampleMonth[] = [
  { month: 'Apr', income: 200_000, spending: 82_000 },
  { month: 'May', income: 200_000, spending: 74_500 },
  { month: 'Jun', income: 200_000, spending: 91_200 },
  { month: 'Jul', income: 235_000, spending: 69_800 },
  { month: 'Aug', income: 200_000, spending: 72_500 },
  { month: 'Sep', income: 200_000, spending: 78_000 },
]

const LATEST = SAMPLE_MONTHS.at(-1) ?? SAMPLE_MONTHS[0]
const MONTHLY_INVESTMENT = 60_000
const MONTHLY_TAX = 24_375

export const SAMPLE_MONTH_LABEL = 'September'
export const SAMPLE_INCOME = LATEST.income

/** The latest sample month's income, split by where it went. */
export const SAMPLE_FLOW: readonly FlowBranch[] = [
  { key: 'spending', label: 'Spending', value: LATEST.spending, color: colors.financial.expense },
  {
    key: 'investments',
    label: 'Investments',
    value: MONTHLY_INVESTMENT,
    color: colors.financial.investment,
  },
  {
    key: 'savings',
    label: 'Savings',
    value: LATEST.income - LATEST.spending - MONTHLY_INVESTMENT - MONTHLY_TAX,
    color: colors.financial.savings,
  },
  { key: 'tax', label: 'Tax', value: MONTHLY_TAX, color: colors.app.orange },
]

/** Share of the latest month's income kept as investments plus savings. */
export const SAMPLE_SAVINGS_RATE =
  ((LATEST.income - LATEST.spending - MONTHLY_TAX) / LATEST.income) * 100

const totalSpending = SAMPLE_MONTHS.reduce((sum, month) => sum + month.spending, 0)
export const SAMPLE_AVG_SPENDING = totalSpending / SAMPLE_MONTHS.length

export const SAMPLE_KPIS: readonly SampleKpi[] = [
  {
    label: 'Net worth',
    value: 2_485_000,
    format: formatInr,
    note: '+12.4% this FY',
    noteClass: 'text-income',
  },
  {
    label: 'Savings rate',
    value: SAMPLE_SAVINGS_RATE,
    format: formatPercent,
    note: SAMPLE_MONTH_LABEL,
    noteClass: 'text-muted-foreground',
  },
  {
    label: 'Invested this FY',
    value: MONTHLY_INVESTMENT * SAMPLE_MONTHS.length,
    format: formatInr,
    note: 'April to September',
    noteClass: 'text-muted-foreground',
  },
  {
    label: 'Avg monthly spend',
    value: SAMPLE_AVG_SPENDING,
    format: formatInr,
    note: 'April to September',
    noteClass: 'text-muted-foreground',
  },
]
