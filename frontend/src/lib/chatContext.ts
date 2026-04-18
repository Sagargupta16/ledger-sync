import { apiClient } from '@/services/api/client'

interface MonthlySummary {
  period: string
  income: number
  expenses: number
  savings_rate: number
}

interface CategoryItem {
  category: string
  total_amount: number
  pct_of_monthly_total: number
}

interface RecurringItem {
  pattern_name: string
  expected_amount: number
  frequency: string
}

interface NetWorthSnapshot {
  total_assets: number
  total_liabilities: number
  net_worth: number
}

interface GoalItem {
  name: string
  target_amount: number
  current_amount: number
  target_date: string | null
}

function fmtAmount(n: number, symbol: string): string {
  return `${symbol}${Math.round(n).toLocaleString()}`
}

export async function buildFinancialContext(): Promise<string> {
  const [summariesRes, categoriesRes, recurringRes, netWorthRes, goalsRes, prefsRes] =
    await Promise.allSettled([
      apiClient.get<MonthlySummary[]>('/api/analytics/v2/monthly-summaries', {
        params: { limit: 6 },
      }),
      apiClient.get<CategoryItem[]>('/api/calculations/category-breakdown', {
        params: { transaction_type: 'expense', limit: 10 },
      }),
      apiClient.get<RecurringItem[]>('/api/analytics/v2/recurring'),
      apiClient.get<NetWorthSnapshot[]>('/api/analytics/v2/net-worth', {
        params: { limit: 1 },
      }),
      apiClient.get<GoalItem[]>('/api/analytics/v2/goals'),
      apiClient.get('/api/preferences'),
    ])

  const summaries: MonthlySummary[] =
    summariesRes.status === 'fulfilled' ? summariesRes.value.data : []
  const categories: CategoryItem[] =
    categoriesRes.status === 'fulfilled' ? categoriesRes.value.data : []
  const recurring: RecurringItem[] =
    recurringRes.status === 'fulfilled' ? recurringRes.value.data : []
  const netWorthList: NetWorthSnapshot[] =
    netWorthRes.status === 'fulfilled' ? netWorthRes.value.data : []
  const goals: GoalItem[] =
    goalsRes.status === 'fulfilled' ? goalsRes.value.data : []
  const prefs = prefsRes.status === 'fulfilled' ? prefsRes.value.data : null

  const currency = prefs?.currency_symbol ?? '₹'
  const displayCurrency = prefs?.display_currency ?? 'INR'
  const sections: string[] = []

  sections.push(
    `You are a personal finance assistant. Currency: ${currency} (${displayCurrency}).`,
  )

  if (Array.isArray(summaries) && summaries.length > 0) {
    const rows = summaries
      .map(
        (s) =>
          `| ${s.period} | ${fmtAmount(s.income, currency)} | ${fmtAmount(s.expenses, currency)} | ${Math.round(s.savings_rate)}% |`,
      )
      .join('\n')
    sections.push(
      `## Monthly Summary (Recent)\n| Month | Income | Expenses | Savings Rate |\n|---|---|---|---|\n${rows}`,
    )
  }

  if (Array.isArray(categories) && categories.length > 0) {
    const rows = categories
      .slice(0, 8)
      .map(
        (c, i) =>
          `${i + 1}. ${c.category}: ${fmtAmount(c.total_amount, currency)} (${Math.round(c.pct_of_monthly_total)}%)`,
      )
      .join('\n')
    sections.push(`## Top Spending Categories\n${rows}`)
  }

  if (Array.isArray(recurring) && recurring.length > 0) {
    const rows = recurring
      .slice(0, 10)
      .map((r) => `- ${r.pattern_name}: ${fmtAmount(r.expected_amount, currency)}/${r.frequency}`)
      .join('\n')
    sections.push(`## Recurring Bills & Subscriptions\n${rows}`)
  }

  if (Array.isArray(netWorthList) && netWorthList.length > 0) {
    const nw = netWorthList[0]
    sections.push(
      `## Net Worth\nTotal: ${fmtAmount(nw.net_worth, currency)} (Assets: ${fmtAmount(nw.total_assets, currency)}, Liabilities: ${fmtAmount(nw.total_liabilities, currency)})`,
    )
  }

  if (Array.isArray(goals) && goals.length > 0) {
    const rows = goals
      .slice(0, 5)
      .map((g) => {
        const pct =
          g.target_amount > 0 ? Math.round((g.current_amount / g.target_amount) * 100) : 0
        return `- ${g.name}: ${fmtAmount(g.current_amount, currency)}/${fmtAmount(g.target_amount, currency)} (${pct}%)`
      })
      .join('\n')
    sections.push(`## Financial Goals\n${rows}`)
  }

  sections.push(
    `\nAnswer questions about the user's finances based on this data. Be specific with numbers. Use ${currency} currency. Keep responses concise. If you lack data to answer, say so.`,
  )

  return sections.join('\n\n')
}
