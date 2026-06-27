import type {
  AccountBalances,
  CategoryBreakdown,
  MasterCategories,
  MonthlyAggregation,
  TotalsData,
} from '@/services/api/calculations'
import type { BehaviorData, KPIData, OverviewData, TrendsData } from '@/services/api/analytics'
import type { Transaction } from '@/types'

import { MS_PER_DAY } from '@/lib/dateUtils'

import { filterByDateRange, isExpense, isIncome, isTransfer, monthKey, sum } from './demoHelpers'

export function generateDemoTotals(
  txs: Transaction[],
  params?: { start_date?: string; end_date?: string },
): TotalsData {
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
    if (!result[mk])
      result[mk] = {
        income: 0,
        expense: 0,
        net_savings: 0,
        transactions: 0,
        income_count: 0,
        expense_count: 0,
      }
    const entry = result[mk]
    if (isIncome(tx)) {
      entry.income += tx.amount
      entry.income_count++
    } else if (isExpense(tx)) {
      entry.expense += tx.amount
      entry.expense_count++
    }
    entry.transactions++
  }
  for (const entry of Object.values(result)) {
    entry.net_savings = entry.income - entry.expense
  }
  return result
}

const OPENING_BALANCES: Record<string, number> = {
  'SBI Savings': 280000,
  'HDFC Salary': 95000,
  'Axis Bank': 45000,
  Cash: 8000,
  'EPF Account': 180000,
  'PPF Account': 120000,
  'Groww Stocks': 150000,
  'Groww Mutual Funds': 200000,
  'SBI FD': 100000,
  'GPay UPI': 2000,
  'Pluxee Wallet': 1500,
  'Amazon Wallet': 500,
}

const NON_NEGATIVE_ACCOUNTS = new Set([
  'SBI Savings',
  'HDFC Salary',
  'Axis Bank',
  'Cash',
  'GPay UPI',
  'Pluxee Wallet',
  'Amazon Wallet',
  'EPF Account',
  'PPF Account',
  'Groww Stocks',
  'Groww Mutual Funds',
  'SBI FD',
])

type AccountEntry = { balance: number; transactions: number; last_transaction: string | null }

function ensureAccount(accounts: Record<string, AccountEntry>, name: string): AccountEntry {
  if (!accounts[name]) accounts[name] = { balance: 0, transactions: 0, last_transaction: null }
  return accounts[name]
}

function applyBalanceDelta(entry: AccountEntry, tx: Transaction): void {
  if (isIncome(tx)) entry.balance += tx.amount
  else if (isExpense(tx)) entry.balance -= tx.amount
  else if (isTransfer(tx)) entry.balance -= tx.amount
}

function recordTransaction(entry: AccountEntry, date: string): void {
  entry.transactions++
  if (!entry.last_transaction || date > entry.last_transaction) {
    entry.last_transaction = date
  }
}

function creditTransferDestination(
  accounts: Record<string, AccountEntry>,
  tx: Transaction,
): void {
  if (!isTransfer(tx) || !tx.to_account) return
  const dest = ensureAccount(accounts, tx.to_account)
  dest.balance += tx.amount
  recordTransaction(dest, tx.date)
}

function clampNonNegativeBalances(accounts: Record<string, AccountEntry>): void {
  for (const [name, data] of Object.entries(accounts)) {
    if (NON_NEGATIVE_ACCOUNTS.has(name) && data.balance < 0) {
      data.balance = 0
    }
  }
}

export function generateDemoAccountBalances(txs: Transaction[]): AccountBalances {
  const accounts: Record<string, AccountEntry> = {}

  for (const [name, balance] of Object.entries(OPENING_BALANCES)) {
    accounts[name] = { balance, transactions: 0, last_transaction: null }
  }

  for (const tx of txs) {
    const entry = ensureAccount(accounts, tx.account)
    applyBalanceDelta(entry, tx)
    recordTransaction(entry, tx.date)
    creditTransferDestination(accounts, tx)
  }

  clampNonNegativeBalances(accounts)

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

export function generateDemoKPIs(txs: Transaction[]): KPIData {
  const totals = generateDemoTotals(txs)
  const monthly = generateDemoMonthlyAggregation(txs)
  const months = Object.values(monthly)
  const avgExpense = months.length > 0 ? sum(months.map((m) => m.expense)) / months.length : 0

  const catTotals: Record<string, number> = {}
  for (const tx of txs.filter(isExpense)) {
    catTotals[tx.category] = (catTotals[tx.category] || 0) + tx.amount
  }
  const totalExp = sum(Object.values(catTotals))
  const hhi =
    totalExp > 0
      ? sum(Object.values(catTotals).map((v) => ((v / totalExp) * 100) ** 2)) / 10000
      : 0

  const monthlyExpenses = months.map((m) => m.expense)
  const mean = monthlyExpenses.length > 0 ? sum(monthlyExpenses) / monthlyExpenses.length : 0
  const variance =
    monthlyExpenses.length > 0
      ? sum(monthlyExpenses.map((e) => (e - mean) ** 2)) / monthlyExpenses.length
      : 0
  const cv = mean > 0 ? Math.sqrt(variance) / mean : 0

  const dates = txs.map((t) => t.date).sort((a, b) => a.localeCompare(b))
  const daySpan =
    dates.length > 1
      ? (new Date(dates.at(-1)!).getTime() - new Date(dates[0]).getTime()) / MS_PER_DAY
      : 1

  return {
    savings_rate: totals.savings_rate,
    daily_spending_rate: daySpan > 0 ? totals.total_expenses / daySpan : 0,
    monthly_burn_rate: avgExpense,
    spending_velocity: avgExpense > 0 ? avgExpense / (totals.total_income / months.length || 1) : 0,
    category_concentration: hhi * 100,
    consistency_score: Math.max(0, Math.min(100, (1 - cv) * 100)),
    lifestyle_inflation:
      months.length >= 6
        ? ((months.at(-1)!.expense - months[0].expense) / (months[0].expense || 1)) * 100
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

  const dates = txs.map((t) => t.date).sort((a, b) => a.localeCompare(b))
  const daySpan =
    dates.length > 1
      ? (new Date(dates.at(-1)!).getTime() - new Date(dates[0]).getTime()) / MS_PER_DAY
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

  const positiveMonths = monthlyTrends.filter((m) => m.surplus > 0).length
  const consistency = monthlyTrends.length > 0 ? (positiveMonths / monthlyTrends.length) * 100 : 0

  return {
    monthly_trends: monthlyTrends,
    surplus_trend: surplusTrend,
    consistency_score: consistency,
  }
}
