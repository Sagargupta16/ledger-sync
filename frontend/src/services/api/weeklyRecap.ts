/**
 * Weekly recap: the deterministic summary of the last full IST week
 * (`GET /api/weekly-recap`, backend `core/weekly_recap.py`) and its optional
 * AI explanation.
 *
 * The explanation sends only the recap facts (`weeklyRecapFacts.ts`): the
 * totals, dates, and category and commitment names the card shows, plus a
 * type, severity and day per flag. Never an anomaly description (it can quote
 * an account and a note) and never a ledger row. It goes over the chat
 * widget's transport: app-funded and personal Bedrock go through
 * `/api/ai/bedrock/chat`, which reserves and settles the shared daily quota
 * exactly like a chat message, and OpenAI or Anthropic keys go browser-direct
 * and report usage to `/api/ai/usage/log`. The model is whatever the user's AI
 * mode resolves to; nothing here picks one.
 */

import { sendChat, type Block } from '@/lib/chatAdapters'
import { useAuthStore } from '@/store/authStore'

import { aiConfigService, type AIConfig } from './aiConfig'
import { aiUsageService } from './aiUsage'
import type { AnomalyTypeValue } from './analyticsV2Anomalies'
import { apiClient } from './client'

export interface RecapWeek {
  start: string
  end: string
  as_of: string
  baseline_start: string | null
  /** Full weeks averaged, 0 to 4; weeks before the first transaction are left out. */
  baseline_weeks: number
  data_from: string | null
  /** The latest transaction dated on or before `as_of`; a row dated ahead does not count. */
  data_through: string | null
  /** False when `data_through` is before the week's Sunday: the week may be incomplete. */
  is_complete: boolean
}

export interface RecapSpending {
  this_week: number
  weekly_average: number | null
  change: number | null
  change_pct: number | null
}

export interface CategoryMover {
  category: string
  this_week: number
  weekly_average: number
  change: number
  /** Null when the category had no spending in the baseline weeks. */
  change_pct: number | null
}

export interface NetWorthDriver {
  category: string
  type: 'Income' | 'Expense'
  /** Signed: income adds, spending subtracts. */
  amount: number
}

export interface RecapNetWorth {
  start: number
  end: number
  change: number
  income: number
  expenses: number
  driver: NetWorthDriver | null
}

export interface BillDue {
  id: number
  name: string
  category: string
  frequency: string
  /** The first due date in the window; a past one rolls forward by cadence. */
  due_date: string
  days_until: number
  /** The effective amount: the user's own when set, else the detected one. */
  amount: number
  occurrences: number
  total: number
  is_confirmed: boolean
}

/** Recurring expense commitments from today to seven days ahead; no card statement dues. */
export interface RecapBills {
  window_start: string
  window_end: string
  total: number
  items: BillDue[]
}

export interface RecapAnomaly {
  id: number
  type: AnomalyTypeValue
  severity: string
  /** For the card only: it can quote an account and a note, so the facts leave it out. */
  description: string
  occurred_on: string | null
  period: string | null
  amount: number | null
}

export interface RecapPayday {
  day_of_month: number
  next_date: string
  days_until: number
}

export interface WeeklyRecap {
  week: RecapWeek
  spending: RecapSpending
  movers: CategoryMover[]
  net_worth: RecapNetWorth
  bills: RecapBills
  anomalies: RecapAnomaly[]
  anomaly_count: number
  payday: RecapPayday
}

const EXPLAIN_SYSTEM_PROMPT = [
  'You turn a personal finance weekly recap into exactly three short, plain sentences for the account owner.',
  'Use only the facts given. Quote amounts, percentages and dates exactly as written and never compute new numbers.',
  'Cover the biggest spending change, the net worth movement, and what is coming up.',
  'If a data note says the week may be incomplete, say so in the first sentence.',
  'Do not give advice or recommendations. No lists, headings, markdown or emojis.',
].join(' ')

interface ExplainRoute {
  provider: string
  model: string
  region?: string
  apiKey: string
}

/** The chat widget's credential rule (`useChat` resolveCredentials). */
async function explainRoute(config: AIConfig | undefined): Promise<ExplainRoute> {
  const accessToken = useAuthStore.getState().accessToken ?? ''
  if (!config || config.mode === 'app_bedrock') {
    // App mode: the backend ignores the model and uses its configured default.
    return { provider: 'bedrock', model: 'app-default', apiKey: accessToken }
  }
  if (!config.provider || !config.model) {
    throw new Error('Choose an AI provider and model in Settings > AI Assistant first.')
  }
  const apiKey = config.provider === 'bedrock' ? accessToken : await aiConfigService.getKey()
  return { provider: config.provider, model: config.model, region: config.region ?? undefined, apiKey }
}

function replyText(blocks: Block[]): string {
  return blocks
    .flatMap((block) => (block.type === 'text' ? [block.text] : []))
    .join('')
    .replaceAll(/\s+/g, ' ')
    .trim()
}

export const weeklyRecapService = {
  async get(): Promise<WeeklyRecap> {
    const response = await apiClient.get<WeeklyRecap>('/api/weekly-recap')
    return response.data
  },

  /** One model call, no tools, over the recap facts only. */
  async explain(facts: string, config: AIConfig | undefined, signal: AbortSignal): Promise<string> {
    const route = await explainRoute(config)
    const response = await sendChat(route.provider, {
      model: route.model,
      systemPrompt: EXPLAIN_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: facts }],
      apiKey: route.apiKey,
      region: route.region,
      signal,
    })
    // Bedrock is settled server-side (usage null). Browser-direct calls report
    // their counters; like the chat, a failed report never hides the reply.
    if (response.usage) {
      await aiUsageService
        .log({
          provider: route.provider,
          model: route.model,
          input_tokens: response.usage.inputTokens,
          output_tokens: response.usage.outputTokens,
          tool_rounds: 1,
        })
        .catch(() => undefined)
    }
    const text = replyText(response.blocks)
    if (!text) throw new Error('The assistant returned an empty reply. Try again.')
    return text
  },
}
