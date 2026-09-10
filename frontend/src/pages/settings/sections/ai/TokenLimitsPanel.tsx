import type { UsageResponse } from '@/services/api/aiUsage'
import Button from '@/components/ui/Button'

import { FieldHint, FieldLegend } from '../../sectionPrimitives'
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
  error: string | null
  saved: boolean
}

export function TokenLimitsPanel(props: Readonly<TokenLimitsPanelProps>) {
  const {
    usage, dailyLimit, setDailyLimit, monthlyLimit, setMonthlyLimit, onSave, saving, error, saved,
  } = props
  const saveLabel = error ? 'Retry limits' : 'Save limits'

  return (
    <div className="border-t border-border pt-4 space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <FieldLegend>Token usage &amp; limits</FieldLegend>
        {usage && (
          <div className="text-xs text-muted-foreground font-mono">
            Today {formatTokens(usage.today.total_tokens)}
            {usage.limits.daily != null ? ` / ${formatTokens(usage.limits.daily)}` : ''}
            <span className="text-text-quaternary"> · </span>
            MTD {formatTokens(usage.month_to_date.total_tokens)}
            {usage.limits.monthly != null ? ` / ${formatTokens(usage.limits.monthly)}` : ''}
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
            max={10_000_000}
            step={1}
            value={dailyLimit}
            onChange={(e) => setDailyLimit(e.target.value)}
            placeholder="No limit"
            aria-describedby="ai-limits-hint ai-limits-status"
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
            max={100_000_000}
            step={1}
            value={monthlyLimit}
            onChange={(e) => setMonthlyLimit(e.target.value)}
            placeholder="No limit"
            aria-describedby="ai-limits-hint ai-limits-status"
            className={inputClass}
          />
        </div>
      </div>
      <div id="ai-limits-hint">
        <FieldHint>
          Leave blank for no token cap. Set 0 to block Bedrock calls. Both shared and personal
          Bedrock calls count used tokens and tokens reserved for pending calls toward these
          limits. OpenAI and Anthropic limits are informational because calls go directly to
          the provider; set spending controls with your provider.
        </FieldHint>
      </div>
      {(usage?.month_to_date.reserved_tokens ?? 0) > 0 && (
        <p className="text-xs text-muted-foreground">
          {formatTokens(usage?.today.reserved_tokens ?? 0)} tokens reserved today;{' '}
          {formatTokens(usage?.month_to_date.reserved_tokens ?? 0)} this month.
        </p>
      )}
      <Button
        id="save-ai-token-limits"
        type="button"
        variant="secondary"
        size="sm"
        onClick={onSave}
        disabled={saving}
        isLoading={saving}
      >
        {saving ? 'Saving limits...' : saveLabel}
      </Button>
      <div id="ai-limits-status" role={error ? 'alert' : 'status'} aria-live={error ? 'assertive' : 'polite'}>
        {error && <p className="text-sm text-app-red">{error} Your entries are kept here.</p>}
        {!error && saved && <p className="text-sm text-app-green">Token limits saved.</p>}
      </div>
    </div>
  )
}
