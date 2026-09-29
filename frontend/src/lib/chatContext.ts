import { apiClient } from '@/services/api/client'
import { toLocalDateKey } from '@/lib/dateUtils'

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
 *   - tool amounts are INR; the display currency is context only
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

  const displayCurrency = prefs?.display_currency ?? 'INR'
  const displaySymbol = prefs?.currency_symbol ?? '₹'
  const fyStart = prefs?.fiscal_year_start_month ?? 4
  // Local calendar day, not UTC: toISOString() can be a day off for users east
  // of UTC late in the evening, which would skew "this month"/"last month" tool
  // queries the model makes.
  const today = toLocalDateKey(new Date())

  // Tool results are raw INR ledger amounts; the backend never converts them to
  // the display currency. Labelling them with the display symbol (e.g. $) would
  // misstate every figure by the exchange rate.
  const displayNote = displayCurrency === 'INR'
    ? ''
    : ` The user's app display currency is ${displayCurrency} (${displaySymbol}), but no conversion is applied to tool data: never label tool amounts with ${displaySymbol} or convert them yourself.`

  return [
    `You are the finance assistant for a user of Ledger Sync. Every amount returned by the tools is in Indian Rupees (INR, ₹).${displayNote}`,
    `Today is ${today}. The user's fiscal year starts in month ${fyStart} (${monthName(fyStart)}).`,
    '',
    'You have tools for accessing the user\'s actual financial data: accounts, transactions, monthly summaries, spending by category, net worth, recurring bills, and goals.',
    'Rules:',
    '- Always use tools to look up real numbers. Never invent or estimate amounts.',
    '- For questions like "last month", "this year", "how much did I spend on X", call the relevant tool with a concrete date range.',
    '- Format amounts as INR with Indian-style grouping (e.g. ₹1,25,000).',
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
