import { apiClient } from './client'

/**
 * Matches the backend rollup shape in `api/ai_usage.py`.
 */
export interface UsageRollup {
  input_tokens: number
  output_tokens: number
  total_tokens: number
  cost_usd: number
  call_count: number
}

export interface UsageResponse {
  /** Mode the user is currently on; drives whether we show messages or tokens. */
  mode: 'app_bedrock' | 'byok'
  today: UsageRollup
  month_to_date: UsageRollup
  all_time: UsageRollup
  limits: {
    /** BYOK-only per-user token cap (null = no limit) */
    daily: number | null
    monthly: number | null
    /** App-wide daily message cap, applies only in app_bedrock mode */
    app_daily_messages: number
  }
  /** Messages sent via app_bedrock today (0 when BYOK). */
  messages_today: number
  as_of: string
  day_start: string
  month_start: string
  next_reset_utc: string
}

export interface UsageLogRequest {
  provider: string
  model: string
  input_tokens: number
  output_tokens: number
  tool_rounds?: number
}

export interface LimitsUpdateRequest {
  daily_token_limit?: number | null
  monthly_token_limit?: number | null
  clear_daily?: boolean
  clear_monthly?: boolean
}

/** Default limits shape so consumers can always read `usage.limits.*`. */
const DEFAULT_LIMITS = { daily: null, monthly: null, app_daily_messages: 10 } as const

export const aiUsageService = {
  /** Fetch today / month / all-time rollups + current limits. */
  async get(): Promise<UsageResponse> {
    const res = await apiClient.get<UsageResponse>('/api/ai/usage')
    // Guarantee `limits` exists so a partial/malformed payload (e.g. a 401
    // error body, or demo mode) can't crash components that read
    // usage.limits.app_daily_messages directly.
    return { ...res.data, limits: { ...DEFAULT_LIMITS, ...res.data?.limits } }
  },

  /** Record usage from a browser-direct OpenAI/Anthropic response. */
  async log(entry: UsageLogRequest): Promise<void> {
    await apiClient.post('/api/ai/usage/log', entry)
  },

  /** Update per-user daily/monthly token limits. */
  async updateLimits(update: LimitsUpdateRequest): Promise<void> {
    await apiClient.patch('/api/preferences/ai-config/limits', update)
  },
}
