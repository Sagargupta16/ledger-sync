import type {
  Anomaly,
  Budget,
  CategoryTrend,
  FinancialGoal,
  FYSummary,
  MonthlySummary,
  NetWorthSnapshot,
  RecurringTransaction,
} from '@/services/api/analyticsV2'
import type { Transaction } from '@/types'

import { generateDemoMonthlyAggregation } from './demoCalculations'
import {
  ESSENTIAL_CATEGORIES,
  isExpense,
  isIncome,
  isTransfer,
  monthKey,
  sum,
} from './demoHelpers'

function computeIncomeBreakdown(txs: Transaction[], mk: string) {
  const incomeItems = txs.filter((t) => isIncome(t) && monthKey(t.date) === mk)
  const salary = sum(
    incomeItems.filter((t) => t.category === 'Employment Income').map((t) => t.amount),
  )
  const investment = sum(
    incomeItems.filter((t) => t.category === 'Investment Income').map((t) => t.amount),
  )
  return { items: incomeItems, salary, investment }
}

function computeExpenseBreakdown(txs: Transaction[], mk: string) {
  const expenseItems = txs.filter((t) => isExpense(t) && monthKey(t.date) === mk)
  const essential = sum(
    expenseItems.filter((t) => ESSENTIAL_CATEGORIES.includes(t.category)).map((t) => t.amount),
  )
  return { items: expenseItems, essential }
}

function computeTransferTotals(txs: Transaction[], mk: string) {
  const transfers = txs.filter((t) => isTransfer(t) && monthKey(t.date) === mk)
  const out = sum(transfers.filter((t) => t.from_account).map((t) => t.amount))
  return { count: transfers.length, out, in: 0 }
}

function computeChangePct(current: number, previous: number | null): number | null {
  if (previous === null || previous <= 0) return null
  return ((current - previous) / previous) * 100
}

export function generateDemoMonthlySummaries(txs: Transaction[]): MonthlySummary[] {
  const monthly = generateDemoMonthlyAggregation(txs)
  const sortedMonths = Object.keys(monthly).sort((a, b) => a.localeCompare(b))
  const now = new Date().toISOString()

  return sortedMonths.map((mk, i) => {
    const data = monthly[mk]
    const [yearStr, monthStr] = mk.split('-')
    const year = Number.parseInt(yearStr)
    const month = Number.parseInt(monthStr)

    const inc = computeIncomeBreakdown(txs, mk)
    const exp = computeExpenseBreakdown(txs, mk)
    const xfer = computeTransferTotals(txs, mk)

    const prevMonth = i > 0 ? monthly[sortedMonths[i - 1]] : null
    const incomeChangePct = computeChangePct(data.income, prevMonth?.income ?? null)
    const expenseChangePct = computeChangePct(data.expense, prevMonth?.expense ?? null)

    return {
      period: mk,
      year,
      month,
      income: {
        total: data.income,
        salary: inc.salary,
        investment: inc.investment,
        other: data.income - inc.salary - inc.investment,
        count: inc.items.length,
        change_pct: incomeChangePct,
      },
      expenses: {
        total: data.expense,
        essential: exp.essential,
        discretionary: data.expense - exp.essential,
        count: exp.items.length,
        change_pct: expenseChangePct,
      },
      transfers: {
        out: xfer.out,
        in: xfer.in,
        net_investment: xfer.out - xfer.in,
        count: xfer.count,
      },
      savings: {
        net: data.net_savings,
        rate: data.income > 0 ? (data.net_savings / data.income) * 100 : 0,
      },
      expense_ratio: data.income > 0 ? (data.expense / data.income) * 100 : 0,
      total_transactions: data.transactions,
      last_calculated: now,
    }
  })
}

type GroupedEntry = { total: number; count: number; amounts: number[] }

function groupTransactionsByMonth(
  txs: Transaction[],
): Record<string, Record<string, GroupedEntry>> {
  const grouped: Record<string, Record<string, GroupedEntry>> = {}
  for (const tx of txs) {
    if (isTransfer(tx)) continue
    const mk = monthKey(tx.date)
    const key = `${tx.category}|${tx.subcategory || ''}`
    if (!grouped[mk]) grouped[mk] = {}
    if (!grouped[mk][key]) grouped[mk][key] = { total: 0, count: 0, amounts: [] }
    grouped[mk][key].total += tx.amount
    grouped[mk][key].count++
    grouped[mk][key].amounts.push(tx.amount)
  }
  return grouped
}

function buildTrendEntry(
  mk: string,
  key: string,
  data: GroupedEntry,
  prevData: GroupedEntry | null | undefined,
): CategoryTrend {
  const [category, subcategory] = key.split('|')
  const avg = data.count > 0 ? data.total / data.count : 0
  const momChange = prevData ? data.total - prevData.total : 0
  const momChangePct = prevData && prevData.total > 0 ? (momChange / prevData.total) * 100 : null

  return {
    period: mk,
    category,
    subcategory: subcategory || null,
    type: null,
    total: data.total,
    count: data.count,
    avg,
    max: Math.max(...data.amounts),
    min: Math.min(...data.amounts),
    pct_of_monthly: null,
    mom_change: momChange,
    mom_change_pct: momChangePct,
  }
}

export function generateDemoCategoryTrends(txs: Transaction[]): CategoryTrend[] {
  const grouped = groupTransactionsByMonth(txs)
  const sortedMonths = Object.keys(grouped).sort((a, b) => a.localeCompare(b))
  const trends: CategoryTrend[] = []

  for (let i = 0; i < sortedMonths.length; i++) {
    const mk = sortedMonths[i]
    const prevMk = i > 0 ? sortedMonths[i - 1] : null

    for (const [key, data] of Object.entries(grouped[mk])) {
      const prevData = prevMk ? grouped[prevMk]?.[key] : null
      trends.push(buildTrendEntry(mk, key, data, prevData))
    }
  }

  return trends
}

export function generateDemoRecurring(): RecurringTransaction[] {
  const now = new Date()
  const nextMonth = (day: number) => {
    const d = new Date(now.getFullYear(), now.getMonth() + 1, day)
    return d.toISOString().slice(0, 10)
  }
  const lastMonth = (day: number) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 1, day)
    return d.toISOString().slice(0, 10)
  }

  return [
    { id: 1, name: 'Salary Credit', category: 'Employment Income', subcategory: 'Salary', account: 'HDFC Salary', type: 'Income', frequency: 'monthly', expected_amount: 170000, variance: 4000, expected_day: 1, confidence: 98, occurrences: 48, last_occurrence: lastMonth(1), next_expected: nextMonth(1), times_missed: 0, is_active: true, is_confirmed: true },
    { id: 2, name: 'EPF Employer Contribution', category: 'Employment Income', subcategory: 'EPF Contribution', account: 'EPF Account', type: 'Income', frequency: 'monthly', expected_amount: 4100, variance: 500, expected_day: 1, confidence: 95, occurrences: 48, last_occurrence: lastMonth(1), next_expected: nextMonth(1), times_missed: 0, is_active: true, is_confirmed: true },
    { id: 3, name: 'Rent Payment', category: 'Housing', subcategory: 'Rent', account: 'HDFC Salary', type: 'Expense', frequency: 'monthly', expected_amount: 19500, variance: 0, expected_day: 5, confidence: 100, occurrences: 48, last_occurrence: lastMonth(5), next_expected: nextMonth(5), times_missed: 0, is_active: true, is_confirmed: true },
    { id: 4, name: 'Domestic Help', category: 'Housing', subcategory: 'Domestic Help', account: 'Cash', type: 'Expense', frequency: 'monthly', expected_amount: 2900, variance: 500, expected_day: 1, confidence: 90, occurrences: 48, last_occurrence: lastMonth(1), next_expected: nextMonth(1), times_missed: 0, is_active: true, is_confirmed: true },
    { id: 5, name: 'SIP Investment', category: 'Investment', subcategory: 'SIP', account: 'SBI Savings', type: 'Transfer', frequency: 'monthly', expected_amount: 17000, variance: 2500, expected_day: 10, confidence: 100, occurrences: 48, last_occurrence: lastMonth(10), next_expected: nextMonth(10), times_missed: 0, is_active: true, is_confirmed: true },
    { id: 6, name: 'EPF Employee Contribution', category: 'Investment', subcategory: 'EPF', account: 'HDFC Salary', type: 'Transfer', frequency: 'monthly', expected_amount: 20400, variance: 2000, expected_day: 1, confidence: 95, occurrences: 48, last_occurrence: lastMonth(1), next_expected: nextMonth(1), times_missed: 0, is_active: true, is_confirmed: true },
    { id: 7, name: 'OTT Subscriptions', category: 'Entertainment & Recreations', subcategory: 'OTT Subscriptions', account: 'Swiggy HDFC Credit Card', type: 'Expense', frequency: 'monthly', expected_amount: 649, variance: 150, expected_day: 1, confidence: 90, occurrences: 42, last_occurrence: lastMonth(1), next_expected: nextMonth(1), times_missed: 3, is_active: true, is_confirmed: true },
    { id: 8, name: 'Mobile Recharge', category: 'Entertainment & Recreations', subcategory: 'Recharge', account: 'GPay UPI', type: 'Expense', frequency: 'monthly', expected_amount: 349, variance: 200, expected_day: 15, confidence: 85, occurrences: 44, last_occurrence: lastMonth(15), next_expected: nextMonth(15), times_missed: 2, is_active: true, is_confirmed: true },
    { id: 9, name: 'Pluxee Meal Card Top-up', category: 'Transfer', subcategory: 'Meal Card', account: 'HDFC Salary', type: 'Transfer', frequency: 'monthly', expected_amount: 2200, variance: 0, expected_day: 3, confidence: 100, occurrences: 48, last_occurrence: lastMonth(3), next_expected: nextMonth(3), times_missed: 0, is_active: true, is_confirmed: true },
    { id: 10, name: 'Family Monthly Transfer', category: 'Transfer', subcategory: 'Family Transfer', account: 'HDFC Salary', type: 'Transfer', frequency: 'monthly', expected_amount: 15000, variance: 5000, expected_day: 5, confidence: 90, occurrences: 48, last_occurrence: lastMonth(5), next_expected: nextMonth(5), times_missed: 0, is_active: true, is_confirmed: true },
    { id: 11, name: 'Health Insurance Annual Premium', category: 'Healthcare', subcategory: 'Insurance', account: 'HDFC Salary', type: 'Expense', frequency: 'yearly', expected_amount: 19600, variance: 800, expected_day: 12, confidence: 95, occurrences: 4, last_occurrence: lastMonth(12), next_expected: nextMonth(12), times_missed: 0, is_active: true, is_confirmed: true },
    { id: 12, name: 'AC EMI 12mo (No-Cost)', category: 'EMI', subcategory: 'Consumer Durable EMI', account: 'HDFC Salary', type: 'Expense', frequency: 'monthly', expected_amount: 4250, variance: 0, expected_day: 7, confidence: 100, occurrences: 12, last_occurrence: lastMonth(7), next_expected: null, times_missed: 0, is_active: false, is_confirmed: true },
  ]
}

export function generateDemoNetWorth(txs: Transaction[]): NetWorthSnapshot[] {
  const monthly = generateDemoMonthlyAggregation(txs)
  const sortedMonths = Object.keys(monthly).sort((a, b) => a.localeCompare(b))
  const snapshots: NetWorthSnapshot[] = []

  let runningCash = 50000
  const runningInvestments = 200000
  let runningMF = 100000
  let runningPPF = 80000
  let runningEPF = 150000
  let runningFD = 100000
  let runningLoan = -1500000
  for (let i = 0; i < sortedMonths.length; i++) {
    const mk = sortedMonths[i]
    const data = monthly[mk]
    const monthTxs = txs.filter((t) => monthKey(t.date) === mk)

    runningCash += data.net_savings
    const sipAmount = sum(monthTxs.filter((t) => t.subcategory === 'SIP').map((t) => t.amount))
    const ppfAmount = sum(monthTxs.filter((t) => t.subcategory === 'PPF').map((t) => t.amount))
    const epfAmount = sum(monthTxs.filter((t) => t.subcategory === 'EPF').map((t) => t.amount))
    const fdAmount = sum(
      monthTxs.filter((t) => t.subcategory === 'Fixed Deposit').map((t) => t.amount),
    )

    runningMF += sipAmount * 1.008
    runningPPF += ppfAmount * 1.006
    runningEPF += epfAmount * 1.007
    runningFD += fdAmount * 1.005
    runningLoan += 10000
    const runningCC =
      -sum(
        monthTxs
          .filter((t) => t.account === 'ICICI Credit Card' && isExpense(t))
          .map((t) => t.amount),
      ) * 0.1

    const assets = {
      cash_and_bank: Math.max(0, runningCash),
      investments: runningInvestments + i * 5000,
      mutual_funds: runningMF,
      stocks: 50000 + i * 2000,
      fixed_deposits: runningFD,
      ppf_epf: runningPPF + runningEPF,
      other: 0,
      total: 0,
    }
    assets.total =
      assets.cash_and_bank +
      assets.investments +
      assets.mutual_funds +
      assets.stocks +
      assets.fixed_deposits +
      assets.ppf_epf

    const liabilities = {
      credit_cards: Math.abs(runningCC),
      loans: Math.abs(runningLoan),
      other: 0,
      total: 0,
    }
    liabilities.total = liabilities.credit_cards + liabilities.loans

    const netWorth = assets.total - liabilities.total
    const prevNetWorth = i > 0 ? snapshots[i - 1].net_worth : netWorth
    const change = netWorth - prevNetWorth

    snapshots.push({
      date: `${mk}-28`,
      assets,
      liabilities,
      net_worth: netWorth,
      change,
      change_pct: prevNetWorth === 0 ? null : (change / Math.abs(prevNetWorth)) * 100,
    })
  }

  return snapshots
}

export function generateDemoFYSummaries(txs: Transaction[]): FYSummary[] {
  const fyMap: Record<string, Transaction[]> = {}
  for (const tx of txs) {
    const d = new Date(tx.date)
    const month = d.getMonth() + 1
    const year = d.getFullYear()
    const fy = month >= 4 ? `FY${year}-${year + 1}` : `FY${year - 1}-${year}`
    if (!fyMap[fy]) fyMap[fy] = []
    fyMap[fy].push(tx)
  }

  const sortedFYs = Object.keys(fyMap).sort((a, b) => a.localeCompare(b))
  return sortedFYs.map((fy, i) => {
    const fyTxs = fyMap[fy]
    const income = sum(fyTxs.filter(isIncome).map((t) => t.amount))
    const expenses = sum(fyTxs.filter(isExpense).map((t) => t.amount))
    const salaryIncome = sum(
      fyTxs.filter((t) => isIncome(t) && t.category === 'Employment Income').map((t) => t.amount),
    )
    const investIncome = sum(
      fyTxs.filter((t) => isIncome(t) && t.category === 'Investment Income').map((t) => t.amount),
    )
    const investments = sum(
      fyTxs
        .filter((t) => isTransfer(t) && t.subcategory?.match(/SIP|PPF|EPF|FD|Fixed/))
        .map((t) => t.amount),
    )

    const prevFY = i > 0 ? fyMap[sortedFYs[i - 1]] : null
    const prevIncome = prevFY ? sum(prevFY.filter(isIncome).map((t) => t.amount)) : 0
    const prevExpenses = prevFY ? sum(prevFY.filter(isExpense).map((t) => t.amount)) : 0
    const prevSavings = prevIncome - prevExpenses

    const [startYear] = fy.replace('FY', '').split('-').map(Number)
    return {
      fiscal_year: fy,
      period: `Apr ${startYear} - Mar ${startYear + 1}`,
      income: {
        total: income,
        salary: salaryIncome,
        bonus: 0,
        investment: investIncome,
        other: income - salaryIncome - investIncome,
      },
      expenses: { total: expenses, tax_paid: 0 },
      investments_made: investments,
      savings: {
        net: income - expenses,
        rate: income > 0 ? ((income - expenses) / income) * 100 : 0,
      },
      yoy: {
        income: prevIncome > 0 ? ((income - prevIncome) / prevIncome) * 100 : null,
        expenses: prevExpenses > 0 ? ((expenses - prevExpenses) / prevExpenses) * 100 : null,
        savings:
          prevSavings === 0
            ? null
            : ((income - expenses - prevSavings) / Math.abs(prevSavings)) * 100,
      },
      is_complete: i < sortedFYs.length - 1,
    }
  })
}

export function generateDemoAnomalies(): Anomaly[] {
  const now = new Date()
  const recent = (daysAgo: number) => {
    const d = new Date(now)
    d.setDate(d.getDate() - daysAgo)
    return d.toISOString()
  }

  return [
    {
      id: 1,
      anomaly_type: 'high_expense',
      severity: 'high',
      description: 'Unusually high spending in Shopping category - 3.2x above monthly average',
      transaction_id: 'demo-00120',
      period_key: null,
      expected_value: 5000,
      actual_value: 16000,
      deviation_pct: 220,
      detected_at: recent(3),
      is_reviewed: false,
      is_dismissed: false,
      review_notes: null,
      reviewed_at: null,
    },
    {
      id: 2,
      anomaly_type: 'large_transfer',
      severity: 'medium',
      description: 'Large transfer to SBI FD - Rs 50,000 (above usual pattern)',
      transaction_id: 'demo-00200',
      period_key: null,
      expected_value: 25000,
      actual_value: 50000,
      deviation_pct: 100,
      detected_at: recent(10),
      is_reviewed: false,
      is_dismissed: false,
      review_notes: null,
      reviewed_at: null,
    },
    {
      id: 3,
      anomaly_type: 'unusual_category',
      severity: 'low',
      description: 'First transaction in Education > Courses category in 4 months',
      transaction_id: 'demo-00350',
      period_key: null,
      expected_value: null,
      actual_value: 4500,
      deviation_pct: null,
      detected_at: recent(15),
      is_reviewed: true,
      is_dismissed: true,
      review_notes: 'Online course purchase - expected',
      reviewed_at: recent(14),
    },
  ]
}

export function generateDemoBudgets(): Budget[] {
  return [
    { id: 1, category: 'Food & Dining', subcategory: null, monthly_limit: 15000, current_spent: 12800, remaining: 2200, usage_pct: 85.3, alert_threshold: 80, avg_actual: 13500, months_over: 4, months_under: 20 },
    { id: 2, category: 'Shopping', subcategory: null, monthly_limit: 8000, current_spent: 6200, remaining: 1800, usage_pct: 77.5, alert_threshold: 80, avg_actual: 7200, months_over: 6, months_under: 18 },
    { id: 3, category: 'Entertainment', subcategory: null, monthly_limit: 5000, current_spent: 2800, remaining: 2200, usage_pct: 56, alert_threshold: 80, avg_actual: 3200, months_over: 2, months_under: 22 },
    { id: 4, category: 'Transportation', subcategory: null, monthly_limit: 6000, current_spent: 4500, remaining: 1500, usage_pct: 75, alert_threshold: 80, avg_actual: 5000, months_over: 3, months_under: 21 },
    { id: 5, category: 'Healthcare', subcategory: null, monthly_limit: 5000, current_spent: 1200, remaining: 3800, usage_pct: 24, alert_threshold: 80, avg_actual: 2000, months_over: 1, months_under: 23 },
  ]
}

export function generateDemoGoals(): FinancialGoal[] {
  const now = new Date()
  const toISO = (d: Date) => d.toISOString().slice(0, 10)
  const monthsAgo = (n: number) => {
    const d = new Date(now)
    d.setMonth(d.getMonth() - n)
    return toISO(d)
  }
  const monthsLater = (n: number) => {
    const d = new Date(now)
    d.setMonth(d.getMonth() + n)
    return toISO(d)
  }

  return [
    { id: 1, name: 'Emergency Fund (6 months)', goal_type: 'savings', target_amount: 500000, current_amount: 320000, progress_pct: 64, start_date: monthsAgo(12), target_date: monthsLater(8), is_achieved: false, achieved_date: null, notes: 'Building 6-month expense buffer', created_at: monthsAgo(12), updated_at: toISO(now) },
    { id: 2, name: 'Home Loan Prepayment', goal_type: 'debt_payoff', target_amount: 200000, current_amount: 85000, progress_pct: 42.5, start_date: monthsAgo(8), target_date: monthsLater(12), is_achieved: false, achieved_date: null, notes: 'Extra payments towards home loan principal', created_at: monthsAgo(8), updated_at: toISO(now) },
    { id: 3, name: 'Vacation Fund', goal_type: 'savings', target_amount: 100000, current_amount: 72000, progress_pct: 72, start_date: monthsAgo(6), target_date: monthsLater(3), is_achieved: false, achieved_date: null, notes: 'Trip to Europe', created_at: monthsAgo(6), updated_at: toISO(now) },
    { id: 4, name: 'Increase SIP to 25K', goal_type: 'investment', target_amount: 25000, current_amount: 15000, progress_pct: 60, start_date: monthsAgo(4), target_date: monthsLater(6), is_achieved: false, achieved_date: null, notes: 'Gradually increasing monthly SIP', created_at: monthsAgo(4), updated_at: toISO(now) },
  ]
}
