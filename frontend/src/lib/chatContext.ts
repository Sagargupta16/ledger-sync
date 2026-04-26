import { apiClient } from '@/services/api/client'

// --- Response shapes matching the actual backend V2 endpoints ---------------

interface MonthlySummaryRow {
  readonly period: string
  readonly income: { readonly total: number }
  readonly expenses: { readonly total: number }
  readonly savings: { readonly rate: number | null }
}

interface CategoryBreakdownResponse {
  readonly categories: Record<string, { readonly total: number; readonly percentage: number }>
  readonly total: number
}

interface RecurringRow {
  readonly name: string
  readonly expected_amount: number
  readonly frequency: string | null
}

interface NetWorthResponse {
  readonly current: {
    readonly net_worth: number
    readonly total_assets: number
    readonly total_liabilities: number
    readonly as_of: string
  } | null
}

interface GoalRow {
  readonly name: string
  readonly target_amount: number
  readonly current_amount: number
  readonly target_date: string | null
  readonly progress_pct: number | null
}

interface PreferencesResponse {
  readonly currency_symbol?: string
  readonly display_currency?: string
}

// V2 endpoints wrap list responses as `{ data: [...], count: N }`.
// The category-breakdown endpoint wraps as `{ categories: {...}, total: N }`.

function fmtAmount(n: number, symbol: string): string {
  return `${symbol}${Math.round(n).toLocaleString()}`
}

/**
 * Logs and returns the `.data` body from an Axios-style `Promise.allSettled`
 * result. Returning `null` on rejection so callers can use `??` defaults.
 *
 * Without this, failures in the context builder were silently swallowed,
 * producing an empty system prompt and a chatbot that said "I don't have
 * access to your data."
 */
function unwrapBody<T>(
  res: PromiseSettledResult<{ data: T }>,
  label: string,
): T | null {
  if (res.status === 'fulfilled') return res.value.data
  console.warn(`[chatContext] failed to fetch ${label}:`, res.reason)
  return null
}

/**
 * Extracts the `.data` array from a wrapped `{ data: T[] }` response.
 * Returns an empty array on either fetch failure or missing body, so the
 * main builder can be a simple chain of `.length > 0` checks.
 */
function unwrapList<T>(
  res: PromiseSettledResult<{ data: { data: T[] } }>,
  label: string,
): T[] {
  return unwrapBody(res, label)?.data ?? []
}

export async function buildFinancialContext(): Promise<string> {
  const [summariesRes, categoriesRes, recurringRes, netWorthRes, goalsRes, prefsRes] =
    await Promise.allSettled([
      apiClient.get<{ data: MonthlySummaryRow[] }>('/api/analytics/v2/monthly-summaries', {
        params: { limit: 6 },
      }),
      apiClient.get<CategoryBreakdownResponse>('/api/calculations/category-breakdown', {
        params: { transaction_type: 'expense' },
      }),
      apiClient.get<{ data: RecurringRow[] }>('/api/analytics/v2/recurring-transactions'),
      apiClient.get<NetWorthResponse>('/api/analytics/v2/net-worth', {
        params: { limit: 1 },
      }),
      apiClient.get<{ data: GoalRow[] }>('/api/analytics/v2/goals'),
      apiClient.get<PreferencesResponse>('/api/preferences'),
    ])

  // Unwrap each endpoint. List endpoints return `{ data: T[] }`; the two
  // non-list endpoints (category-breakdown, net-worth) return their payload
  // directly and use `unwrapBody`. Prefs is plain, no wrapper.
  const summaries = unwrapList(summariesRes, 'monthly-summaries')
  const categoriesBody = unwrapBody(categoriesRes, 'category-breakdown')
  const recurring = unwrapList(recurringRes, 'recurring-transactions')
  const netWorthBody = unwrapBody(netWorthRes, 'net-worth')
  const goals = unwrapList(goalsRes, 'goals')
  const prefs = unwrapBody(prefsRes, 'preferences')

  const currency = prefs?.currency_symbol ?? '₹'
  const displayCurrency = prefs?.display_currency ?? 'INR'
  const sections: string[] = []

  sections.push(
    `You are a personal finance assistant for a user who tracks expenses in Ledger Sync. ` +
      `All amounts are in ${currency} (${displayCurrency}). ` +
      `Today is ${new Date().toISOString().slice(0, 10)}.`,
  )

  if (summaries.length > 0) {
    const rows = summaries
      .map((s) => {
        const income = s.income?.total ?? 0
        const expenses = s.expenses?.total ?? 0
        const rate = s.savings?.rate
        const rateStr = rate === null || rate === undefined ? '-' : `${Math.round(rate)}%`
        return `| ${s.period} | ${fmtAmount(income, currency)} | ${fmtAmount(expenses, currency)} | ${rateStr} |`
      })
      .join('\n')
    sections.push(
      `## Monthly Summary (most recent first)\n| Month | Income | Expenses | Savings Rate |\n|---|---|---|---|\n${rows}`,
    )
  }

  if (categoriesBody?.categories) {
    const entries = Object.entries(categoriesBody.categories)
      .sort(([, a], [, b]) => (b.total ?? 0) - (a.total ?? 0))
      .slice(0, 10)
    if (entries.length > 0) {
      const rows = entries
        .map(
          ([name, c], i) =>
            `${i + 1}. ${name}: ${fmtAmount(c.total, currency)} (${Math.round(c.percentage)}%)`,
        )
        .join('\n')
      sections.push(`## Top Spending Categories (all-time)\n${rows}`)
    }
  }

  if (recurring.length > 0) {
    const rows = recurring
      .slice(0, 10)
      .map((r) => `- ${r.name}: ${fmtAmount(r.expected_amount, currency)}/${r.frequency ?? 'unknown'}`)
      .join('\n')
    sections.push(`## Recurring Bills & Subscriptions\n${rows}`)
  }

  if (netWorthBody?.current) {
    const nw = netWorthBody.current
    sections.push(
      `## Net Worth\n- Total: ${fmtAmount(nw.net_worth, currency)}\n- Assets: ${fmtAmount(nw.total_assets, currency)}\n- Liabilities: ${fmtAmount(nw.total_liabilities, currency)}\n- As of: ${nw.as_of.slice(0, 10)}`,
    )
  }

  if (goals.length > 0) {
    const rows = goals
      .slice(0, 5)
      .map((g) => {
        const pct =
          g.progress_pct ??
          (g.target_amount > 0 ? Math.round((g.current_amount / g.target_amount) * 100) : 0)
        const due = g.target_date ? ` (due ${g.target_date.slice(0, 10)})` : ''
        return `- ${g.name}: ${fmtAmount(g.current_amount, currency)} of ${fmtAmount(g.target_amount, currency)} (${Math.round(pct)}%)${due}`
      })
      .join('\n')
    sections.push(`## Financial Goals\n${rows}`)
  }

  sections.push(
    `\nAnswer questions about the user's finances using the data above. ` +
      `Be specific with numbers. Use ${currency} currency. Keep responses concise. ` +
      `If the data above doesn't cover what they asked, say what's missing -- don't invent numbers.`,
  )

  return sections.join('\n\n')
}
