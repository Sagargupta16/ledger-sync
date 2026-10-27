/**
 * Pieces of BalanceProjectionChart: the low-balance threshold form and the
 * per-account list of lowest points and crossings under the plot.
 */

import { useState, type FormEvent } from 'react'

import { Button, Input, Money } from '@/components/ui'
import { BASE_CURRENCY } from '@/constants/currencies'
import { MAX_LOW_BALANCE_THRESHOLD } from '@/hooks/api/useSafeToSpend'
import { formatCurrencyCompact, formatDate } from '@/lib/formatters'
import type { BalanceSeries } from '@/services/api/safeToSpend'

const shortDate = (key: string) => formatDate(key, { month: 'short', day: 'numeric' })

/**
 * Threshold kept on this device; empty or 0 flags only a fall below zero. Any
 * amount is accepted (the hook rounds it to whole rupees): only the API's
 * ceiling is a browser limit, so Apply never fails without saying why.
 */
export function ThresholdForm({ threshold, onChange }: Readonly<{ threshold: number; onChange: (value: number) => void }>) {
  const [draft, setDraft] = useState(threshold > 0 ? String(threshold) : '')
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    onChange(Number(draft))
  }
  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
      <Input
        id="low-balance-threshold"
        label={`Warn me below (${BASE_CURRENCY})`}
        type="number"
        inputMode="numeric"
        min={0}
        max={MAX_LOW_BALANCE_THRESHOLD}
        step="any"
        placeholder="Not set"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        className="w-40 tabular-nums"
      />
      <Button type="submit" variant="secondary" size="sm">
        Apply
      </Button>
    </form>
  )
}

function status(series: BalanceSeries, threshold: number): { text: string; tone: string } {
  if (series.below_zero_on) return { text: `Below zero on ${shortDate(series.below_zero_on)}`, tone: 'text-app-red' }
  if (series.below_threshold_on) {
    return { text: `Below ${formatCurrencyCompact(threshold)} on ${shortDate(series.below_threshold_on)}`, tone: 'text-app-orange' }
  }
  if (series.starts_below_zero) return { text: 'Already below zero today', tone: 'text-app-red' }
  return { text: `Lowest on ${shortDate(series.lowest_on)}`, tone: 'text-muted-foreground' }
}

/** Every projected account, flagged ones first, with today's balance and its lowest point. */
export function ProjectionAccountList({ accounts, threshold }: Readonly<{ accounts: readonly BalanceSeries[]; threshold: number }>) {
  return (
    <ul aria-label="Projected accounts" className="divide-y divide-[var(--hairline-1)]">
      {accounts.map((account) => {
        const { text, tone } = status(account, threshold)
        return (
          <li key={account.name} className="flex items-center justify-between gap-3 py-2.5 text-xs">
            <div className="min-w-0">
              <p className="truncate font-medium text-foreground" title={account.name}>{account.name}</p>
              <p className={tone}>{text}</p>
            </div>
            <div className="shrink-0 text-right leading-5">
              <p>
                <span className="text-muted-foreground">Today </span>
                <Money value={account.start_balance} formatter={formatCurrencyCompact} />
              </p>
              <p>
                <span className="text-muted-foreground">Lowest </span>
                <Money value={account.lowest} formatter={formatCurrencyCompact} className={account.lowest < 0 ? 'text-app-red' : undefined} />
              </p>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
