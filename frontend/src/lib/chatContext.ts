import { apiClient } from '@/services/api/client'

interface PreferencesResponse {
  readonly currency_symbol?: string
  readonly display_currency?: string
  readonly fiscal_year_start_month?: number
}

/**
 * Build the system prompt for the chat.
 *
 * With tool calling we no longer pre-fetch summaries, categories, net worth,
 * etc. -- the LLM fetches whatever it needs on demand via tools. The context
 * is now minimal:
 *   - user's display currency so amounts are formatted correctly
 *   - today's date (ISO) so "last month" etc. anchor correctly
 *   - a fiscal-year hint for Indian FY users
 *   - tool-use guidance + an anti-hallucination nudge
 *
 * If the preferences call fails, we still return a reasonable default so the
 * chat keeps working.
 */
export async function buildFinancialContext(): Promise<string> {
  let prefs: PreferencesResponse | null = null
  try {
    const res = await apiClient.get<PreferencesResponse>('/api/preferences')
    prefs = res.data
  } catch (err: unknown) {
    console.warn('[chatContext] failed to fetch preferences:', err)
  }

  const currency = prefs?.currency_symbol ?? '₹'
  const displayCurrency = prefs?.display_currency ?? 'INR'
  const fyStart = prefs?.fiscal_year_start_month ?? 4
  const today = new Date().toISOString().slice(0, 10)

  return [
    `You are the finance assistant for a user of Ledger Sync. All amounts are in ${currency} (${displayCurrency}).`,
    `Today is ${today}. The user's fiscal year starts in month ${fyStart} (${monthName(fyStart)}).`,
    '',
    'You have tools for accessing the user\'s actual financial data: accounts, transactions, monthly summaries, spending by category, net worth, recurring bills, and goals.',
    'Rules:',
    '- Always use tools to look up real numbers. Never invent or estimate amounts.',
    '- For questions like "last month", "this year", "how much did I spend on X", call the relevant tool with a concrete date range.',
    `- Format currency as ${currency}{amount} with Indian-style grouping (e.g. ${currency}1,25,000).`,
    '- If a tool returns no results, say so plainly. Do not fill in plausible-looking numbers.',
    '- Keep replies concise. Use bullet lists for multi-item answers.',
  ].join('\n')
}

function monthName(m: number): string {
  const names = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ]
  return names[(m - 1) % 12] ?? 'April'
}
