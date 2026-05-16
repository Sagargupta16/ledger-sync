import { formatCurrency } from '@/lib/formatters'

export type CompareMode = 'months' | 'years'
export type MetricFormat = 'currency' | 'percent' | 'number' | 'days'
export type TransactionType = 'total' | 'income' | 'expense'
export type PeriodKey = string | number

export interface MetricRow {
  label: string
  period1Value: number
  period2Value: number
  change: number
  changePercent: number
  isExpense?: boolean
  format?: MetricFormat
}

export interface MonthData {
  month: string
  income: number
  expense: number
  net_savings: number
}

export interface YearData {
  income: number
  expense: number
  net_savings: number
  months: number
}

export function createMetricRow(
  label: string,
  value1: number,
  value2: number,
  format: MetricFormat = 'currency',
  isExpense = false,
): MetricRow {
  const change = value1 - value2
  const changePercent = value2 === 0 ? 0 : (change / value2) * 100
  return {
    label,
    period1Value: value1,
    period2Value: value2,
    change,
    changePercent,
    isExpense,
    format,
  }
}

export function formatValue(value: number, format?: string) {
  switch (format) {
    case 'percent':
      return `${value.toFixed(1)}%`
    case 'number':
      return value.toLocaleString('en-IN')
    case 'days':
      return `${value.toFixed(0)} days`
    default:
      return formatCurrency(value)
  }
}

export function formatMonthLabel(month: string) {
  return new Date(month + '-01').toLocaleDateString('en-US', {
    month: 'short',
    year: 'numeric',
  })
}

function safeDivide(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0
}

function calcSavingsRate(netSavings: number, income: number): number {
  return income > 0 ? (netSavings / income) * 100 : 0
}

export function buildMonthlyMetrics(
  m1: MonthData,
  m2: MonthData,
  effectiveMonth1: string,
  effectiveMonth2: string,
  availableMonths: MonthData[],
  getTransactionCount: (period: PeriodKey, type?: TransactionType) => number,
): MetricRow[] {
  const avgIncome =
    availableMonths.reduce((sum, m) => sum + m.income, 0) / availableMonths.length
  const avgExpense =
    availableMonths.reduce((sum, m) => sum + m.expense, 0) / availableMonths.length

  const daysInMonth1 = new Date(
    Number(effectiveMonth1.split('-')[0]),
    Number(effectiveMonth1.split('-')[1]),
    0,
  ).getDate()
  const daysInMonth2 = new Date(
    Number(effectiveMonth2.split('-')[0]),
    Number(effectiveMonth2.split('-')[1]),
    0,
  ).getDate()

  const txCount1 = getTransactionCount(effectiveMonth1)
  const txCount2 = getTransactionCount(effectiveMonth2)
  const expenseTxCount1 = getTransactionCount(effectiveMonth1, 'expense')
  const expenseTxCount2 = getTransactionCount(effectiveMonth2, 'expense')

  return [
    createMetricRow('Total Income', m1.income, m2.income, 'currency'),
    createMetricRow('Total Expenses', m1.expense, m2.expense, 'currency', true),
    createMetricRow('Net Savings', m1.net_savings, m2.net_savings, 'currency'),
    createMetricRow(
      'Savings Rate',
      calcSavingsRate(m1.net_savings, m1.income),
      calcSavingsRate(m2.net_savings, m2.income),
      'percent',
    ),
    createMetricRow(
      'Daily Avg Spending',
      m1.expense / daysInMonth1,
      m2.expense / daysInMonth2,
      'currency',
      true,
    ),
    createMetricRow(
      'Daily Avg Income',
      m1.income / daysInMonth1,
      m2.income / daysInMonth2,
      'currency',
    ),
    createMetricRow('Transaction Count', txCount1, txCount2, 'number'),
    createMetricRow(
      'Avg Transaction Size',
      safeDivide(m1.expense, expenseTxCount1),
      safeDivide(m2.expense, expenseTxCount2),
      'currency',
      true,
    ),
    createMetricRow('vs Average Income', m1.income, avgIncome, 'currency'),
    createMetricRow('vs Average Expense', m1.expense, avgExpense, 'currency', true),
  ]
}

export function buildYearlyMetrics(
  y1: YearData,
  y2: YearData,
  effectiveYear1: number,
  effectiveYear2: number,
  getTransactionCount: (period: PeriodKey, type?: TransactionType) => number,
): MetricRow[] {
  const txCount1 = getTransactionCount(effectiveYear1)
  const txCount2 = getTransactionCount(effectiveYear2)
  const expenseTxCount1 = getTransactionCount(effectiveYear1, 'expense')
  const expenseTxCount2 = getTransactionCount(effectiveYear2, 'expense')

  return [
    createMetricRow('Total Income', y1.income, y2.income, 'currency'),
    createMetricRow('Total Expenses', y1.expense, y2.expense, 'currency', true),
    createMetricRow('Net Savings', y1.net_savings, y2.net_savings, 'currency'),
    createMetricRow(
      'Savings Rate',
      calcSavingsRate(y1.net_savings, y1.income),
      calcSavingsRate(y2.net_savings, y2.income),
      'percent',
    ),
    createMetricRow(
      'Monthly Avg Income',
      safeDivide(y1.income, y1.months),
      safeDivide(y2.income, y2.months),
      'currency',
    ),
    createMetricRow(
      'Monthly Avg Expense',
      safeDivide(y1.expense, y1.months),
      safeDivide(y2.expense, y2.months),
      'currency',
      true,
    ),
    createMetricRow('Total Transactions', txCount1, txCount2, 'number'),
    createMetricRow(
      'Avg Transaction Size',
      safeDivide(y1.expense, expenseTxCount1),
      safeDivide(y2.expense, expenseTxCount2),
      'currency',
      true,
    ),
    createMetricRow('Months with Data', y1.months, y2.months, 'number'),
  ]
}
