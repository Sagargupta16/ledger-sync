import type { UsageResponse } from '@/services/api/aiUsage'

/**
 * Mirrors `GET /api/ai/usage` (`backend/api/ai_usage.py::get_usage`).
 *
 * With no demo route, that GET fell through to the adapter's `[]` catch-all.
 * `[].limits` is `undefined`, so `aiUsageService.get()` spread it back into the
 * defaults and every other field stayed missing -- `messages_today` came back
 * `undefined`, and the app-mode panel rendered the literal string
 * "Today's usage NaN / 10 left" (`Math.max(10 - undefined, 0)` is `NaN`, and
 * `Math.max` does not clamp it). The BYOK token panel read
 * `usage.today.total_tokens` off `undefined` and threw outright.
 *
 * Demo mode has no AI provider configured, so `mode` is `app_bedrock` -- the
 * same default the backend applies when a user has no preferences row.
 */

/** A plausible mid-day position: a few messages spent, most of the cap left. */
const DEMO_MESSAGES_TODAY = 3

const DEMO_TODAY = { input_tokens: 5_400, output_tokens: 1_260, cost_usd: 0.0117, call_count: 3 }
const DEMO_MONTH = { input_tokens: 61_800, output_tokens: 14_950, cost_usd: 0.1366, call_count: 34 }
const DEMO_ALL_TIME = {
  input_tokens: 214_500,
  output_tokens: 52_300,
  cost_usd: 0.4761,
  call_count: 118,
}

type Rollup = UsageResponse['today']

/** `total_tokens` is derived, exactly as `_rollup_since` derives it server-side. */
function rollup(seed: Omit<Rollup, 'total_tokens'>): Rollup {
  return { ...seed, total_tokens: seed.input_tokens + seed.output_tokens }
}

export function generateDemoAiUsage(now: Date = new Date()): UsageResponse {
  const dayStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  )
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const nextReset = new Date(dayStart)
  nextReset.setUTCDate(nextReset.getUTCDate() + 1)

  return {
    mode: 'app_bedrock',
    today: rollup(DEMO_TODAY),
    month_to_date: rollup(DEMO_MONTH),
    all_time: rollup(DEMO_ALL_TIME),
    limits: {
      // BYOK-only per-user caps: unset, like a fresh account.
      daily: null,
      monthly: null,
      // Matches the backend default for `LEDGER_SYNC_AI_DAILY_MESSAGE_LIMIT`.
      app_daily_messages: 10,
    },
    messages_today: DEMO_MESSAGES_TODAY,
    as_of: now.toISOString(),
    day_start: dayStart.toISOString(),
    month_start: monthStart.toISOString(),
    next_reset_utc: nextReset.toISOString(),
  }
}
