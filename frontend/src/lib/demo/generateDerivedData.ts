import type { Transaction } from '@/types'
import type { UserPreferences } from '@/services/api/preferences'
import type { TotalsData, MonthlyAggregation, AccountBalances, MasterCategories, CategoryBreakdown } from '@/services/api/calculations'
import type { KPIData, OverviewData, BehaviorData, TrendsData } from '@/services/api/analytics'
import type {
  MonthlySummary,
  CategoryTrend,
  RecurringTransaction,
  NetWorthSnapshot,
  FYSummary,
  Anomaly,
  Budget,
  FinancialGoal,
} from '@/services/api/analyticsV2'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function monthKey(d: string): string {
  return d.slice(0, 7) // "YYYY-MM"
}

function filterByDateRange(txs: Transaction[], startDate?: string, endDate?: string): Transaction[] {
  let filtered = txs
  if (startDate) filtered = filtered.filter((t) => t.date >= startDate)
  if (endDate) filtered = filtered.filter((t) => t.date <= endDate)
  return filtered
}

function isExpense(t: Transaction): boolean {
  return t.type === 'Expense'
}

function isIncome(t: Transaction): boolean {
  return t.type === 'Income'
}

function isTransfer(t: Transaction): boolean {
  return t.type === 'Transfer'
}

function sum(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0)
}

const ESSENTIAL_CATEGORIES = [
  'Housing', 'Food & Dining', 'Healthcare', 'Transportation', 'Education', 'Family',
]

// ---------------------------------------------------------------------------
// Preferences
// ---------------------------------------------------------------------------

export function generateDemoPreferences(): UserPreferences {
  return {
    id: 0,
    fiscal_year_start_month: 4,
    essential_categories: ESSENTIAL_CATEGORIES,
    investment_account_mappings: {
      'Groww Mutual Funds': 'mutual_funds',
      'Groww Stocks': 'stocks',
      'PPF Account': 'ppf_epf',
      'EPF Account': 'ppf_epf',
      'SBI FD': 'fixed_deposits',
    },
    taxable_income_categories: ['Employment Income::Salary', 'Employment Income::Bonuses', 'Employment Income::Stipend'],
    investment_returns_categories: ['Investment Income::Dividends', 'Investment Income::Interest', 'Investment Income::Stock Market Profit'],
    non_taxable_income_categories: ['Refund & Cashbacks::Credit Card Cashbacks', 'Refund & Cashbacks::Other Cashbacks', 'Refund & Cashbacks::Product Refunds'],
    other_income_categories: ['Other Income::Gifts', 'Employment Income::EPF Contribution', 'Employment Income::Expense Reimbursement'],
    default_budget_alert_threshold: 80,
    auto_create_budgets: false,
    budget_rollover_enabled: false,
    number_format: 'indian',
    currency_symbol: '\u20B9',
    currency_symbol_position: 'before',
    default_time_range: 'all_time',
    display_currency: 'INR',
    anomaly_expense_threshold: 200,
    anomaly_types_enabled: ['high_expense', 'unusual_category', 'large_transfer', 'budget_exceeded'],
    auto_dismiss_recurring_anomalies: true,
    recurring_min_confidence: 50,
    recurring_auto_confirm_occurrences: 3,
    needs_target_percent: 50,
    wants_target_percent: 30,
    savings_target_percent: 20,
    credit_card_limits: {
      'Swiggy HDFC Credit Card': 200000,
      'Amazon Pay ICICI Credit Card': 150000,
      'Flipkart Axis Credit Card': 100000,
    },
    earning_start_date: null,
    use_earning_start_date: false,
    fixed_expense_categories: ['Housing', 'Family'],
    savings_goal_percent: 20,
    monthly_investment_target: 50000,
    payday: 1,
    preferred_tax_regime: 'new',
    excluded_accounts: [],
    notify_budget_alerts: true,
    notify_anomalies: true,
    notify_upcoming_bills: true,
    notify_days_ahead: 7,
    salary_structure: {},
    rsu_grants: [],
    growth_assumptions: {
      base_salary_growth_pct: 0,
      bonus_growth_pct: 0,
      epf_scales_with_base: true,
      nps_growth_pct: 0,
      stock_price_appreciation_pct: 0,
      projection_years: 3,
    },
    created_at: null,
    updated_at: null,
  }
}

// ---------------------------------------------------------------------------
// Calculations
// ---------------------------------------------------------------------------

export function generateDemoTotals(txs: Transaction[], params?: { start_date?: string; end_date?: string }): TotalsData {
  const filtered = filterByDateRange(txs, params?.start_date, params?.end_date)
  const income = sum(filtered.filter(isIncome).map((t) => t.amount))
  const expenses = sum(filtered.filter(isExpense).map((t) => t.amount))
  return {
    total_income: income,
    total_expenses: expenses,
    net_savings: income - expenses,
    savings_rate: income > 0 ? ((income - expenses) / income) * 100 : 0,
    transaction_count: filtered.length,
  }
}

export function generateDemoMonthlyAggregation(
  txs: Transaction[],
  params?: { start_date?: string; end_date?: string },
): MonthlyAggregation {
  const filtered = filterByDateRange(txs, params?.start_date, params?.end_date)
  const result: MonthlyAggregation = {}
  for (const tx of filtered) {
    const mk = monthKey(tx.date)
    if (!result[mk]) result[mk] = { income: 0, expense: 0, net_savings: 0, transactions: 0 }
    const entry = result[mk]
    if (isIncome(tx)) entry.income += tx.amount
    else if (isExpense(tx)) entry.expense += tx.amount
    entry.transactions++
  }
  for (const entry of Object.values(result)) {
    entry.net_savings = entry.income - entry.expense
  }
  return result
}

export function generateDemoAccountBalances(txs: Transaction[]): AccountBalances {
  const accounts: Record<string, { balance: number; transactions: number; last_transaction: string | null }> = {}

  for (const tx of txs) {
    const acct = tx.account
    if (!accounts[acct]) accounts[acct] = { balance: 0, transactions: 0, last_transaction: null }
    const entry = accounts[acct]

    if (isIncome(tx)) entry.balance += tx.amount
    else if (isExpense(tx)) entry.balance -= tx.amount
    else if (isTransfer(tx)) entry.balance -= tx.amount

    entry.transactions++
    if (!entry.last_transaction || tx.date > entry.last_transaction) {
      entry.last_transaction = tx.date
    }

    // Credit the destination account for transfers
    if (isTransfer(tx) && tx.to_account) {
      if (!accounts[tx.to_account]) accounts[tx.to_account] = { balance: 0, transactions: 0, last_transaction: null }
      const dest = accounts[tx.to_account]
      dest.balance += tx.amount
      dest.transactions++
      if (!dest.last_transaction || tx.date > dest.last_transaction) {
        dest.last_transaction = tx.date
      }
    }
  }

  const balances = Object.values(accounts).map((a) => a.balance)
  const positiveCount = balances.filter((b) => b >= 0).length
  return {
    accounts,
    total_balance: sum(balances),
    total_accounts: Object.keys(accounts).length,
    average_balance: balances.length > 0 ? sum(balances) / balances.length : 0,
    positive_accounts: positiveCount,
    negative_accounts: balances.length - positiveCount,
  }
}

export function generateDemoMasterCategories(txs: Transaction[]): MasterCategories {
  const income: Record<string, string[]> = {}
  const expense: Record<string, string[]> = {}

  for (const tx of txs) {
    if (isTransfer(tx)) continue
    let map: Record<string, string[]> | null = null
    if (isIncome(tx)) map = income
    else if (isExpense(tx)) map = expense
    if (!map) continue
    const cat = tx.category
    const sub = tx.subcategory || 'Other'
    if (!map[cat]) map[cat] = []
    if (!map[cat].includes(sub)) map[cat].push(sub)
  }

  return { income, expense }
}

export function generateDemoCategoryBreakdown(
  txs: Transaction[],
  params?: { start_date?: string; end_date?: string; transaction_type?: 'income' | 'expense' },
): CategoryBreakdown {
  const filtered = filterByDateRange(txs, params?.start_date, params?.end_date)
  const typeFn = params?.transaction_type === 'income' ? isIncome : isExpense
  const relevant = filtered.filter(typeFn)
  const total = sum(relevant.map((t) => t.amount))

  const categories: CategoryBreakdown['categories'] = {}
  for (const tx of relevant) {
    const cat = tx.category
    if (!categories[cat]) categories[cat] = { total: 0, count: 0, percentage: 0, subcategories: {} }
    categories[cat].total += tx.amount
    categories[cat].count++
    const sub = tx.subcategory || 'Other'
    categories[cat].subcategories[sub] = (categories[cat].subcategories[sub] || 0) + tx.amount
  }

  for (const entry of Object.values(categories)) {
    entry.percentage = total > 0 ? (entry.total / total) * 100 : 0
  }

  return { categories, total }
}

// ---------------------------------------------------------------------------
// Analytics V1
// ---------------------------------------------------------------------------

export function generateDemoKPIs(txs: Transaction[]): KPIData {
  const totals = generateDemoTotals(txs)
  const monthly = generateDemoMonthlyAggregation(txs)
  const months = Object.values(monthly)
  const avgExpense = months.length > 0 ? sum(months.map((m) => m.expense)) / months.length : 0

  // Category concentration (Herfindahl index)
  const catTotals: Record<string, number> = {}
  for (const tx of txs.filter(isExpense)) {
    catTotals[tx.category] = (catTotals[tx.category] || 0) + tx.amount
  }
  const totalExp = sum(Object.values(catTotals))
  const hhi = totalExp > 0 ? sum(Object.values(catTotals).map((v) => ((v / totalExp) * 100) ** 2)) / 10000 : 0

  // Monthly consistency (CV of monthly expenses)
  const monthlyExpenses = months.map((m) => m.expense)
  const mean = monthlyExpenses.length > 0 ? sum(monthlyExpenses) / monthlyExpenses.length : 0
  const variance = monthlyExpenses.length > 0
    ? sum(monthlyExpenses.map((e) => (e - mean) ** 2)) / monthlyExpenses.length
    : 0
  const cv = mean > 0 ? Math.sqrt(variance) / mean : 0

  // Days in data range
  const dates = txs.map((t) => t.date).sort((a, b) => a.localeCompare(b))
  const daySpan = dates.length > 1
    ? (new Date(dates[dates.length - 1]).getTime() - new Date(dates[0]).getTime()) / 86400000
    : 1

  return {
    savings_rate: totals.savings_rate,
    daily_spending_rate: daySpan > 0 ? totals.total_expenses / daySpan : 0,
    monthly_burn_rate: avgExpense,
    spending_velocity: avgExpense > 0 ? avgExpense / (totals.total_income / months.length || 1) : 0,
    category_concentration: hhi * 100,
    consistency_score: Math.max(0, Math.min(100, (1 - cv) * 100)),
    lifestyle_inflation: months.length >= 6
      ? ((months[months.length - 1].expense - months[0].expense) / (months[0].expense || 1)) * 100
      : 0,
    convenience_spending_pct: 0,
  }
}

export function generateDemoOverview(txs: Transaction[]): OverviewData {
  const totals = generateDemoTotals(txs)
  const monthly = generateDemoMonthlyAggregation(txs)
  const entries = Object.entries(monthly)
  const balances = generateDemoAccountBalances(txs)

  let best: { month: string; surplus: number } | null = null
  let worst: { month: string; surplus: number } | null = null
  for (const [mk, data] of entries) {
    const surplus = data.income - data.expense
    if (!best || surplus > best.surplus) best = { month: mk, surplus }
    if (!worst || surplus < worst.surplus) worst = { month: mk, surplus }
  }

  return {
    total_income: totals.total_income,
    total_expenses: totals.total_expenses,
    net_change: totals.net_savings,
    best_month: best,
    worst_month: worst,
    asset_allocation: Object.entries(balances.accounts)
      .map(([account, data]) => ({ account, balance: data.balance }))
      .filter((a) => a.balance > 0)
      .sort((a, b) => b.balance - a.balance),
    transaction_count: totals.transaction_count,
  }
}

export function generateDemoBehavior(txs: Transaction[]): BehaviorData {
  const expenses = txs.filter(isExpense)
  const avgSize = expenses.length > 0 ? sum(expenses.map((t) => t.amount)) / expenses.length : 0

  // Spending frequency: avg transactions per day
  const dates = txs.map((t) => t.date).sort((a, b) => a.localeCompare(b))
  const daySpan = dates.length > 1
    ? (new Date(dates[dates.length - 1]).getTime() - new Date(dates[0]).getTime()) / 86400000
    : 1

  const catTotals: Record<string, number> = {}
  for (const tx of expenses) {
    catTotals[tx.category] = (catTotals[tx.category] || 0) + tx.amount
  }
  const topCategories = Object.entries(catTotals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([category, amount]) => ({ category, amount }))

  return {
    avg_transaction_size: avgSize,
    spending_frequency: daySpan > 0 ? expenses.length / daySpan : 0,
    convenience_spending_pct: 0,
    lifestyle_inflation: 0,
    top_categories: topCategories,
  }
}

export function generateDemoTrends(txs: Transaction[]): TrendsData {
  const monthly = generateDemoMonthlyAggregation(txs)
  const sortedMonths = Object.keys(monthly).sort((a, b) => a.localeCompare(b))

  const monthlyTrends = sortedMonths.map((mk) => ({
    month: mk,
    income: monthly[mk].income,
    expenses: monthly[mk].expense,
    surplus: monthly[mk].income - monthly[mk].expense,
  }))

  const surplusTrend = monthlyTrends.map((m) => ({ month: m.month, surplus: m.surplus }))

  // Consistency: percentage of positive surplus months
  const positiveMonths = monthlyTrends.filter((m) => m.surplus > 0).length
  const consistency = monthlyTrends.length > 0 ? (positiveMonths / monthlyTrends.length) * 100 : 0

  return {
    monthly_trends: monthlyTrends,
    surplus_trend: surplusTrend,
    consistency_score: consistency,
  }
}

// ---------------------------------------------------------------------------
// Analytics V2
// ---------------------------------------------------------------------------

export function generateDemoMonthlySummaries(txs: Transaction[]): MonthlySummary[] {
  const monthly = generateDemoMonthlyAggregation(txs)
  const sortedMonths = Object.keys(monthly).sort((a, b) => a.localeCompare(b))
  const now = new Date().toISOString()

  return sortedMonths.map((mk, i) => {
    const data = monthly[mk]
    const [yearStr, monthStr] = mk.split('-')
    const year = parseInt(yearStr)
    const month = parseInt(monthStr)

    const incomeItems = txs.filter((t) => isIncome(t) && monthKey(t.date) === mk)
    const salaryIncome = sum(incomeItems.filter((t) => t.category === 'Employment Income').map((t) => t.amount))
    const investIncome = sum(incomeItems.filter((t) => t.category === 'Investment Income').map((t) => t.amount))
    const otherIncome = data.income - salaryIncome - investIncome

    const expenseItems = txs.filter((t) => isExpense(t) && monthKey(t.date) === mk)
    const essentialExp = sum(
      expenseItems.filter((t) => ESSENTIAL_CATEGORIES.includes(t.category)).map((t) => t.amount),
    )
    const discretionaryExp = data.expense - essentialExp

    const transfers = txs.filter((t) => isTransfer(t) && monthKey(t.date) === mk)
    const transferOut = sum(transfers.filter((t) => t.from_account).map((t) => t.amount))
    const transferIn = 0 // Demo data uses unified 'Transfer' type; in-flows are on the to_account side

    const prevMonth = i > 0 ? monthly[sortedMonths[i - 1]] : null
    const incomeChangePct = prevMonth && prevMonth.income > 0
      ? ((data.income - prevMonth.income) / prevMonth.income) * 100
      : null
    const expenseChangePct = prevMonth && prevMonth.expense > 0
      ? ((data.expense - prevMonth.expense) / prevMonth.expense) * 100
      : null

    return {
      period: mk,
      year,
      month,
      income: {
        total: data.income,
        salary: salaryIncome,
        investment: investIncome,
        other: otherIncome,
        count: incomeItems.length,
        change_pct: incomeChangePct,
      },
      expenses: {
        total: data.expense,
        essential: essentialExp,
        discretionary: discretionaryExp,
        count: expenseItems.length,
        change_pct: expenseChangePct,
      },
      transfers: {
        out: transferOut,
        in: transferIn,
        net_investment: transferOut - transferIn,
        count: transfers.length,
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

export function generateDemoCategoryTrends(txs: Transaction[]): CategoryTrend[] {
  const grouped: Record<string, Record<string, { total: number; count: number; amounts: number[] }>> = {}

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

  const sortedMonths = Object.keys(grouped).sort((a, b) => a.localeCompare(b))
  const trends: CategoryTrend[] = []

  for (let i = 0; i < sortedMonths.length; i++) {
    const mk = sortedMonths[i]
    const prevMk = i > 0 ? sortedMonths[i - 1] : null

    for (const [key, data] of Object.entries(grouped[mk])) {
      const [category, subcategory] = key.split('|')
      const avg = data.count > 0 ? data.total / data.count : 0
      const prevData = prevMk ? grouped[prevMk]?.[key] : null
      const momChange = prevData ? data.total - prevData.total : 0
      const momChangePct = prevData && prevData.total > 0 ? (momChange / prevData.total) * 100 : null

      trends.push({
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
      })
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
    { id: 1, name: 'Salary Credit', category: 'Employment Income', subcategory: 'Salary', account: 'HDFC Salary', type: 'Income', frequency: 'monthly', expected_amount: 170000, variance: 5000, expected_day: 1, confidence: 98, occurrences: 24, last_occurrence: lastMonth(1), next_expected: nextMonth(1), times_missed: 0, is_active: true, is_confirmed: true },
    { id: 2, name: 'EPF Employer Contribution', category: 'Employment Income', subcategory: 'EPF Contribution', account: 'EPF Account', type: 'Income', frequency: 'monthly', expected_amount: 3600, variance: 500, expected_day: 1, confidence: 95, occurrences: 24, last_occurrence: lastMonth(1), next_expected: nextMonth(1), times_missed: 0, is_active: true, is_confirmed: true },
    { id: 3, name: 'Rent Payment', category: 'Housing', subcategory: 'Rent', account: 'HDFC Salary', type: 'Expense', frequency: 'monthly', expected_amount: 15000, variance: 0, expected_day: 5, confidence: 100, occurrences: 24, last_occurrence: lastMonth(5), next_expected: nextMonth(5), times_missed: 0, is_active: true, is_confirmed: true },
    { id: 4, name: 'Domestic Help', category: 'Housing', subcategory: 'Domestic Help', account: 'Cash', type: 'Expense', frequency: 'monthly', expected_amount: 2500, variance: 500, expected_day: 1, confidence: 90, occurrences: 24, last_occurrence: lastMonth(1), next_expected: nextMonth(1), times_missed: 0, is_active: true, is_confirmed: true },
    { id: 5, name: 'SIP Investment', category: 'Investment', subcategory: 'SIP', account: 'SBI Savings', type: 'Transfer', frequency: 'monthly', expected_amount: 15000, variance: 5000, expected_day: 10, confidence: 100, occurrences: 24, last_occurrence: lastMonth(10), next_expected: nextMonth(10), times_missed: 0, is_active: true, is_confirmed: true },
    { id: 6, name: 'EPF Employee Contribution', category: 'Investment', subcategory: 'EPF', account: 'HDFC Salary', type: 'Transfer', frequency: 'monthly', expected_amount: 18000, variance: 2000, expected_day: 1, confidence: 95, occurrences: 24, last_occurrence: lastMonth(1), next_expected: nextMonth(1), times_missed: 0, is_active: true, is_confirmed: true },
    { id: 7, name: 'OTT Subscriptions', category: 'Entertainment & Recreations', subcategory: 'OTT Subscriptions', account: 'Swiggy HDFC Credit Card', type: 'Expense', frequency: 'monthly', expected_amount: 499, variance: 150, expected_day: 1, confidence: 90, occurrences: 20, last_occurrence: lastMonth(1), next_expected: nextMonth(1), times_missed: 2, is_active: true, is_confirmed: true },
    { id: 8, name: 'Mobile Recharge', category: 'Entertainment & Recreations', subcategory: 'Recharge', account: 'GPay UPI', type: 'Expense', frequency: 'monthly', expected_amount: 299, variance: 200, expected_day: 15, confidence: 85, occurrences: 22, last_occurrence: lastMonth(15), next_expected: nextMonth(15), times_missed: 1, is_active: true, is_confirmed: true },
    { id: 9, name: 'Pluxee Meal Card Top-up', category: 'Transfer', subcategory: 'Meal Card', account: 'HDFC Salary', type: 'Transfer', frequency: 'monthly', expected_amount: 2200, variance: 0, expected_day: 3, confidence: 100, occurrences: 24, last_occurrence: lastMonth(3), next_expected: nextMonth(3), times_missed: 0, is_active: true, is_confirmed: true },
    { id: 10, name: 'Family Monthly Transfer', category: 'Transfer', subcategory: 'Family Transfer', account: 'HDFC Salary', type: 'Transfer', frequency: 'monthly', expected_amount: 15000, variance: 5000, expected_day: 5, confidence: 90, occurrences: 24, last_occurrence: lastMonth(5), next_expected: nextMonth(5), times_missed: 0, is_active: true, is_confirmed: true },
  ]
}

export function generateDemoNetWorth(txs: Transaction[]): NetWorthSnapshot[] {
  const monthly = generateDemoMonthlyAggregation(txs)
  const sortedMonths = Object.keys(monthly).sort((a, b) => a.localeCompare(b))
  const snapshots: NetWorthSnapshot[] = []

  let runningCash = 50000 // starting cash balance
  const runningInvestments = 200000
  let runningMF = 100000
  let runningPPF = 80000
  let runningEPF = 150000
  let runningFD = 100000
  let runningLoan = -1500000 // outstanding loan
  for (let i = 0; i < sortedMonths.length; i++) {
    const mk = sortedMonths[i]
    const data = monthly[mk]
    const monthTxs = txs.filter((t) => monthKey(t.date) === mk)

    // Approximate: net savings goes to cash, transfers go to respective accounts
    runningCash += data.net_savings
    const sipAmount = sum(monthTxs.filter((t) => t.subcategory === 'SIP').map((t) => t.amount))
    const ppfAmount = sum(monthTxs.filter((t) => t.subcategory === 'PPF').map((t) => t.amount))
    const epfAmount = sum(monthTxs.filter((t) => t.subcategory === 'EPF').map((t) => t.amount))
    const fdAmount = sum(monthTxs.filter((t) => t.subcategory === 'Fixed Deposit').map((t) => t.amount))

    runningMF += sipAmount * 1.008 // slight growth
    runningPPF += ppfAmount * 1.006
    runningEPF += epfAmount * 1.007
    runningFD += fdAmount * 1.005
    runningLoan += 10000 // slowly paying off
    const runningCC = -sum(monthTxs.filter((t) => t.account === 'ICICI Credit Card' && isExpense(t)).map((t) => t.amount)) * 0.1

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
    assets.total = assets.cash_and_bank + assets.investments + assets.mutual_funds +
      assets.stocks + assets.fixed_deposits + assets.ppf_epf

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
  // Indian FY: April to March
  const fyMap: Record<string, Transaction[]> = {}
  for (const tx of txs) {
    const d = new Date(tx.date)
    const month = d.getMonth() + 1 // 1-12
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
    const salaryIncome = sum(fyTxs.filter((t) => isIncome(t) && t.category === 'Employment Income').map((t) => t.amount))
    const investIncome = sum(fyTxs.filter((t) => isIncome(t) && t.category === 'Investment Income').map((t) => t.amount))
    const investments = sum(fyTxs.filter((t) => isTransfer(t) && t.subcategory?.match(/SIP|PPF|EPF|FD|Fixed/)).map((t) => t.amount))

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
        savings: prevSavings === 0 ? null : ((income - expenses - prevSavings) / Math.abs(prevSavings)) * 100,
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
      id: 1, anomaly_type: 'high_expense', severity: 'high',
      description: 'Unusually high spending in Shopping category - 3.2x above monthly average',
      transaction_id: 'demo-00120', period_key: null,
      expected_value: 5000, actual_value: 16000, deviation_pct: 220,
      detected_at: recent(3), is_reviewed: false, is_dismissed: false, review_notes: null, reviewed_at: null,
    },
    {
      id: 2, anomaly_type: 'large_transfer', severity: 'medium',
      description: 'Large transfer to SBI FD - Rs 50,000 (above usual pattern)',
      transaction_id: 'demo-00200', period_key: null,
      expected_value: 25000, actual_value: 50000, deviation_pct: 100,
      detected_at: recent(10), is_reviewed: false, is_dismissed: false, review_notes: null, reviewed_at: null,
    },
    {
      id: 3, anomaly_type: 'unusual_category', severity: 'low',
      description: 'First transaction in Education > Courses category in 4 months',
      transaction_id: 'demo-00350', period_key: null,
      expected_value: null, actual_value: 4500, deviation_pct: null,
      detected_at: recent(15), is_reviewed: true, is_dismissed: true, review_notes: 'Online course purchase - expected', reviewed_at: recent(14),
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
  const monthsAgo = (n: number) => { const d = new Date(now); d.setMonth(d.getMonth() - n); return toISO(d) }
  const monthsLater = (n: number) => { const d = new Date(now); d.setMonth(d.getMonth() + n); return toISO(d) }

  return [
    {
      id: 1, name: 'Emergency Fund (6 months)', goal_type: 'savings',
      target_amount: 500000, current_amount: 320000, progress_pct: 64,
      start_date: monthsAgo(12), target_date: monthsLater(8),
      is_achieved: false, achieved_date: null, notes: 'Building 6-month expense buffer',
      created_at: monthsAgo(12), updated_at: toISO(now),
    },
    {
      id: 2, name: 'Home Loan Prepayment', goal_type: 'debt_payoff',
      target_amount: 200000, current_amount: 85000, progress_pct: 42.5,
      start_date: monthsAgo(8), target_date: monthsLater(12),
      is_achieved: false, achieved_date: null, notes: 'Extra payments towards home loan principal',
      created_at: monthsAgo(8), updated_at: toISO(now),
    },
    {
      id: 3, name: 'Vacation Fund', goal_type: 'savings',
      target_amount: 100000, current_amount: 72000, progress_pct: 72,
      start_date: monthsAgo(6), target_date: monthsLater(3),
      is_achieved: false, achieved_date: null, notes: 'Trip to Europe',
      created_at: monthsAgo(6), updated_at: toISO(now),
    },
    {
      id: 4, name: 'Increase SIP to 25K', goal_type: 'investment',
      target_amount: 25000, current_amount: 15000, progress_pct: 60,
      start_date: monthsAgo(4), target_date: monthsLater(6),
      is_achieved: false, achieved_date: null, notes: 'Gradually increasing monthly SIP',
      created_at: monthsAgo(4), updated_at: toISO(now),
    },
  ]
}
