import type { UsageResponse } from '@/services/api/aiUsage'

import { FieldHint, FieldLabel } from '../../sectionPrimitives'
import { inputClass } from '../../styles'
import { formatTokens } from './aiConstants'

interface TokenLimitsPanelProps {
  usage: UsageResponse | undefined
  dailyLimit: string
  setDailyLimit: (v: string) => void
  monthlyLimit: string
  setMonthlyLimit: (v: string) => void
  onSave: () => void
  saving: boolean
}

export function TokenLimitsPanel(props: Readonly<TokenLimitsPanelProps>) {
  const { usage, dailyLimit, setDailyLimit, monthlyLimit, setMonthlyLimit, onSave, saving } = props

  return (
    <div className="border-t border-border pt-4 space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <FieldLabel htmlFor="ai-daily-limit">Token usage &amp; limits</FieldLabel>
        {usage && (
          <div className="text-xs text-muted-foreground font-mono">
            Today {formatTokens(usage.today.total_tokens)}
            {usage.limits.daily ? ` / ${formatTokens(usage.limits.daily)}` : ''}
            <span className="text-text-quaternary"> · </span>
            MTD {formatTokens(usage.month_to_date.total_tokens)}
            {usage.limits.monthly ? ` / ${formatTokens(usage.limits.monthly)}` : ''}
            {usage.all_time.cost_usd > 0 && (
              <>
                <span className="text-text-quaternary"> · </span>
                <span title="All-time estimated cost (USD)">
                  ${usage.all_time.cost_usd.toFixed(2)}
                </span>
              </>
            )}
          </div>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label
            htmlFor="ai-daily-limit"
            className="text-xs text-muted-foreground mb-1 block"
          >
            Daily limit (tokens)
          </label>
          <input
            id="ai-daily-limit"
            type="number"
            inputMode="numeric"
            min={0}
            step={1000}
            value={dailyLimit}
            onChange={(e) => setDailyLimit(e.target.value)}
            placeholder="No limit"
            className={inputClass}
          />
        </div>
        <div>
          <label
            htmlFor="ai-monthly-limit"
            className="text-xs text-muted-foreground mb-1 block"
          >
            Monthly limit (tokens)
          </label>
          <input
            id="ai-monthly-limit"
            type="number"
            inputMode="numeric"
            min={0}
            step={10000}
            value={monthlyLimit}
            onChange={(e) => setMonthlyLimit(e.target.value)}
            placeholder="No limit"
            className={inputClass}
          />
        </div>
      </div>
      <FieldHint>
        Leave blank for no cap. Server-side Bedrock calls are blocked when today's or this
        month's usage would exceed the limit. For browser-direct providers (OpenAI, Anthropic)
        the limits are informational only -- the provider still charges your key.
      </FieldHint>
      <button
        type="button"
        onClick={onSave}
        disabled={saving}
        className="px-3 py-1.5 text-xs bg-white/10 text-white rounded-lg hover:bg-white/20 transition-colors disabled:opacity-40"
      >
        {saving ? 'Saving limits...' : 'Save limits'}
      </button>
    </div>
  )
}
